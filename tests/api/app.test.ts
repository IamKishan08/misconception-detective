import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AiService } from '../../src/ai/service.js';
import type { ModelClient } from '../../src/ai/modelClient.js';
import { createApp } from '../../src/server/app.js';

const fakeClient: ModelClient = {
  generateJson: async () => JSON.stringify({ templateId: 'F1.common_parts' }),
};
const offlineApp = () => createApp({ ai: new AiService({ client: null }) });
const validExplain = { family: 'F1', templateId: 'F1.common_parts', hintLevel: 0 };

describe('health and status', () => {
  it('GET /healthz', async () => {
    const res = await request(offlineApp()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/status says "live" only after a real model call has succeeded', async () => {
    expect((await request(offlineApp()).get('/api/status')).body).toEqual({ explanations: 'offline' });
    const live = createApp({ ai: new AiService({ client: fakeClient }) });
    expect((await request(live).get('/api/status')).body).toEqual({ explanations: 'untested' });
    await request(live).post('/api/explain').send(validExplain);
    expect((await request(live).get('/api/status')).body).toEqual({ explanations: 'live' });

    const failing: ModelClient = { generateJson: () => Promise.reject(new Error('402 credits depleted')) };
    const broken = createApp({ ai: new AiService({ client: failing }) });
    await request(broken).post('/api/explain').send(validExplain);
    expect((await request(broken).get('/api/status')).body).toEqual({ explanations: 'failing' });
  });
});

describe('POST /api/explain', () => {
  it('returns a fallback when there is no key', async () => {
    const res = await request(offlineApp()).post('/api/explain').send(validExplain);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'fallback', fallbackReason: 'no_key', templateId: 'F1.common_parts' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns model output when live', async () => {
    const app = createApp({ ai: new AiService({ client: fakeClient }) });
    const res = await request(app).post('/api/explain').send(validExplain);
    expect(res.body.source).toBe('gemini');
  });

  it.each([
    ['unknown family', { ...validExplain, family: 'F9' }],
    ['hintLevel 5', { ...validExplain, hintLevel: 5 }],
    ['extra field', { ...validExplain, extra: 1 }],
    ['missing field', { family: 'F1', hintLevel: 0 }],
    ['wrong types', { family: 1, templateId: 2, hintLevel: '0' }],
  ])('rejects %s', async (_n, body) => {
    const res = await request(offlineApp()).post('/api/explain').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request' });
  });
});

describe('POST /api/interpret', () => {
  it('rejects text over 200 chars and empty text', async () => {
    const app = offlineApp();
    expect((await request(app).post('/api/interpret').send({ text: 'a'.repeat(201) })).status).toBe(400);
    expect((await request(app).post('/api/interpret').send({ text: '   ' })).status).toBe(400);
  });

  it('accepts valid text and returns none offline', async () => {
    const res = await request(offlineApp()).post('/api/interpret').send({ text: 'I added the tops' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'fallback', family: 'none', fallbackReason: 'no_key' });
  });
});

describe('request hardening', () => {
  it('rejects oversized bodies with 413', async () => {
    const res = await request(offlineApp())
      .post('/api/interpret')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ text: 'a'.repeat(3000) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload_too_large' });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(offlineApp()).post('/api/explain').set('Content-Type', 'application/json').send('{"family":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request' });
  });

  it('rate limits per client with Retry-After', async () => {
    const app = createApp({ ai: new AiService({ client: null }), rateLimit: { windowMs: 60_000, max: 3 } });
    for (let i = 0; i < 3; i++) expect((await request(app).post('/api/interpret').send({ text: 'x' })).status).toBe(200);
    const res = await request(app).post('/api/interpret').send({ text: 'x' });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'rate_limited' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not rate limit the cheap status read, and still limits the endpoints that can call the model', async () => {
    const app = createApp({ ai: new AiService({ client: null }), rateLimit: { windowMs: 60_000, max: 2 } });
    for (let i = 0; i < 10; i++) expect((await request(app).get('/api/status')).status).toBe(200);
    expect((await request(app).post('/api/interpret').send({ text: 'x' })).status).toBe(200);
    expect((await request(app).post('/api/ask').send({ problem: { kind: 'arith', op: 'add', a: { n: 1, d: 2 }, b: { n: 1, d: 4 } }, question: 'hi' })).status).toBe(200);
    expect((await request(app).post('/api/interpret').send({ text: 'x' })).status).toBe(429);
    expect((await request(app).get('/api/status')).status).toBe(200);
  });

  it('sets security headers and hides x-powered-by', async () => {
    const res = await request(offlineApp()).get('/healthz');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(offlineApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
