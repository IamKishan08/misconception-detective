import { DEMO_CONTEXTS, DEMO_SEED, buildSampleLearners, runScript } from '../../src/engine/demo.js';
import { FAMILIES } from '../../src/engine/families/index.js';
import {
  MAX_ATTEMPTS_PER_FAMILY,
  continueAfterExplanation,
  createLearner,
  submitAnswer,
  type LearnerState,
} from '../../src/engine/progression.js';
import { groupByFamily } from '../../src/engine/teacher.js';
import type { Answer, Question } from '../../src/engine/types.js';

function current(state: LearnerState): Question {
  if (state.step.kind !== 'question') throw new Error(`expected a question, got ${state.step.kind}`);
  return state.step.question;
}
const wrong = (s: LearnerState) => FAMILIES[current(s).family].misconceptionAnswer(current(s));
const right = (s: LearnerState) => FAMILIES[current(s).family].correctAnswer(current(s));

/** An F1 answer that is wrong but matches no pattern (sum and across answers are both < 1 here). */
const unmatched: Answer = { kind: 'fraction', numerator: '7', denominator: '3' };

describe('the three demo contexts lead to different next actions', () => {
  it('1. new learner, one matching error → follow-up question, label only "possible"', () => {
    const run = runScript(DEMO_SEED, DEMO_CONTEXTS.newLearnerOneError);
    expect(run.actions).toEqual(['ask_followup']);
    expect(run.state.families.F1.status).toBe('possible');
    expect(current(run.state).stage).toBe('followup');
  });

  it('2. same F1 error on item and follow-up → explanation, then a transfer question', () => {
    const before = runScript(DEMO_SEED, ['wrong', 'wrong']);
    expect(before.actions).toEqual(['ask_followup', 'show_explanation']);
    expect(before.state.step).toMatchObject({ kind: 'explanation', labelled: true });
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
    let state = createLearner(9);
    const first = submitAnswer(state, unmatched);
    expect(first).toMatchObject({ outcome: 'needs_more_evidence', action: 'ask_another_item' });
    expect(first.state.families.F1.status).toBe('checking');
    state = first.state;
    const second = submitAnswer(state, unmatched);
    expect(second.action).toBe('show_explanation');
    expect(second.state.step).toMatchObject({ kind: 'explanation', labelled: false });
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

  it('a transfer answered with a hint does not count toward secure', () => {
    let { state } = runScript(DEMO_SEED, DEMO_CONTEXTS.repeatedError);
    const result = submitAnswer(state, right(state), { hintUsed: true });
    expect(result.action).toBe('ask_transfer');
    expect(result.state.families.F1).toMatchObject({ status: 'likely', transferStreak: 0, hintsUsed: 1 });
    state = result.state;
    expect(current(state).stage).toBe('transfer');
  });

  it('the misconception on a transfer question returns to the explanation', () => {
    const { state } = runScript(DEMO_SEED, DEMO_CONTEXTS.repeatedError);
    const result = submitAnswer(state, wrong(state));
    expect(result.action).toBe('show_explanation');
    expect(continueAfterExplanation(result.state).step.kind).toBe('question');
  });

  it('caps stored attempts per family', () => {
    let state = createLearner(3);
    for (let i = 0; i < MAX_ATTEMPTS_PER_FAMILY + 10; i += 1) {
      if (state.step.kind === 'explanation') state = continueAfterExplanation(state);
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

describe('teacher grouping', () => {
  it('groups learners by family with observed attempts, keeping samples separate', () => {
    const real = runScript(DEMO_SEED, ['wrong', 'wrong']).state;
    const samples = buildSampleLearners().map((s) => ({ ...s, sample: true }));
    const groups = groupByFamily([{ id: 'you', displayName: 'You', sample: false, state: real }, ...samples]);
    const f1 = groups.find((g) => g.family === 'F1');
    const you = f1?.needsReteach.find((e) => e.learnerId === 'you');
    expect(you?.status).toBe('likely');
    expect(you?.observed.map((a) => a.stage)).toEqual(['item', 'followup']);
    expect(groups.flatMap((g) => g.needsReteach).some((e) => e.sample)).toBe(true);
    // Building samples never changes the real learner.
    expect(real.families.F1.attempts).toHaveLength(2);
  });
});
