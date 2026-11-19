/** Versioned localStorage wrapper. All learner data stays on this device. */
import { z } from 'zod';
import { problemSchema } from '../ai/schemas.js';
import { MAX_ANSWER_CHARS, MAX_ENTRIES, emptyHistory, historyFromLearner, type History } from '../engine/history.js';
import { createLearner, type LearnerState } from '../engine/progression.js';

const STORAGE_KEY = 'misconception-detective:v1';
const SETTINGS_KEY = 'misconception-detective:settings:v1';
const HISTORY_KEY = 'misconception-detective:history:v1';

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
  // Older saved attempts had no such field; without help they were independent.
  independent: z.boolean().optional(),
  reasonId: z.enum(['added_tops_bottoms', 'bigger_bottom_bigger', 'changed_one_number', 'counted_parts', 'not_sure']).nullable(),
});
const runSchema = z.object({
  started: z.number().int().min(0).default(0),
  hints: z.number().int().min(0).max(5),
  solutionViewed: z.boolean(),
  tries: z.number().int().min(0),
  planned: z.enum(['retry_same', 'ask_followup', 'show_explanation', 'ask_another_item', 'ask_transfer', 'ask_harder_transfer', 'next_family', 'all_done']).nullable(),
});
const blankRunValue = { started: 0, hints: 0, solutionViewed: false, tries: 0, planned: null } as const;
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
    z.object({ kind: z.literal('question'), question: questionSchema, run: runSchema.default(blankRunValue) }),
    z.object({
      kind: z.literal('review'),
      question: questionSchema,
      run: runSchema,
      answerDisplay: z.string().max(40),
      outcome: z.enum(['correct', 'possible_misconception', 'needs_more_evidence']),
      pattern: z.enum(['add_across', 'bigger_denominator', 'scale_one_part', 'additive_scaling', 'not_equivalent']).nullable(),
      labelled: z.boolean(),
    }),
    // Saved by an earlier version: restart that question rather than discard the learner's progress.
    z.object({ kind: z.literal('explanation'), question: questionSchema, labelled: z.boolean() }).transform((old) => ({ kind: 'question' as const, question: old.question, run: blankRunValue })),
    z.object({ kind: z.literal('finished') }),
  ]),
});

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export interface Settings {
  theme: ThemeChoice;
}
// Older versions also stored a sample-learner switch; unknown keys are ignored.
const settingsSchema = z.object({ theme: z.enum(THEME_CHOICES).default('system') });
const DEFAULT_SETTINGS: Settings = { theme: 'system' };

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

function hasStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
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
  if (parsed.success) return normaliseLearner(parsed.data);
  // Save a new learner straight away so a reload shows the same first question.
  const fresh = createLearner(randomSeed());
  saveLearner(fresh);
  return fresh;
}

type StoredLearner = z.infer<typeof learnerSchema>;

function normaliseLearner(stored: StoredLearner): LearnerState {
  const fix = (progress: StoredLearner['families']['F1']) => ({
    ...progress,
    attempts: progress.attempts.map((a) => ({ ...a, independent: a.independent ?? !a.hintUsed })),
  });
  return { ...stored, families: { F1: fix(stored.families.F1), F2: fix(stored.families.F2), F3: fix(stored.families.F3) } };
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
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  writeJson(SETTINGS_KEY, settings);
}

/** "system" removes the attribute so the operating-system preference applies through CSS. */
export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

// ---------------------------------------------------------------------------------------------
// Activity history for "My progress": versioned, validated on load, bounded, and free of free-text working or questions.

const historyEntrySchema = z.object({
  key: z.string().min(1).max(80),
  source: z.enum(['solve', 'practice']),
  topic: z.enum(['add', 'sub', 'mul', 'div', 'compare', 'equivalent']),
  problem: problemSchema,
  at: z.number().int().min(0).nullable(),
  wrong: z.number().int().min(0).max(1000),
  hint: z.boolean(),
  solution: z.boolean(),
  correct: z.boolean(),
  answer: z.string().max(MAX_ANSWER_CHARS).nullable(),
});
const historySchema = z.object({ version: z.literal(1), entries: z.array(historyEntrySchema).max(MAX_ENTRIES) });

/**
 * Loads history. If none was ever saved, builds it from existing practice progress so earlier work is kept. If something is
 * saved but invalid, starts empty rather than guessing. An empty saved history stays empty (deleted history is not rebuilt).
 */
export function loadHistory(learner: LearnerState): History {
  const raw = readJson(HISTORY_KEY);
  if (raw === null && !hasStored(HISTORY_KEY)) {
    const migrated = historyFromLearner(learner);
    saveHistory(migrated);
    return migrated;
  }
  const parsed = historySchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyHistory();
}

/** Returns false when the browser refuses storage (private mode, quota full). */
export function saveHistory(history: History): boolean {
  return writeJson(HISTORY_KEY, history);
}

/** Deletes the history. An empty history is saved so it is not rebuilt from practice progress. */
export function clearHistory(): History {
  const empty = emptyHistory();
  saveHistory(empty);
  return empty;
}

/** Removes everything this app stored on the device. */
export function clearAllData(): void {
  try {
    for (const key of [STORAGE_KEY, SETTINGS_KEY, HISTORY_KEY]) window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}
