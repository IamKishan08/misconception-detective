/**
 * Deterministic solver. Computes the answer with exact arithmetic (result.ts), then writes worked steps from the same
 * numbers (steps.ts). Every equation in the steps carries a machine-checkable claim (`check`) so tests can verify that the
 * explanation matches the calculated result.
 */
import { cmp, frac, lcm, reduce, show, showMixed, toMixed, type Frac } from './frac.js';
import type { Problem } from './problem.js';
import { computeResult } from './result.js';
import { REASONS, addSubSteps, compareSteps, divSteps, equivalentSteps, mulSteps } from './steps.js';
import type { Result, Solution, Step, StepDraft } from './types.js';
import { pieceName } from './visuals.js';

export type { BarSpec, Check, Line, Result, Solution, Step, StepDraft, Tone, Visual } from './types.js';
export { computeResult } from './result.js';
export { pieceName } from './visuals.js';

// ---------------------------------------------------------------------------------------------
// Hints (never reveal the final answer)

function hintsFor(p: Problem): string[] {
  switch (p.kind) {
    case 'arith': {
      const { a, b, op } = p;
      if (op === 'add' || op === 'sub') {
        const L = lcm(a.d, b.d);
        return [
          'The denominator tells us the size of each piece, and we can only combine pieces of the same size. Do the two fractions have the same bottom number?',
          a.d === b.d
            ? `Both are in ${pieceName(L)}. Combine only the top numbers (${a.n} ${op === 'add' ? '+' : '−'} ${b.n}) and keep the bottom number ${L}.`
            : `Rewrite both fractions with the bottom number ${L} (a common multiple of ${a.d} and ${b.d}) before ${op === 'add' ? 'adding' : 'subtracting'}.`,
        ];
      }
      if (op === 'mul') {
        return [
          'To multiply fractions, multiply across: top times top, bottom times bottom.',
          `Work out ${a.n} × ${b.n} for the top and ${a.d} × ${b.d} for the bottom, then see if the result simplifies.`,
        ];
      }
      return [
        'Dividing by a fraction is the same as multiplying by its reciprocal (the fraction flipped).',
        `The reciprocal of ${show(b)} is ${show(frac(b.d, b.n))}. Rewrite the problem as ${show(a)} × ${show(frac(b.d, b.n))}.`,
      ];
    }
    case 'compare': {
      const L = lcm(p.a.d, p.b.d);
      return [
        'To compare fractions, first make the pieces the same size (a common denominator).',
        p.a.d === p.b.d ? 'The bottom numbers already match, so compare the top numbers.' : `Rewrite both with the bottom number ${L}, then compare the top numbers.`,
      ];
    }
    case 'equivalent': {
      const { known, blank, other } = p;
      return [
        'An equal fraction comes from multiplying (or dividing) the top and bottom by the same number.',
        blank === 'numerator'
          ? `What do you multiply ${known.d} by to get ${other}? Do the same to the top number ${known.n}.`
          : `What do you multiply ${known.n} by to get ${other}? Do the same to the bottom number ${known.d}.`,
      ];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Public API

function describeAnswer(p: Problem, result: Result): string {
  switch (result.type) {
    case 'value': {
      const reduced = reduce(result.value);
      const mixed = toMixed(reduced);
      return mixed === null ? show(reduced) : `${show(reduced)} (or ${showMixed(mixed)})`;
    }
    case 'compare': {
      if (p.kind !== 'compare') return '';
      return result.relation === 'equal' ? 'They are equal' : `${show(result.relation === 'first' ? p.a : p.b)} is ${p.ask}`;
    }
    case 'missing':
      return `${result.value} (so ${p.kind === 'equivalent' ? `${show(p.known)} = ${show(result.filled)}` : ''})`;
    case 'no_integer':
      return 'No whole number works';
    case 'any':
      return 'Any whole number (1 or more) works';
  }
}

export function solve(problem: Problem): Solution {
  const result = computeResult(problem);
  let steps: StepDraft[];
  switch (problem.kind) {
    case 'arith': {
      const { op, a, b } = problem;
      steps = (op === 'add' || op === 'sub' ? addSubSteps(op, a, b) : op === 'mul' ? mulSteps(a, b) : divSteps(a, b)).steps;
      break;
    }
    case 'compare':
      steps = compareSteps(problem);
      break;
    case 'equivalent':
      steps = equivalentSteps(problem);
      break;
  }
  const finished = steps.map((step): Step => ({ ...step, reason: REASONS[step.id] ?? step.why }));
  return { problem, result, answerText: describeAnswer(problem, result), steps: finished, hints: hintsFor(problem) };
}

/** Returns a list of problems found in the solution; empty means every claim in the steps is true. */
export function verifySolution(solution: Solution): string[] {
  const failures: string[] = [];
  for (const step of solution.steps) {
    for (const line of step.lines) {
      const c = line.check;
      if (c === undefined) continue;
      const order = cmp(c.left, c.right);
      const holds = c.kind === 'eq' ? order === 0 : c.symbol === '=' ? order === 0 : c.symbol === '<' ? order < 0 : order > 0;
      if (!holds) failures.push(`${step.id}: "${line.text}" is not true`);
    }
  }
  return failures;
}

/** The value the final step arrives at (for arithmetic), used to confirm steps match the computed result. */
export function stepsEndValue(solution: Solution): Frac | null {
  for (const step of [...solution.steps].reverse()) {
    for (const line of [...step.lines].reverse()) {
      if (line.check?.kind === 'eq' && step.id !== 'mixed') return line.check.right;
    }
  }
  return null;
}
