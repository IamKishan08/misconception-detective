/** F2: believes a larger denominator always means a larger fraction (1/8 > 1/4). */
import { compare, format, lcm, scaleTo, type Rational } from '../rational.js';
import type { Answer, Bar, ChoiceId, Evaluation, FamilyDefinition, Question, VisualStep } from '../types.js';
import { DEFAULT_ORDER, larger, memoByStage, range, readChoice, result } from './shared.js';

const MAX_DENOMINATOR = { 1: 10, 2: 12 } as const;
/** Easier transfer questions keep denominators a little smaller. */
const MAX_TRANSFER_DENOMINATOR_EASY = 9;
/** Numerators used for non-unit comparisons (same numerator, different denominators). */
const NON_UNIT_NUMERATORS = range(2, 5);

function pair(q: Question): { first: Rational; second: Rational } {
  if (q.body.type !== 'compare') throw new TypeError('F2 expects a comparison question');
  return { first: q.body.first, second: q.body.second };
}

/** Useful only when the fraction with the larger denominator is NOT the larger fraction. */
export function discriminatesDenominatorBelief(first: Rational, second: Rational): boolean {
  if (first.d === second.d) return false;
  const biggerDen = first.d > second.d ? first : second;
  const other = biggerDen === first ? second : first;
  return compare(biggerDen, other) < 0;
}

function makeQuestion(stage: Question['stage'], difficulty: Question['difficulty'], first: Rational, second: Rational): Question {
  return {
    id: `F2.${stage}.${difficulty}.${format(first)}vs${format(second)}`,
    family: 'F2',
    stage,
    difficulty,
    body: { type: 'compare', context: stage === 'followup' ? 'share' : 'plain', first, second, order: DEFAULT_ORDER },
  };
}

const candidates = memoByStage((stage, difficulty) => {
  const useUnit = stage === 'followup' || (stage === 'item' && difficulty === 1);
  const numerators = useUnit ? [1] : NON_UNIT_NUMERATORS;
  const maxDen = stage === 'transfer' && difficulty === 1 ? MAX_TRANSFER_DENOMINATOR_EASY : MAX_DENOMINATOR[difficulty];
  const out: Question[] = [];
  for (const n of numerators) {
    for (const d1 of range(n + 1, maxDen)) {
      for (const d2 of range(n + 1, maxDen)) {
        const first = { n, d: d1 };
        const second = { n, d: d2 };
        if (discriminatesDenominatorBelief(first, second)) out.push(makeQuestion(stage, difficulty, first, second));
      }
    }
  }
  return out;
});

function correctChoice(q: Question): ChoiceId {
  const { first, second } = pair(q);
  const diff = compare(first, second);
  if (diff === 0) return 'equal';
  return diff > 0 ? 'first' : 'second';
}

function evaluate(q: Question, answer: Answer): Evaluation {
  const read = readChoice(answer);
  if (!('ok' in read)) return read;
  const { first, second } = pair(q);
  const chosen = read.value === 'equal' ? null : read.value === 'first' ? first : second;
  const biggerDen = first.d > second.d ? first : second;
  return result(read.value === correctChoice(q), chosen === biggerDen ? 'bigger_denominator' : null, chosen === null ? 'equal' : format(chosen));
}

function bar(value: Rational, parts: number, role: Bar['role']): Bar {
  return { value, parts, shaded: scaleTo(value, parts).n, role };
}

function visual(q: Question): VisualStep[] {
  const { first, second } = pair(q);
  const common = lcm(first.d, second.d);
  const big = larger(first, second);
  const small = big === first ? second : first;
  return [
    { bars: [bar(first, first.d, 'first'), bar(second, second.d, 'second')], note: { key: 'same_whole', bigger: big, smaller: small } },
    { bars: [bar(first, common, 'first'), bar(second, common, 'second')], note: { key: 'compare_common', larger: big, parts: common } },
  ];
}

export const comparisonFamily: FamilyDefinition = {
  id: 'F2',
  candidates,
  evaluate,
  misconceptionAnswer: (q) => {
    const { first, second } = pair(q);
    return { kind: 'choice', optionId: first.d > second.d ? 'first' : 'second' };
  },
  correctAnswer: (q) => ({ kind: 'choice', optionId: correctChoice(q) }),
  visual,
};
