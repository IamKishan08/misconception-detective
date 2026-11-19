/**
 * Parser for typed problems and answers. A small hand-written grammar: no eval, no Function, no
 * expression library. Anything it cannot read exactly is reported, never guessed.
 */
import { MAX_ANSWER_DIGITS, MAX_PART, frac, mixedValue, type Frac } from './frac.js';
import type { Op, Problem } from './problem.js';

export type ParseErrorCode =
  | 'empty'
  | 'too_long'
  | 'zero_denominator'
  | 'divide_by_zero'
  | 'decimals'
  | 'mixed_number'
  | 'negative_operand'
  | 'out_of_range'
  | 'unknown_text'
  | 'too_many_fractions'
  | 'no_operation'
  | 'slash_division'
  | 'two_blanks'
  | 'no_blank'
  | 'bad_blank'
  | 'compare_count'
  | 'incomplete';

export type ParseOutcome = { ok: true; problem: Problem } | { ok: false; code: ParseErrorCode; message: string };

export const MAX_PROBLEM_CHARS = 80;
export const SUPPORTED_FORMATS: readonly string[] = [
  '1/2 + 1/4',
  '3/4 - 1/6',
  '2/3 × 3/5',
  '1/2 ÷ 3/4',
  'Compare 2/3 and 3/4',
  '1/2 = ?/8',
  '3/5 = 9/?',
];

function fail(code: ParseErrorCode, message: string): ParseOutcome {
  return { ok: false, code, message };
}

const BLANK = /^[?_□]+$/;
const OPERAND = /^(\d+)(?:\s*\/\s*(\d+))?$/;

type Operand = { ok: true; value: Frac } | { ok: false; error: Extract<ParseOutcome, { ok: false }> };

function bad(code: ParseErrorCode, message: string): Operand {
  return { ok: false, error: { ok: false, code, message } };
}

function operand(raw: string): Operand {
  const text = raw.trim();
  if (text === '') return bad('incomplete', 'Something is missing. Each fraction needs a top and bottom number, like 3/4.');
  if (/^-/.test(text)) return bad('negative_operand', 'Negative fractions are not supported as inputs yet. Type positive fractions; answers can still be negative.');
  if (/\d\s*[.,]\s*\d|^[.,]\d/.test(text)) return bad('decimals', 'Decimals are not supported yet. Please write the number as a fraction, for example 1/2 instead of 0.5.');
  if (/^\d+\s+\d+\s*\/\s*\d+$/.test(text)) {
    return bad('mixed_number', 'Mixed numbers like 1 1/2 are not supported in problems yet. Write it as an improper fraction (3/2) instead.');
  }
  const m = OPERAND.exec(text);
  if (m === null) return bad('unknown_text', `I could not read "${text}" as a fraction. Use the form 3/4 or a whole number like 2.`);
  const top = m[1] ?? '';
  const bottom = m[2];
  if (top.length > 3 || (bottom !== undefined && bottom.length > 3)) {
    return bad('out_of_range', `Numbers must be ${MAX_PART} or smaller so the working stays exact and readable.`);
  }
  const n = Number.parseInt(top, 10);
  const d = bottom === undefined ? 1 : Number.parseInt(bottom, 10);
  if (d === 0) return bad('zero_denominator', `The bottom number cannot be 0 (in ${text}). A whole cannot be cut into 0 equal parts.`);
  return { ok: true, value: frac(n, d) };
}

function normalise(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[⁄∕]/g, '/')
    .replace(/[−–—‐]/g, '-')
    .replace(/[·∙✕✖*]/g, '×')
    .replace(/\bdivided by\b/g, '÷')
    .replace(/\bmultiplied by\b/g, '×')
    .replace(/\btimes\b/g, '×')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/(?<![a-z])x(?![a-z])/g, '×')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMPARE_WORDS = /\b(compare|which|is|the|fraction|fractions|bigger|larger|greater|smaller|less|lesser|of|these|two|between|biggest|largest|smallest|number)\b/g;

