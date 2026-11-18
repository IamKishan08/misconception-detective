import type { Rational } from './rational.js';

export type FamilyId = 'F1' | 'F2' | 'F3';
export const FAMILY_ORDER: readonly FamilyId[] = ['F1', 'F2', 'F3'];

export type Stage = 'item' | 'followup' | 'transfer';
export type Difficulty = 1 | 2;

/** Error patterns the detectors look for. Each belongs to exactly one family. */
export type PatternId = 'add_across' | 'bigger_denominator' | 'scale_one_part' | 'additive_scaling' | 'not_equivalent';

export type ChoiceId = 'first' | 'second' | 'equal';

export type QuestionBody =
  | { type: 'add'; a: Rational; b: Rational }
  | { type: 'compare'; context: 'plain' | 'share'; first: Rational; second: Rational; order: readonly ChoiceId[] }
  | { type: 'missing_numerator'; known: Rational; targetDen: number }
  | { type: 'missing_denominator'; known: Rational; targetNum: number }
  | { type: 'equal_check'; first: Rational; second: Rational; order: readonly ChoiceId[] };

export interface Question {
  /** Deterministic id built from the numbers, used to avoid repeats. */
  readonly id: string;
  readonly family: FamilyId;
  readonly stage: Stage;
  readonly difficulty: Difficulty;
  readonly body: QuestionBody;
}

export type Answer =
  | { kind: 'fraction'; numerator: string; denominator: string }
  | { kind: 'choice'; optionId: string }
  | { kind: 'whole'; value: string };

export type InvalidReason = 'empty' | 'not_whole_number' | 'out_of_range' | 'zero_denominator' | 'wrong_answer_kind' | 'unknown_option';

export type Evaluation =
  | { valid: false; reason: InvalidReason }
  | { valid: true; correct: boolean; pattern: PatternId | null; display: string };

export type Outcome = 'correct' | 'possible_misconception' | 'needs_more_evidence' | 'invalid_input';

/** A bar split into `parts` equal pieces with `shaded` of them filled. Always shaded/parts === value exactly. */
export interface Bar {
  readonly value: Rational;
  readonly parts: number;
  readonly shaded: number;
  readonly role: 'first' | 'second' | 'total' | 'across' | 'equivalent' | 'one_part_scaled';
}

export type VisualNote =
  | { key: 'show_fraction'; value: Rational }
  | { key: 'common_parts'; parts: number }
  | { key: 'total'; total: Rational; reduced: Rational }
  | { key: 'across_not_bigger'; across: Rational; largest: Rational }
  | { key: 'same_whole'; bigger: Rational; smaller: Rational }
  | { key: 'compare_common'; larger: Rational; parts: number }
  | { key: 'split_parts'; factor: number; from: Rational; to: Rational }
  | { key: 'one_part_scaled'; wrong: Rational; right: Rational };

export interface VisualStep {
  readonly bars: readonly Bar[];
  readonly note: VisualNote;
}

export interface FamilyDefinition {
  readonly id: FamilyId;
  /** Every valid question for a stage and difficulty (already filtered to discriminating ones). */
  candidates(stage: Stage, difficulty: Difficulty): readonly Question[];
  evaluate(question: Question, answer: Answer): Evaluation;
  /** The answer a learner holding this family's misconception would give (used in tests and demos). */
  misconceptionAnswer(question: Question): Answer;
  correctAnswer(question: Question): Answer;
  visual(question: Question): readonly VisualStep[];
}
