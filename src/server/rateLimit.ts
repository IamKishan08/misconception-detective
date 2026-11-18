import type { RequestHandler } from 'express';

export interface RateLimitOptions {
  readonly windowMs: number;
  readonly max: number;
  /** Upper bound on tracked IPs so memory stays bounded under many clients. */
  readonly maxTrackedClients?: number;
  readonly now?: () => number;
}

const DEFAULT_MAX_TRACKED = 10_000;

/**
 * Fixed-window, per-IP limiter held in memory. It is per instance: with autoscaling,
 * each Cloud Run instance counts separately, so the real limit is max x instances.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const now = options.now ?? Date.now;
  const maxTracked = options.maxTrackedClients ?? DEFAULT_MAX_TRACKED;
  const hits = new Map<string, { count: number; start: number }>();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const t = now();
    let entry = hits.get(key);
    if (entry === undefined || t - entry.start >= options.windowMs) {
      if (entry === undefined && hits.size >= maxTracked) {
        for (const [ip, e] of hits) if (t - e.start >= options.windowMs) hits.delete(ip);
        if (hits.size >= maxTracked) hits.clear();
      }
      entry = { count: 0, start: t };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.start + options.windowMs - t) / 1000)));
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}
