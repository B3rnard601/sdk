/**
 * HttpClient Tests
 *
 * Covers: network failures, timeouts, malformed JSON, 4xx non-retry,
 * 5xx retry with exponential backoff, header management, interceptors.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpClient } from './http-client';
import { ApiError } from '../types';

// ─── fetch mock helpers ──────────────────────────────────────────────────────

function mockFetchOk(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: () => Promise.resolve(body),
  });
}

function mockFetchError(status: number, errorBody: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(errorBody),
  });
}


function mockFetchMalformedJson() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
  });
}

// ─── setup ───────────────────────────────────────────────────────────────────

let client: HttpClient;
const BASE_URL = 'https://api.example.com';

beforeEach(() => {
  client = new HttpClient(BASE_URL, { timeout: 5000, retryAttempts: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Basic requests ───────────────────────────────────────────────────────────

describe('HttpClient – successful requests', () => {
  it('returns parsed JSON on 200', async () => {
    const payload = { success: true, data: { id: '1' } };
    globalThis.fetch = mockFetchOk(payload);

    const result = await client.request<typeof payload>('/users/1', { method: 'GET' });

    expect(result).toEqual(payload);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('sends JSON body on POST', async () => {
    const payload = { success: true, data: {} };
    globalThis.fetch = mockFetchOk(payload);

    await client.request('/items', {
      method: 'POST',
      body: { name: 'test', value: 42 },
    });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(init.body).toBe(JSON.stringify({ name: 'test', value: 42 }));
  });

  it('strips trailing slash from baseUrl', async () => {
    const slashedClient = new HttpClient('https://api.example.com/', { retryAttempts: 1 });
    globalThis.fetch = mockFetchOk({ success: true });

    await slashedClient.request('/path', { method: 'GET' });

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe('https://api.example.com/path');
  });

  it('sends default Content-Type: application/json header', async () => {
    globalThis.fetch = mockFetchOk({ success: true });

    await client.request('/ping', { method: 'GET' });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});

// ─── Header management ────────────────────────────────────────────────────────

describe('HttpClient – header management', () => {
  it('setHeader adds a header to all subsequent requests', async () => {
    globalThis.fetch = mockFetchOk({ success: true });

    client.setHeader('Authorization', 'Bearer token123');
    await client.request('/me', { method: 'GET' });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token123');
  });

  it('removeHeader removes a previously set header', async () => {
    globalThis.fetch = mockFetchOk({ success: true });

    client.setHeader('X-Custom', 'value');
    client.removeHeader('X-Custom');
    await client.request('/me', { method: 'GET' });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['X-Custom']).toBeUndefined();
  });

  it('per-request headers override defaults', async () => {
    globalThis.fetch = mockFetchOk({ success: true });

    client.setHeader('X-Version', 'v1');
    await client.request('/me', { method: 'GET', headers: { 'X-Version': 'v2' } });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['X-Version']).toBe('v2');
  });
});

// ─── 4xx errors – never retry ─────────────────────────────────────────────────

describe('HttpClient – 4xx errors (no retry)', () => {
  for (const status of [400, 401, 403, 404, 422, 429]) {
    it(`throws ApiError immediately on ${status} without retrying`, async () => {
      // retryAttempts = 3 to prove no extra calls happen
      const c = new HttpClient(BASE_URL, { retryAttempts: 3 });
      globalThis.fetch = mockFetchError(status, { error: `Error ${status}`, code: `E${status}` });

      await expect(c.request('/resource', { method: 'GET' })).rejects.toBeInstanceOf(ApiError);
      // fetch called only once – no retries
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  }

  it('propagates the correct status code on 401', async () => {
    globalThis.fetch = mockFetchError(401, { error: 'Unauthorized' });

    const err = await client
      .request('/secure', { method: 'GET' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(401);
  });

  it('propagates the correct status code on 404', async () => {
    globalThis.fetch = mockFetchError(404, { error: 'Not found' });

    const err = await client
      .request('/missing', { method: 'GET' })
      .catch((e: unknown) => e);

    expect((err as ApiError).statusCode).toBe(404);
  });
});

// ─── 5xx errors – retry ───────────────────────────────────────────────────────

describe('HttpClient – 5xx errors (retry)', () => {
  it('retries on 500 and succeeds on second attempt', async () => {
    const payload = { success: true };
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      call++;
      if (call === 1) return { ok: false, status: 500, json: async () => ({ error: 'oops' }) };
      return { ok: true, status: 200, json: async () => payload };
    });
    const c = new HttpClient(BASE_URL, { retryAttempts: 2 });
    const result = await c.request('/data', { method: 'GET' });
    expect(result).toEqual(payload);
    expect(call).toBe(2);
  });

  it('exhausts all retry attempts and throws on persistent 500', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({ error: 'err' }) }));
    const c = new HttpClient(BASE_URL, { retryAttempts: 3 });
    await expect(c.request('/data', { method: 'GET' })).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 502 Bad Gateway', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    const c = new HttpClient(BASE_URL, { retryAttempts: 2 });
    await expect(c.request('/data', { method: 'GET' })).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 Service Unavailable', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const c = new HttpClient(BASE_URL, { retryAttempts: 2 });
    await expect(c.request('/data', { method: 'GET' })).rejects.toBeInstanceOf(ApiError);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff: second wait is longer than first', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({ error: 'err' }) }));
    const c = new HttpClient(BASE_URL, { retryAttempts: 3 });

    const delays: number[] = [];
    const orig = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) => {
      if (typeof ms === 'number' && ms > 10) delays.push(ms);
      return orig(fn, 0, ...args);
    });
    await c.request('/data', { method: 'GET' }).catch(() => {});
    spy.mockRestore();

    expect(delays.length).toBeGreaterThanOrEqual(2);
    expect(delays[1] as number).toBeGreaterThan(delays[0] as number);
  });
});

// ─── Network failures ─────────────────────────────────────────────────────────

describe('HttpClient – network failures', () => {
  it('throws on ECONNREFUSED', async () => {
    globalThis.fetch = vi.fn().mockImplementationOnce(() => Promise.reject(new Error('ECONNREFUSED')));

    await expect(client.request('/ping', { method: 'GET' })).rejects.toThrow('ECONNREFUSED');
  });

  it('throws on ENOTFOUND (DNS failure)', async () => {
    globalThis.fetch = vi.fn().mockImplementationOnce(() => Promise.reject(new Error('ENOTFOUND api.example.com')));

    await expect(client.request('/ping', { method: 'GET' })).rejects.toThrow('ENOTFOUND');
  });

  it('throws on generic network error', async () => {
    globalThis.fetch = vi.fn().mockImplementationOnce(() => Promise.reject(new Error('Failed to fetch')));

    await expect(client.request('/ping', { method: 'GET' })).rejects.toThrow('Failed to fetch');
  });

  it('retries network failures and eventually throws', async () => {
    const c = new HttpClient(BASE_URL, { retryAttempts: 2 });
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      calls++;
      throw new Error('ECONNREFUSED');
    });
    await expect(c.request('/ping', { method: 'GET' })).rejects.toThrow('ECONNREFUSED');
    expect(calls).toBe(2);
  });
});

// ─── Timeout ──────────────────────────────────────────────────────────────────

describe('HttpClient – timeout handling', () => {
  it('throws when AbortSignal fires (simulated via AbortError)', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    // Use retryAttempts:1 (no retries) so the mock is only called once
    const noRetryClient = new HttpClient(BASE_URL, { timeout: 5000, retryAttempts: 1 });
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.reject(abortErr));

    await expect(
      noRetryClient.request('/slow', { method: 'GET' })
    ).rejects.toThrow();
  });

  it('passes the configured timeout to AbortSignal', async () => {
    globalThis.fetch = mockFetchOk({ success: true });

    // Spy on AbortSignal.timeout to capture the timeout value
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const customClient = new HttpClient(BASE_URL, { timeout: 7500, retryAttempts: 1 });

    await customClient.request('/check', { method: 'GET' });

    expect(timeoutSpy).toHaveBeenCalledWith(7500);
  });

  it('per-request timeout overrides the client default', async () => {
    globalThis.fetch = mockFetchOk({ success: true });
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

    await client.request('/check', { method: 'GET', timeout: 1234 });

    expect(timeoutSpy).toHaveBeenCalledWith(1234);
  });
});

// ─── Malformed JSON ───────────────────────────────────────────────────────────

describe('HttpClient – malformed JSON response', () => {
  it('throws a SyntaxError when the response body is not valid JSON', async () => {
    globalThis.fetch = mockFetchMalformedJson();

    await expect(client.request('/bad-json', { method: 'GET' })).rejects.toThrow(SyntaxError);
  });

  it('also throws when the error body is unparseable (falls back to empty object)', async () => {
    // Non-OK + json() fails → falls back to {} → throws generic ApiError
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('bad json')),
    });

    await expect(client.request('/bad-error-json', { method: 'GET' })).rejects.toBeInstanceOf(ApiError);
  });
});

// ─── Interceptors ─────────────────────────────────────────────────────────────

describe('HttpClient – interceptors', () => {
  it('request interceptor can mutate headers', async () => {
    globalThis.fetch = mockFetchOk({ success: true });

    client.getInterceptors().addRequestInterceptor((opts) => ({
      ...opts,
      headers: { ...opts.headers, 'X-Intercepted': 'yes' },
    }));

    await client.request('/any', { method: 'GET' });

    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['X-Intercepted']).toBe('yes');
  });

  it('response interceptor can transform the response', async () => {
    globalThis.fetch = mockFetchOk({ raw: true });

    client.getInterceptors().addResponseInterceptor(<T>(res: T) => ({
      ...(res as object),
      intercepted: true,
    }) as T);

    const result = await client.request<{ raw: boolean; intercepted?: boolean }>('/any', { method: 'GET' });

    expect(result.intercepted).toBe(true);
  });

  it('error interceptor is called on failure', async () => {
    globalThis.fetch = mockFetchError(400, { error: 'Bad request' });
    const errorSpy = vi.fn();

    client.getInterceptors().addErrorInterceptor((err) => { errorSpy(err); return err; });

    await client.request('/bad', { method: 'GET' }).catch(() => {/* expected */});

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).toBeInstanceOf(ApiError);
  });
});
