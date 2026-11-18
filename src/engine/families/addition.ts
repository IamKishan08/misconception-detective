/** F1: adds numerators and denominators separately (1/2 + 1/3 → 2/5). */
import { add, addAcross, compare, equals, format, lcm, scaleTo, type Rational } from '../rational.js';
import type { Answer, Bar, Evaluation, FamilyDefinition, Question, VisualStep } from '../types.js';
import { larger, memoByStage, properFractions, range, readFraction, result } from './shared.js';

/** Largest operand denominator for easier / harder items. */
const MAX_DENOMINATOR = { 1: 6, 2: 12 } as const;
/** Upper limit for the common denominator, so bars stay readable. */
const MAX_COMMON_DENOMINATOR = { 1: 12, 2: 24 } as const;
const ONE_WHOLE: Rational = { n: 1, d: 1 };

function operands(q: Question): { a: Rational; b: Rational } {
  if (q.body.type !== 'add') throw new TypeError('F1 expects an addition question');
  return { a: q.body.a, b: q.body.b };
}

function makeQuestion(stage: Question['stage'], difficulty: Question['difficulty'], a: Rational, b: Rational): Question {
  return { id: `F1.${stage}.${difficulty}.${format(a)}+${format(b)}`, family: 'F1', stage, difficulty, body: { type: 'add', a, b } };
}

/** Useful only if the across-answer differs from the true sum; the sum stays within one whole so it fits one bar. */
function isUsable(a: Rational, b: Rational): boolean {
  const sum = add(a, b);
  return !equals(addAcross(a, b), sum) && compare(sum, ONE_WHOLE) <= 0;
}

const candidates = memoByStage((stage, difficulty) => {
  const out: Question[] = [];
  if (stage === 'followup') {
    // Same denominators: "add the bottoms too" still gives a different answer, which separates the idea from a slip.
    for (const d of range(3, MAX_DENOMINATOR[difficulty] + 2)) {
      for (const n1 of range(1, d - 2)) {
        for (const n2 of range(1, d - 1 - n1)) {
          const a = { n: n1, d };
          const b = { n: n2, d };
          if (isUsable(a, b)) out.push(makeQuestion(stage, difficulty, a, b));
        }
      }
    }
    return out;
  }
  const fractions = properFractions(2, MAX_DENOMINATOR[difficulty]);
  for (const a of fractions) {
    for (const b of fractions) {
      if (a.d === b.d || lcm(a.d, b.d) > MAX_COMMON_DENOMINATOR[difficulty]) continue;
      if (isUsable(a, b)) out.push(makeQuestion(stage, difficulty, a, b));
    }
  }
  return out;
});

function evaluate(q: Question, answer: Answer): Evaluation {
  const { a, b } = operands(q);
  const read = readFraction(answer);
  if (!('ok' in read)) return read;
  const given = read.value;
  return result(equals(given, add(a, b)), equals(given, addAcross(a, b)) ? 'add_across' : null, format(given));
}

function fractionAnswer(r: Rational): Answer {
  return { kind: 'fraction', numerator: String(r.n), denominator: String(r.d) };
}

function bar(value: Rational, parts: number, role: Bar['role']): Bar {
  return { value, parts, shaded: scaleTo(value, parts).n, role };
}

function visual(q: Question): VisualStep[] {
  const { a, b } = operands(q);
  const common = lcm(a.d, b.d);
  const total = { n: scaleTo(a, common).n + scaleTo(b, common).n, d: common };
  const across = addAcross(a, b);
  const big = larger(a, b);
  // Start with the contradiction (the across answer is not even bigger than one part), then rebuild the sum.
  const steps: VisualStep[] = [
    { bars: [bar(big, big.d, 'first'), bar(across, across.d, 'across')], note: { key: 'across_not_bigger', across, largest: big } },
    { bars: [bar(a, a.d, 'first'), bar(b, b.d, 'second')], note: { key: 'two_fractions', first: a, second: b } },
  ];
  if (a.d !== b.d) {
    steps.push({ bars: [bar(a, common, 'first'), bar(b, common, 'second')], note: { key: 'common_parts', parts: common } });
  }
  steps.push({
    bars: [bar(a, common, 'first'), bar(b, common, 'second'), bar(total, common, 'total')],
    note: { key: 'total', total, reduced: add(a, b) },
  });
  return steps;
}

export const additionFamily: FamilyDefinition = {
  id: 'F1',
  candidates,
  evaluate,
  misconceptionAnswer: (q) => {
    const { a, b } = operands(q);
    return fractionAnswer(addAcross(a, b));
  },
  correctAnswer: (q) => {
    const { a, b } = operands(q);
    return fractionAnswer(add(a, b));
  },
  visual,
};
