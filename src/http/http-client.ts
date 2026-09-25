/**
 * HTTP Client
 *
 * Base HTTP client for making requests to the backend API.
 * Handles request/response formatting, retries, error handling,
 * and sandbox/mock mode for offline testing.
 */

import { ApiError } from '../types';
import { InterceptorManager } from './interceptors';
import { MockRouter, type SandboxHistoryEntry } from '../sandbox/mock-router';

export type HttpClientMode = 'live' | 'sandbox' | 'production';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeout?: number;
  retries?: number;
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
}

function normalizeMode(mode?: HttpClientMode): 'live' | 'sandbox' {
  if (mode === 'sandbox') return 'sandbox';
  return 'live';
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private retryAttempts: number;
  private interceptors: InterceptorManager;
  private mode: 'live' | 'sandbox';
  private mockRouter: MockRouter;

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
  }

  /**
   * Get interceptor manager
   */
  getInterceptors(): InterceptorManager {
    return this.interceptors;
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

  configureSandbox(options: {
    seed?: number;
    latency?: number;
    errorRate?: number;
  }): void {
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
   */
  async request<T>(path: string, options: RequestOptions): Promise<T> {
    const finalOptions = await this.interceptors.executeRequestInterceptors(options);

    if (this.mode === 'sandbox') {
      const mocked = await this.mockRouter.handle(
        finalOptions.method,
        path,
        finalOptions.body
      );
      return (await this.interceptors.executeResponseInterceptors(mocked)) as T;
    }

    const url = `${this.baseUrl}${path}`;
    const headers = { ...this.defaultHeaders, ...finalOptions.headers };

    let lastError: Error | null = null;
    const attempts = finalOptions.retries ?? this.retryAttempts;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: finalOptions.method,
          headers,
          body: finalOptions.body ? JSON.stringify(finalOptions.body) : undefined,
          signal: AbortSignal.timeout(finalOptions.timeout ?? this.timeout),
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

        if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }
}
