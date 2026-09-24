/**
 * HttpClient retry / idempotency tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClient } from './http-client';
import { ApiError } from '../types';

describe('HttpClient idempotent retries', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not retry POST /transactions/tip on 500 (non-idempotent)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error', code: 'INTERNAL' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com', { retryAttempts: 3 });

    await expect(
      client.request('/api/v1/transactions/tip', {
        method: 'POST',
        body: { creatorId: 'c1', amount: 10 },
      })
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry POST on 400 Duplicate tip', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Duplicate tip', code: 'DUPLICATE' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com', { retryAttempts: 3 });

    await expect(
      client.request('/api/v1/transactions/tip', {
        method: 'POST',
        body: { creatorId: 'c1', amount: 10 },
      })
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries GET on 500 up to maxAttempts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com', { retryAttempts: 3 });

    const promise = client.request('/api/v1/health', { method: 'GET' });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries POST when isIdempotent is true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'tip-1' }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com', { retryAttempts: 3 });

    const promise = client.request('/api/v1/transactions/tip', {
      method: 'POST',
      body: { creatorId: 'c1', amount: 10 },
      isIdempotent: true,
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: 'tip-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries POST when Idempotency-Key header is present', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad gateway' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'tip-2' }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com', { retryAttempts: 3 });

    const promise = client.request('/api/v1/transactions/tip', {
      method: 'POST',
      body: { creatorId: 'c1', amount: 10 },
      headers: { 'Idempotency-Key': 'abc-123' },
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ id: 'tip-2' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry DELETE without isIdempotent flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com', { retryAttempts: 3 });

    await expect(
      client.request('/api/v1/wallets/1', { method: 'DELETE' })
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
