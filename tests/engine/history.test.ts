import { describe, expect, it } from 'vitest';
import { MAX_ENTRIES, applyEvent, emptyHistory, historyFromLearner, outcomeOf, summarise, topicOf, type History, type HistoryEvent } from '../../src/engine/history.js';
import { DEMO_CONTEXTS, DEMO_SEED, runScript } from '../../src/engine/demo.js';
import { createLearner } from '../../src/engine/progression.js';
import { frac } from '../../src/engine/solver/frac.js';
import type { Problem } from '../../src/engine/solver/problem.js';

const add: Problem = { kind: 'arith', op: 'add', a: frac(1, 2), b: frac(1, 4) };
const check = (key: string, correct: boolean, answer = '3/4', source: 'solve' | 'practice' = 'solve', problem: Problem = add): HistoryEvent => ({ type: 'check', key, source, problem, correct, answer });
const help = (key: string, kind: 'hint' | 'solution', problem: Problem = add): HistoryEvent => ({ type: 'help', key, source: 'solve', problem, kind });
const run = (events: HistoryEvent[], start: History = emptyHistory()) => events.reduce((h, e, i) => applyEvent(h, e, 1000 + i), start);
const only = (h: History) => {
  const e = h.entries[0];
  if (e === undefined) throw new Error('no entry');
  return e;
};

describe('real events become outcomes that never confuse help with independence', () => {
  it('an unaided first correct answer is independent', () => {
    expect(outcomeOf(only(run([check('a', true)])))).toBe('independent');
  });

  it('a correct answer after a wrong one, with no help, is a retry', () => {
    expect(outcomeOf(only(run([check('a', false, '2/6'), check('a', true)])))).toBe('retry');
  });

  it('a correct answer after a hint or after seeing the solution is "with help", never independent', () => {
    expect(outcomeOf(only(run([help('a', 'hint'), check('a', true)])))).toBe('with_help');
    expect(outcomeOf(only(run([help('a', 'solution'), check('a', true)])))).toBe('with_help');
    expect(outcomeOf(only(run([check('a', false), help('a', 'solution'), check('a', true)])))).toBe('with_help');
  });

  it('opening a solution or hint without answering is "explored", which is not mastery', () => {
    expect(outcomeOf(only(run([help('a', 'solution')])))).toBe('explored');
    expect(outcomeOf(only(run([help('a', 'hint')])))).toBe('explored');
  });

  it('a wrong answer stays "incorrect" until a correct one arrives', () => {
    const h = run([check('a', false, '2/6'), check('a', false, '1/3')]);
    expect(outcomeOf(only(h))).toBe('incorrect');
    expect(only(h)).toMatchObject({ wrong: 2, answer: '1/3' });
  });

  it('looking at help AFTER a correct answer does not downgrade it, and a later check does not change it', () => {
    const h = run([check('a', true), help('a', 'solution'), help('a', 'hint'), check('a', false, '9/9')]);
    expect(outcomeOf(only(h))).toBe('independent');
    expect(only(h).answer).toBe('3/4');
  });
});

describe('no duplicates', () => {
  it('repeated identical help events and repeated events for one key keep a single entry', () => {
    const h = run([help('a', 'hint'), help('a', 'hint'), help('a', 'solution'), help('a', 'solution'), check('a', true), check('a', true)]);
    expect(h.entries).toHaveLength(1);
    expect(only(h)).toMatchObject({ wrong: 0, hint: true, solution: true, correct: true });
  });

  it('different problem attempts are different entries, newest last, and applying the same event object twice is harmless', () => {
    const e = check('a', true);
    const once = run([e]);
    expect(applyEvent(once, e, 5)).toBe(once);
    const two = run([check('a', true), check('b', false, '1', 'practice')]);
    expect(two.entries.map((x) => x.key)).toEqual(['a', 'b']);
  });

  it('touching an older entry moves it to the end (most recent activity)', () => {
    const h = run([check('a', false), check('b', true), check('a', true)]);
    expect(h.entries.map((x) => x.key)).toEqual(['b', 'a']);
  });
});

