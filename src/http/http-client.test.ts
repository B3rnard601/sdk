/**
 * HttpClient retry / idempotency / session-refresh tests
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

function unauthorized() {
  return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized', code: 'UNAUTHORIZED' }) };
}

describe('HttpClient 401 session refresh', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('refreshes the session and replays the request with the new token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'user-1' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com');
    client.setHeader('Authorization', 'Bearer stale');

    let refreshes = 0;
    client.setTokenRefresher(async () => {
      refreshes += 1;
      client.setHeader('Authorization', 'Bearer fresh');
    });

    await expect(client.request('/api/v1/users/me', { method: 'GET' })).resolves.toEqual({
      id: 'user-1',
    });

    expect(refreshes).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const replay = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((replay.headers as Record<string, string>).Authorization).toBe('Bearer fresh');
  });

  it('surfaces the original 401 when the refresh fails, without looping', async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com');
    client.setHeader('Authorization', 'Bearer stale');

    let refreshes = 0;
    client.setTokenRefresher(async () => {
      refreshes += 1;
      throw new Error('refresh rejected');
    });

    await expect(client.request('/api/v1/users/me', { method: 'GET' })).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(refreshes).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when the endpoint is the refresh endpoint itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com');
    client.setHeader('Authorization', 'Bearer stale');

    let refreshes = 0;
    client.setTokenRefresher(async () => {
      refreshes += 1;
    });

    await expect(client.request('/auth/refresh', { method: 'POST' })).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(refreshes).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh a request that carries no credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(unauthorized());
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com');

    let refreshes = 0;
    client.setTokenRefresher(async () => {
      refreshes += 1;
    });

    await expect(client.request('/api/v1/users/me', { method: 'GET' })).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(refreshes).toBe(0);
  });

  it('shares a single refresh across concurrent 401s', async () => {
    let call = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call <= 2) return unauthorized();
      return { ok: true, json: async () => ({ call }) };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com');
    client.setHeader('Authorization', 'Bearer stale');

    let refreshes = 0;
    client.setTokenRefresher(async () => {
      refreshes += 1;
      await Promise.resolve();
      client.setHeader('Authorization', 'Bearer fresh');
    });

    const [a, b] = await Promise.all([
      client.request('/api/v1/alpha', { method: 'GET' }),
      client.request('/api/v1/beta', { method: 'GET' }),
    ]);

    expect(refreshes).toBe(1);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('replays a non-idempotent POST after a 401 (auth retry is exempt)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'tip-1' }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new HttpClient('https://api.example.com');
    client.setHeader('Authorization', 'Bearer stale');
    client.setTokenRefresher(async () => {
      client.setHeader('Authorization', 'Bearer fresh');
    });

    await expect(
      client.request('/api/v1/transactions/tip', { method: 'POST', body: { amount: 10 } })
    ).resolves.toEqual({ id: 'tip-1' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
