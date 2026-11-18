/**
 * Exact rational arithmetic on small, bounded integers.
 * No floating-point comparison is ever used to check an answer.
 */

export interface Rational {
  readonly n: number;
  readonly d: number;
}

/** Largest numerator or denominator a learner may type. Keeps cross-multiplication far below 2^53. */
export const MAX_INPUT_PART = 999;

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

function isBoundedInt(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Builds a rational from trusted integers (engine-generated). Throws on a zero or invalid denominator. */
export function rational(n: number, d: number): Rational {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d <= 0 || n < 0) {
    throw new RangeError(`Invalid rational ${n}/${d}`);
  }
  return { n, d };
}

export function reduce(r: Rational): Rational {
  const g = gcd(r.n, r.d);
  return g === 0 ? { n: 0, d: 1 } : { n: r.n / g, d: r.d / g };
}

export function equals(a: Rational, b: Rational): boolean {
  return a.n * b.d === b.n * a.d;
}

/** Negative if a < b, zero if equal, positive if a > b. */
export function compare(a: Rational, b: Rational): number {
  return a.n * b.d - b.n * a.d;
}

export function add(a: Rational, b: Rational): Rational {
  const d = lcm(a.d, b.d);
  return reduce({ n: a.n * (d / a.d) + b.n * (d / b.d), d });
}

/** The "add tops and add bottoms" result (the mediant). */
export function addAcross(a: Rational, b: Rational): Rational {
  return { n: a.n + b.n, d: a.d + b.d };
}

/** Same value written over a new denominator; only valid when `d` is a multiple of r.d. */
export function scaleTo(r: Rational, d: number): Rational {
  if (d % r.d !== 0) throw new RangeError(`${d} is not a multiple of ${r.d}`);
  return { n: r.n * (d / r.d), d };
}

export function format(r: Rational): string {
  return `${r.n}/${r.d}`;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: 'empty' | 'not_whole_number' | 'out_of_range' | 'zero_denominator' };

const WHOLE_NUMBER = /^\d{1,4}$/;

/** Parses one typed part (numerator, denominator or a whole-number answer). */
export function parseWholeNumber(raw: string): ParseResult<number> {
  const text = raw.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (!WHOLE_NUMBER.test(text)) return { ok: false, reason: 'not_whole_number' };
  const value = Number.parseInt(text, 10);
  if (!isBoundedInt(value, 0, MAX_INPUT_PART)) return { ok: false, reason: 'out_of_range' };
  return { ok: true, value };
}

export function parseFraction(numerator: string, denominator: string): ParseResult<Rational> {
  const n = parseWholeNumber(numerator);
  if (!n.ok) return n;
  const d = parseWholeNumber(denominator);
  if (!d.ok) return d;
  if (d.value === 0) return { ok: false, reason: 'zero_denominator' };
  return { ok: true, value: { n: n.value, d: d.value } };
}
