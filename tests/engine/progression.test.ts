import { DEMO_CONTEXTS, DEMO_SEED, runScript } from '../../src/engine/demo.js';
import { FAMILIES } from '../../src/engine/families/index.js';
import {
  MAX_ATTEMPTS_PER_FAMILY,
  MAX_HINTS,
  continueFromReview,
  createLearner,
  isIndependent,
  markSolutionViewed,
  requestHint,
  similarQuestion,
  submitAnswer,
  tryAgain,
  type LearnerState,
} from '../../src/engine/progression.js';
import type { Answer, Question } from '../../src/engine/types.js';

function current(state: LearnerState): Question {
  if (state.step.kind !== 'question') throw new Error(`expected a question, got ${state.step.kind}`);
  return state.step.question;
}
function reviewed(state: LearnerState) {
  if (state.step.kind !== 'review') throw new Error(`expected a review, got ${state.step.kind}`);
  return state.step;
}
const wrong = (s: LearnerState) => FAMILIES[current(s).family].misconceptionAnswer(current(s));
const right = (s: LearnerState) => FAMILIES[current(s).family].correctAnswer(current(s));

/** An F1 answer that is wrong but matches no pattern (sum and across answers are both < 1 here). */
const unmatched: Answer = { kind: 'fraction', numerator: '7', denominator: '3' };

describe('the three demo contexts lead to different next actions', () => {
  it('1. new learner, one matching error → the question stays for review; a follow-up is planned, label only "possible"', () => {
    const run = runScript(DEMO_SEED, DEMO_CONTEXTS.newLearnerOneError);
    expect(run.actions).toEqual(['ask_followup']);
    expect(run.state.families.F1.status).toBe('possible');
    expect(reviewed(run.state).run.planned).toBe('ask_followup');
    expect(current(continueFromReview(run.state)).stage).toBe('followup');
  });

  it('2. same F1 error on item and follow-up → explanation shown with the question, then a transfer question', () => {
    const before = runScript(DEMO_SEED, ['wrong', 'wrong']);
    expect(before.actions).toEqual(['ask_followup', 'show_explanation']);
    expect(before.state.step).toMatchObject({ kind: 'review', labelled: true, run: { solutionViewed: true, planned: 'show_explanation' } });
    expect(before.state.families.F1.status).toBe('likely');
    const after = runScript(DEMO_SEED, DEMO_CONTEXTS.repeatedError);
    expect(current(after.state).stage).toBe('transfer');
  });

  it('3. correct transfer after explanation → harder transfer, family "improving"', () => {
    const run = runScript(DEMO_SEED, DEMO_CONTEXTS.transferAfterExplanation);
    expect(run.actions.at(-1)).toBe('ask_harder_transfer');
    expect(run.state.families.F1.status).toBe('improving');
    expect(current(run.state)).toMatchObject({ stage: 'transfer', difficulty: 2 });
  });

  it('two transfers in a row without hints → secure and on to the next family', () => {
    const run = runScript(DEMO_SEED, [...DEMO_CONTEXTS.transferAfterExplanation, 'right']);
    expect(run.actions.at(-1)).toBe('next_family');
    expect(run.state.families.F1.status).toBe('secure');
    expect(current(run.state).family).toBe('F2');
  });
});

