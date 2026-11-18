/** Versioned localStorage wrapper. All learner data stays on this device. */
import { z } from 'zod';
import { createLearner, type LearnerState } from '../engine/progression.js';

const STORAGE_KEY = 'misconception-detective:v1';
const SETTINGS_KEY = 'misconception-detective:settings:v1';

// Structural check of stored state. Anything unexpected (old version, tampering) starts a fresh learner.
const rationalSchema = z.object({ n: z.number().int().min(0), d: z.number().int().min(1) });
const choiceOrder = z.array(z.enum(['first', 'second', 'equal']));
const bodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add'), a: rationalSchema, b: rationalSchema }),
  z.object({ type: z.literal('compare'), context: z.enum(['plain', 'share']), first: rationalSchema, second: rationalSchema, order: choiceOrder }),
  z.object({ type: z.literal('missing_numerator'), known: rationalSchema, targetDen: z.number().int() }),
  z.object({ type: z.literal('missing_denominator'), known: rationalSchema, targetNum: z.number().int() }),
  z.object({ type: z.literal('equal_check'), first: rationalSchema, second: rationalSchema, order: choiceOrder }),
]);
const familyId = z.enum(['F1', 'F2', 'F3']);
const questionSchema = z.object({
  id: z.string(),
  family: familyId,
  stage: z.enum(['item', 'followup', 'transfer']),
  difficulty: z.union([z.literal(1), z.literal(2)]),
  body: bodySchema,
});
const attemptSchema = z.object({
  seq: z.number().int(),
  stage: z.enum(['item', 'followup', 'transfer']),
  question: questionSchema,
  answerDisplay: z.string().max(20),
  outcome: z.enum(['correct', 'possible_misconception', 'needs_more_evidence']),
  pattern: z.enum(['add_across', 'bigger_denominator', 'scale_one_part', 'additive_scaling', 'not_equivalent']).nullable(),
  hintUsed: z.boolean(),
  reasonId: z.enum(['added_tops_bottoms', 'bigger_bottom_bigger', 'changed_one_number', 'counted_parts', 'not_sure']).nullable(),
});
const progressSchema = z.object({
  status: z.enum(['not_started', 'checking', 'possible', 'likely', 'improving', 'secure']),
  attempts: z.array(attemptSchema).max(50),
  transferStreak: z.number().int().min(0),
  unmatchedWrong: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
});
const learnerSchema = z.object({
  version: z.literal(1),
  seedBase: z.number().int(),
  counter: z.number().int().min(0),
  activeFamily: familyId,
  families: z.object({ F1: progressSchema, F2: progressSchema, F3: progressSchema }),
  step: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('question'), question: questionSchema }),
    z.object({ kind: z.literal('explanation'), question: questionSchema, labelled: z.boolean() }),
    z.object({ kind: z.literal('finished') }),
  ]),
});

export interface Settings {
  showSamples: boolean;
}
const settingsSchema = z.object({ showSamples: z.boolean() });

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 1;
}

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses storage (private mode, blocked site data). */
function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadLearner(): LearnerState {
  const parsed = learnerSchema.safeParse(readJson(STORAGE_KEY));
  if (parsed.success) return parsed.data;
  // Save a new learner straight away so a reload shows the same first question.
  const fresh = createLearner(randomSeed());
  saveLearner(fresh);
  return fresh;
}

export function saveLearner(state: LearnerState): boolean {
  return writeJson(STORAGE_KEY, state);
}

export function resetLearner(): LearnerState {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to remove.
  }
  return createLearner(randomSeed());
}

export function loadSettings(): Settings {
  const parsed = settingsSchema.safeParse(readJson(SETTINGS_KEY));
  return parsed.success ? parsed.data : { showSamples: true };
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}
