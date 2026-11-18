/**
 * Guarded access to the model: timeout, one retry on transient errors, an hourly per-instance budget,
 * a small LRU cache for explanations, in-flight de-duplication, strict validation and verified fallbacks.
 * The model never decides correctness, labels or next steps.
 */
import type { FamilyId } from '../engine/types.js';
import { TransientModelError, type ModelClient } from './modelClient.js';
import { explainPrompt, interpretPrompt, type Prompt } from './prompts.js';
import { INTERPRETATION_JSON_SCHEMA, explanationJsonSchema, modelExplanationSchema, modelInterpretationSchema } from './schemas.js';
import { TEMPLATES, defaultTemplate, fallbackSentences, findTemplate } from './templates.js';

export type AiSource = 'gemini' | 'fallback';
export type FallbackReason = 'no_key' | 'timeout' | 'invalid_output' | 'provider_error' | 'budget';

export interface ExplanationResult {
  readonly source: AiSource;
  readonly templateId: string;
  readonly sentences: readonly string[];
  readonly fallbackReason?: FallbackReason;
}

export interface InterpretationResult {
  readonly source: AiSource;
  readonly family: FamilyId | 'none';
  readonly fallbackReason?: FallbackReason;
}

export interface AiServiceOptions {
  readonly client: ModelClient | null;
  readonly timeoutMs?: number;
  readonly callsPerHour?: number;
  readonly cacheSize?: number;
  readonly now?: () => number;
}

const DEFAULT_TIMEOUT_MS = 6000;
/** Per-instance cap on model calls per hour; under autoscaling each instance has its own budget. */
const DEFAULT_CALLS_PER_HOUR = 300;
/** 3 families x 2 templates x 3 hint levels = 18 possible keys; 32 leaves headroom. */
const DEFAULT_CACHE_SIZE = 32;
const HOUR_MS = 60 * 60 * 1000;

class ModelFailure extends Error {
  constructor(readonly reason: FallbackReason) {
    super(reason);
  }
}

export class AiService {
  private readonly client: ModelClient | null;
  private readonly timeoutMs: number;
  private readonly callsPerHour: number;
  private readonly cacheSize: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, ExplanationResult>();
  private readonly inFlight = new Map<string, Promise<ExplanationResult>>();
  private windowStart = 0;
  private callsInWindow = 0;

  constructor(options: AiServiceOptions) {
    this.client = options.client;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.callsPerHour = options.callsPerHour ?? DEFAULT_CALLS_PER_HOUR;
    this.cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE;
    this.now = options.now ?? Date.now;
  }

  get live(): boolean {
    return this.client !== null;
  }

  /** Maps free text to a family id or 'none'. Never cached (the cache must not hold learner text). */
  async interpretReason(text: string): Promise<InterpretationResult> {
    try {
      const raw = await this.call(interpretPrompt(text), INTERPRETATION_JSON_SCHEMA);
      const parsed = modelInterpretationSchema.safeParse(safeJson(raw));
      if (!parsed.success) return { source: 'fallback', family: 'none', fallbackReason: 'invalid_output' };
      return { source: 'gemini', family: parsed.data.family };
    } catch (error) {
      return { source: 'fallback', family: 'none', fallbackReason: reasonOf(error) };
    }
  }

  /** Chooses a template and writes up to two sentences. Cached by family + template + hint level only. */
  explain(family: FamilyId, templateId: string, hintLevel: number): Promise<ExplanationResult> {
    const requested = findTemplate(family, templateId) ?? defaultTemplate(family);
    const key = `${family}|${requested.id}|${hintLevel}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      // Refresh recency for LRU eviction.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending;

    const work = this.explainUncached(family, requested.id, hintLevel).then((result) => {
      if (result.source === 'gemini') this.remember(key, result);
      return result;
    });
    this.inFlight.set(key, work);
    return work.finally(() => this.inFlight.delete(key));
  }

  private async explainUncached(family: FamilyId, templateId: string, hintLevel: number): Promise<ExplanationResult> {
    const fallback = (reason: FallbackReason): ExplanationResult => {
      const template = findTemplate(family, templateId) ?? defaultTemplate(family);
      return { source: 'fallback', templateId: template.id, sentences: fallbackSentences(template, hintLevel), fallbackReason: reason };
    };
    try {
      const ids = TEMPLATES[family].map((t) => t.id);
      const raw = await this.call(explainPrompt(family, templateId, hintLevel), explanationJsonSchema(ids));
      const parsed = modelExplanationSchema.safeParse(safeJson(raw));
      if (!parsed.success || !ids.includes(parsed.data.templateId)) return fallback('invalid_output');
      return { source: 'gemini', templateId: parsed.data.templateId, sentences: parsed.data.sentences };
    } catch (error) {
      return fallback(reasonOf(error));
    }
  }

  private remember(key: string, value: ExplanationResult): void {
    this.cache.set(key, value);
    while (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private takeBudget(): boolean {
    const now = this.now();
    if (now - this.windowStart >= HOUR_MS) {
      this.windowStart = now;
      this.callsInWindow = 0;
    }
    if (this.callsInWindow >= this.callsPerHour) return false;
    this.callsInWindow += 1;
    return true;
  }

  private async call(prompt: Prompt, schema: unknown): Promise<string> {
    const client = this.client;
    if (client === null) throw new ModelFailure('no_key');
    const attempt = async (): Promise<string> => {
      if (!this.takeBudget()) throw new ModelFailure('budget');
      return withTimeout((signal) => client.generateJson(prompt, schema, signal), this.timeoutMs);
    };
    try {
      return await attempt();
    } catch (error) {
      if (error instanceof TransientModelError) return attempt();
      throw error;
    }
  }
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelFailure('timeout'));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function reasonOf(error: unknown): FallbackReason {
  return error instanceof ModelFailure ? error.reason : 'provider_error';
}