describe('progression rules', () => {
  it('correct item then correct transfer with no errors → secure', () => {
    const run = runScript(7, ['right', 'right']);
    expect(run.actions).toEqual(['ask_transfer', 'next_family']);
    expect(run.state.families.F1.status).toBe('secure');
  });

  it('follow-up answered correctly → needs more evidence: a different item from the same family', () => {
    const run = runScript(7, ['wrong', 'right']);
    expect(run.actions).toEqual(['ask_followup', 'ask_another_item']);
    const q = current(run.state);
    expect(q).toMatchObject({ family: 'F1', stage: 'item' });
    expect(run.state.families.F1.attempts.map((a) => a.question.id)).not.toContain(q.id);
  });

  it('a second matching item after a correct follow-up strengthens the label', () => {
    const run = runScript(7, ['wrong', 'right', 'wrong']);
    expect(run.actions.at(-1)).toBe('show_explanation');
    expect(run.state.families.F1.status).toBe('likely');
  });

  it('an unmatched wrong answer never sets a label; the second one shows unlabelled support', () => {
    const state = createLearner(9);
    const first = submitAnswer(state, unmatched);
    expect(first).toMatchObject({ outcome: 'needs_more_evidence', action: 'ask_another_item' });
    expect(first.state.families.F1.status).toBe('checking');
    expect(reviewed(first.state).run.solutionViewed).toBe(false);
    const second = submitAnswer(continueFromReview(first.state), unmatched);
    expect(second.action).toBe('show_explanation');
    expect(second.state.step).toMatchObject({ kind: 'review', labelled: false, run: { solutionViewed: true } });
  });

  it('a reasoning choice or model suggestion only prompts a follow-up, never a label', () => {
    const state = createLearner(9);
    const viaReason = submitAnswer(state, unmatched, { reasonId: 'added_tops_bottoms' });
    expect(viaReason.action).toBe('ask_followup');
    expect(viaReason.state.families.F1.status).toBe('checking');
    const viaModel = submitAnswer(state, unmatched, { suggestedFamily: 'F1' });
    expect(viaModel.action).toBe('ask_followup');
    expect(submitAnswer(state, right(state), { suggestedFamily: 'F1' }).outcome).toBe('correct');
  });

  it('invalid input changes nothing and asks to retry', () => {
    const state = createLearner(9);
    const result = submitAnswer(state, { kind: 'fraction', numerator: '1', denominator: '0' });
    expect(result).toMatchObject({ outcome: 'invalid_input', action: 'retry_same', invalidReason: 'zero_denominator' });
    expect(result.state).toBe(state);
  });

  it('the misconception on a transfer question gets the explanation, and new numbers only after continuing', () => {
    const { state } = runScript(DEMO_SEED, DEMO_CONTEXTS.repeatedError);
    const result = submitAnswer(state, wrong(state));
    expect(result.action).toBe('show_explanation');
    expect(reviewed(result.state).question.id).toBe(current(state).id);
    expect(continueFromReview(result.state).step.kind).toBe('question');
  });

  it('caps stored attempts per family', () => {
    let state = createLearner(3);
    for (let i = 0; i < MAX_ATTEMPTS_PER_FAMILY + 10; i += 1) {
      if (state.step.kind === 'review') state = continueFromReview(state);
      state = submitAnswer(state, unmatched).state;
    }
    expect(state.families.F1.attempts.length).toBeLessThanOrEqual(MAX_ATTEMPTS_PER_FAMILY);
  });

  it('finishes once every family is secure', () => {
    const run = runScript(11, ['right', 'right', 'right', 'right', 'right', 'right']);
    expect(run.actions.at(-1)).toBe('all_done');
    expect(run.state.step.kind).toBe('finished');
  });
});

describe('guided practice never takes a question away before it can be reviewed', () => {
  it('keeps the original question on screen after any incorrect answer, at every stage and for every family', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      let state = createLearner(seed);
      for (let i = 0; i < 40 && state.step.kind !== 'finished'; i += 1) {
        if (state.step.kind === 'review') state = continueFromReview(state);
        if (state.step.kind !== 'question') break;
        const asked = state.step.question;
        const answer = i % 3 === 0 ? unmatchedFor(state) : i % 3 === 1 ? wrong(state) : right(state);
        const result = submitAnswer(state, answer);
        if (result.outcome === 'possible_misconception' || result.outcome === 'needs_more_evidence') {
          const review = reviewed(result.state);
          expect(review.question).toEqual(asked);
          expect(review.answerDisplay).not.toBe('');
          // Trying again returns to the very same question.
          expect(current(tryAgain(result.state))).toEqual(asked);
        }
        state = result.state;
      }
    }
  });

  /** A wrong answer that matches no pattern, shaped for whatever kind of question is showing. */
  function unmatchedFor(state: LearnerState): Answer {
    const q = current(state);
    const correct = FAMILIES[q.family].correctAnswer(q);
    const misc = FAMILIES[q.family].misconceptionAnswer(q);
    if (q.body.type === 'add') return unmatched;
    if (correct.kind === 'whole') return { kind: 'whole', value: String(Number(correct.value) + 37) };
    if (correct.kind === 'choice' && misc.kind === 'choice') {
      const other = ['first', 'second', 'equal'].find((id) => id !== correct.optionId && id !== misc.optionId);
      return { kind: 'choice', optionId: other ?? misc.optionId };
    }
    return misc;
  }

  it('does not generate the next question until the learner chooses to continue', () => {
    const state = createLearner(5);
    const result = submitAnswer(state, unmatched);
    expect(result.state.counter).toBe(state.counter + 1);
    const after = tryAgain(result.state);
    expect(after.counter).toBe(result.state.counter);
    const next = continueFromReview(result.state);
    expect(next.counter).toBe(result.state.counter + 1);
    expect(current(next).id).not.toBe(current(state).id);
  });

  it('offers the next question only after continuing, and says what it will be', () => {
    const run = runScript(DEMO_SEED, ['wrong']);
    expect(reviewed(run.state).run.planned).toBe('ask_followup');
    expect(continueFromReview(run.state).step).toMatchObject({ kind: 'question', question: { stage: 'followup' } });
  });
});

