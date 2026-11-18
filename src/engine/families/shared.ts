import { compare, gcd, parseFraction, parseWholeNumber, type Rational } from '../rational.js';
import type { Answer, ChoiceId, Difficulty, Evaluation, PatternId, Question, Stage } from '../types.js';

export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

/** Proper fractions n/d (0 < n < d) in lowest terms for each denominator in the range. */
export function properFractions(minDen: number, maxDen: number): Rational[] {
  const out: Rational[] = [];
  for (const d of range(minDen, maxDen)) {
    for (const n of range(1, d - 1)) {
      if (gcd(n, d) === 1) out.push({ n, d });
    }
  }
  return out;
}

/** Caches candidate lists so they are built once per stage and difficulty. */
export function memoByStage(build: (stage: Stage, difficulty: Difficulty) => Question[]) {
  const cache = new Map<string, readonly Question[]>();
  return (stage: Stage, difficulty: Difficulty): readonly Question[] => {
    const key = `${stage}:${difficulty}`;
    let list = cache.get(key);
    if (list === undefined) {
      list = Object.freeze(build(stage, difficulty));
      cache.set(key, list);
    }
    return list;
  };
}

export const DEFAULT_ORDER: readonly ChoiceId[] = ['first', 'second', 'equal'];

type Invalid = Extract<Evaluation, { valid: false }>;
type Read<T> = { ok: true; value: T } | Invalid;

export function readFraction(answer: Answer): Read<Rational> {
  if (answer.kind !== 'fraction') return { valid: false, reason: 'wrong_answer_kind' };
  const parsed = parseFraction(answer.numerator, answer.denominator);
  return parsed.ok ? { ok: true, value: parsed.value } : { valid: false, reason: parsed.reason };
}

export function readWhole(answer: Answer): Read<number> {
  if (answer.kind !== 'whole') return { valid: false, reason: 'wrong_answer_kind' };
  const parsed = parseWholeNumber(answer.value);
  return parsed.ok ? { ok: true, value: parsed.value } : { valid: false, reason: parsed.reason };
}

export function readChoice(answer: Answer): Read<ChoiceId> {
  if (answer.kind !== 'choice') return { valid: false, reason: 'wrong_answer_kind' };
  if (answer.optionId === 'first' || answer.optionId === 'second' || answer.optionId === 'equal') {
    return { ok: true, value: answer.optionId };
  }
  return { valid: false, reason: 'unknown_option' };
}

/** A correct answer never carries a pattern label. */
export function result(correct: boolean, pattern: PatternId | null, display: string): Evaluation {
  return { valid: true, correct, pattern: correct ? null : pattern, display };
}

export function larger(a: Rational, b: Rational): Rational {
  return compare(a, b) >= 0 ? a : b;
}
