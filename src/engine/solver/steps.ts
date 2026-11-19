/**
 * Worked-step builders for each kind of problem. Every equation carries a machine-checkable `check`, and every step has
 * a fuller explanation (`why`), a plainer one (`simple`) and a one-sentence reason (added from REASONS).
 */
import { add, cmp, div, frac, gcd, isReduced, lcm, mul, reduce, show, showMixed, sub, toMixed, whole, type Frac } from './frac.js';
import type { Problem } from './problem.js';
import { equivalentResult } from './result.js';
import type { Check, Line, StepDraft, Visual } from './types.js';
import { bars, eqLine, numberLine, pieceName, scaleTo, withVisual } from './visuals.js';

export const REASONS: Record<string, string> = {
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

export function finishSteps(raw: Frac): StepDraft[] {
  const simplified = simplifyStep(raw);
  return [...simplified, ...mixedStep(reduce(raw))];
}

// ---------------------------------------------------------------------------------------------
// Addition and subtraction

export function addSubSteps(op: 'add' | 'sub', a: Frac, b: Frac): { steps: StepDraft[]; raw: Frac } {
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

export function mulSteps(a: Frac, b: Frac): { steps: StepDraft[]; raw: Frac } {
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

export function divSteps(a: Frac, b: Frac): { steps: StepDraft[]; raw: Frac } {
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

export function compareSteps(p: Extract<Problem, { kind: 'compare' }>): StepDraft[] {
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

/**
 * The two steps shared by both kinds of missing number. One side of the equal fraction is fully known: its number tells us
 * the multiplier (`other` / driver). The same multiplier is then applied to the other number of the known fraction.
 * For a missing numerator the bottom drives; for a missing denominator the top drives.
 */
function scalingSteps(known: Frac, base: Frac, blank: 'numerator' | 'denominator', other: number): StepDraft[] {
  const [driver, follower] = blank === 'numerator' ? [base.d, base.n] : [base.n, base.d];
  const [driverName, followerName] = blank === 'numerator' ? ['bottom', 'top'] : ['top', 'bottom'];
  const k = other / driver;
  const scaled = follower * k;
  const filled = blank === 'numerator' ? frac(scaled, other) : frac(other, scaled);
  const filledText = `${filled.n}/${filled.d}`;
  return [
    {
      id: 'factor',
      title: `What did the ${driverName} number get multiplied by?`,
      lines: [eqLine(`${driver} × ${k}`, whole(driver * k), String(other), whole(other))],
      why: `To get from a ${driverName} number of ${driver} to ${other}, we multiply by ${k}.`,
      simple: `${driver} × ${k} = ${other}, so the ${driverName} was multiplied by ${k}.`,
    },
    withVisual(
      {
        id: 'apply',
        title: `Do the same to the ${followerName} number`,
        lines: [eqLine(`${follower} × ${k}`, whole(scaled), String(scaled), whole(scaled)), eqLine(show(base), base, filledText, filled)],
        why: `We multiplied the ${driverName} by ${k}, so we multiply the ${followerName} by ${k} as well. The missing ${followerName} number is ${scaled}.`,
        simple: `Multiply the ${followerName} by ${k} too: ${follower} × ${k} = ${scaled}.`,
      },
      bars(`${show(known)} and ${filledText} are the same amount`, [
        { label: show(known), value: known, parts: known.d, tone: 'first' },
        { label: filledText, value: filled, parts: filled.d, tone: 'result' },
      ]),
    ),
  ];
}

export function equivalentSteps(p: Extract<Problem, { kind: 'equivalent' }>): StepDraft[] {
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

  steps.push(...scalingSteps(known, base, blank, other));
  return steps;
}
