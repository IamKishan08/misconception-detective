/**
 * Checks a student's typed answer against the verified solution, and separates three things:
 * what was observed (the answer), a possible explanation (a hedged pattern match), and the evidence behind it.
 */
import { add, cmp, div, eq, frac, isReduced, mul, reduce, show, type Frac } from './frac.js';
import { parseAnswer } from './parse.js';
import type { Solution } from './solve.js';

export type Verdict = 'correct' | 'correct_unsimplified' | 'incorrect' | 'blank' | 'invalid';

export type CauseId =
  | 'added_across'
  | 'subtracted_across'
  | 'reversed_order'
  | 'added_instead'
  | 'no_flip'
  | 'flipped_first'
  | 'bigger_denominator'
  | 'added_same_number'
  | 'changed_one_number';

export interface Cause {
  readonly id: CauseId;
  /** The possible explanation, phrased as a possibility. */
  readonly text: string;
  readonly evidence: 'answer' | 'working';
  /** What exactly was seen, e.g. "Your working includes 1 + 1 and 2 + 4". */
  readonly evidenceText: string;
}

export interface AnswerCheck {
  readonly verdict: Verdict;
  /** The student's answer as they wrote it (normalised), or '' when none. */
  readonly shown: string;
  /** For 'invalid': what was wrong with the input. */
  readonly message?: string;
  /** Plain facts about the answer (too small, wrong form...). Not diagnoses. */
  readonly observations: readonly string[];
  readonly causes: readonly Cause[];
  /** For 'correct_unsimplified': the simplest form. */
  readonly simplest?: string;
}

const ANSWER_ONLY = 'This is based on your final answer only, so it is a possibility, not a diagnosis.';

function cause(id: CauseId, text: string, evidence: Cause['evidence'] = 'answer', evidenceText = ANSWER_ONLY): Cause {
  return { id, text, evidence, evidenceText };
}

function maxOf(a: Frac, b: Frac): Frac {
  return cmp(a, b) >= 0 ? a : b;
}
function minOf(a: Frac, b: Frac): Frac {
  return cmp(a, b) <= 0 ? a : b;
}

/** Looks for "x + y" pairs in the student's working that match the numbers of an add-across slip. */
function workingEvidence(solution: Solution, working: string): Cause[] {
  const p = solution.problem;
  if (p.kind !== 'arith' || (p.op !== 'add' && p.op !== 'sub') || working.trim() === '') return [];
  const normalised = working.normalize('NFKC').replace(/[−–—]/g, '-');
  const symbol = p.op === 'add' ? '+' : '-';
  const pairs = [...normalised.matchAll(/(\d+)\s*([+-])\s*(\d+)/g)].filter((m) => m[2] === symbol).map((m) => [m[1], m[3]]);
  const has = (x: number, y: number) => pairs.some(([l, r]) => l === String(x) && r === String(y));
  if (has(p.a.n, p.b.n) && has(p.a.d, p.b.d) && p.a.d !== p.b.d) {
    const verb = p.op === 'add' ? 'adding' : 'subtracting';
    const id: CauseId = p.op === 'add' ? 'added_across' : 'subtracted_across';
    return [
      cause(id, `${verb[0]?.toUpperCase()}${verb.slice(1)} the tops and the bottoms separately (${p.a.n} ${symbol} ${p.b.n} over ${p.a.d} ${symbol} ${p.b.d}).`, 'working', `Your working includes ${p.a.n} ${symbol} ${p.b.n} and ${p.a.d} ${symbol} ${p.b.d}, which fits this idea. It is still only evidence from one problem.`),
    ];
  }
  return [];
}

function arithmeticCauses(solution: Solution, v: Frac): Cause[] {
  const p = solution.problem;
  if (p.kind !== 'arith' || solution.result.type !== 'value') return [];
  const { a, b, op } = p;
  const out: Cause[] = [];
  if (op === 'add' && eq(v, frac(a.n + b.n, a.d + b.d))) {
    out.push(cause('added_across', `Adding the tops and the bottoms separately (${a.n} + ${b.n} over ${a.d} + ${b.d}).`));
  }
  if (op === 'sub') {
    if (a.d > b.d && eq(v, frac(a.n - b.n, a.d - b.d))) {
      out.push(cause('subtracted_across', `Subtracting the tops and the bottoms separately (${a.n} − ${b.n} over ${a.d} − ${b.d}).`));
    }
    if (solution.result.value.n < 0 && eq(v, frac(-solution.result.value.n, solution.result.value.d))) {
      out.push(cause('reversed_order', 'Subtracting the smaller fraction from the larger one, which gives the same size but loses the minus sign.'));
    }
  }
  if (op === 'mul' && eq(v, add(a, b))) out.push(cause('added_instead', 'Adding the two fractions instead of multiplying them.'));
  if (op === 'div') {
    if (eq(v, mul(a, b))) out.push(cause('no_flip', 'Multiplying without flipping the second fraction first.'));
    if (a.n !== 0 && eq(v, div(b, a))) out.push(cause('flipped_first', 'Flipping the first fraction instead of the second.'));
  }
  return out;
}

function mergeCauses(fromAnswer: Cause[], fromWorking: Cause[]): Cause[] {
  const merged = fromAnswer.map((c) => fromWorking.find((w) => w.id === c.id) ?? c);
  return [...merged, ...fromWorking.filter((w) => !fromAnswer.some((c) => c.id === w.id))];
}

