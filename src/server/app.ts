import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';
import { explainRequestSchema, interpretRequestSchema } from '../ai/schemas.js';
import type { AiService } from '../ai/service.js';
import { rateLimit, type RateLimitOptions } from './rateLimit.js';

export interface AppOptions {
  readonly ai: AiService;
  /** Directory with the built frontend; omitted in API tests. */
  readonly staticDir?: string;
  readonly rateLimit?: RateLimitOptions;
}

/** Request bodies are tiny (a 200-character reason at most); anything bigger is rejected. */
const MAX_BODY = '2kb';
const DEFAULT_RATE_LIMIT: RateLimitOptions = { windowMs: 60_000, max: 30 };

function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_request' });
    return null;
  }
  return parsed.data;
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  // Cloud Run sits behind one Google front end proxy; trust it so req.ip is the client address.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  api.use(rateLimit(options.rateLimit ?? DEFAULT_RATE_LIMIT));
  api.use(express.json({ limit: MAX_BODY, strict: true }));
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/status', (_req, res) => {
    res.json({ explanations: options.ai.health });
  });

  api.post('/interpret', async (req, res) => {
    const body = parseBody(interpretRequestSchema, req, res);
    if (body === null) return;
    res.json(await options.ai.interpretReason(body.text));
  });

  api.post('/explain', async (req, res) => {
    const body = parseBody(explainRequestSchema, req, res);
    if (body === null) return;
    res.json(await options.ai.explain(body.family, body.templateId, body.hintLevel));
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  app.use('/api', api);

  const staticDir = options.staticDir;
  if (staticDir !== undefined && existsSync(staticDir)) {
    app.use(
      '/assets',
      express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '1y', index: false }),
    );
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    const code = status === 413 ? 'payload_too_large' : status >= 500 ? 'server_error' : 'invalid_request';
    // Log only the error kind, never request bodies or learner text.
    if (status >= 500) console.error(JSON.stringify({ severity: 'ERROR', message: 'unhandled_error', status }));
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: code });
  };
  app.use(onError);
  return app;
}
