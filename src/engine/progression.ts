/**
 * Progression rules: pure functions from (learner state, answer) to (new state, next action).
 * These are MVP heuristics, not validated mastery measures.
 */
import { FAMILIES, generateQuestion } from './families/index.js';
import { createRng, deriveSeed } from './random.js';
import {
  FAMILY_ORDER,
  type Answer,
  type Difficulty,
  type FamilyId,
  type InvalidReason,
  type Outcome,
  type PatternId,
  type Question,
  type Stage,
} from './types.js';

export type FamilyStatus = 'not_started' | 'checking' | 'possible' | 'likely' | 'improving' | 'secure';

/** Reasoning choices a learner can tap instead of typing. */
export const REASON_IDS = ['added_tops_bottoms', 'bigger_bottom_bigger', 'changed_one_number', 'counted_parts', 'not_sure'] as const;
export type ReasonId = (typeof REASON_IDS)[number];

/** Which family a reasoning choice points to. A reason can only prompt a follow-up, never set a label. */
export const REASON_FAMILY: Readonly<Record<ReasonId, FamilyId | null>> = {
  added_tops_bottoms: 'F1',
  bigger_bottom_bigger: 'F2',
  changed_one_number: 'F3',
  counted_parts: null,
  not_sure: null,
};

export interface AttemptRecord {
  readonly seq: number;
  readonly stage: Stage;
  readonly question: Question;
  readonly answerDisplay: string;
  readonly outcome: Exclude<Outcome, 'invalid_input'>;
  readonly pattern: PatternId | null;
  readonly hintUsed: boolean;
  readonly reasonId: ReasonId | null;
}

export interface FamilyProgress {
  readonly status: FamilyStatus;
  readonly attempts: readonly AttemptRecord[];
  /** Consecutive transfer questions answered correctly without a hint. */
  readonly transferStreak: number;
  /** Wrong answers in this family that matched no known pattern. */
  readonly unmatchedWrong: number;
  readonly hintsUsed: number;
}

export type Step =
  | { readonly kind: 'question'; readonly question: Question }
  | { readonly kind: 'explanation'; readonly question: Question; readonly labelled: boolean }
  | { readonly kind: 'finished' };

export interface LearnerState {
  readonly version: 1;
  readonly seedBase: number;
  readonly counter: number;
  readonly activeFamily: FamilyId;
  readonly families: Readonly<Record<FamilyId, FamilyProgress>>;
  readonly step: Step;
}

export type NextAction =
  | 'retry_same'
  | 'ask_followup'
  | 'show_explanation'
  | 'ask_another_item'
  | 'ask_transfer'
  | 'ask_harder_transfer'
  | 'next_family'
  | 'all_done';

export interface AnswerContext {
  readonly reasonId?: ReasonId | null;
  /** Family suggested by the model from free text. Treated exactly like a reasoning choice: it can only prompt a follow-up. */
  readonly suggestedFamily?: FamilyId | null;
  readonly hintUsed?: boolean;
}

export interface StepResult {
  readonly state: LearnerState;
  readonly outcome: Outcome;
  readonly pattern: PatternId | null;
  readonly action: NextAction;
  readonly invalidReason?: InvalidReason;
}

/** Transfer questions in a row (no hint) needed to call a family "secure" once any error was seen. */
export const SECURE_STREAK = 2;
/** Unmatched wrong answers in a family before showing the explanation anyway (without a label). */
export const UNMATCHED_BEFORE_SUPPORT = 2;
/** Attempts kept per family in local storage; older ones are dropped to bound storage. */
export const MAX_ATTEMPTS_PER_FAMILY = 20;
/** Hint levels passed to the explanation writer: 0 none, 1 one hint, 2 two or more. */
export const MAX_HINT_LEVEL = 2;

function emptyProgress(): FamilyProgress {
  return { status: 'not_started', attempts: [], transferStreak: 0, unmatchedWrong: 0, hintsUsed: 0 };
}

function seenIds(progress: FamilyProgress): Set<string> {
  return new Set(progress.attempts.map((a) => a.question.id));
}