describe('repeated unrecognised wrong answers always lead to support', () => {
  it('two unrecognised wrong answers on new transfer questions → the explanation is shown with the question, not another transfer', () => {
    // Item correct, so the next question is a transfer question.
    const afterItem = runScript(7, ['right']).state;
    expect(current(afterItem).stage).toBe('transfer');

    const first = submitAnswer(afterItem, unmatched);
    expect(first.outcome).toBe('needs_more_evidence');
    // The first one only offers help; nothing is forced on the learner yet.
    expect(first.action).toBe('ask_transfer');
    expect(reviewed(first.state).run.solutionViewed).toBe(false);

    const second = submitAnswer(continueFromReview(first.state), unmatched);
    expect(current(continueFromReview(first.state)).stage).toBe('transfer');
    expect(second.action).toBe('show_explanation');
    expect(second.state.step).toMatchObject({ kind: 'review', run: { solutionViewed: true, planned: 'show_explanation' } });
  });

  it('the old loop is gone: unrecognised transfer answers can never return ask_transfer indefinitely', () => {
    let state = runScript(7, ['right']).state;
    const actions: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      if (state.step.kind === 'review') state = continueFromReview(state);
      if (state.step.kind !== 'question') break;
      const result = submitAnswer(state, unmatched);
      actions.push(result.action);
      state = result.state;
    }
    expect(actions.slice(1).every((a) => a === 'show_explanation')).toBe(true);
    expect(actions.filter((a) => a === 'ask_transfer')).toHaveLength(1);
  });

  it('repeated wrong answers to the SAME question display support after the second try', () => {
    let state = runScript(7, ['right']).state;
    const asked = current(state);
    state = submitAnswer(state, unmatched).state;
    expect(reviewed(state).run).toMatchObject({ tries: 1, solutionViewed: false });
    state = submitAnswer(tryAgain(state), unmatched).state;
    const review = reviewed(state);
    expect(review.question).toEqual(asked);
    expect(review.run).toMatchObject({ tries: 2, solutionViewed: true });
  });

  it('a later unmatched answer does not strengthen any label or streak (retries are the same evidence)', () => {
    let state = createLearner(7);
    state = submitAnswer(state, wrong(state)).state;
    expect(state.families.F1.status).toBe('possible');
    const planned = reviewed(state).run.planned;
    state = submitAnswer(tryAgain(state), wrong(tryAgain(state))).state;
    expect(state.families.F1.status).toBe('possible');
    expect(reviewed(state).run.planned).toBe(planned);
    const attempts = state.families.F1.attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.independent)).toEqual([true, false]);
  });
});

