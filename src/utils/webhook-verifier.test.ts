import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { createWebhookMiddleware, createNextWebhookHandler, createNextApiWebhookHandler } from '../http/webhook-middleware';
import { parseWebhookPayload, verifyWebhookSignature } from './webhook-verifier';
import { WebhookPayloadSchema } from './validation-schemas';

const secret = 'test-secret';
const now = 1_700_000_000_000;
const event = { id: 'evt_1', timestamp: now, event: 'tip.confirmed', data: { amount: 1 } };
const body = JSON.stringify(event);
const sign = (raw: string, timestamp: number) => crypto.createHmac('sha256', secret)
  .update(`${timestamp}.${raw}`).digest('hex');

describe('webhook verification', () => {
  it('accepts a correctly signed timestamp and preserves legacy body-only verification', () => {
    expect(verifyWebhookSignature(body, sign(body, now), secret, { timestamp: now, now })).toBe(true);
    const legacy = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWebhookSignature(body, legacy, secret)).toBe(true);
    expect(verifyWebhookSignature(body, legacy, secret, { timestamp: now, now })).toBe(false);
  });

  it('rejects tampering, malformed signatures, missing timestamps and invalid settings', () => {
    expect(verifyWebhookSignature(body + ' ', sign(body, now), secret, { timestamp: now, now })).toBe(false);
    expect(verifyWebhookSignature(body, 'not-hex', secret, { timestamp: now, now })).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, now), secret, { timestamp: 'abc', now })).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, now), secret, { timestamp: now, maxAge: -1, now })).toBe(false);
  });

  it('rejects old and future messages with configurable windows', () => {
    const old = now - 300_001;
    expect(verifyWebhookSignature(body, sign(body, old), secret, { timestamp: old, now })).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, old), secret, { timestamp: old, maxAge: 300_001, now })).toBe(true);
    const future = now + 300_001;
    expect(verifyWebhookSignature(body, sign(body, future), secret, { timestamp: future, now })).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, future), secret, { timestamp: future, clockSkew: 300_001, now })).toBe(true);
  });

  it('validates webhook payload structure', () => {
    expect(parseWebhookPayload(event)).toEqual(event);
    expect(WebhookPayloadSchema.safeParse({ ...event, timestamp: NaN }).success).toBe(false);
    expect(() => parseWebhookPayload({ ...event, data: [] })).toThrow();
    expect(() => parseWebhookPayload({ ...event, timestamp: Infinity })).toThrow();
  });
});

describe('webhook middleware', () => {
  const makeRequest = (raw = body, timestamp = now) => ({
    body: Buffer.from(raw),
    headers: {
      'x-dorisio-signature': sign(raw, timestamp),
      'x-dorisio-timestamp': String(timestamp),
    },
    dorisioWebhook: undefined as undefined | typeof event,
  });

  it('passes a verified Express event to the next handler', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const req = makeRequest();
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      createWebhookMiddleware({ secret })(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.dorisioWebhook).toEqual(event);
      expect(res.status).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('rejects parsed input, expired delivery, malformed JSON and payload timestamp mismatch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const middleware = createWebhookMiddleware({ secret });
      middleware({ ...makeRequest(), body: event }, res, next);
      expect(res.status).toHaveBeenLastCalledWith(400);
      middleware(makeRequest('{', now), res, next);
      expect(res.status).toHaveBeenLastCalledWith(401);
      middleware(makeRequest(body, now - 300_001), res, next);
      expect(res.status).toHaveBeenLastCalledWith(401);
      middleware(makeRequest(body, now - 1), res, next);
      expect(res.status).toHaveBeenLastCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('wraps a Next.js App Router handler', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const handler = vi.fn(() => Response.json({ ok: true }));
      const route = createNextWebhookHandler({ secret }, handler);
      const request = (signature: string) => new Request('https://example.com/webhook', {
        method: 'POST', body,
        headers: { 'x-dorisio-signature': signature, 'x-dorisio-timestamp': String(now) },
      });
      expect((await route(request(sign(body, now)))).status).toBe(200);
      expect(handler).toHaveBeenCalledWith(event, expect.any(Request));
      expect((await route(request('0'.repeat(64)))).status).toBe(401);
      expect(handler).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it('wraps a Next.js Pages Router stream', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const handler = vi.fn();
      const route = createNextApiWebhookHandler({ secret }, handler);
      const req = {
        headers: { 'x-dorisio-signature': sign(body, now), 'x-dorisio-timestamp': String(now) },
        async *[Symbol.asyncIterator]() { yield Buffer.from(body); },
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await route(req, res);
      expect(handler).toHaveBeenCalledWith(event, res);
    } finally { vi.useRealTimers(); }
  });
});
