/**
 * HTTP Client
 *
 * Base HTTP client for making requests to the backend API.
 * Handles request/response formatting, retries, error handling,
 * and sandbox/mock mode for offline testing.
 */

import { ApiError } from '../types';
import { InterceptorManager } from './interceptors';
import { isRequestIdempotent } from './retry-manager';
import { MockRouter, type SandboxHistoryEntry } from '../sandbox/mock-router';

export type HttpClientMode = 'live' | 'sandbox' | 'production';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeout?: number;
  retries?: number;
  /**
   * Opt a non-idempotent request (POST / DELETE) into retries. A request that
   * carries an `Idempotency-Key` header is treated as retryable as well.
   */
  isIdempotent?: boolean;
}

export interface HttpClientOptions {
  timeout?: number;
  retryAttempts?: number;
  headers?: Record<string, string>;
  /**
   * `sandbox` bypasses fetch and returns deterministic mocks.
   * `live` / `production` hit the real network.
   */
  mode?: HttpClientMode;
  sandboxSeed?: number;
  sandboxLatency?: number;
  sandboxErrorRate?: number;
  /** Emit sanitized request/response diagnostics through the configured logger. */
  debug?: boolean;
  logger?: (message: string, data?: unknown) => void;
  /** Reuse an in-flight or recently completed identical request. */
  deduplicateRequests?: boolean;
  deduplicationWindow?: number;
}

type CachedRequest = {
  promise: Promise<unknown>;
  expiresAt: number;
};

function normalizeMode(mode?: HttpClientMode): 'live' | 'sandbox' {
  if (mode === 'sandbox') return 'sandbox';
  return 'live';
}

/**
 * Endpoints that establish the session itself. They are excluded from the
 * automatic refresh: a 401 from one of them is a bad credential, not an
 * expired access token, so refreshing would just loop.
 */
const AUTH_ENDPOINTS = ['/auth/refresh', '/auth/login', '/auth/register'] as const;

