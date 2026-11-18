import { FAMILIES, generateQuestion } from '../../src/engine/families/index.js';
import { createRng } from '../../src/engine/random.js';
import { compare, equals, type Rational } from '../../src/engine/rational.js';
import { FAMILY_ORDER, type Answer, type Difficulty, type Question, type Stage } from '../../src/engine/types.js';

const STAGES: Stage[] = ['item', 'followup', 'transfer'];
const DIFFICULTIES: Difficulty[] = [1, 2];
const SEEDED_RUNS = 300;

function allCandidates(): Question[] {
  return FAMILY_ORDER.flatMap((f) => STAGES.flatMap((s) => DIFFICULTIES.flatMap((d) => [...FAMILIES[f].candidates(s, d)])));
}

function evaluate(q: Question, a: Answer) {
  return FAMILIES[q.family].evaluate(q, a);
}

describe('every generated question', () => {
  const questions = allCandidates();

  it('exists for every family, stage and difficulty', () => {
    for (const f of FAMILY_ORDER) for (const s of STAGES) for (const d of DIFFICULTIES) {
      expect(FAMILIES[f].candidates(s, d).length, `${f} ${s} ${d}`).toBeGreaterThan(0);
    }
  });

  it('discriminates: the misconception answer is wrong and matches the family pattern', () => {
    for (const q of questions) {
      const result = evaluate(q, FAMILIES[q.family].misconceptionAnswer(q));
      expect(result, q.id).toMatchObject({ valid: true, correct: false });
      expect(result.valid && result.pattern, q.id).not.toBeNull();
    }
  });

  it('accepts the correct answer and never labels it', () => {
    for (const q of questions) {
      expect(evaluate(q, FAMILIES[q.family].correctAnswer(q)), q.id).toMatchObject({ valid: true, correct: true, pattern: null });
    }
  });

  it('has visual bars whose shaded parts equal the exact quantity', () => {
    for (const q of questions) {
      for (const step of FAMILIES[q.family].visual(q)) {
        for (const bar of step.bars) {
          expect(bar.shaded, q.id).toBeLessThanOrEqual(bar.parts);
          expect(equals({ n: bar.shaded, d: bar.parts }, bar.value), q.id).toBe(true);
        }
      }
    }
  });

  it('has no duplicate choice options', () => {
    for (const q of questions) {
      const b = q.body;
      if (b.type === 'compare' || b.type === 'equal_check') {
        expect(new Set(b.order).size).toBe(b.order.length);
        expect(equals(b.first, b.second) && b.type === 'compare', q.id).toBe(false);
      }
    }
  });

  it('stays in bounded ranges', () => {
    const operands = (q: Question): Rational[] => {
      const b = q.body;
      if (b.type === 'add') return [b.a, b.b];
      if (b.type === 'compare' || b.type === 'equal_check') return [b.first, b.second];
      return [b.known];
    };
    for (const q of questions) {
      for (const r of operands(q)) {
        expect(r.d, q.id).toBeGreaterThanOrEqual(2);
        expect(r.d, q.id).toBeLessThanOrEqual(24);
        expect(r.n, q.id).toBeGreaterThanOrEqual(0);
        expect(r.n, q.id).toBeLessThanOrEqual(24);
      }
    }
  });
});

describe('seeded generation', () => {
  it('is reproducible and avoids repeats while fresh questions remain', () => {
    for (const f of FAMILY_ORDER) {
      const a = generateQuestion(f, 'item', 1, createRng(42), new Set());
      const b = generateQuestion(f, 'item', 1, createRng(42), new Set());
      expect(a).toEqual(b);
      const next = generateQuestion(f, 'item', 1, createRng(42), new Set([a.id]));
      expect(next.id).not.toBe(a.id);
    }
  });

  it('keeps discriminating across many seeded runs', () => {
    for (let seed = 0; seed < SEEDED_RUNS; seed += 1) {
      const rng = createRng(seed);
      for (const f of FAMILY_ORDER) for (const s of STAGES) {
        const q = generateQuestion(f, s, seed % 2 === 0 ? 1 : 2, rng, new Set());
        const wrong = evaluate(q, FAMILIES[f].misconceptionAnswer(q));
        expect(wrong.valid && !wrong.correct && wrong.pattern !== null).toBe(true);
      }
    }
  });
});

