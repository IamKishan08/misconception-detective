import { fmt, type Frac } from './frac.js';

export type Op = 'add' | 'sub' | 'mul' | 'div';

/** A fraction problem the solver understands. Operands are non-negative and bounded; results may be negative or improper. */
export type Problem =
  | { readonly kind: 'arith'; readonly op: Op; readonly a: Frac; readonly b: Frac }
  | { readonly kind: 'compare'; readonly a: Frac; readonly b: Frac; readonly ask: 'larger' | 'smaller' }
  | { readonly kind: 'equivalent'; readonly known: Frac; readonly blank: 'numerator' | 'denominator'; readonly other: number };

export const OP_SYMBOL: Record<Op, string> = { add: '+', sub: '-', mul: '×', div: '÷' };

/** Canonical typed form. Always parses back to the same problem. */
export function problemText(p: Problem): string {
  switch (p.kind) {
    case 'arith':
      return `${fmt(p.a)} ${OP_SYMBOL[p.op]} ${fmt(p.b)}`;
    case 'compare':
      return p.ask === 'larger' ? `Compare ${fmt(p.a)} and ${fmt(p.b)}` : `Which is smaller: ${fmt(p.a)} or ${fmt(p.b)}`;
    case 'equivalent':
      return p.blank === 'numerator' ? `${fmt(p.known)} = ?/${p.other}` : `${fmt(p.known)} = ${p.other}/?`;
  }
}

const OP_WORDS: Record<Op, string> = { add: 'Add', sub: 'Subtract', mul: 'Multiply', div: 'Divide' };

/** One-line plain-English reading shown so the student can confirm it. */
export function describeProblem(p: Problem): string {
  switch (p.kind) {
    case 'arith':
      return p.op === 'sub'
        ? `Subtract: ${fmt(p.b)} taken away from ${fmt(p.a)}`
        : p.op === 'div'
          ? `Divide ${fmt(p.a)} by ${fmt(p.b)}`
          : `${OP_WORDS[p.op]} ${fmt(p.a)} ${p.op === 'add' ? 'and' : 'by'} ${fmt(p.b)}`;
    case 'compare':
      return `Which is ${p.ask}: ${fmt(p.a)} or ${fmt(p.b)}?`;
    case 'equivalent':
      return p.blank === 'numerator'
        ? `Find the missing top number (numerator) so that ${fmt(p.known)} = ?/${p.other}`
        : `Find the missing bottom number (denominator) so that ${fmt(p.known)} = ${p.other}/?`;
  }
}

export function sameProblem(a: Problem, b: Problem): boolean {
  return problemText(a) === problemText(b);
}
