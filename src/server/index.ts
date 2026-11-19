import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_MODEL, createGeminiClient } from '../ai/modelClient.js';
import { AiService } from '../ai/service.js';
import { createApp } from './app.js';

const DEFAULT_PORT = 8080;
/** Time allowed for open requests to finish after SIGTERM (Cloud Run gives 10 s). */
const SHUTDOWN_GRACE_MS = 8000;

const apiKey = process.env.GEMINI_API_KEY?.trim();
const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
const ai = new AiService({ client: apiKey ? createGeminiClient(apiKey, model) : null });

// Compiled to dist/server/server/index.js; the frontend build lives in dist/web.
const here = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR ?? path.resolve(here, '../../web');

/**
 * Requests per minute per client address for endpoints that can call the model. Configurable because a whole class can
 * share one address; the default stays conservative. Bounded so a typo cannot disable the limit.
 */
const rateMax = Math.min(10_000, Math.max(1, Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE ?? '', 10) || 30));

const port = Number.parseInt(process.env.PORT ?? '', 10) || DEFAULT_PORT;
const server = createApp({ ai, staticDir, rateLimit: { windowMs: 60_000, max: rateMax } }).listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ severity: 'INFO', message: 'listening', port, ai: ai.live ? 'configured' : 'not_configured', model: ai.live ? model : null }));
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ severity: 'INFO', message: 'shutting_down', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
