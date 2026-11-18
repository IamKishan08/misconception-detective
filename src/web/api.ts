/** Browser client for the small /api surface: timeouts, de-duplication and verified offline fallback. */
import { z } from 'zod';
import { defaultTemplate, fallbackSentences, findTemplate } from '../ai/templates.js';
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

const inFlight = new Map<string, Promise<unknown>>();

async function postJson(path: string, body: unknown): Promise<unknown> {
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
export async function interpretReason(text: string): Promise<FamilyId | null> {
  try {
    const parsed = interpretationSchema.safeParse(await postJson('/api/interpret', { text }));
    return parsed.success && parsed.data.family !== 'none' ? parsed.data.family : null;
  } catch {
    return null;
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
