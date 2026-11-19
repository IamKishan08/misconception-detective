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
  /** A hint or the worked solution was used before this answer. */
  readonly hintUsed: boolean;
  /**
   * True only for a first answer given with no hint, no solution and no earlier try on this question.
   * Only independent attempts can move a family towards "secure".
   */
  readonly independent: boolean;
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

/** Support the learner has used on the question currently on screen. Carried through retries. */
export interface Run {
  /** Counter value when this question was shown: with the question id it identifies this attempt run, so history never double counts. */
  readonly started: number;
  readonly hints: number;
  readonly solutionViewed: boolean;
  /** Wrong answers already given to this question. */
  readonly tries: number;
  /** What happens next if the learner chooses to move on after a wrong answer. Set by the first wrong answer. */
  readonly planned: NextAction | null;
}

export type Step =
  | { readonly kind: 'question'; readonly question: Question; readonly run: Run }
  /** Shown after an answer that needs another look. The question stays; nothing is replaced until the learner continues. */
  | {
      readonly kind: 'review';
      readonly question: Question;
      readonly run: Run;
      readonly answerDisplay: string;
      readonly outcome: Exclude<Outcome, 'invalid_input'>;
      readonly pattern: PatternId | null;
      readonly labelled: boolean;
    }
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
/** Wrong answers to the same question after which support is shown automatically instead of only offered. */
export const SUPPORT_AFTER_TRIES = 2;
/** Hints available per question before only the step-by-step solution is left. */
export const MAX_HINTS = 2;
/** Hint levels passed to the explanation writer: 0 none, 1 one hint, 2 two or more. */
export const MAX_HINT_LEVEL = 2;

function emptyProgress(): FamilyProgress {
  return { status: 'not_started', attempts: [], transferStreak: 0, unmatchedWrong: 0, hintsUsed: 0 };
}

function seenIds(progress: FamilyProgress): Set<string> {
  return new Set(progress.attempts.map((a) => a.question.id));
}

export function blankRun(started = 0): Run {
  return { started, hints: 0, solutionViewed: false, tries: 0, planned: null };
}

/** True when nothing but the learner's own thinking went into the answer being given. */
export function isIndependent(run: Run): boolean {
  return run.hints === 0 && !run.solutionViewed && run.tries === 0;
}

function nextQuestion(state: LearnerState, family: FamilyId, stage: Stage, difficulty: Difficulty, avoid?: string): { question: Question; counter: number } {
  const rng = createRng(deriveSeed(state.seedBase, state.counter));
  const seen = seenIds(state.families[family]);
  if (avoid !== undefined) seen.add(avoid);
  const question = generateQuestion(family, stage, difficulty, rng, seen);
  return { question, counter: state.counter + 1 };
}

