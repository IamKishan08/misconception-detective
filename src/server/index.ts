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

const port = Number.parseInt(process.env.PORT ?? '', 10) || DEFAULT_PORT;
const server = createApp({ ai, staticDir }).listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ severity: 'INFO', message: 'listening', port, explanations: ai.live ? 'live' : 'offline', model: ai.live ? model : null }));
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ severity: 'INFO', message: 'shutting_down', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
