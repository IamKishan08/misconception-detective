/**
 * Reviewed concept explanations ("why must the denominators match?"), filled in with the problem's own numbers.
 * This is the only place mathematical teaching prose lives for the Ask feature: a model can select a concept id, never write one.
 */
import type { CauseId } from './check.js';
import { lcm, show } from './frac.js';
import { CONCEPT_IDS, type ConceptId } from './helpTypes.js';
import { pieceName, type Solution } from './solve.js';

export interface Concept {
  readonly title: string;
  readonly applies: (s: Solution) => boolean;
  readonly body: (s: Solution) => string[];
  /** The worked step that shows the idea in action, when there is one. */
  readonly stepId?: string;
}

const hasStep = (s: Solution, id: string) => s.steps.some((st) => st.id === id);

function denominators(s: Solution): [number, number] | null {
  const p = s.problem;
  if (p.kind === 'arith' || p.kind === 'compare') return [p.a.d, p.b.d];
  return null;
}

/** "halves" → "half", "quarters" → "quarter": for sentences about a single piece. */
function onePiece(d: number): string {
  const name = pieceName(d);
  return name === 'halves' ? 'half' : name.replace(/s( of size)/, '$1').replace(/s$/, '');
}

export const CONCEPTS: Record<ConceptId, Concept> = {
  equal_denominators: {
    title: 'Why the denominators have to match',
    applies: (s) => s.problem.kind === 'compare' || (s.problem.kind === 'arith' && (s.problem.op === 'add' || s.problem.op === 'sub')),
    stepId: 'common',
    body: (s) => {
      const d = denominators(s);
      const [x, y] = d ?? [1, 1];
      const verb = s.problem.kind === 'compare' ? 'compare' : s.problem.kind === 'arith' && s.problem.op === 'sub' ? 'take away' : 'add';
      return [
        'The denominator tells us the size of each piece. We can only count, add, take away or compare pieces that are the same size.',
        x === y
          ? `Here both fractions use ${pieceName(x)}, so the pieces already match and we can ${verb} the top numbers straight away.`
          : `Here one fraction uses ${pieceName(x)} and the other uses ${pieceName(y)}. A ${onePiece(x)} and a ${onePiece(y)} are different sizes, so counting them together would be like adding centimetres to kilograms. We rewrite both with the same piece size first, then ${verb} them.`,
      ];
    },
  },
  common_denominator: {
    title: 'How to find a common denominator',
    applies: (s) => {
      const d = denominators(s);
      return d !== null && d[0] !== d[1];
    },
    stepId: 'common',
    body: (s) => {
      const [x, y] = denominators(s) ?? [1, 1];
      const L = lcm(x, y);
      return [
        `A common denominator is a number that both bottom numbers divide into. For ${x} and ${y}, one is ${L}: ${x} × ${L / x} = ${L} and ${y} × ${L / y} = ${L}.`,
        'Any common multiple works. Using the smallest one keeps the numbers small.',
      ];
    },
  },
  multiply_both: {
    title: 'Why we multiply the top and the bottom by the same number',
    applies: (s) => hasStep(s, 'common') || s.problem.kind === 'equivalent',
    stepId: 'common',
    body: (s) => {
      const lines = [
        'Multiplying the bottom number by 2 cuts every piece into 2 smaller equal pieces, so there are twice as many pieces. To keep the same amount we then need twice as many shaded pieces too, so the top is multiplied by 2 as well.',
        'Multiplying only one of the two numbers would change the amount. Multiplying both by the same number only changes the name of the fraction.',
      ];
      const common = s.steps.find((st) => st.id === 'common' || st.id === 'apply');
      if (common !== undefined && common.lines.length > 0) lines.push(`In this problem: ${common.lines.map((l) => l.text).join(' and ')}.`);
      return lines;
    },
  },
  keep_denominator: {
    title: 'Why the denominator stays the same when adding or subtracting',
    applies: (s) => s.problem.kind === 'arith' && (s.problem.op === 'add' || s.problem.op === 'sub'),
    stepId: 'combine',
    body: (s) => {
      const step = s.steps.find((st) => st.id === 'combine');
      return [
        'The denominator names the kind of piece, such as quarters. Adding 2 quarters and 1 quarter gives 3 quarters: we count how many pieces, and the pieces are still quarters.',
        'That is why only the top numbers are added or subtracted. Adding the bottoms too would change the size of the pieces.',
        ...(step !== undefined && step.lines[0] !== undefined ? [`In this problem: ${step.lines[0].text}.`] : []),
      ];
    },
  },
  invert_divisor: {
    title: 'Why we flip the fraction we divide by',
    applies: (s) => s.problem.kind === 'arith' && s.problem.op === 'div',
    stepId: 'flip',
    body: (s) => {
      const p = s.problem;
      if (p.kind !== 'arith') return [];
      return [
        `Dividing ${show(p.a)} by ${show(p.b)} asks: how many ${show(p.b)}s fit into ${show(p.a)}?`,
        `The flipped fraction ${show({ n: p.b.d, d: p.b.n })} is the one that multiplies with ${show(p.b)} to make exactly 1: ${show(p.b)} × ${show({ n: p.b.d, d: p.b.n })} = 1. Multiplying by it undoes the division, so dividing by ${show(p.b)} gives the same result as multiplying by ${show({ n: p.b.d, d: p.b.n })}.`,
      ];
    },
  },
  multiply_across: {
    title: 'Why we multiply the tops and the bottoms',
    applies: (s) => s.problem.kind === 'arith' && s.problem.op === 'mul',
    stepId: 'multiply',
    body: (s) => {
      const p = s.problem;
      if (p.kind !== 'arith') return [];
      return [
        `${show(p.a)} × ${show(p.b)} means taking ${show(p.a)} of ${show(p.b)}. The bottom numbers multiply (${p.a.d} × ${p.b.d}) because each piece is cut into smaller pieces; the top numbers multiply (${p.a.n} × ${p.b.n}) because we count how many of those small pieces we keep.`,
        'No common denominator is needed, because we are not joining pieces of different sizes.',
      ];
    },
  },
  simplify_fraction: {
    title: 'What simplifying means',
    applies: (s) => hasStep(s, 'simplify'),
    stepId: 'simplify',
    body: (s) => {
      const step = s.steps.find((st) => st.id === 'simplify');
      return [
        'Simplifying means dividing the top and the bottom by the same number. The amount does not change; the same amount is written with bigger pieces and fewer of them.',
        'A fraction is in simplest form when no number other than 1 divides both the top and the bottom.',
        ...(step !== undefined && step.lines[0] !== undefined ? [`In this problem: ${step.lines[0].text}.`] : []),
      ];
    },
  },
  improper_to_mixed: {
    title: 'Improper fractions and mixed numbers',
    applies: (s) => hasStep(s, 'mixed'),
    stepId: 'mixed',
    body: (s) => {
      const step = s.steps.find((st) => st.id === 'mixed');
      return [
        'When the top number is bigger than the bottom number, the fraction is more than one whole. A mixed number writes the whole ones first and the leftover pieces after.',
        ...(step !== undefined && step.lines[0] !== undefined ? [`In this problem: ${step.lines[0].text}.`] : []),
      ];
    },
  },
  negative_result: {
    title: 'Why the answer can be negative',
    applies: (s) => s.result.type === 'value' && s.result.value.n < 0,
    stepId: 'combine',
    body: (s) => [
      'If we take away more than we started with, we end up below zero, which is a negative number.',
      s.result.type === 'value' ? `Here the answer is ${show(s.result.value)}, so we land to the left of zero on the number line.` : '',
    ],
  },
  compare_common: {
    title: 'How same-sized pieces let us compare',
    applies: (s) => s.problem.kind === 'compare',
    stepId: 'compare',
    body: () => [
      'When the pieces are the same size, the fraction with more pieces is bigger. So after writing both fractions with the same denominator we only compare the top numbers.',
      'A bigger bottom number alone does not make a fraction bigger: it only means the pieces are smaller.',
    ],
  },
  zero_denominator: {
    title: 'Why the bottom number can never be 0',
    applies: () => true,
    body: () => [
      'The bottom number says how many equal parts the whole is cut into. A whole cannot be cut into 0 parts, so a fraction with 0 on the bottom has no meaning.',
      'Dividing by a fraction whose value is 0 is also impossible, because no number of groups of size 0 can make a non-zero amount.',
    ],
  },
};

export function applicableConcepts(solution: Solution): ConceptId[] {
  return CONCEPT_IDS.filter((id) => CONCEPTS[id].applies(solution));
}

export const CAUSE_TEXT: Record<CauseId, string> = {
  added_across: 'adding the tops and the bottoms separately',
  subtracted_across: 'subtracting the tops and the bottoms separately',
  reversed_order: 'subtracting the smaller fraction from the larger one',
  added_instead: 'adding instead of multiplying',
  no_flip: 'multiplying without flipping the second fraction',
  flipped_first: 'flipping the first fraction instead of the second',
  bigger_denominator: 'thinking a bigger bottom number means a bigger fraction',
  added_same_number: 'adding the same number to the top and bottom',
  changed_one_number: 'changing only one of the two numbers',
};
