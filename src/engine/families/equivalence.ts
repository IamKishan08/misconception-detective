/** F3: misunderstands equivalent fractions (2/4 ≠ 1/2, scales only one part, or adds instead of multiplying). */
import { format, scaleTo, type Rational } from '../rational.js';
import type { Answer, Bar, Evaluation, FamilyDefinition, Question, VisualStep } from '../types.js';
import { DEFAULT_ORDER, memoByStage, properFractions, range, readChoice, readWhole, result } from './shared.js';

const MAX_BASE_DENOMINATOR = { 1: 6, 2: 10 } as const;
const MAX_FACTOR = { 1: 3, 2: 4 } as const;
/** Keeps the scaled denominator small enough to draw as a bar. */
const MAX_SCALED_DENOMINATOR = { 1: 18, 2: 24 } as const;

interface Scaling {
  known: Rational;
  factor: number;
}

function scalings(difficulty: Question['difficulty']): Scaling[] {
  const out: Scaling[] = [];
  for (const known of properFractions(2, MAX_BASE_DENOMINATOR[difficulty])) {
    for (const factor of range(2, MAX_FACTOR[difficulty])) {
      if (known.d * factor <= MAX_SCALED_DENOMINATOR[difficulty]) out.push({ known, factor });
    }
  }
  return out;
}

function scalingOf(q: Question): Scaling {
  const body = q.body;
  switch (body.type) {
    case 'missing_numerator':
      return { known: body.known, factor: body.targetDen / body.known.d };
    case 'missing_denominator':
      return { known: body.known, factor: body.targetNum / body.known.n };
    case 'equal_check':
      return { known: body.first, factor: body.second.d / body.first.d };
    default:
      throw new TypeError('F3 expects an equivalence question');
  }
}

function makeQuestion(stage: Question['stage'], difficulty: Question['difficulty'], { known, factor }: Scaling): Question {
  const scaled = { n: known.n * factor, d: known.d * factor };
  if (stage === 'item') {
    return {
      id: `F3.item.${difficulty}.${format(known)}=?/${scaled.d}`, family: 'F3', stage, difficulty,
      body: { type: 'missing_numerator', known, targetDen: scaled.d },
    };
  }
  if (stage === 'transfer') {
    return {
      id: `F3.transfer.${difficulty}.${format(known)}=${scaled.n}/?`, family: 'F3', stage, difficulty,
      body: { type: 'missing_denominator', known, targetNum: scaled.n },
    };
  }
  return {
    id: `F3.followup.${difficulty}.${format(known)}~${format(scaled)}`, family: 'F3', stage, difficulty,
    body: { type: 'equal_check', first: known, second: scaled, order: DEFAULT_ORDER },
  };
}

interface MissingPartAnswers {
  /** Keeps the other number unchanged ("scale only one part"). */
  oneChanged: number;
  /** Adds the same amount instead of multiplying. */
  additive: number;
  correct: number;
}

/** For a proper fraction and factor ≥ 2 the three answers always differ; the candidate filter re-checks it. */
function missingPartAnswers(q: Question): MissingPartAnswers | null {
  const { known, factor } = scalingOf(q);
  if (q.body.type === 'missing_numerator') {
    return { oneChanged: known.n, additive: known.n + (q.body.targetDen - known.d), correct: known.n * factor };
  }
  if (q.body.type === 'missing_denominator') {
    return { oneChanged: known.d, additive: known.d + (q.body.targetNum - known.n), correct: known.d * factor };
  }
  return null;
}

const candidates = memoByStage((stage, difficulty) =>
  scalings(difficulty)
    .map((s) => makeQuestion(stage, difficulty, s))
    .filter((q) => {
      const answers = missingPartAnswers(q);
      return answers === null || new Set([answers.oneChanged, answers.additive, answers.correct]).size === 3;
    }),
);

function evaluate(q: Question, answer: Answer): Evaluation {
  if (q.body.type === 'equal_check') {
    const read = readChoice(answer);
    if (!('ok' in read)) return read;
    const { first, second } = q.body;
    const symbol = read.value === 'equal' ? '=' : read.value === 'first' ? '>' : '<';
    return result(read.value === 'equal', 'not_equivalent', `${format(first)} ${symbol} ${format(second)}`);
  }
  const read = readWhole(answer);
  if (!('ok' in read)) return read;
  const answers = missingPartAnswers(q);
  if (answers === null) return { valid: false, reason: 'wrong_answer_kind' };
  const given = read.value;
  const pattern = given === answers.oneChanged ? 'scale_one_part' : given === answers.additive ? 'additive_scaling' : null;
  return result(given === answers.correct, pattern, String(given));
}

function bar(value: Rational, parts: number, role: Bar['role']): Bar {
  return { value, parts, shaded: scaleTo(value, parts).n, role };
}

function visual(q: Question): VisualStep[] {
  const { known, factor } = scalingOf(q);
  const scaled = { n: known.n * factor, d: known.d * factor };
  // "Change only the bottom": same count of shaded parts, but each part is smaller, so the amount shrinks.
  const wrong = { n: known.n, d: scaled.d };
  // Start with what "change only the bottom" gives next to the true equal fraction, then show the splitting.
  return [
    { bars: [bar(scaled, scaled.d, 'equivalent'), bar(wrong, scaled.d, 'one_part_scaled')], note: { key: 'one_part_scaled', wrong, right: scaled } },
    { bars: [bar(known, known.d, 'first'), bar(scaled, scaled.d, 'equivalent')], note: { key: 'split_parts', factor, from: known, to: scaled } },
  ];
}

export const equivalenceFamily: FamilyDefinition = {
  id: 'F3',
  candidates,
  evaluate,
  misconceptionAnswer: (q) => {
    if (q.body.type === 'equal_check') return { kind: 'choice', optionId: 'first' };
    return { kind: 'whole', value: String(missingPartAnswers(q)?.oneChanged ?? '') };
  },
  correctAnswer: (q) => {
    if (q.body.type === 'equal_check') return { kind: 'choice', optionId: 'equal' };
    return { kind: 'whole', value: String(missingPartAnswers(q)?.correct ?? '') };
  },
  visual,
};