function withQuestion(state: LearnerState, family: FamilyId, stage: Stage, difficulty: Difficulty, avoid?: string): LearnerState {
  const { question, counter } = nextQuestion(state, family, stage, difficulty, avoid);
  return { ...state, counter, activeFamily: family, step: { kind: 'question', question, run: blankRun(state.counter) } };
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
function decide(stage: Stage, outcome: AttemptRecord['outcome'], progress: FamilyProgress, family: FamilyId, ctx: AnswerContext, independent: boolean): Decision {
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
  if (outcome === 'correct' && independent) {
    const streak = progress.transferStreak + 1;
    const hadErrors = progress.attempts.some((a) => a.outcome !== 'correct');
    const cleared = { ...keep, unmatchedWrong: 0 };
    if (!hadErrors || streak >= SECURE_STREAK) return { ...cleared, status: 'secure', transferStreak: streak, action: 'next_family' };
    return { ...cleared, status: 'improving', transferStreak: streak, action: 'ask_harder_transfer' };
  }
  // Correct only with help: not independent evidence, so the streak restarts and no status improves.
  if (outcome === 'correct') return { ...keep, transferStreak: 0, action: 'ask_transfer' };
  if (outcome === 'possible_misconception') return { ...keep, status: 'likely', transferStreak: 0, action: 'show_explanation' };
  // A wrong answer that matches no known pattern: never loop on new transfer questions without support.
  const count = progress.unmatchedWrong + 1;
  return { ...keep, transferStreak: 0, unmatchedWrong: count, action: count >= UNMATCHED_BEFORE_SUPPORT ? 'show_explanation' : 'ask_transfer' };
}

function applyAction(state: LearnerState, family: FamilyId, action: NextAction): LearnerState {
  switch (action) {
    case 'ask_followup':
      return withQuestion(state, family, 'followup', 1);
    case 'ask_another_item':
      return withQuestion(state, family, 'item', 1);
    case 'ask_transfer':
      return withQuestion(state, family, 'transfer', 1);
    case 'ask_harder_transfer':
      return withQuestion(state, family, 'transfer', 2);
    case 'show_explanation': {
      // The explanation has been offered; new numbers check the idea once the learner chooses to continue.
      const difficulty: Difficulty = state.families[family].status === 'improving' ? 2 : 1;
      return withQuestion(state, family, 'transfer', difficulty);
    }
    case 'next_family': {
      const next = nextUnsecuredFamily(state, family);
      return next === null ? { ...state, step: { kind: 'finished' } } : startFamily(state, next);
    }
    case 'all_done':
    case 'retry_same':
      return state;
  }
}

/** The question or review currently on screen, with the support used so far. */
function activeRun(state: LearnerState): { question: Question; run: Run } | null {
  const step = state.step;
  return step.kind === 'finished' ? null : { question: step.question, run: step.run };
}

function withRun(state: LearnerState, run: Run): LearnerState {
  const step = state.step;
  if (step.kind === 'finished') return state;
  return { ...state, step: { ...step, run } };
}

/**
 * Records that a hint was shown. Allowed on any question, so a learner who does not know how to begin never has to
 * submit a wrong answer to get help. The answer that follows is not independent evidence.
 */
export function requestHint(state: LearnerState): LearnerState {
  const active = activeRun(state);
  if (active === null || active.run.hints >= MAX_HINTS) return state;
  return withRun(state, { ...active.run, hints: active.run.hints + 1 });
}

/** Records that the worked solution was opened. Like a hint, it makes any later answer to this question assisted. */
export function markSolutionViewed(state: LearnerState): LearnerState {
  const active = activeRun(state);
  if (active === null || active.run.solutionViewed) return state;
  return withRun(state, { ...active.run, solutionViewed: true });
}

/** Goes back to the same question after a wrong answer. Nothing is replaced and no new evidence is added. */
export function tryAgain(state: LearnerState): LearnerState {
  if (state.step.kind !== 'review') return state;
  return { ...state, step: { kind: 'question', question: state.step.question, run: state.step.run } };
}

/** The learner chose to move on after reviewing. Only now does the planned next question appear. */
export function continueFromReview(state: LearnerState): LearnerState {
  if (state.step.kind !== 'review') return state;
  const { question, run } = state.step;
  return applyAction(state, question.family, run.planned ?? 'ask_transfer');
}

/**
 * When the engine itself decides support is needed (an idea matched twice, repeated unmatched answers, or repeated tries
 * on one question) the explanation is shown straight away rather than only offered. Showing it counts as viewing it.
 */
function withAutoSupport(run: Run, outcome: AttemptRecord['outcome']): Run {
  if (outcome === 'correct' || run.solutionViewed) return run;
  return run.planned === 'show_explanation' || needsProactiveSupport(run) ? { ...run, solutionViewed: true } : run;
}

/**
 * "Give me a similar problem" in guided practice: a different question of the same kind (same idea, stage and difficulty).
 * It records nothing: evidence from the current question stays as it was, and the learner chose to move on.
 */
export function similarQuestion(state: LearnerState): LearnerState {
  const step = state.step;
  if (step.kind === 'finished') return state;
  const { question } = step;
  return withQuestion(state, question.family, question.stage, question.difficulty, question.id);
}

/** True once repeated wrong answers mean support should be shown rather than only offered. */
export function needsProactiveSupport(run: Run): boolean {
  return run.tries >= SUPPORT_AFTER_TRIES;
}

/**
 * Checks an answer for the current question. A correct first answer moves straight on. Any other answer leaves the
 * question on screen in a review step. Evidence rules:
 *  - the first wrong answer is evidence (patterns, labels) exactly as before;
 *  - later answers to the same question are recorded but never strengthen a label or a streak;
 *  - only a first answer with no hint and no solution can count towards "secure".
 * Makes no model calls.
 */
export function submitAnswer(state: LearnerState, answer: Answer, ctx: AnswerContext = {}): StepResult {
  if (state.step.kind !== 'question') throw new Error('No question is waiting for an answer');
  const { question, run } = state.step;
  const family = question.family;
  const evaluation = FAMILIES[family].evaluate(question, answer);
  if (!evaluation.valid) {
    return { state, outcome: 'invalid_input', pattern: null, action: 'retry_same', invalidReason: evaluation.reason };
  }

  const outcome = classify(evaluation.correct, evaluation.pattern);
  const progress = state.families[family];
  const independent = isIndependent(run);
  const helped = run.hints > 0 || run.solutionViewed;
  const attempt: AttemptRecord = {
    seq: state.counter,
    stage: question.stage,
    question,
    answerDisplay: evaluation.display,
    outcome,
    pattern: evaluation.pattern,
    hintUsed: helped,
    independent,
    reasonId: ctx.reasonId ?? null,
  };
  const attempts = [...progress.attempts, attempt].slice(-MAX_ATTEMPTS_PER_FAMILY);
  const review = (nextRun: Run, status: FamilyStatus): Step => ({
    kind: 'review',
    question,
    run: nextRun,
    answerDisplay: evaluation.display,
    outcome,
    pattern: evaluation.pattern,
    labelled: status === 'likely',
  });

  if (run.tries > 0) {
    // A repeat answer to the same question: kept as a record, but it is the same evidence, so no rule fires again.
    const recorded: LearnerState = {
      ...state,
      counter: state.counter + 1,
      families: { ...state.families, [family]: { ...progress, attempts } },
    };
    const nextRun = withAutoSupport({ ...run, tries: run.tries + 1 }, outcome);
    return { state: { ...recorded, step: review(nextRun, progress.status) }, outcome, pattern: evaluation.pattern, action: nextRun.planned ?? 'ask_transfer' };
  }

  const decision = decide(question.stage, outcome, progress, family, ctx, independent);
  const updated: FamilyProgress = {
    status: decision.status,
    transferStreak: decision.transferStreak,
    unmatchedWrong: decision.unmatchedWrong,
    hintsUsed: progress.hintsUsed + (helped ? 1 : 0),
    attempts,
  };
  const recorded: LearnerState = { ...state, counter: state.counter + 1, families: { ...state.families, [family]: updated } };
  if (outcome === 'correct') {
    const next = applyAction(recorded, family, decision.action);
    return { state: next, outcome, pattern: evaluation.pattern, action: next.step.kind === 'finished' && decision.action === 'next_family' ? 'all_done' : decision.action };
  }
  const nextRun = withAutoSupport({ ...run, tries: 1, planned: decision.action }, outcome);
  return { state: { ...recorded, step: review(nextRun, decision.status) }, outcome, pattern: evaluation.pattern, action: decision.action };
}

/** Count of families marked secure, for the "ideas mastered" path. */
export function securedCount(state: LearnerState): number {
  return FAMILY_ORDER.filter((f) => state.families[f].status === 'secure').length;
}
