import { ApiError, GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import type { Prompt } from './prompts.js';

/** Thin seam over the model so tests can substitute a fake. Returns the raw JSON text. */
export interface ModelClient {
  generateJson(prompt: Prompt, jsonSchema: unknown, signal: AbortSignal): Promise<string>;
}

/** Errors worth one retry: provider overload or a dropped connection. Quota (429) and bad requests are not retried. */
export class TransientModelError extends Error {}

/** 402 (credits depleted) and 429 (quota) fall through as provider errors: no retry, verified fallback. */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
/** Output cap: two short sentences of JSON fit comfortably. */
export const MAX_OUTPUT_TOKENS = 256;

/** Verified working on 19 Nov 2026; gemini-2.5-flash is no longer offered to new API users. */
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/**
 * Short classification/writing tasks need little reasoning. Gemini 2.x takes a token budget (0 = off);
 * Gemini 3 models take a level and hang rather than fail when given a zero budget.
 */
export function thinkingFor(model: string): ThinkingConfig {
  return /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: ThinkingLevel.MINIMAL };
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
            temperature: 0.4,
            thinkingConfig: thinkingFor(model),
            abortSignal: signal,
          },
        });
        return response.text ?? '';
      } catch (error) {
        if (error instanceof ApiError && TRANSIENT_STATUSES.has(error.status)) throw new TransientModelError(`status ${error.status}`);
        if (error instanceof TypeError) throw new TransientModelError('network');
        throw error;
      }
    },
  };
}
