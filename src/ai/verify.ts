/**
 * Checks model-written text against the verified solution before it is shown as "checked".
 * Rules (anything else is rejected, and the app falls back to built-in explanations):
 *  - short plain text: no markup, links, decimals or percentages;
 *  - every fraction mentioned must appear in the verified solution;
 *  - every standalone number must appear in the verified solution (or be 1 or 2);
 *  - every equation the text writes out (like 1/2 + 1/4 = 3/4) must be exactly true.
 */
import { add, div, eq, frac, mul, sub, type Frac } from '../engine/solver/frac.js';
import { problemText } from '../engine/solver/problem.js';
import { solutionFacts, type Solution } from '../engine/solver/solve.js';

import { MAX_AI_ANSWER_CHARS } from './schemas.js';

export type Verification = { ok: true } | { ok: false; reason: string };

const FRACTION = /\d+\s*\/\s*\d+/g;
const RUN = /\d+(?:\s*\/\s*\d+)?(?:\s*[=+\-\u00d7\u00f7*]\s*\d+(?:\s*\/\s*\d+)?)+/g;
const SEGMENT = /^(\d+(?:\s*\/\s*\d+)?)(?:\s*([+\-\u00d7\u00f7*])\s*(\d+(?:\s*\/\s*\d+)?))?$/;

function clean(text: string): string {
  return text.normalize('NFKC').replace(/[\u2212\u2013\u2014]/g, '-').replace(/\u2044/g, '/');
}

function key(fraction: string): string {
  return fraction.replace(/\s+/g, '');
}

function operandValue(raw: string): Frac | null {
  const [top, bottom] = raw.split('/').map((p) => Number.parseInt(p.trim(), 10));
  if (top === undefined || Number.isNaN(top)) return null;
  const d = bottom ?? 1;
  if (!Number.isSafeInteger(top) || !Number.isSafeInteger(d) || d <= 0) return null;
  return frac(top, d);
}

function evaluateSegment(segment: string): Frac | null {
  const m = SEGMENT.exec(segment.trim());
  if (m === null) return null;
  const left = operandValue(m[1] ?? '');
  if (left === null) return null;
  if (m[2] === undefined) return left;
  const right = operandValue(m[3] ?? '');
  if (right === null) return null;
  try {
    switch (m[2]) {
      case '+':
        return add(left, right);
      case '-':
        return sub(left, right);
      case '\u00f7':
        return div(left, right);
      default:
        return mul(left, right);
    }
  } catch {
    return null;
  }
}

export function verifyAiText(raw: string, solution: Solution): Verification {
  const text = clean(raw).trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (text.length > MAX_AI_ANSWER_CHARS) return { ok: false, reason: 'too_long' };
  if (/[<>`]|https?:|www\.|%|\d\s*[.,]\s*\d/i.test(text)) return { ok: false, reason: 'unsafe_or_unsupported_format' };

  const facts = clean([problemText(solution.problem), ...solutionFacts(solution), ...solution.hints].join(' '));
  const allowedFractions = new Set((facts.match(FRACTION) ?? []).map(key));
  const allowedNumbers = new Set<string>(['1', '2', ...(facts.match(/\d+/g) ?? [])]);

  const fractions = (text.match(FRACTION) ?? []).map(key);
  for (const f of fractions) if (!allowedFractions.has(f)) return { ok: false, reason: `unverified_fraction:${f}` };
  const withoutFractions = text.replace(FRACTION, ' ');
  for (const n of withoutFractions.match(/\d+/g) ?? []) if (!allowedNumbers.has(n)) return { ok: false, reason: `unverified_number:${n}` };

  for (const run of text.match(RUN) ?? []) {
    const values = run.split('=').map(evaluateSegment);
    if (values.some((v) => v === null)) return { ok: false, reason: 'unverifiable_equation' };
    const first = values[0];
    if (first === null || first === undefined) return { ok: false, reason: 'unverifiable_equation' };
    for (const v of values) if (v === null || v === undefined || !eq(first, v)) return { ok: false, reason: 'false_equation' };
  }
  return { ok: true };
}
