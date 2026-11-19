/**
 * Deterministic solver. Computes the answer with exact arithmetic, then writes worked steps from the same
 * numbers. Every equation in the steps carries a machine-checkable claim (`check`) so tests, and the server
 * when it grounds AI text, can verify that the explanation matches the calculated result.
 */
import {
  add,
  cmp,
  div,
  frac,
  gcd,
  isReduced,
  lcm,
  mul,
  reduce,
  show,
  showMixed,
  sub,
  toMixed,
  whole,
  type Frac,
} from './frac.js';
import type { Problem } from './problem.js';

// ---------------------------------------------------------------------------------------------
// Types

export type Tone = 'first' | 'second' | 'total' | 'result';

export interface BarSpec {
  readonly label: string;
  /** Equal parts in ONE whole. */
  readonly parts: number;
  /** Shaded parts; may exceed `parts`, in which case several whole bars are drawn. */
  readonly shaded: number;
  readonly tone: Tone;
}

export type Visual =
  | { readonly kind: 'bars'; readonly caption: string; readonly bars: readonly BarSpec[] }
  | {
      readonly kind: 'line';
      readonly caption: string;
      readonly min: number;
      readonly max: number;
      /** Tick marks per whole (e.g. 4 for quarters) or null when too fine to draw. */
      readonly tickDen: number | null;
      readonly marks: readonly { readonly value: Frac; readonly label: string; readonly tone: Tone }[];
      readonly arrow?: { readonly from: Frac; readonly to: Frac };
    };

export type Check =
  | { readonly kind: 'eq'; readonly left: Frac; readonly right: Frac }
  | { readonly kind: 'rel'; readonly left: Frac; readonly right: Frac; readonly symbol: '<' | '>' | '=' };

export interface Line {
  readonly text: string;
  readonly check?: Check;
}

export interface StepDraft {
  readonly id: string;
  readonly title: string;
  readonly lines: readonly Line[];
  /** Why the step is valid, in student language. */
  readonly why: string;
  /** A shorter, plainer restatement of the same step. */
  readonly simple: string;
  readonly visual?: Visual;
  /** True for steps a correct answer may skip (for example simplifying). */
  readonly optional?: boolean;
}

export interface Step extends StepDraft {
  /** One sentence answering "Why this step?". */
  readonly reason: string;
}

const REASONS: Record<string, string> = {
  common: 'Because pieces can only be added, taken away or compared when they are the same size.',
  same: 'Because the denominators already match, so nothing needs rewriting.',
  combine: 'Because we are counting pieces that are all the same size, and counting them does not change their size.',
  simplify: 'Because dividing the top and bottom by the same number keeps the amount the same.',
  mixed: 'Because the top number is bigger than the bottom number, so there is at least one whole.',
  multiply: 'Because taking a fraction of a fraction multiplies how many pieces we take and how small each piece gets.',
  flip: 'Because a fraction times its flipped version is 1, so multiplying by the flip undoes the division.',
  compare: 'Because when the pieces are the same size, more pieces means a bigger amount.',
  idea: 'Because doing the same thing to the top and bottom keeps the value of the fraction.',
  factor: 'Because the multiplier tells us how much each piece was cut up.',
  apply: 'Because the top and bottom must change in the same way for the fraction to stay equal.',
  none: 'Because only multiples of the simplest bottom (or top) number can appear in an equal fraction.',
};

export type Result =
  | { readonly type: 'value'; readonly value: Frac }
  | { readonly type: 'compare'; readonly relation: 'first' | 'second' | 'equal' }
  | { readonly type: 'missing'; readonly value: number; readonly filled: Frac }
  | { readonly type: 'no_integer' }
  | { readonly type: 'any' };

export interface Solution {
  readonly problem: Problem;
  readonly result: Result;
  /** Reader-friendly final answer, e.g. "5/4 (or 1 1/4)". */
  readonly answerText: string;
  readonly steps: readonly Step[];
  /** Progressive hints that never reveal the final answer. */
  readonly hints: readonly string[];
}