function isAuthEndpoint(path: string): boolean {
  const clean = path.split('?')[0] || '';
  return AUTH_ENDPOINTS.some((endpoint) => clean.includes(endpoint));
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sanitize(value: unknown, key = ''): unknown {
  if (/authorization|cookie|token|secret|password|private.?key|api.?key/i.test(key)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, entryKey),
      ])
    );
  }
  return value;
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private retryAttempts: number;
  private interceptors: InterceptorManager;
  private mode: 'live' | 'sandbox';
  private mockRouter: MockRouter;
  private debug: boolean;
  private logger: (message: string, data?: unknown) => void;
  private deduplicateRequests: boolean;
  private deduplicationWindow: number;
  private deduplicationCache = new Map<string, CachedRequest>();
  /** Registered by the client so a 401 can be recovered from transparently. */
  private tokenRefresher?: () => Promise<void>;
  /** In-flight refresh, shared so concurrent 401s refresh exactly once. */
  private refreshPromise?: Promise<void>;

  constructor(baseUrl: string, options?: HttpClientOptions) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = options?.timeout || 30000;
    this.retryAttempts = options?.retryAttempts || 3;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };
    this.interceptors = new InterceptorManager();
    this.mode = normalizeMode(options?.mode);
    this.mockRouter = new MockRouter({
      seed: options?.sandboxSeed ?? 42,
      latency: options?.sandboxLatency ?? 0,
      errorRate: options?.sandboxErrorRate ?? 0,
    });
    this.debug = options?.debug ?? false;
    this.logger = options?.logger ?? ((message, data) => console.debug(message, data));
    this.deduplicateRequests = options?.deduplicateRequests ?? false;
    this.deduplicationWindow = options?.deduplicationWindow ?? 1000;
    if (this.deduplicationWindow < 0) {
      throw new Error('deduplicationWindow must be greater than or equal to zero');
    }
  }

  /**
   * Get interceptor manager
   */
  getInterceptors(): InterceptorManager {
    return this.interceptors;
  }

  /**
   * Register the callback used to renew the session when a request comes back
   * `401 Unauthorized`. The callback is expected to install the new token
   * (e.g. via {@link HttpClient.setHeader}). Without one, 401s surface
   * unchanged.
   */
  setTokenRefresher(refresher: () => Promise<void>): void {
    this.tokenRefresher = refresher;
  }

  /**
   * Set default header
   */
  setHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }

  /**
   * Remove default header
   */
  removeHeader(key: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.defaultHeaders[key];
  }

  /**
   * Switch between sandbox and live without recreating the client
   */
  setMode(mode: HttpClientMode): void {
    this.mode = normalizeMode(mode);
  }

  getMode(): 'live' | 'sandbox' {
    return this.mode;
  }

  isSandboxMode(): boolean {
    return this.mode === 'sandbox';
  }

  configureSandbox(options: { seed?: number; latency?: number; errorRate?: number }): void {
    if (options.seed !== undefined) this.mockRouter.setSeed(options.seed);
    if (options.latency !== undefined) this.mockRouter.setLatency(options.latency);
    if (options.errorRate !== undefined) this.mockRouter.setErrorRate(options.errorRate);
  }

  getSandboxHistory(): readonly SandboxHistoryEntry[] {
    return this.mockRouter.getHistory();
  }

  clearSandboxHistory(): void {
    this.mockRouter.clearHistory();
  }

  /**
   * Make HTTP request (or mock when in sandbox mode)
   *
   * A `401 Unauthorized` is recoverable: when a token refresher is registered
   * the session is renewed once and the request replayed with the new token. If
   * the refresh itself fails, the original 401 is surfaced so the caller can log
   * the user out. The refresh is never attempted for
   * {@link AUTH_ENDPOINTS} (that would recurse) nor for requests that carry no
   * credentials (nothing to renew).
   */
  async request<T>(path: string, options: RequestOptions): Promise<T> {
    const finalOptions = await this.interceptors.executeRequestInterceptors(options);

    const key = `${finalOptions.method}:${path}:${stableSerialize(finalOptions.body ?? null)}`;
    if (this.deduplicateRequests) {
      const cached = this.deduplicationCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.promise as Promise<T>;
      }
      if (cached) this.deduplicationCache.delete(key);
    }

    const requestPromise = this.executeRequest<T>(path, finalOptions);
    if (this.deduplicateRequests) {
      const cachedRequest: CachedRequest = {
        promise: requestPromise,
        expiresAt: Date.now() + this.deduplicationWindow,
      };
      this.deduplicationCache.set(key, cachedRequest);
      requestPromise.catch(() => {
        if (this.deduplicationCache.get(key) === cachedRequest) {
          this.deduplicationCache.delete(key);
        }
      });
      if (this.deduplicationWindow > 0) {
        setTimeout(() => {
          if (this.deduplicationCache.get(key) === cachedRequest) {
            this.deduplicationCache.delete(key);
          }
        }, this.deduplicationWindow);
      }
    }
    return requestPromise;
  }

  private async executeRequest<T>(path: string, finalOptions: RequestOptions): Promise<T> {
    if (this.mode === 'sandbox') {
      const mocked = await this.mockRouter.handle(finalOptions.method, path, finalOptions.body);
      return (await this.interceptors.executeResponseInterceptors(mocked)) as T;
    }

    try {
      return await this.sendWithRetries<T>(path, finalOptions);
    } catch (error) {
      if (!this.canRecoverFrom(error, path, finalOptions)) {
        throw error;
      }

      // Refresh exactly once, sharing the in-flight attempt with any other
      // request that was rejected at the same time.
      try {
        await this.refreshSessionOnce();
      } catch {
        // Refresh failed: the session is genuinely gone, surface the original
        // 401 rather than a secondary refresh error.
        throw error;
      }

      // Replay once. This call cannot refresh again, so a second 401 falls
      // straight through to the caller.
      return await this.sendWithRetries<T>(path, finalOptions);
    }
  }

  /**
   * Whether a failed request is worth a token refresh + replay.
   */
  private canRecoverFrom(error: unknown, path: string, options: RequestOptions): boolean {
    if (!this.tokenRefresher) {
      return false;
    }
    if (!(error instanceof ApiError) || error.statusCode !== 401) {
      return false;
    }
    if (isAuthEndpoint(path)) {
      return false;
    }
    // Without credentials there is nothing to refresh.
    return hasHeader({ ...this.defaultHeaders, ...options.headers }, 'authorization');
  }

  /**
   * Run the registered refresh callback, collapsing concurrent callers onto a
   * single in-flight refresh so a burst of 401s renews the session only once.
   */
  private refreshSessionOnce(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = Promise.resolve()
        .then(() => this.tokenRefresher?.())
        .then(() => undefined)
        .finally(() => {
          this.refreshPromise = undefined;
        });
    }
    return this.refreshPromise;
  }

  /**
   * Retry loop for a single attempt to reach the API.
   *
   * Client errors are never retried. Server-side failures are retried only for
   * idempotent requests, so a POST that may already have been applied is not
   * replayed unless the caller opted in with `isIdempotent` or an
   * `Idempotency-Key` header.
   */
  private async sendWithRetries<T>(path: string, options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = { ...this.defaultHeaders, ...options.headers };

    let lastError: Error | null = null;
    const attempts = options.retries ?? this.retryAttempts;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const startedAt = Date.now();
        this.log('[DORISIO] request', {
          method: options.method,
          path,
          body: sanitize(options.body),
          headers: sanitize(headers),
          attempt: attempt + 1,
        });
        const response = await fetch(url, {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(options.timeout ?? this.timeout),
        });
        this.log('[DORISIO] response', {
          method: options.method,
          path,
          status: response.status,
          elapsedMs: Date.now() - startedAt,
          attempt: attempt + 1,
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new ApiError(error.error || 'Request failed', response.status, error.code);
        }

        const data = (await response.json()) as T;
        return await this.interceptors.executeResponseInterceptors(data);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await this.interceptors.executeErrorInterceptors(lastError);

        if (
          error instanceof ApiError &&
          error.statusCode !== undefined &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw error;
        }

        const idempotent = isRequestIdempotent({
          method: options.method,
          isIdempotent: options.isIdempotent,
          headers: options.headers,
        });
        if (!idempotent) {
          throw error;
        }

        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private log(message: string, data: unknown): void {
    if (this.debug) this.logger(message, data);
  }
}