describe('what is kept', () => {
  it('keeps only structured data: the problem numbers, a short numeric answer, counts and flags', () => {
    const e = only(run([check('a', false, '2/6'.padEnd(80, '9'))]));
    expect(e.answer?.length).toBeLessThanOrEqual(24);
    expect(Object.keys(e).sort()).toEqual(['answer', 'at', 'correct', 'hint', 'key', 'problem', 'solution', 'source', 'topic', 'wrong']);
  });

  it('is bounded: the oldest entries are dropped first', () => {
    let h = emptyHistory();
    for (let i = 0; i < MAX_ENTRIES + 25; i += 1) h = applyEvent(h, check(`k${i}`, true), i);
    expect(h.entries).toHaveLength(MAX_ENTRIES);
    expect(h.entries[0]?.key).toBe('k25');
    expect(h.entries.at(-1)?.key).toBe(`k${MAX_ENTRIES + 24}`);
  });

  it('topics come from the problem', () => {
    expect(topicOf(add)).toBe('add');
    expect(topicOf({ kind: 'compare', a: frac(1, 2), b: frac(1, 3), ask: 'larger' })).toBe('compare');
    expect(topicOf({ kind: 'equivalent', known: frac(1, 2), blank: 'numerator', other: 8 })).toBe('equivalent');
    expect(topicOf({ kind: 'arith', op: 'div', a: frac(1, 2), b: frac(1, 3) })).toBe('div');
  });
});

describe('no invented data', () => {
  it('a new learner has an empty history: no sample or made-up activity', () => {
    expect(historyFromLearner(createLearner(1)).entries).toEqual([]);
    expect(emptyHistory().entries).toEqual([]);
    expect(summarise(emptyHistory())).toEqual([]);
  });

  it('migrates real earlier practice attempts, in order, without dates, and without inventing any', () => {
    const state = runScript(DEMO_SEED, DEMO_CONTEXTS.transferAfterExplanation).state;
    const real = Object.values(state.families).flatMap((f) => f.attempts);
    const migrated = historyFromLearner(state);
    expect(migrated.entries).toHaveLength(real.length);
    expect(migrated.entries.every((e) => e.at === null && e.source === 'practice')).toBe(true);
    expect(migrated.entries.map((e) => e.correct)).toEqual(real.sort((a, b) => a.seq - b.seq).map((a) => a.outcome === 'correct'));
    // The last of the demo is an independent correct transfer answer; the wrong ones are not independent.
    expect(outcomeOf(migrated.entries.at(-1) ?? migrated.entries[0]!)).toBe('independent');
    expect(migrated.entries.filter((e) => !e.correct).every((e) => outcomeOf(e) === 'incorrect')).toBe(true);
  });
});

describe('summary is counts and a plain rule, not a score', () => {
  it('counts outcomes per topic and flags a topic whose latest activity was not an independent correct answer', () => {
    const sub: Problem = { kind: 'arith', op: 'sub', a: frac(3, 4), b: frac(1, 6) };
    const h = run([
      check('a', true),
      check('b', false, '2/6'),
      check('b', true),
      { type: 'check', key: 'c', source: 'solve', problem: sub, correct: false, answer: '1/3' },
    ]);
    const s = summarise(h);
    const addSummary = s.find((t) => t.topic === 'add');
    expect(addSummary?.counts).toEqual({ independent: 1, retry: 1, with_help: 0, incorrect: 0, explored: 0 });
    expect(addSummary?.revisit).toBe(true);
    expect(s.find((t) => t.topic === 'sub')).toMatchObject({ revisit: true, counts: { incorrect: 1 } });
    expect(s.find((t) => t.topic === 'mul')).toBeUndefined();
    expect(JSON.stringify(s)).not.toMatch(/percent|score|mastery/i);
    const clear = summarise(run([check('x', true)]));
    expect(clear[0]?.revisit).toBe(false);
  });
});
