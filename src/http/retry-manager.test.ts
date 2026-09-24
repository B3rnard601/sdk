/**
 * RetryManager Tests
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { RetryManager } from './retry-manager';
import { ApiError } from '../types';

afterEach(() => { vi.restoreAllMocks(); });

// ─── executeWithRetry – basic behaviour ──────────────────────────────────────

describe('RetryManager.executeWithRetry', () => {
  it('returns immediately on first success', async () => {
    const mgr = new RetryManager({ maxAttempts: 3 });
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await mgr.executeWithRetry(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds on later attempt', async () => {
    const mgr = new RetryManager({ maxAttempts: 3, initialDelayMs: 0 });
    const fn = vi.fn()
      .mockImplementationOnce(async () => { throw new Error('t'); })
      .mockImplementationOnce(async () => { throw new Error('t'); })
      .mockResolvedValue('success');
    expect(await mgr.executeWithRetry(fn)).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all attempts', async () => {
    const mgr = new RetryManager({ maxAttempts: 3, initialDelayMs: 0 });
    const fn = vi.fn().mockImplementation(async () => { throw new Error('fail'); });
    await expect(mgr.executeWithRetry(fn)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when maxAttempts is 1', async () => {
    const mgr = new RetryManager({ maxAttempts: 1 });
    const fn = vi.fn().mockImplementation(async () => { throw new Error('fail'); });
    await expect(mgr.executeWithRetry(fn)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops immediately when isRetryable returns false', async () => {
    const mgr = new RetryManager({ maxAttempts: 5, initialDelayMs: 0 });
    const fn = vi.fn().mockImplementation(async () => { throw new Error('terminal'); });
    await expect(mgr.executeWithRetry(fn, () => false)).rejects.toThrow('terminal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('continues when isRetryable returns true', async () => {
    const mgr = new RetryManager({ maxAttempts: 3, initialDelayMs: 0 });
    const fn = vi.fn().mockImplementation(async () => { throw new Error('retriable'); });
    await expect(mgr.executeWithRetry(fn, () => true)).rejects.toThrow('retriable');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ─── Exponential backoff timing ───────────────────────────────────────────────

describe('RetryManager – exponential backoff', () => {
  it('increases delay between successive attempts', async () => {
    const mgr = new RetryManager({ maxAttempts: 4, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 10000 });
    const fn = vi.fn().mockImplementation(async () => { throw new Error('fail'); });

    const delays: number[] = [];
    const orig = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb, ms, ...args) => {
      if (typeof ms === 'number' && ms >= 50) delays.push(ms);
      return orig(cb, 0, ...args);
    });
    await mgr.executeWithRetry(fn).catch(() => {});
    spy.mockRestore();

    expect(delays).toHaveLength(3);
    const [d0, d1, d2] = delays as [number, number, number];
    expect(d1 * 0.8).toBeGreaterThan(d0 * 0.5);
    expect(d2 * 0.8).toBeGreaterThan(d0 * 0.5);
  });

  it('caps delay at maxDelayMs', async () => {
    const mgr = new RetryManager({ maxAttempts: 3, initialDelayMs: 10000, backoffMultiplier: 100, maxDelayMs: 15000 });
    const fn = vi.fn().mockImplementation(async () => { throw new Error('fail'); });

    const delays: number[] = [];
    const orig = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb, ms, ...args) => {
      if (typeof ms === 'number' && ms >= 100) delays.push(ms);
      return orig(cb, 0, ...args);
    });
    await mgr.executeWithRetry(fn).catch(() => {});
    spy.mockRestore();

    for (const d of delays) expect(d).toBeLessThanOrEqual(15000 * 1.11);
  });

  it('never produces a negative delay', async () => {
    const mgr = new RetryManager({ maxAttempts: 3, initialDelayMs: 1, backoffMultiplier: 2, maxDelayMs: 1 });
    const fn = vi.fn().mockImplementation(async () => { throw new Error('fail'); });

    const delays: number[] = [];
    const orig = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb, ms, ...args) => {
      if (typeof ms === 'number') delays.push(ms);
      return orig(cb, 0, ...args);
    });
    await mgr.executeWithRetry(fn).catch(() => {});
    spy.mockRestore();

    for (const d of delays) expect(d).toBeGreaterThanOrEqual(0);
  });
});

// ─── Jitter variance ──────────────────────────────────────────────────────────

describe('RetryManager – jitter', () => {
  it('adds variance across runs', async () => {
    const observed: number[] = [];
    for (let i = 0; i < 20; i++) {
      const mgr = new RetryManager({ maxAttempts: 2, initialDelayMs: 1000 });
      const fn = vi.fn()
        .mockImplementationOnce(async () => { throw new Error('t'); })
        .mockResolvedValue('ok');

      let captured: number | null = null;
      const orig = globalThis.setTimeout;
      const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementationOnce((cb, ms, ...args) => {
        if (typeof ms === 'number') captured = ms;
        return orig(cb, 0, ...args);
      });
      await mgr.executeWithRetry(fn);
      spy.mockRestore();
      if (captured !== null) observed.push(captured as number);
    }
    expect(new Set(observed).size).toBeGreaterThan(1);
  });
});

// ─── isRetryableError ─────────────────────────────────────────────────────────

describe('RetryManager.isRetryableError', () => {
  it.each([500, 502, 503, 504])('retryable: %i server error', (s) => {
    expect(RetryManager.isRetryableError(new ApiError('e', s))).toBe(true);
  });

  it('retryable: 429 rate limit', () => {
    expect(RetryManager.isRetryableError(new ApiError('e', 429))).toBe(true);
  });

  it('retryable: 408 timeout', () => {
    expect(RetryManager.isRetryableError(new ApiError('e', 408))).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])('not retryable: %i client error', (s) => {
    expect(RetryManager.isRetryableError(new ApiError('e', s))).toBe(false);
  });

  it('retryable: ECONNREFUSED', () => {
    expect(RetryManager.isRetryableError(new Error('connect ECONNREFUSED'))).toBe(true);
  });

  it('retryable: ENOTFOUND', () => {
    expect(RetryManager.isRetryableError(new Error('getaddrinfo ENOTFOUND'))).toBe(true);
  });

  it('retryable: network error', () => {
    expect(RetryManager.isRetryableError(new Error('network failure'))).toBe(true);
  });

  it('retryable: timeout error', () => {
    expect(RetryManager.isRetryableError(new Error('request timeout'))).toBe(true);
  });

  it('not retryable: unrelated error', () => {
    expect(RetryManager.isRetryableError(new Error('validation failed'))).toBe(false);
  });

  it('not retryable: non-Error values', () => {
    expect(RetryManager.isRetryableError('string')).toBe(false);
    expect(RetryManager.isRetryableError(null)).toBe(false);
    expect(RetryManager.isRetryableError(42)).toBe(false);
  });

  it('not retryable: ApiError without statusCode', () => {
    expect(RetryManager.isRetryableError(new ApiError('unknown'))).toBe(false);
  });
});
