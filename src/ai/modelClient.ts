import { ApiError, GoogleGenAI } from '@google/genai';
import type { Prompt } from './prompts.js';

/** Thin seam over the model so tests can substitute a fake. Returns the raw JSON text. */
export interface ModelClient {
  generateJson(prompt: Prompt, jsonSchema: unknown, signal: AbortSignal): Promise<string>;
}

/** Errors worth one retry: provider overload or a dropped connection. Quota (429) and bad requests are not retried. */
export class TransientModelError extends Error {}

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
/** Output cap: two short sentences of JSON fit comfortably. */
export const MAX_OUTPUT_TOKENS = 256;

export const DEFAULT_MODEL = 'gemini-2.5-flash';

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
            // Short classification/writing tasks do not need extended thinking; this keeps latency and cost low.
            thinkingConfig: { thinkingBudget: 0 },
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