function nextQuestion(state: LearnerState, family: FamilyId, stage: Stage, difficulty: Difficulty): { question: Question; counter: number } {
  const rng = createRng(deriveSeed(state.seedBase, state.counter));
  const question = generateQuestion(family, stage, difficulty, rng, seenIds(state.families[family]));
  return { question, counter: state.counter + 1 };
}

function withQuestion(state: LearnerState, family: FamilyId, stage: Stage, difficulty: Difficulty): LearnerState {
  const { question, counter } = nextQuestion(state, family, stage, difficulty);
  return { ...state, counter, activeFamily: family, step: { kind: 'question', question } };
}

export function createLearner(seedBase: number): LearnerState {
  const families: Record<FamilyId, FamilyProgress> = { F1: emptyProgress(), F2: emptyProgress(), F3: emptyProgress() };
  const blank: LearnerState = { version: 1, seedBase: seedBase >>> 0, counter: 0, activeFamily: 'F1', families, step: { kind: 'finished' } };
  return startFamily(blank, 'F1');
}

/** Moves to a family's first item (also used when the learner picks a family on the path). */
export function startFamily(state: LearnerState, family: FamilyId): LearnerState {
  const progress = state.families[family];
  const status: FamilyStatus = progress.status === 'not_started' ? 'checking' : progress.status;
  const next = { ...state, families: { ...state.families, [family]: { ...progress, status } } };
  return withQuestion(next, family, 'item', 1);
}

export function hintLevel(progress: FamilyProgress): number {
  return Math.min(progress.hintsUsed, MAX_HINT_LEVEL);
}

function classify(correct: boolean, pattern: PatternId | null): Exclude<Outcome, 'invalid_input'> {
  if (correct) return 'correct';
  return pattern === null ? 'needs_more_evidence' : 'possible_misconception';
}

function nextUnsecuredFamily(state: LearnerState, after: FamilyId): FamilyId | null {
  const start = FAMILY_ORDER.indexOf(after);
  for (let i = 1; i <= FAMILY_ORDER.length; i += 1) {
    const family = FAMILY_ORDER[(start + i) % FAMILY_ORDER.length];
    if (family !== undefined && state.families[family].status !== 'secure') return family;
  }
  return null;
}

interface Decision {
  status: FamilyStatus;
  transferStreak: number;
  unmatchedWrong: number;
  action: NextAction;
}

/** The core rules. `progress` already excludes the current attempt. */
function decide(stage: Stage, outcome: AttemptRecord['outcome'], progress: FamilyProgress, family: FamilyId, ctx: AnswerContext): Decision {
  const keep = { status: progress.status, transferStreak: progress.transferStreak, unmatchedWrong: progress.unmatchedWrong };
  const hinted = ctx.reasonId != null && REASON_FAMILY[ctx.reasonId] === family;
  const suggested = hinted || ctx.suggestedFamily === family;
  const unmatched = (): Decision => {
    const count = progress.unmatchedWrong + 1;
    return { ...keep, unmatchedWrong: count, action: count >= UNMATCHED_BEFORE_SUPPORT ? 'show_explanation' : 'ask_another_item' };
  };

  if (stage === 'item') {
    if (outcome === 'correct') {
      // Keep an existing label: one correct item is not enough evidence to drop it.
      const labelled = progress.status === 'possible' || progress.status === 'likely';
      return { ...keep, status: labelled ? progress.status : 'checking', action: 'ask_transfer' };
    }
    if (outcome === 'possible_misconception') {
      // A second matching item (after a correct follow-up) is enough to strengthen the label.
      return progress.status === 'possible' || progress.status === 'likely'
        ? { ...keep, status: 'likely', action: 'show_explanation' }
        : { ...keep, status: 'possible', action: 'ask_followup' };
    }
    if (suggested) return { ...keep, action: 'ask_followup' };
    return unmatched();
  }

  if (stage === 'followup') {
    if (outcome === 'possible_misconception') return { ...keep, status: 'likely', action: 'show_explanation' };
    if (outcome === 'correct') return { ...keep, action: 'ask_another_item' };
    return unmatched();
  }

  // Transfer question.
  if (outcome === 'correct' && ctx.hintUsed !== true) {
    const streak = progress.transferStreak + 1;
    const hadErrors = progress.attempts.some((a) => a.outcome !== 'correct');
    if (!hadErrors || streak >= SECURE_STREAK) return { ...keep, status: 'secure', transferStreak: streak, action: 'next_family' };
    return { ...keep, status: 'improving', transferStreak: streak, action: 'ask_harder_transfer' };
  }
  if (outcome === 'correct') return { ...keep, transferStreak: 0, action: 'ask_transfer' };
  if (outcome === 'possible_misconception') return { ...keep, status: 'likely', transferStreak: 0, action: 'show_explanation' };
  return { ...keep, transferStreak: 0, action: 'ask_transfer' };
}

