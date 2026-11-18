import { z } from 'zod';

/** Learner free text is capped before it reaches any prompt. */
export const MAX_REASON_CHARS = 200;
/** Each model sentence must be short enough to read at a glance. */
export const MAX_SENTENCE_CHARS = 160;
export const MAX_SENTENCES = 2;

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

/**
 * Model sentences may not contain digits (all numbers come from verified code), angle brackets, or URLs.
 * Anything else is rejected and the verified fallback is used instead.
 */
const safeSentence = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SENTENCE_CHARS)
  .refine((s) => !/[0-9<>]/.test(s) && !/https?:|www\./i.test(s), 'unsafe sentence');

export const modelExplanationSchema = z.strictObject({
  templateId: z.string(),
  sentences: z.array(safeSentence).min(1).max(MAX_SENTENCES),
});

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
    properties: {
      templateId: { type: 'string', enum: [...templateIds] },
      sentences: { type: 'array', items: { type: 'string', maxLength: MAX_SENTENCE_CHARS }, minItems: 1, maxItems: MAX_SENTENCES },
    },
    required: ['templateId', 'sentences'],
    additionalProperties: false,
  } as const;
}