function arithmeticObservations(solution: Solution, v: Frac): string[] {
  const p = solution.problem;
  if (p.kind !== 'arith') return [];
  const { a, b, op } = p;
  const out: string[] = [];
  if (op === 'add' && cmp(v, maxOf(a, b)) < 0) {
    out.push(`Your answer ${show(v)} is smaller than ${show(maxOf(a, b))}, but adding more to ${show(maxOf(a, b))} can only make it bigger.`);
  }
  if (op === 'sub' && b.n > 0 && cmp(v, a) > 0) {
    out.push(`Your answer ${show(v)} is bigger than ${show(a)}, but taking something away should make it smaller.`);
  }
  if (op === 'mul' && a.n > 0 && b.n > 0 && cmp(a, frac(1, 1)) < 0 && cmp(b, frac(1, 1)) < 0 && cmp(v, minOf(a, b)) >= 0) {
    out.push(`Both fractions are less than 1, so their product has to be smaller than each of them. ${show(v)} is not smaller than ${show(minOf(a, b))}.`);
  }
  return out;
}

export function checkAnswer(solution: Solution, answerRaw: string, workingRaw: string): AnswerCheck {
  const p = solution.problem;
  const working = workingEvidence(solution, workingRaw);
  if (answerRaw.trim() === '') return { verdict: 'blank', shown: '', observations: [], causes: working };

  const parsed = parseAnswer(answerRaw, p.kind === 'compare');
  if (!parsed.ok) return { verdict: 'invalid', shown: '', message: parsed.message, observations: [], causes: [] };

  const result = solution.result;

  if (p.kind === 'compare' && result.type === 'compare') {
    let relation: 'first' | 'second' | 'equal' | 'neither';
    if (parsed.kind === 'equal') relation = 'equal';
    else relation = eq(parsed.value, p.a) ? 'first' : eq(parsed.value, p.b) ? 'second' : 'neither';
    if (relation === result.relation) return { verdict: 'correct', shown: parsed.text, observations: [], causes: [] };
    const observations: string[] = [];
    const causes: Cause[] = [];
    if (relation === 'neither' && parsed.kind === 'frac') observations.push(`${parsed.text} is not one of the two fractions in the question (${show(p.a)} and ${show(p.b)}).`);
    if (relation === 'first' || relation === 'second') {
      const picked = relation === 'first' ? p.a : p.b;
      const other = relation === 'first' ? p.b : p.a;
      if (result.relation === 'equal') observations.push(`${show(p.a)} and ${show(p.b)} are equal in value, so neither is ${p.ask}.`);
      else if (picked.d !== other.d && (p.ask === 'larger' ? picked.d > other.d : picked.d < other.d)) {
        causes.push(cause('bigger_denominator', 'Thinking a bigger bottom number means a bigger fraction.'));
      }
    }
    if (relation === 'equal') observations.push(`${show(p.a)} and ${show(p.b)} are not equal in value.`);
    return { verdict: 'incorrect', shown: parsed.text, observations, causes };
  }

  if (parsed.kind !== 'frac') return { verdict: 'invalid', shown: '', message: 'Please write your answer as a number or fraction.', observations: [], causes: [] };
  const v = parsed.value;

  if (p.kind === 'equivalent') {
    const asFraction = parsed.text.includes('/');
    if (result.type === 'any') {
      return v.d === 1 && v.n >= 1
        ? { verdict: 'correct', shown: parsed.text, observations: [], causes: [] }
        : { verdict: 'incorrect', shown: parsed.text, observations: ['The top number is 0, so any whole number of 1 or more works for the bottom.'], causes: [] };
    }
    if (result.type !== 'missing') {
      return { verdict: 'incorrect', shown: parsed.text, observations: ['No whole number makes this equal; the steps show why.'], causes: [] };
    }
    const fits = asFraction ? v.n === result.filled.n && v.d === result.filled.d : v.d === 1 && v.n === result.value;
    if (fits) return { verdict: 'correct', shown: parsed.text, observations: [], causes: [] };
    const observations: string[] = [];
    const causes: Cause[] = [];
    if (asFraction && eq(v, p.known)) {
      observations.push(`${parsed.text} is an equal fraction to ${show(p.known)}, but the question asks for ${p.blank === 'numerator' ? `a fraction with bottom number ${p.other}` : `a fraction with top number ${p.other}`}.`);
    } else if (!asFraction && v.d === 1) {
      const s = v.n;
      if (p.blank === 'numerator') {
        if (s === p.known.n + (p.other - p.known.d)) causes.push(cause('added_same_number', `Adding the same number to the top and bottom (${p.known.d} + ${p.other - p.known.d} = ${p.other}, so ${p.known.n} + ${p.other - p.known.d}) instead of multiplying both by the same number.`));
        else if (s === p.known.n) causes.push(cause('changed_one_number', 'Changing only the bottom number and leaving the top number alone.'));
      } else if (s === p.known.d + (p.other - p.known.n)) {
        causes.push(cause('added_same_number', 'Adding the same number to the top and bottom instead of multiplying both by the same number.'));
      } else if (s === p.known.d) {
        causes.push(cause('changed_one_number', 'Changing only the top number and leaving the bottom number alone.'));
      }
    }
    return { verdict: 'incorrect', shown: parsed.text, observations, causes };
  }

  if (result.type !== 'value') return { verdict: 'invalid', shown: '', message: 'I could not check that answer.', observations: [], causes: [] };
  if (eq(v, result.value)) {
    if (!isReduced(v)) return { verdict: 'correct_unsimplified', shown: parsed.text, observations: [], causes: [], simplest: show(reduce(v)) };
    return { verdict: 'correct', shown: parsed.text, observations: [], causes: [] };
  }
  return {
    verdict: 'incorrect',
    shown: parsed.text,
    observations: arithmeticObservations(solution, v),
    causes: mergeCauses(arithmeticCauses(solution, v), working),
  };
}