describe('assisted answers are kept separate from independent evidence', () => {
  /** Learner on a transfer question after an explanation, as in the README demo. */
  const onTransfer = () => runScript(DEMO_SEED, DEMO_CONTEXTS.repeatedError).state;

  it('a hint can be taken on any question without submitting a wrong answer, and is capped', () => {
    let state = createLearner(5);
    expect(state.step.kind === 'question' && isIndependent(state.step.run)).toBe(true);
    for (let i = 0; i < MAX_HINTS + 3; i += 1) state = requestHint(state);
    const step = state.step;
    expect(step.kind === 'question' && step.run.hints).toBe(MAX_HINTS);
    expect(state.families.F1.attempts).toHaveLength(0);
  });

  it('a correct transfer answer after a hint does not count toward "secure"', () => {
    let state = onTransfer();
    state = requestHint(state);
    const result = submitAnswer(state, right(state));
    expect(result.action).toBe('ask_transfer');
    expect(result.state.families.F1).toMatchObject({ status: 'likely', transferStreak: 0, hintsUsed: 1 });
    expect(result.state.families.F1.attempts.at(-1)).toMatchObject({ hintUsed: true, independent: false });
  });

  it('viewing the solution first does not count either', () => {
    let state = onTransfer();
    state = markSolutionViewed(state);
    const result = submitAnswer(state, right(state));
    expect(result.state.families.F1.status).toBe('likely');
    expect(result.state.families.F1.transferStreak).toBe(0);
    expect(result.state.families.F1.attempts.at(-1)?.independent).toBe(false);
  });

  it('a correct answer on a second try is not independent evidence, but the learner can continue', () => {
    let state = onTransfer();
    state = submitAnswer(state, wrong(state)).state;
    const retry = tryAgain(state);
    const result = submitAnswer(retry, right(retry));
    expect(result.outcome).toBe('correct');
    expect(result.state.step).toMatchObject({ kind: 'review', outcome: 'correct' });
    expect(result.state.families.F1.status).toBe('likely');
    expect(result.state.families.F1.transferStreak).toBe(0);
    expect(continueFromReview(result.state).step.kind).toBe('question');
  });

  it('assisted answers never make a family secure, however many there are', () => {
    let state = createLearner(11);
    for (let i = 0; i < 12 && state.step.kind !== 'finished'; i += 1) {
      if (state.step.kind === 'review') state = continueFromReview(state);
      if (state.step.kind !== 'question') break;
      state = requestHint(state);
      state = submitAnswer(state, right(state)).state;
    }
    expect(state.families.F1.status).not.toBe('secure');
    expect(state.families.F2.status).not.toBe('secure');
    expect(state.families.F3.status).not.toBe('secure');
    expect(state.families.F1.attempts.every((a) => !a.independent)).toBe(true);
  });

  it('independent correct answers still do', () => {
    const run = runScript(7, ['right', 'right']);
    expect(run.state.families.F1.status).toBe('secure');
    expect(run.state.families.F1.attempts.every((a) => a.independent)).toBe(true);
  });
});

describe('"Give me a similar problem" in guided practice', () => {
  it('gives a different question of the same kind, only by the learner\u2019s choice, and records no evidence', () => {
    const answered = submitAnswer(createLearner(7), unmatched);
    const review = reviewed(answered.state);
    const similar = similarQuestion(answered.state);
    const next = current(similar);
    expect(next.id).not.toBe(review.question.id);
    expect(next).toMatchObject({ family: review.question.family, stage: review.question.stage, difficulty: review.question.difficulty });
    // The wrong answer already counted once; moving to a similar question adds nothing and resets support for the new question.
    expect(similar.families.F1.attempts).toEqual(answered.state.families.F1.attempts);
    expect(similar.families.F1.status).toBe(answered.state.families.F1.status);
    expect(similar.step).toMatchObject({ kind: 'question', run: { hints: 0, solutionViewed: false, tries: 0, planned: null } });
  });

  it('also works from an unanswered question and never repeats it', () => {
    const state = createLearner(11);
    const next = current(similarQuestion(state));
    expect(next.id).not.toBe(current(state).id);
  });

  it('each question shown has its own run id, so history cannot merge two attempts', () => {
    const a = createLearner(3);
    const b = similarQuestion(a);
    if (a.step.kind !== 'question' || b.step.kind !== 'question') throw new Error('expected questions');
    expect(a.step.run.started).not.toBe(b.step.run.started);
  });
});
