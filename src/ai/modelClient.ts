import { ApiError, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { Prompt } from './prompts.js';

/** Thin seam over the model so tests can substitute a fake. Returns the raw JSON text. */
export interface ModelClient {
  generateJson(prompt: Prompt, jsonSchema: unknown, signal: AbortSignal): Promise<string>;
}

/** Errors worth one retry: provider overload or a dropped connection. Authentication, quota and bad requests are never retried. */
export class TransientModelError extends Error {}

export type ModelFailureKind = 'auth' | 'quota' | 'model_unavailable' | 'provider';

/** A provider failure that must not be retried. Only the kind is kept: provider messages can echo request details. */
export class ModelCallError extends Error {
  constructor(readonly kind: ModelFailureKind) {
    super(kind);
  }
}

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/** Output cap: the answers here are tiny JSON selections. */
export const MAX_OUTPUT_TOKENS = 200;

/** Default model. Configurable with GEMINI_MODEL; availability is checked against the provider's model list, not assumed. */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/**
 * Short selection tasks need little reasoning. Gemini 2.x takes a token budget (0 = off); Gemini 3 models take a level
 * and hang rather than fail when given a zero budget. See https://ai.google.dev/gemini-api/docs/thinking
 */
export function thinkingFor(model: string): ThinkingConfig {
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.MINIMAL };
}

/** Maps a provider error to what the app can do about it. Pure, so it is unit tested. */
export function classifyApiError(status: number, message: string): Error {
  if (TRANSIENT_STATUSES.has(status)) return new TransientModelError(`status ${status}`);
  if (status === 401 || status === 403 || (status === 400 && /api[_ ]key/i.test(message))) return new ModelCallError('auth');
  if (status === 402 || status === 429) return new ModelCallError('quota');
  if (status === 404) return new ModelCallError('model_unavailable');
  return new ModelCallError('provider');
}

export function createGeminiClient(apiKey: string, model: string): ModelClient {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateJson(prompt, jsonSchema, signal) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          config: {
            systemInstruction: prompt.system,
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            thinkingConfig: thinkingFor(model),
            abortSignal: signal,
          },
        });
        return response.text ?? '';
      } catch (error) {
        if (error instanceof ApiError) throw classifyApiError(error.status, error.message);
        if (error instanceof TypeError) throw new TransientModelError('network');
        throw error;
      }
    },
  };
}
