/**
 * Reproducible learner scripts for the README demo contexts and the engine tests.
 * Never used by the app UI: no sample or made-up learners appear anywhere a student can see.
 */
import { FAMILIES } from './families/index.js';
import { continueFromReview, createLearner, submitAnswer, type LearnerState, type NextAction } from './progression.js';

/**
 * 'wrong' gives the family's misconception answer; 'right' the correct answer; 'continue' moves on from a review.
 * A move that answers while a review is showing first continues from it, as a learner would by pressing the button.
 */
export type ScriptMove = 'wrong' | 'right' | 'continue';

export interface ScriptRun {
  readonly state: LearnerState;
  readonly actions: readonly NextAction[];
}

export function runScript(seed: number, moves: readonly ScriptMove[]): ScriptRun {
  let state = createLearner(seed);
  const actions: NextAction[] = [];
  for (const move of moves) {
    if (move === 'continue' || state.step.kind === 'review') state = continueFromReview(state);
    if (move === 'continue') continue;
    if (state.step.kind !== 'question') throw new Error(`Script expected a question but found ${state.step.kind}`);
    const question = state.step.question;
    const family = FAMILIES[question.family];
    const answer = move === 'wrong' ? family.misconceptionAnswer(question) : family.correctAnswer(question);
    const result = submitAnswer(state, answer);
    state = result.state;
    actions.push(result.action);
  }
  return { state, actions };
}

/** Fixed seed so the README examples and tests always show the same numbers. */
export const DEMO_SEED = 20261119;

export const DEMO_CONTEXTS = {
  /** 1. New learner, one error matching F1 once → ask a follow-up before labelling. */
  newLearnerOneError: ['wrong'],
  /** 2. Same F1 error on the item and on the follow-up → explanation, then a transfer question. */
  repeatedError: ['wrong', 'wrong', 'continue'],
  /** 3. Correct on the transfer question after the explanation → harder transfer (family "improving"). */
  transferAfterExplanation: ['wrong', 'wrong', 'continue', 'right'],
} as const satisfies Record<string, readonly ScriptMove[]>;