function parseCompare(s: string): ParseOutcome {
  const ask: 'larger' | 'smaller' = /\b(smaller|less|lesser|smallest)\b/.test(s) ? 'smaller' : 'larger';
  const stripped = s
    .replace(/\b(and|or|vs\.?|versus)\b|[<>,]/g, '|')
    .replace(COMPARE_WORDS, ' ')
    .replace(/[?:.]/g, ' ');
  const left = stripped.replace(/[|\s\d/]/g, '');
  if (left !== '') return fail('unknown_text', `I could not understand "${left}". Try "Compare 2/3 and 3/4".`);
  const parts = stripped.split('|').map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length !== 2) return fail('compare_count', 'Comparing needs exactly two fractions, for example "Compare 2/3 and 3/4".');
  const first = operand(parts[0] ?? '');
  if (!first.ok) return first.error;
  const second = operand(parts[1] ?? '');
  if (!second.ok) return second.error;
  return { ok: true, problem: { kind: 'compare', a: first.value, b: second.value, ask } };
}

function parseEquivalent(s: string): ParseOutcome {
  const sides = s.split('=').map((p) => p.trim());
  if (sides.length !== 2) return fail('bad_blank', 'Use one equals sign, like 1/2 = ?/8.');
  const [left, right] = [sides[0] ?? '', sides[1] ?? ''];
  const hasBlank = (t: string) => /[?_□]/.test(t);
  if (hasBlank(left) && hasBlank(right)) return fail('two_blanks', 'Only one number can be missing. Fill in one side and use ? for the missing number, like 1/2 = ?/8.');
  if (!hasBlank(left) && !hasBlank(right)) {
    return fail('no_blank', 'Use ? for the missing number (like 1/2 = ?/8). To check whether two fractions are equal, try "Compare 1/2 and 2/4".');
  }
  const [known, blankSide] = hasBlank(left) ? [right, left] : [left, right];
  const knownFrac = operand(known);
  if (!knownFrac.ok) return knownFrac.error;
  const parts = blankSide.split('/').map((p) => p.trim());
  const [top, bottom] = [parts[0] ?? '', parts[1] ?? ''];
  if (parts.length !== 2 || (!BLANK.test(top) && !BLANK.test(bottom)) || (BLANK.test(top) && BLANK.test(bottom))) {
    return fail('bad_blank', 'Write the missing number as ?/8 (missing top) or 3/? (missing bottom).');
  }
  const givenText = BLANK.test(top) ? bottom : top;
  const given = operand(givenText);
  if (!given.ok) return given.error;
  if (given.value.d !== 1) return fail('bad_blank', 'Write the missing number as ?/8 (missing top) or 3/? (missing bottom).');
  const blank: 'numerator' | 'denominator' = BLANK.test(top) ? 'numerator' : 'denominator';
  if (blank === 'numerator' && given.value.n === 0) {
    return fail('zero_denominator', 'The bottom number cannot be 0. A whole cannot be cut into 0 equal parts.');
  }
  return { ok: true, problem: { kind: 'equivalent', known: knownFrac.value, blank, other: given.value.n } };
}

const OP_BY_SYMBOL: Record<string, Op> = { '+': 'add', '-': 'sub', '×': 'mul', '÷': 'div' };