// ---------------------------------------------------------------------------------------------
// Independent answer calculation

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

function equivalentResult(known: Frac, blank: 'numerator' | 'denominator', other: number): Result {
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

// ---------------------------------------------------------------------------------------------
// Wording helpers

const PIECES: Record<number, string> = { 2: 'halves', 3: 'thirds', 4: 'quarters', 5: 'fifths', 6: 'sixths', 7: 'sevenths', 8: 'eighths', 9: 'ninths', 10: 'tenths', 12: 'twelfths' };

export function pieceName(d: number): string {
  return PIECES[d] ?? `pieces of size 1/${d}`;
}

const MAX_BAR_PARTS = 24;
const MAX_BAR_WHOLES = 4;
const MAX_LINE_SPAN = 8;

function scaleTo(f: Frac, d: number): Frac {
  return frac(f.n * (d / f.d), d);
}

interface BarInput {
  readonly label: string;
  readonly value: Frac;
  readonly parts: number;
  readonly tone: Tone;
}

/** Fraction bars, or undefined when the numbers would not draw clearly or the value is negative. */
function bars(caption: string, inputs: readonly BarInput[]): Visual | undefined {
  const specs: BarSpec[] = [];
  for (const input of inputs) {
    const { value, parts } = input;
    if (value.n < 0 || parts > MAX_BAR_PARTS || parts % value.d !== 0) return undefined;
    const shaded = value.n * (parts / value.d);
    if (Math.ceil(shaded / parts) > MAX_BAR_WHOLES) return undefined;
    specs.push({ label: input.label, parts, shaded, tone: input.tone });
  }
  return { kind: 'bars', caption, bars: specs };
}

/** A number line from the nearest whole at or below the smallest value to the nearest at or above the largest. */
function numberLine(caption: string, marks: readonly { value: Frac; label: string; tone: Tone }[], arrow?: { from: Frac; to: Frac }): Visual | undefined {
  const values = marks.map((m) => m.value);
  const min = Math.min(0, ...values.map((v) => Math.floor(v.n / v.d)));
  const max = Math.max(1, ...values.map((v) => Math.ceil(v.n / v.d)));
  if (max - min > MAX_LINE_SPAN) return undefined;
  const tick = values.reduce((acc, v) => lcm(acc, v.d), 1);
  const tickDen = tick <= 12 && (max - min) * tick <= 48 ? tick : null;
  return { kind: 'line', caption, min, max, tickDen, marks, ...(arrow === undefined ? {} : { arrow }) };
}

function withVisual(step: Omit<StepDraft, 'visual'>, visual: Visual | undefined): StepDraft {
  return visual === undefined ? step : { ...step, visual };
}

const eqLine = (leftText: string, left: Frac, rightText: string, right: Frac): Line => ({
  text: `${leftText} = ${rightText}`,
  check: { kind: 'eq', left, right },
});

// ---------------------------------------------------------------------------------------------
// Shared step builders

function simplifyStep(raw: Frac): StepDraft[] {
  const g = gcd(raw.n, raw.d);
  if (g <= 1) return [];
  const red = reduce(raw);
  return [
    {
      id: 'simplify',
      title: 'Simplify (optional)',
      lines: [eqLine(show(raw), raw, show(red), red)],
      why: `Dividing the top and bottom by the same number (${g}) does not change the amount; it just uses bigger pieces. ${show(red)} cannot be simplified further, so it is in simplest form.`,
      simple: `Divide the top and the bottom by ${g}. That gives ${show(red)}, the same amount in simplest form.`,
      optional: true,
    },
  ];
}

function mixedStep(value: Frac): StepDraft[] {
  const mixed = toMixed(value);
  if (mixed === null) return [];
  const red = reduce(value);
  return [
    {
      id: 'mixed',
      title: 'Write it as a mixed number (optional)',
      lines: [{ text: `${show(red)} = ${showMixed(mixed)}` }],
      why: `The top number ${Math.abs(red.n)} is bigger than the bottom number ${red.d}, so the answer is more than one whole. ${red.d} of the ${pieceName(red.d)} make 1 whole, which leaves ${mixed.whole} whole${mixed.whole === 1 ? '' : 's'} and ${mixed.n}/${mixed.d}.`,
      simple: `${show(red)} is more than one whole, so it can also be written as ${showMixed(mixed)}.`,
      optional: true,
    },
  ];
}

function finishSteps(raw: Frac): StepDraft[] {
  const simplified = simplifyStep(raw);
  return [...simplified, ...mixedStep(reduce(raw))];
}

// ---------------------------------------------------------------------------------------------
// Addition and subtraction

function addSubSteps(op: 'add' | 'sub', a: Frac, b: Frac): { steps: StepDraft[]; raw: Frac } {
  const L = lcm(a.d, b.d);
  const a2 = scaleTo(a, L);
  const b2 = scaleTo(b, L);
  const sym = op === 'add' ? '+' : '−';
  const verb = op === 'add' ? 'adding' : 'subtracting';
  const steps: StepDraft[] = [];

  if (a.d !== b.d) {
    steps.push(
      withVisual(
        {
          id: 'common',
          title: 'Make the pieces the same size',
          lines: [eqLine(show(a), a, show(a2), a2), eqLine(show(b), b, show(b2), b2)],
          why: `The denominator tells us the size of each piece. We need equal-sized pieces before ${verb}. A common denominator for ${a.d} and ${b.d} is ${L}, so we rewrite both fractions as ${pieceName(L)}. Multiplying the top and bottom by the same number does not change the amount.`,
          simple: `Make both fractions use ${pieceName(L)}: ${show(a)} is the same as ${show(a2)}, and ${show(b)} is the same as ${show(b2)}.`,
        },
        bars('Both fractions cut into the same size pieces', [
          { label: show(a2), value: a2, parts: L, tone: 'first' },
          { label: show(b2), value: b2, parts: L, tone: 'second' },
        ]),
      ),
    );
  } else {
    steps.push({
      id: 'same',
      title: 'The pieces are already the same size',
      lines: [],
      why: `Both fractions have the denominator ${L}, so both count ${pieceName(L)}. We can ${op === 'add' ? 'add' : 'subtract'} them straight away.`,
      simple: `Both fractions are in ${pieceName(L)}, so we can go straight to the next step.`,
    });
  }

  const topNumber = op === 'add' ? a2.n + b2.n : a2.n - b2.n;
  const raw = frac(topNumber, L);
  const exact = op === 'add' ? add(a2, b2) : sub(a2, b2);
  const rawText = show(raw);
  const combineLine: Line = {
    text: `${show(a2)} ${sym} ${show(b2)} = (${a2.n} ${sym} ${b2.n})/${L} = ${rawText}`,
    check: { kind: 'eq', left: exact, right: raw },
  };
  const negativeNote = raw.n < 0 ? ` The answer is negative because we are taking away more than we started with.` : '';
  let visual: Visual | undefined;
  if (raw.n >= 0) {
    visual = bars(op === 'add' ? 'Join the shaded pieces' : 'Start with the first amount and take the second away', [
      { label: show(a2), value: a2, parts: L, tone: 'first' },
      { label: show(b2), value: b2, parts: L, tone: 'second' },
      { label: rawText, value: raw, parts: L, tone: 'result' },
    ]);
  } else {
    visual = numberLine(
      `Start at ${show(a)} and move left ${show(b)} to land on ${show(reduce(raw))}`,
      [
        { value: a, label: show(a), tone: 'first' },
        { value: reduce(raw), label: show(reduce(raw)), tone: 'result' },
      ],
      { from: a, to: reduce(raw) },
    );
  }
  steps.push(
    withVisual(
      {
        id: 'combine',
        title: op === 'add' ? 'Add the top numbers' : 'Subtract the top numbers',
        lines: [combineLine],
        why: `We are counting pieces, so we ${op === 'add' ? 'add' : 'subtract'} the top numbers. We keep the denominator ${L} because the pieces are still ${pieceName(L)}; ${verb} does not change their size.${negativeNote}`,
        simple: `${op === 'add' ? 'Add' : 'Subtract'} the top numbers (${a2.n} ${sym} ${b2.n}) and keep the bottom number ${L}.${negativeNote}`,
      },
      visual,
    ),
  );
  steps.push(...finishSteps(raw));
  return { steps, raw };
}

// ---------------------------------------------------------------------------------------------
// Multiplication and division

function mulSteps(a: Frac, b: Frac): { steps: StepDraft[]; raw: Frac } {
  const raw = frac(a.n * b.n, a.d * b.d);
  const exact = mul(a, b);
  const result = reduce(raw);
  const steps: StepDraft[] = [
    withVisual(
      {
        id: 'multiply',
        title: 'Multiply across',
        lines: [
          {
            text: `${show(a)} × ${show(b)} = (${a.n} × ${b.n})/(${a.d} × ${b.d}) = ${show(raw)}`,
            check: { kind: 'eq', left: exact, right: raw },
          },
        ],
        why: `Multiplying means taking a fraction of a fraction. The top numbers multiply because we are counting pieces; the bottom numbers multiply because each piece is cut into smaller pieces.`,
        simple: `Multiply the top numbers together (${a.n} × ${b.n}) and the bottom numbers together (${a.d} × ${b.d}).`,
      },
      bars(a.d > 1 && Math.abs(a.n) < a.d ? `${show(a)} of ${show(b)} is ${show(result)}` : `${show(a)} × ${show(b)} = ${show(result)}`, [
        { label: show(b), value: b, parts: b.d, tone: 'second' },
        { label: show(result), value: result, parts: result.d, tone: 'result' },
      ]),
    ),
  ];
  steps.push(...finishSteps(raw));
  return { steps, raw };
}

function divSteps(a: Frac, b: Frac): { steps: StepDraft[]; raw: Frac } {
  const recip = frac(b.d, b.n);
  const raw = frac(a.n * recip.n, a.d * recip.d);
  const L = lcm(a.d, b.d);
  const steps: StepDraft[] = [
    {
      id: 'flip',
      title: 'Flip the second fraction',
      lines: [{ text: `The reciprocal of ${show(b)} is ${show(recip)}` }, { text: `${show(b)} × ${show(recip)} = 1`, check: { kind: 'eq', left: mul(b, recip), right: whole(1) } }],
      why: `Dividing by ${show(b)} asks how many ${show(b)}s fit into ${show(a)}. Multiplying by the reciprocal ${show(recip)} gives the same answer, because ${show(b)} × ${show(recip)} = 1: flipping a fraction undoes it.`,
      simple: `Dividing by ${show(b)} is the same as multiplying by ${show(recip)} (the fraction flipped upside down).`,
    },
    withVisual(
      {
        id: 'multiply',
        title: 'Multiply by the flipped fraction',
        lines: [
          {
            text: `${show(a)} ÷ ${show(b)} = ${show(a)} × ${show(recip)} = (${a.n} × ${recip.n})/(${a.d} × ${recip.d}) = ${show(raw)}`,
            check: { kind: 'eq', left: div(a, b), right: raw },
          },
        ],
        why: `Now it is an ordinary multiplication: multiply the tops and multiply the bottoms.`,
        simple: `Multiply the top numbers (${a.n} × ${recip.n}) and the bottom numbers (${a.d} × ${recip.d}).`,
      },
      bars(`In ${pieceName(L)}: ${show(scaleTo(a, L))} ÷ ${show(scaleTo(b, L))} is ${a.n * (L / a.d)} ÷ ${b.n * (L / b.d)} = ${show(reduce(raw))}`, [
        { label: show(a), value: a, parts: L, tone: 'first' },
        { label: show(b), value: b, parts: L, tone: 'second' },
      ]),
    ),
  ];
  steps.push(...finishSteps(raw));
  return { steps, raw };
}

// ---------------------------------------------------------------------------------------------
// Comparison

const REL_WORD: Record<'<' | '>' | '=', string> = { '<': 'is less than', '>': 'is greater than', '=': 'is equal to' };

function compareSteps(p: Extract<Problem, { kind: 'compare' }>): StepDraft[] {
  const { a, b } = p;
  const L = lcm(a.d, b.d);
  const a2 = scaleTo(a, L);
  const b2 = scaleTo(b, L);
  const symbol: '<' | '>' | '=' = cmp(a, b) < 0 ? '<' : cmp(a, b) > 0 ? '>' : '=';
  const steps: StepDraft[] = [];
  if (a.d !== b.d) {
    steps.push(
      withVisual(
        {
          id: 'common',
          title: 'Make the pieces the same size',
          lines: [eqLine(show(a), a, show(a2), a2), eqLine(show(b), b, show(b2), b2)],
          why: `Fractions with different denominators are cut into different-sized pieces, so we cannot compare the top numbers yet. We rewrite both as ${pieceName(L)} (${L} is a common denominator of ${a.d} and ${b.d}). The amounts do not change.`,
          simple: `Rewrite both fractions with the bottom number ${L} so the pieces match.`,
        },
        bars('Same-sized pieces make the amounts easy to compare', [
          { label: show(a2), value: a2, parts: L, tone: 'first' },
          { label: show(b2), value: b2, parts: L, tone: 'second' },
        ]),
      ),
    );
  }
  const relation: Check = { kind: 'rel', left: a2, right: b2, symbol };
  const which = symbol === '=' ? 'They are equal' : (symbol === '>') === (p.ask === 'larger') ? `${show(a)} is ${p.ask}` : `${show(b)} is ${p.ask}`;
  steps.push(
    withVisual(
      {
        id: 'compare',
        title: a.d === b.d ? 'Compare the top numbers' : 'Compare the top numbers of the new fractions',
        lines: [
          { text: `${a2.n} ${symbol} ${b2.n}, so ${show(a)} ${symbol} ${show(b)}`, check: relation },
          { text: which },
        ],
        why: `With equal-sized pieces, the fraction with more pieces is bigger. ${a2.n} ${REL_WORD[symbol]} ${b2.n}, so ${show(a)} ${REL_WORD[symbol]} ${show(b)}.`,
        simple: `Same size pieces: ${a2.n} pieces ${REL_WORD[symbol]} ${b2.n} pieces.`,
      },
      a.d === b.d
        ? bars('Same-sized pieces', [
            { label: show(a), value: a, parts: L, tone: 'first' },
            { label: show(b), value: b, parts: L, tone: 'second' },
          ])
        : undefined,
    ),
  );
  return steps;
}

// ---------------------------------------------------------------------------------------------
// Equivalent fractions

function noneStep(why: string): StepDraft {
  return { id: 'none', title: 'No whole number works', lines: [], why, simple: why };
}

function equivalentSteps(p: Extract<Problem, { kind: 'equivalent' }>): StepDraft[] {
  const { known, blank, other } = p;
  const result = equivalentResult(known, blank, other);
  const steps: StepDraft[] = [];
  const idea: StepDraft = {
    id: 'idea',
    title: 'Same amount, different name',
    lines: [],
    why: `Multiplying (or dividing) the top and bottom by the same number gives an equal fraction: every piece is cut into smaller equal pieces, so the amount stays the same. Whatever we do to the bottom, we must do to the top.`,
    simple: `To make an equal fraction, do the same thing to the top and the bottom.`,
  };
  steps.push(idea);

  let base = known;
  const reduced = reduce(known);
  const needsReduce = !isReduced(known);
  const solvableDirect = blank === 'numerator' ? other % known.d === 0 : known.n > 0 && other > 0 && other % known.n === 0;

  if (result.type === 'any') {
    steps.push(noneStep(`The top number is 0, so the fraction is 0 whatever the bottom number is. Any whole number (1 or more) works.`));
    return steps;
  }
  if (!solvableDirect && needsReduce && result.type === 'missing') {
    steps.push({
      id: 'simplify',
      title: 'Simplify first',
      lines: [eqLine(show(known), known, show(reduced), reduced)],
      why: `${show(known)} can be simplified to ${show(reduced)}. Starting from the simplest form makes the multiplier a whole number.`,
      simple: `${show(known)} is the same as ${show(reduced)}. Use that.`,
      optional: true,
    });
    base = reduced;
  }
  if (result.type !== 'missing') {
    if (needsReduce) steps.push({ id: 'simplify', title: 'Simplify first', lines: [eqLine(show(known), known, show(reduced), reduced)], why: `${show(known)} is the same as ${show(reduced)}.`, simple: `${show(known)} is the same as ${show(reduced)}.` });
    const why =
      blank === 'numerator'
        ? `In simplest form the bottom number is ${reduced.d}. Equal fractions only have bottom numbers that are multiples of ${reduced.d}, and ${other} is not one. So no whole number can go in the box.`
        : reduced.n === 0
          ? `${show(known)} is 0, but ${other}/? is not 0, so no bottom number can make them equal.`
          : `In simplest form the top number is ${reduced.n}. Equal fractions only have top numbers that are multiples of ${reduced.n}, and ${other} is not one. So no whole number can go in the box.`;
    steps.push(noneStep(why));
    return steps;
  }

  if (blank === 'numerator') {
    const k = other / base.d;
    const x = base.n * k;
    steps.push(
      {
        id: 'factor',
        title: `What did the bottom number get multiplied by?`,
        lines: [eqLine(`${base.d} × ${k}`, whole(base.d * k), String(other), whole(other))],
        why: `To get from a bottom number of ${base.d} to ${other}, we multiply by ${k}.`,
        simple: `${base.d} × ${k} = ${other}, so the bottom was multiplied by ${k}.`,
      },
      withVisual(
        {
          id: 'apply',
          title: 'Do the same to the top number',
          lines: [eqLine(`${base.n} × ${k}`, whole(base.n * k), String(x), whole(x)), eqLine(show(base), base, `${x}/${other}`, frac(x, other))],
          why: `We multiplied the bottom by ${k}, so we multiply the top by ${k} as well. The missing top number is ${x}.`,
          simple: `Multiply the top by ${k} too: ${base.n} × ${k} = ${x}.`,
        },
        bars(`${show(known)} and ${x}/${other} are the same amount`, [
          { label: show(known), value: known, parts: known.d, tone: 'first' },
          { label: `${x}/${other}`, value: frac(x, other), parts: other, tone: 'result' },
        ]),
      ),
    );
    return steps;
  }

  const k = other / base.n;
  const y = base.d * k;
  steps.push(
    {
      id: 'factor',
      title: 'What did the top number get multiplied by?',
      lines: [eqLine(`${base.n} × ${k}`, whole(base.n * k), String(other), whole(other))],
      why: `To get from a top number of ${base.n} to ${other}, we multiply by ${k}.`,
      simple: `${base.n} × ${k} = ${other}, so the top was multiplied by ${k}.`,
    },
    withVisual(
      {
        id: 'apply',
        title: 'Do the same to the bottom number',
        lines: [eqLine(`${base.d} × ${k}`, whole(base.d * k), String(y), whole(y)), eqLine(show(base), base, `${other}/${y}`, frac(other, y))],
        why: `We multiplied the top by ${k}, so we multiply the bottom by ${k} as well. The missing bottom number is ${y}.`,
        simple: `Multiply the bottom by ${k} too: ${base.d} × ${k} = ${y}.`,
      },
      bars(`${show(known)} and ${other}/${y} are the same amount`, [
        { label: show(known), value: known, parts: known.d, tone: 'first' },
        { label: `${other}/${y}`, value: frac(other, y), parts: y, tone: 'result' },
      ]),
    ),
  );
  return steps;
}

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

/** Every fraction and number the verified solution mentions, as written. Used to ground and check AI text. */
export function solutionFacts(solution: Solution): string[] {
  const facts = [describeAnswer(solution.problem, solution.result)];
  for (const step of solution.steps) {
    facts.push(`${step.title}: ${step.lines.map((l) => l.text).join('; ')}. ${step.why}`);
  }
  return facts;
}
