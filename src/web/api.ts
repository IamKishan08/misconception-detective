/** Browser client for the small /api surface: timeouts, de-duplication and verified offline fallback. */
import { z } from 'zod';
import { defaultTemplate, fallbackSentences, findTemplate } from '../ai/templates.js';
import type { Problem } from '../engine/solver/problem.js';
import type { FamilyId, Question } from '../engine/types.js';

const CLIENT_TIMEOUT_MS = 8000;

const explanationSchema = z.object({
  source: z.enum(['gemini', 'fallback']),
  templateId: z.string(),
  sentences: z.array(z.string()).max(2),
});
const interpretationSchema = z.object({ source: z.enum(['gemini', 'fallback']), family: z.enum(['F1', 'F2', 'F3', 'none']) });
const statusSchema = z.object({ explanations: z.enum(['offline', 'untested', 'live', 'failing']) });
export type AiHealth = z.infer<typeof statusSchema>['explanations'];

export type Explanation = z.infer<typeof explanationSchema> & { networkError?: boolean };

const askSchema = z.object({ source: z.enum(['gemini', 'fallback']), answer: z.string().max(450).optional() });

/** What the app shows after a follow-up question: a checked AI answer, or nothing (the caller uses built-in help). */
export interface FollowUp {
  source: 'gemini' | 'fallback';
  answer: string | null;
}

const inFlight = new Map<string, Promise<unknown>>();

/** Rejects as soon as `signal` aborts, without cancelling a request other callers may share. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error instanceof Error ? error : new Error('request failed'));
      },
    );
  });
}

async function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  return abortable(sharedPost(path, body), signal);
}

async function sharedPost(path: string, body: unknown): Promise<unknown> {
  const key = `${path}|${JSON.stringify(body)}`;
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing;
  const request = (async () => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    return data;
  })();
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

/** Template the engine suggests for this question; the model may pick the other allowed one. */
export function suggestedTemplateId(question: Question): string {
  const b = question.body;
  switch (b.type) {
    case 'add':
      return b.a.d === b.b.d ? 'F1.size_check' : 'F1.common_parts';
    case 'compare':
      return b.context === 'share' ? 'F2.sharing' : 'F2.same_whole';
    case 'equal_check':
      return 'F3.same_amount';
    case 'missing_numerator':
    case 'missing_denominator':
      return 'F3.split_parts';
  }
}

export function offlineExplanation(family: FamilyId, templateId: string, hintLevel: number): Explanation {
  const template = findTemplate(family, templateId) ?? defaultTemplate(family);
  return { source: 'fallback', templateId: template.id, sentences: [...fallbackSentences(template, hintLevel)], networkError: true };
}

export async function fetchExplanation(family: FamilyId, templateId: string, hintLevel: number): Promise<Explanation> {
  try {
    const parsed = explanationSchema.safeParse(await postJson('/api/explain', { family, templateId, hintLevel }));
    return parsed.success ? parsed.data : offlineExplanation(family, templateId, hintLevel);
  } catch {
    return offlineExplanation(family, templateId, hintLevel);
  }
}

/** Returns the family suggested for the learner's free text, or null when unavailable. */
export async function interpretReason(text: string, signal?: AbortSignal): Promise<FamilyId | null> {
  try {
    const parsed = interpretationSchema.safeParse(await postJson('/api/interpret', { text }, signal));
    return parsed.success && parsed.data.family !== 'none' ? parsed.data.family : null;
  } catch {
    return null;
  }
}

/**
 * Asks a short follow-up question about a solved problem. Only the problem's numbers and the question are sent.
 * Resolves with a null answer on any failure; rejects only when the caller aborts.
 */
export async function askFollowUp(problem: Problem, question: string, signal?: AbortSignal): Promise<FollowUp> {
  try {
    const parsed = askSchema.safeParse(await postJson('/api/ask', { problem, question }, signal));
    if (!parsed.success || parsed.data.source !== 'gemini' || parsed.data.answer === undefined) return { source: 'fallback', answer: null };
    return { source: 'gemini', answer: parsed.data.answer };
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { source: 'fallback', answer: null };
  }
}

export async function fetchStatus(): Promise<AiHealth> {
  try {
    const res = await fetch('/api/status', { signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
    const parsed = statusSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.explanations : 'offline';
  } catch {
    return 'offline';
  }
}
