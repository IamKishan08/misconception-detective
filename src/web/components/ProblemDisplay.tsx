import type { Problem } from '../../engine/solver/problem.js';
import { describeProblem } from '../../engine/solver/problem.js';
import { messages } from '../messages.js';
import { Fraction } from './Fraction.js';

const SYMBOL = { add: '+', sub: '\u2212', mul: '\u00d7', div: '\u00f7' } as const;
const SPOKEN = { add: 'plus', sub: 'minus', mul: 'times', div: 'divided by' } as const;

function Blank({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="fraction" aria-hidden="true">
      <span className="fraction-top">{top}</span>
      <span className="fraction-bottom">{bottom}</span>
    </span>
  );
}

/** The problem as the student would write it, with stacked fractions and a spoken alternative. */
export function ProblemDisplay({ problem }: { problem: Problem }) {
  switch (problem.kind) {
    case 'arith':
      return (
        <p className="expression" aria-label={describeProblem(problem)}>
          <Fraction value={problem.a} />
          <span aria-hidden="true" className="op">{SYMBOL[problem.op]}</span>
          <span className="visually-hidden">{SPOKEN[problem.op]}</span>
          <Fraction value={problem.b} />
        </p>
      );
    case 'compare':
      return (
        <p className="expression">
          <span className="expression-words">{messages.solve.compareWhich(problem.ask)}</span>
          <Fraction value={problem.a} />
          <span className="expression-words">{messages.solve.or}</span>
          <Fraction value={problem.b} />
        </p>
      );
    case 'equivalent':
      return (
        <p className="expression">
          <Fraction value={problem.known} />
          <span aria-hidden="true" className="op">=</span>
          <span className="visually-hidden">{problem.blank === 'numerator' ? messages.solve.equalsMissingTop(problem.other) : messages.solve.equalsMissingBottom(problem.other)}</span>
          {problem.blank === 'numerator' ? <Blank top="?" bottom={String(problem.other)} /> : <Blank top={String(problem.other)} bottom="?" />}
        </p>
      );
  }
}