describe('F1 detector: adding across', () => {
  const q: Question = { id: 't', family: 'F1', stage: 'item', difficulty: 1, body: { type: 'add', a: { n: 1, d: 2 }, b: { n: 1, d: 3 } } };
  const frac = (n: string, d: string): Answer => ({ kind: 'fraction', numerator: n, denominator: d });

  it('fires on 2/5 and on an equivalent 4/10', () => {
    expect(evaluate(q, frac('2', '5'))).toMatchObject({ correct: false, pattern: 'add_across' });
    expect(evaluate(q, frac('4', '10'))).toMatchObject({ correct: false, pattern: 'add_across' });
  });

  it('accepts 5/6 and the equivalent 10/12', () => {
    expect(evaluate(q, frac('5', '6'))).toMatchObject({ correct: true, pattern: null });
    expect(evaluate(q, frac('10', '12'))).toMatchObject({ correct: true });
  });

  it('gives no pattern for an unrelated wrong answer, and rejects bad input', () => {
    expect(evaluate(q, frac('3', '4'))).toMatchObject({ correct: false, pattern: null });
    expect(evaluate(q, frac('1', '0'))).toEqual({ valid: false, reason: 'zero_denominator' });
    expect(evaluate(q, { kind: 'whole', value: '5' })).toEqual({ valid: false, reason: 'wrong_answer_kind' });
  });
});

describe('F2 detector: bigger denominator means bigger', () => {
  const q: Question = {
    id: 't', family: 'F2', stage: 'item', difficulty: 1,
    body: { type: 'compare', context: 'plain', first: { n: 1, d: 8 }, second: { n: 1, d: 4 }, order: ['first', 'second', 'equal'] },
  };
  it('fires when 1/8 is chosen over 1/4, not on the correct choice or "equal"', () => {
    expect(evaluate(q, { kind: 'choice', optionId: 'first' })).toMatchObject({ correct: false, pattern: 'bigger_denominator' });
    expect(evaluate(q, { kind: 'choice', optionId: 'second' })).toMatchObject({ correct: true, pattern: null });
    expect(evaluate(q, { kind: 'choice', optionId: 'equal' })).toMatchObject({ correct: false, pattern: null });
    expect(evaluate(q, { kind: 'choice', optionId: 'banana' })).toEqual({ valid: false, reason: 'unknown_option' });
  });

  it('never generates items where the bigger denominator is also the bigger fraction', () => {
    for (const s of STAGES) for (const d of DIFFICULTIES) {
      for (const c of FAMILIES.F2.candidates(s, d)) {
        if (c.body.type !== 'compare') throw new Error('unexpected');
        const big = c.body.first.d > c.body.second.d ? c.body.first : c.body.second;
        const other = big === c.body.first ? c.body.second : c.body.first;
        expect(compare(big, other)).toBeLessThan(0);
      }
    }
  });
});

describe('F3 detector: equivalent fractions', () => {
  const missing: Question = { id: 't', family: 'F3', stage: 'item', difficulty: 1, body: { type: 'missing_numerator', known: { n: 1, d: 2 }, targetDen: 6 } };
  const whole = (value: string): Answer => ({ kind: 'whole', value });

  it('detects scaling only one part and additive scaling', () => {
    expect(evaluate(missing, whole('3'))).toMatchObject({ correct: true, pattern: null });
    expect(evaluate(missing, whole('1'))).toMatchObject({ correct: false, pattern: 'scale_one_part' });
    expect(evaluate(missing, whole('5'))).toMatchObject({ correct: false, pattern: 'additive_scaling' });
    expect(evaluate(missing, whole('4'))).toMatchObject({ correct: false, pattern: null });
  });

  it('detects "2/4 is not equal to 1/2"', () => {
    const q: Question = {
      id: 't', family: 'F3', stage: 'followup', difficulty: 1,
      body: { type: 'equal_check', first: { n: 1, d: 2 }, second: { n: 2, d: 4 }, order: ['first', 'second', 'equal'] },
    };
    expect(evaluate(q, { kind: 'choice', optionId: 'second' })).toMatchObject({ correct: false, pattern: 'not_equivalent' });
    expect(evaluate(q, { kind: 'choice', optionId: 'equal' })).toMatchObject({ correct: true, pattern: null });
  });
});
