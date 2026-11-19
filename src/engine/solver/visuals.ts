/**
 * Wording and drawing helpers for worked steps: piece names, fraction bars and number lines. A visual is only produced
 * when it would be drawn clearly and accurately; otherwise the helpers return undefined and the step has no picture.
 */
import { frac, lcm, type Frac } from './frac.js';
import type { Line, StepDraft, Tone, Visual, BarSpec } from './types.js';

const PIECES: Record<number, string> = { 2: 'halves', 3: 'thirds', 4: 'quarters', 5: 'fifths', 6: 'sixths', 7: 'sevenths', 8: 'eighths', 9: 'ninths', 10: 'tenths', 12: 'twelfths' };

export function pieceName(d: number): string {
  return PIECES[d] ?? `pieces of size 1/${d}`;
}

const MAX_BAR_PARTS = 24;
const MAX_BAR_WHOLES = 4;
const MAX_LINE_SPAN = 8;

export function scaleTo(f: Frac, d: number): Frac {
  return frac(f.n * (d / f.d), d);
}

interface BarInput {
  readonly label: string;
  readonly value: Frac;
  readonly parts: number;
  readonly tone: Tone;
}

/** Fraction bars, or undefined when the numbers would not draw clearly or the value is negative. */
export function bars(caption: string, inputs: readonly BarInput[]): Visual | undefined {
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
export function numberLine(caption: string, marks: readonly { value: Frac; label: string; tone: Tone }[], arrow?: { from: Frac; to: Frac }): Visual | undefined {
  const values = marks.map((m) => m.value);
  const min = Math.min(0, ...values.map((v) => Math.floor(v.n / v.d)));
  const max = Math.max(1, ...values.map((v) => Math.ceil(v.n / v.d)));
  if (max - min > MAX_LINE_SPAN) return undefined;
  const tick = values.reduce((acc, v) => lcm(acc, v.d), 1);
  const tickDen = tick <= 12 && (max - min) * tick <= 48 ? tick : null;
  return { kind: 'line', caption, min, max, tickDen, marks, ...(arrow === undefined ? {} : { arrow }) };
}

export function withVisual(step: Omit<StepDraft, 'visual'>, visual: Visual | undefined): StepDraft {
  return visual === undefined ? step : { ...step, visual };
}

export const eqLine = (leftText: string, left: Frac, rightText: string, right: Frac): Line => ({
  text: `${leftText} = ${rightText}`,
  check: { kind: 'eq', left, right },
});
