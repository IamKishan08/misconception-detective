import { z } from 'zod';
import { CAUSE_IDS, CONCEPT_IDS, INTENTS } from '../engine/solver/help.js';

/** Learner free text is capped before it reaches any prompt. */
export const MAX_REASON_CHARS = 200;

export const familyIdSchema = z.enum(['F1', 'F2', 'F3']);

export const interpretRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_REASON_CHARS),
});

export const explainRequestSchema = z.strictObject({
  family: familyIdSchema,
  templateId: z.string().min(1).max(40),
  hintLevel: z.number().int().min(0).max(2),
});

export type InterpretRequest = z.infer<typeof interpretRequestSchema>;
export type ExplainRequest = z.infer<typeof explainRequestSchema>;

export const modelInterpretationSchema = z.strictObject({
  family: z.enum(['F1', 'F2', 'F3', 'none']),
});

/** The model only chooses WHICH reviewed template to show; it writes no sentences. */
export const modelExplanationSchema = z.strictObject({ templateId: z.string() });

/** JSON schemas sent to Gemini for structured output (kept in step with the Zod schemas above). */
export const INTERPRETATION_JSON_SCHEMA = {
  type: 'object',
  properties: { family: { type: 'string', enum: ['F1', 'F2', 'F3', 'none'] } },
  required: ['family'],
  additionalProperties: false,
} as const;

export function explanationJsonSchema(templateIds: readonly string[]) {
  return {
    type: 'object',
    properties: { templateId: { type: 'string', enum: [...templateIds] } },
    required: ['templateId'],
    additionalProperties: false,
  } as const;
}

// ---------------------------------------------------------------------------------------------
// Follow-up question about the current solution

/** A follow-up question is short; the problem itself is sent as numbers only. */
export const MAX_QUESTION_CHARS = 200;

const fracSchema = z.strictObject({ n: z.number().int().min(0).max(999), d: z.number().int().min(1).max(999) });

export const problemSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('arith'), op: z.enum(['add', 'sub', 'mul', 'div']), a: fracSchema, b: fracSchema }),
    z.strictObject({ kind: z.literal('compare'), a: fracSchema, b: fracSchema, ask: z.enum(['larger', 'smaller']) }),
    z.strictObject({ kind: z.literal('equivalent'), known: fracSchema, blank: z.enum(['numerator', 'denominator']), other: z.number().int().min(0).max(999) }),
  ])
  .refine((p) => !(p.kind === 'arith' && p.op === 'div' && p.b.n === 0), 'division by zero')
  .refine((p) => !(p.kind === 'equivalent' && p.blank === 'numerator' && p.other === 0), 'zero denominator');

export const askRequestSchema = z.strictObject({
  problem: problemSchema,
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  /** Possible mistakes the app itself found in the student's answer, so help about them can be selected. */
  causes: z.array(z.enum(CAUSE_IDS)).max(3).optional(),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/**
 * What the model may return: an intent and identifiers, nothing else. Whether each identifier exists and applies to this
 * problem is checked by validateSelection; this schema only fixes the shape.
 */
export const modelSelectionSchema = z.strictObject({
  intent: z.enum(INTENTS),
  stepId: z.string().max(24).optional(),
  conceptId: z.enum(CONCEPT_IDS).optional(),
  causeId: z.enum(CAUSE_IDS).optional(),
});

/** JSON schema sent to Gemini: step ids are restricted to this problem's steps. */
export function selectionJsonSchema(stepIds: readonly string[]) {
  return {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      stepId: { type: 'string', enum: [...stepIds] },
      conceptId: { type: 'string', enum: [...CONCEPT_IDS] },
      causeId: { type: 'string', enum: [...CAUSE_IDS] },
    },
    required: ['intent'],
    additionalProperties: false,
  } as const;
}
