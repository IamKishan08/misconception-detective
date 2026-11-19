/**
 * Signed exact fractions for the "Solve my problem" feature.
 * Typed operands are bounded (see MAX_PART) so every intermediate value stays far below 2^53;
 * comparisons use BigInt so even large typed answers can never be misjudged by rounding.
 * Values are NOT auto-reduced: steps need to show unsimplified forms such as 2/4.
 */

export interface Frac {
  /** May be negative. */
  readonly n: number;
  /** Always a positive integer. */
  readonly d: number;
}

/** Largest numerator or denominator a student may type in a problem. */
export const MAX_PART = 999;
/** Largest number of digits accepted in a typed answer. */
export const MAX_ANSWER_DIGITS = 9;

export function frac(n: number, d: number): Frac {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) throw new RangeError(`Invalid fraction ${n}/${d}`);
  return { n, d };
}

export function whole(n: number): Frac {
  return frac(n, 1);
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

function safe(n: number, d: number): Frac {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw new RangeError('Number too large');
  return frac(n, d);
}

export function reduce(f: Frac): Frac {
  const g = gcd(f.n, f.d);
  return g === 0 ? { n: 0, d: 1 } : { n: f.n / g, d: f.d / g };
}

export function isReduced(f: Frac): boolean {
  return gcd(f.n, f.d) <= 1;
}

/** Exact comparison: negative if a < b, 0 if equal, positive if a > b. */
export function cmp(a: Frac, b: Frac): number {
  const left = BigInt(a.n) * BigInt(b.d);
  const right = BigInt(b.n) * BigInt(a.d);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function eq(a: Frac, b: Frac): boolean {
  return cmp(a, b) === 0;
}

export function neg(a: Frac): Frac {
  return { n: -a.n, d: a.d };
}

export function abs(a: Frac): Frac {
  return { n: Math.abs(a.n), d: a.d };
}

export function add(a: Frac, b: Frac): Frac {
  return reduce(safe(a.n * b.d + b.n * a.d, a.d * b.d));
}

export function sub(a: Frac, b: Frac): Frac {
  return add(a, neg(b));
}

export function mul(a: Frac, b: Frac): Frac {
  return reduce(safe(a.n * b.n, a.d * b.d));
}

export function div(a: Frac, b: Frac): Frac {
  if (b.n === 0) throw new RangeError('Division by zero');
  const sign = b.n < 0 ? -1 : 1;
  return reduce(safe(a.n * b.d * sign, a.d * Math.abs(b.n)));
}

export function sign(a: Frac): -1 | 0 | 1 {
  return a.n === 0 ? 0 : a.n < 0 ? -1 : 1;
}

/** Plain text such as "3/4", "-1/2" or "5" (whole numbers have no bottom). ASCII minus so it can be parsed again. */
export function fmt(a: Frac): string {
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
}

/** Display text with a true minus sign. */
export function show(a: Frac): string {
  return fmt(a).replace('-', '−');
}

export interface Mixed {
  readonly negative: boolean;
  readonly whole: number;
  readonly n: number;
  readonly d: number;
}

/** 5/4 → 1 1/4. Null unless the reduced value is improper and not a whole number. */
export function toMixed(a: Frac): Mixed | null {
  const r = reduce(a);
  const top = Math.abs(r.n);
  if (r.d === 1 || top < r.d) return null;
  return { negative: r.n < 0, whole: Math.floor(top / r.d), n: top % r.d, d: r.d };
}

export function showMixed(m: Mixed): string {
  return `${m.negative ? '−' : ''}${m.whole} ${m.n}/${m.d}`;
}

export function mixedValue(m: Mixed): Frac {
  const top = m.whole * m.d + m.n;
  return frac(m.negative ? -top : top, m.d);
}
