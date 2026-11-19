import type { Question } from '../types.js';
import type { Problem } from './problem.js';

/** The solver's view of a guided-practice question, so practice and "Solve my problem" share one set of verified steps. */
export function questionToProblem(q: Question): Problem {
  const b = q.body;
  switch (b.type) {
    case 'add':
      return { kind: 'arith', op: 'add', a: b.a, b: b.b };
    case 'compare':
      return { kind: 'compare', a: b.first, b: b.second, ask: 'larger' };
    case 'equal_check':
      return { kind: 'compare', a: b.first, b: b.second, ask: 'larger' };
    case 'missing_numerator':
      return { kind: 'equivalent', known: b.known, blank: 'numerator', other: b.targetDen };
    case 'missing_denominator':
      return { kind: 'equivalent', known: b.known, blank: 'denominator', other: b.targetNum };
  }
}
