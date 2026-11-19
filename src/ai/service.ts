/**
 * Guarded access to the model: timeout, one retry on transient errors only, an hourly per-instance budget, a small cache
 * for template choices, in-flight de-duplication, strict validation and built-in fallbacks.
 * The model never decides correctness, labels or next steps, and never writes text that is displayed: it only SELECTS
 * identifiers, which are validated for the current problem and rendered from verified engine data.
 */
import { validateSelection, type HelpContext, type HelpSelection } from '../engine/solver/help.js';
import { solve } from '../engine/solver/solve.js';
import type { Problem } from '../engine/solver/problem.js';
import type { CauseId } from '../engine/solver/check.js';
import type { FamilyId } from '../engine/types.js';
import { ModelCallError, TransientModelError, type ModelClient } from './modelClient.js';
import { askPrompt, explainPrompt, interpretPrompt, type Prompt } from './prompts.js';
import {
  INTERPRETATION_JSON_SCHEMA,
  explanationJsonSchema,
  modelExplanationSchema,
  modelInterpretationSchema,
  modelSelectionSchema,
  selectionJsonSchema,
} from './schemas.js';
import { TEMPLATES, defaultTemplate, fallbackSentences, findTemplate } from './templates.js';

export type AiSource = 'gemini' | 'fallback';
/**
 * Honest health for the UI. "live" only after a model reply was parsed AND accepted by validation; "failing" after the
 * latest attempt failed or was rejected; "untested" before any attempt; "offline" with no key.
 */
export type AiHealth = 'offline' | 'untested' | 'live' | 'failing';
/**
 * Why the built-in path was used. Diagnostic detail stays server-side: the browser maps every reason except
 * "no_key" to one simple "AI help is not available right now" message.
 */
export type FallbackReason = 'no_key' | 'auth' | 'quota' | 'model_unavailable' | 'timeout' | 'malformed' | 'rejected' | 'provider_error' | 'budget';

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

export interface AskResult {
  readonly source: AiSource;
  /** Present only when the model's choice passed validation for this problem. */
  readonly selection?: HelpSelection;
  readonly fallbackReason?: FallbackReason;
}

export interface AiServiceOptions {
  readonly client: ModelClient | null;
  readonly timeoutMs?: number;
  readonly callsPerHour?: number;
  readonly cacheSize?: number;
  readonly now?: () => number;
  /** Receives only a failure category (never keys, prompts or learner text). Defaults to one JSON log line. */
  readonly onFailure?: (reason: FallbackReason) => void;
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
  private readonly onFailure: (reason: FallbackReason) => void;
  private readonly cache = new Map<string, ExplanationResult>();
  private readonly inFlight = new Map<string, Promise<ExplanationResult>>();
  private windowStart = 0;
  private callsInWindow = 0;
  private lastCall: 'none' | 'accepted' | 'failed' = 'none';

  constructor(options: AiServiceOptions) {
    this.client = options.client;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.callsPerHour = options.callsPerHour ?? DEFAULT_CALLS_PER_HOUR;
    this.cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE;
    this.now = options.now ?? Date.now;
    this.onFailure =
      options.onFailure ?? ((reason) => console.log(JSON.stringify({ severity: 'WARNING', message: 'model_unavailable', reason })));
  }

  get live(): boolean {
    return this.client !== null;
  }

  get health(): AiHealth {
    if (this.client === null) return 'offline';
    if (this.lastCall === 'none') return 'untested';
    return this.lastCall === 'accepted' ? 'live' : 'failing';
  }

  private accepted(): void {
    this.lastCall = 'accepted';
  }

  /** Records a failed or rejected attempt. A rejected reply never counts as the AI working. */
  private failed(reason: FallbackReason): void {
    this.lastCall = 'failed';
    if (reason !== 'no_key') this.onFailure(reason);
  }

  /** Maps free text to a family id or 'none'. Never cached (the cache must not hold learner text). */
  async interpretReason(text: string): Promise<InterpretationResult> {
    try {
      const raw = await this.call(interpretPrompt(text), INTERPRETATION_JSON_SCHEMA);
      const parsed = modelInterpretationSchema.safeParse(safeJson(raw));
      if (!parsed.success) throw new ModelFailure('malformed');
      this.accepted();
      return { source: 'gemini', family: parsed.data.family };
    } catch (error) {
      const reason = reasonOf(error);
      this.failed(reason);
      return { source: 'fallback', family: 'none', fallbackReason: reason };
    }
  }

  /**
   * Chooses WHICH reviewed help to show for a follow-up question. The server re-solves the problem itself, shows the model
   * a menu of ids that exist for this problem, and accepts the reply only if validateSelection says every id is real and
   * applicable. The result is a selection, never text. Never cached: the question is learner text.
   */
  async ask(problem: Problem, question: string, causes: readonly CauseId[] = []): Promise<AskResult> {
    const ctx: HelpContext = { solution: solve(problem), causes };
    try {
      const raw = await this.call(askPrompt(ctx, question), selectionJsonSchema(ctx.solution.steps.map((s) => s.id)));
      const parsed = modelSelectionSchema.safeParse(safeJson(raw));
      if (!parsed.success) throw new ModelFailure('malformed');
      const checked = validateSelection(parsed.data, ctx);
      if (!checked.ok) throw new ModelFailure('rejected');
      this.accepted();
      return { source: 'gemini', selection: checked.selection };
    } catch (error) {
      const reason = reasonOf(error);
      this.failed(reason);
      return { source: 'fallback', fallbackReason: reason };
    }
  }

  /** Picks one of the reviewed templates. Cached by family + template + hint level only. */
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
    const fromTemplate = (id: string, source: AiSource, fallbackReason?: FallbackReason): ExplanationResult => {
      const template = findTemplate(family, id) ?? defaultTemplate(family);
      return { source, templateId: template.id, sentences: fallbackSentences(template, hintLevel), ...(fallbackReason === undefined ? {} : { fallbackReason }) };
    };
    try {
      const ids = TEMPLATES[family].map((t) => t.id);
      const raw = await this.call(explainPrompt(family, templateId), explanationJsonSchema(ids));
      const parsed = modelExplanationSchema.safeParse(safeJson(raw));
      if (!parsed.success) throw new ModelFailure('malformed');
      if (!ids.includes(parsed.data.templateId)) throw new ModelFailure('rejected');
      this.accepted();
      return fromTemplate(parsed.data.templateId, 'gemini');
    } catch (error) {
      const reason = reasonOf(error);
      this.failed(reason);
      return fromTemplate(templateId, 'fallback', reason);
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

  /** Calls the model once, plus one retry for transient errors only. Authentication and billing failures are never retried. */
  private async call(prompt: Prompt, schema: unknown): Promise<string> {
    const client = this.client;
    if (client === null) throw new ModelFailure('no_key');
    const attempt = async (): Promise<string> => {
      if (!this.takeBudget()) throw new ModelFailure('budget');
      return withTimeout((signal) => client.generateJson(prompt, schema, signal), this.timeoutMs);
    };
    return attempt().catch((error: unknown) => {
      if (error instanceof TransientModelError) return attempt();
      throw error;
    });
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
  if (error instanceof ModelFailure) return error.reason;
  if (error instanceof ModelCallError) return error.kind === 'provider' ? 'provider_error' : error.kind;
  return 'provider_error';
}
