/** Data shapes of a worked solution. Pure types: no behaviour lives here. */
import type { Frac } from './frac.js';
import type { Problem } from './problem.js';

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
