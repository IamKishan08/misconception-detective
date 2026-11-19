/**
 * Independent answer calculation. The worked steps are written from the same numbers, and the tests (and `verifySolution`)
 * confirm that the steps arrive at exactly this result.
 */
import { add, cmp, div, frac, mul, sub, type Frac } from './frac.js';
import type { Problem } from './problem.js';
import type { Result } from './types.js';

export function computeResult(p: Problem): Result {
  switch (p.kind) {
    case 'arith': {
      const { op, a, b } = p;
      const value = op === 'add' ? add(a, b) : op === 'sub' ? sub(a, b) : op === 'mul' ? mul(a, b) : div(a, b);
      return { type: 'value', value };
    }
    case 'compare': {
      const c = cmp(p.a, p.b);
      if (c === 0) return { type: 'compare', relation: 'equal' };
      const firstIsLarger = c > 0;
      return { type: 'compare', relation: firstIsLarger === (p.ask === 'larger') ? 'first' : 'second' };
    }
    case 'equivalent':
      return equivalentResult(p.known, p.blank, p.other);
  }
}

export function equivalentResult(known: Frac, blank: 'numerator' | 'denominator', other: number): Result {
  if (blank === 'numerator') {
    const top = known.n * other;
    if (top % known.d !== 0) return { type: 'no_integer' };
    const value = top / known.d;
    return { type: 'missing', value, filled: frac(value, other) };
  }
  if (known.n === 0) return other === 0 ? { type: 'any' } : { type: 'no_integer' };
  const bottom = other * known.d;
  if (other === 0 || bottom % known.n !== 0) return { type: 'no_integer' };
  const value = bottom / known.n;
  return { type: 'missing', value, filled: frac(other, value) };
}