function parseArithmetic(s: string): ParseOutcome {
  if (/[a-z]/.test(s)) {
    const word = /[a-z]+/.exec(s)?.[0] ?? '';
    return fail('unknown_text', `I could not understand "${word}". I can add, subtract, multiply or divide two fractions, compare two fractions, or find a missing number in an equal fraction.`);
  }
  const m = /^(.*?)\s*([+×÷-])\s*(.*)$/.exec(s);
  if (m === null) {
    if ((s.match(/\//g) ?? []).length >= 2 && !/^\d+\s*\/\s*\d+$/.test(s)) {
      return fail('slash_division', 'A slash only separates the top and bottom of a fraction. To divide, use ÷, like 1/2 ÷ 3/4.');
    }
    return fail('no_operation', 'I need an operation between two fractions: +, -, × or ÷ (or start with "Compare").');
  }
  const [lhs, symbol, rhs] = [m[1] ?? '', m[2] ?? '', m[3] ?? ''];
  if (lhs === '') return fail('negative_operand', 'Negative fractions are not supported as inputs yet. Type positive fractions; answers can still be negative.');
  if (/[+×÷-]/.test(rhs)) {
    return /^-/.test(rhs)
      ? fail('negative_operand', 'Negative fractions are not supported as inputs yet. Type positive fractions; answers can still be negative.')
      : fail('too_many_fractions', 'I can work with two fractions at a time. Please enter one operation, like 1/2 + 1/4.');
  }
  const a = operand(lhs);
  if (!a.ok) return a.error;
  const b = operand(rhs);
  if (!b.ok) return b.error;
  const op = OP_BY_SYMBOL[symbol];
  if (op === undefined) return fail('no_operation', 'I need an operation between two fractions: +, -, × or ÷.');
  if (op === 'div' && b.value.n === 0) {
    return fail('divide_by_zero', `${rhs.trim()} is zero, and you cannot divide by zero: there is no number of groups of size zero that makes ${lhs.trim()}.`);
  }
  return { ok: true, problem: { kind: 'arith', op, a: a.value, b: b.value } };
}

export function parseProblem(raw: string): ParseOutcome {
  if (raw.trim() === '') return fail('empty', 'Type a fraction problem to begin, for example 1/2 + 1/4.');
  if (raw.length > MAX_PROBLEM_CHARS) return fail('too_long', `That is a bit long. Please keep the problem under ${MAX_PROBLEM_CHARS} characters.`);
  const s = normalise(raw);
  if (/\b(compare|bigger|larger|greater|smaller|less|vs\.?|versus|which)\b|[<>]/.test(s)) return parseCompare(s);
  if (s.includes('=')) return parseEquivalent(s);
  return parseArithmetic(s);
}

// ---------------------------------------------------------------------------------------------
// Student answers

export type AnswerParse =
  | { ok: true; kind: 'frac'; value: Frac; text: string }
  | { ok: true; kind: 'equal'; text: string }
  | { ok: false; message: string };

const ANSWER = new RegExp(`^(-)?(?:(\\d{1,${MAX_ANSWER_DIGITS}})\\s+)?(\\d{1,${MAX_ANSWER_DIGITS}})(?:\\s*/\\s*(\\d{1,${MAX_ANSWER_DIGITS}}))?$`);

/** Reads a student's answer: 3/4, -1/12, 5, or a mixed number like 1 1/4 (and "equal" for comparisons). */
export function parseAnswer(raw: string, allowEqualWord: boolean): AnswerParse {
  const s = raw.normalize('NFKC').toLowerCase().replace(/[−–—]/g, '-').replace(/⁄/g, '/').trim();
  if (s === '') return { ok: false, message: 'empty' };
  if (allowEqualWord && /^(equal|equals|same|they are equal|both|neither)$/.test(s)) return { ok: true, kind: 'equal', text: 'They are equal' };
  if (/\d\s*[.,]\s*\d|%/.test(s)) return { ok: false, message: 'Please write your answer as a fraction (like 3/4) rather than a decimal or percentage.' };
  const m = ANSWER.exec(s);
  if (m === null) return { ok: false, message: 'I could not read your answer. Write it like 3/4, 5, or a mixed number like 1 1/4.' };
  const negative = m[1] !== undefined;
  const lead = m[2];
  const top = Number.parseInt(m[3] ?? '0', 10);
  const bottom = m[4] === undefined ? undefined : Number.parseInt(m[4], 10);
  if (bottom === 0) return { ok: false, message: 'The bottom number of your answer cannot be 0.' };
  if (lead !== undefined) {
    if (bottom === undefined) return { ok: false, message: 'I could not read your answer. Write it like 3/4, 5, or a mixed number like 1 1/4.' };
    const value = mixedValue({ negative, whole: Number.parseInt(lead, 10), n: top, d: bottom });
    return { ok: true, kind: 'frac', value, text: `${negative ? '−' : ''}${lead} ${top}/${bottom}` };
  }
  const d = bottom ?? 1;
  const value = frac(negative ? -top : top, d);
  return { ok: true, kind: 'frac', value, text: `${negative ? '−' : ''}${top}${bottom === undefined ? '' : `/${bottom}`}` };
}
