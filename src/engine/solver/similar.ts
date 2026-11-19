/** Deterministic "similar problem" generator: same kind of problem, new small numbers, always solvable. */
import { createRng, deriveSeed, pickIndex, type Rng } from '../random.js';
import { cmp, frac, reduce, type Frac } from './frac.js';
import { problemText, type Problem } from './problem.js';

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function properFraction(rng: Rng, maxDen: number): Frac {
  const d = 2 + pickIndex(rng, maxDen - 1);
  return frac(1 + pickIndex(rng, d - 1), d);
}

function candidate(p: Problem, rng: Rng): Problem {
  switch (p.kind) {
    case 'arith': {
      let a = properFraction(rng, 9);
      let b = properFraction(rng, 9);
      // Keep the flavour of the original: same-denominator problems stay that way.
      if (p.a.d === p.b.d) b = frac(1 + pickIndex(rng, Math.max(1, a.d - 1)), a.d);
      // Subtraction keeps its sign class so a "negative answer" example gives another negative one, and vice versa.
      if (p.op === 'sub') {
        const originalNegative = cmp(p.a, p.b) < 0;
        if ((cmp(a, b) < 0) !== originalNegative) [a, b] = [b, a];
        // Equal operands would give 0, which is a different kind of example.
        if (cmp(a, b) === 0 && cmp(p.a, p.b) !== 0) b = frac(Math.max(1, b.n - 1), b.d + 1);
      }
      return { kind: 'arith', op: p.op, a, b };
    }
    case 'compare': {
      const a = properFraction(rng, 9);
      if (cmp(p.a, p.b) === 0) {
        const k = 2 + pickIndex(rng, 3);
        return { kind: 'compare', a, b: frac(a.n * k, a.d * k), ask: p.ask };
      }
      return { kind: 'compare', a, b: properFraction(rng, 9), ask: p.ask };
    }
    case 'equivalent': {
      const known = reduce(properFraction(rng, 6));
      const k = 2 + pickIndex(rng, 4);
      return { kind: 'equivalent', known, blank: p.blank, other: p.blank === 'numerator' ? known.d * k : known.n * k };
    }
  }
}

/** `variation` lets the caller ask for a different problem each time (0, 1, 2 ...). */
export function similarProblem(original: Problem, variation: number): Problem {
  const baseText = problemText(original);
  const rng = createRng(deriveSeed(hash(baseText), variation));
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const next = candidate(original, rng);
    const wrongSign =
      next.kind === 'arith' && original.kind === 'arith' && original.op === 'sub' && cmp(original.a, original.b) !== 0 &&
      (cmp(next.a, next.b) < 0) !== (cmp(original.a, original.b) < 0);
    if (wrongSign || (next.kind === 'arith' && next.op === 'sub' && cmp(next.a, next.b) === 0 && original.kind === 'arith' && cmp(original.a, original.b) !== 0)) continue;
    const sameCompare = next.kind === 'compare' && original.kind === 'compare' && cmp(original.a, original.b) !== 0 && cmp(next.a, next.b) === 0;
    if (problemText(next) !== baseText && !sameCompare) return next;
  }
  throw new Error('Could not generate a similar problem');
}
