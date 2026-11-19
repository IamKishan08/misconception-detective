/** Identifiers and shapes for teaching help. A model (or the built-in matcher) may only pick among these. */
import type { CauseId } from './check.js';
import type { Solution, Visual } from './solve.js';

export const INTENTS = [
  'explain_step',
  'explain_concept',
  'explain_simply',
  'show_visual',
  'explain_mistake',
  'help_start',
  'clarify',
  'out_of_scope',
] as const;
export type Intent = (typeof INTENTS)[number];

export const CONCEPT_IDS = [
  'equal_denominators',
  'common_denominator',
  'multiply_both',
  'keep_denominator',
  'invert_divisor',
  'multiply_across',
  'simplify_fraction',
  'improper_to_mixed',
  'negative_result',
  'compare_common',
  'zero_denominator',
] as const;
export type ConceptId = (typeof CONCEPT_IDS)[number];

export const CAUSE_IDS = [
  'added_across',
  'subtracted_across',
  'reversed_order',
  'added_instead',
  'no_flip',
  'flipped_first',
  'bigger_denominator',
  'added_same_number',
  'changed_one_number',
] as const satisfies readonly CauseId[];

/** What the selector (model or built-in matcher) picked. Parameters not used by the intent are always dropped. */
export interface HelpSelection {
  readonly intent: Intent;
  readonly stepId?: string;
  readonly conceptId?: ConceptId;
  readonly causeId?: CauseId;
}

export interface HelpContext {
  readonly solution: Solution;
  /** Possible mistakes the app itself found in the student's checked answer (never from the model). */
  readonly causes: readonly CauseId[];
}

export type SelectionCheck = { ok: true; selection: HelpSelection } | { ok: false; reason: string };

export interface NextHelp {
  readonly label: string;
  readonly selection: HelpSelection;
}

export interface HelpContent {
  readonly intent: Intent;
  readonly title: string;
  readonly paragraphs: readonly string[];
  /** Verified lines of working related to the help. */
  readonly lines: readonly string[];
  readonly visual?: Visual;
  /** Built-in help the student can try next: each is a selection the app can render without any model. */
  readonly nextHelp: readonly NextHelp[];
}