function applyAction(state: LearnerState, family: FamilyId, action: NextAction, explained: Question): { state: LearnerState; action: NextAction } {
  switch (action) {
    case 'ask_followup':
      return { state: withQuestion(state, family, 'followup', 1), action };
    case 'ask_another_item':
      return { state: withQuestion(state, family, 'item', 1), action };
    case 'ask_transfer':
      return { state: withQuestion(state, family, 'transfer', 1), action };
    case 'ask_harder_transfer':
      return { state: withQuestion(state, family, 'transfer', 2), action };
    case 'show_explanation': {
      const labelled = state.families[family].status === 'likely';
      return { state: { ...state, step: { kind: 'explanation', question: explained, labelled } }, action };
    }
    case 'next_family': {
      const next = nextUnsecuredFamily(state, family);
      if (next === null) return { state: { ...state, step: { kind: 'finished' } }, action: 'all_done' };
      return { state: startFamily(state, next), action };
    }
    case 'all_done':
    case 'retry_same':
      return { state, action };
  }
}

/** Checks an answer for the current question and decides the next step. Makes no model calls. */
export function submitAnswer(state: LearnerState, answer: Answer, ctx: AnswerContext = {}): StepResult {
  if (state.step.kind !== 'question') throw new Error('No question is waiting for an answer');
  const question = state.step.question;
  const family = question.family;
  const evaluation = FAMILIES[family].evaluate(question, answer);
  if (!evaluation.valid) {
    return { state, outcome: 'invalid_input', pattern: null, action: 'retry_same', invalidReason: evaluation.reason };
  }

  const outcome = classify(evaluation.correct, evaluation.pattern);
  const progress = state.families[family];
  const hintUsed = question.stage === 'transfer' && ctx.hintUsed === true;
  const decision = decide(question.stage, outcome, progress, family, ctx);
  const attempt: AttemptRecord = {
    seq: state.counter,
    stage: question.stage,
    question,
    answerDisplay: evaluation.display,
    outcome,
    pattern: evaluation.pattern,
    hintUsed,
    reasonId: ctx.reasonId ?? null,
  };
  const updated: FamilyProgress = {
    status: decision.status,
    transferStreak: decision.transferStreak,
    unmatchedWrong: decision.unmatchedWrong,
    hintsUsed: progress.hintsUsed + (hintUsed ? 1 : 0),
    attempts: [...progress.attempts, attempt].slice(-MAX_ATTEMPTS_PER_FAMILY),
  };
  const recorded: LearnerState = { ...state, counter: state.counter + 1, families: { ...state.families, [family]: updated } };
  const next = applyAction(recorded, family, decision.action, question);
  return { state: next.state, outcome, pattern: evaluation.pattern, action: next.action };
}

/** After the learner has stepped through an explanation, check the idea with new numbers. */
export function continueAfterExplanation(state: LearnerState): LearnerState {
  if (state.step.kind !== 'explanation') return state;
  const family = state.step.question.family;
  const difficulty: Difficulty = state.families[family].status === 'improving' ? 2 : 1;
  return withQuestion(state, family, 'transfer', difficulty);
}

/** Count of families marked secure, for the "ideas mastered" path. */
export function securedCount(state: LearnerState): number {
  return FAMILY_ORDER.filter((f) => state.families[f].status === 'secure').length;
}
