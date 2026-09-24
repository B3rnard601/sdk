/**
 * HTTP Client
 *
 * Base HTTP client for making requests to the backend API.
 * Handles request/response formatting, retries, and error handling.
 */

import { ApiError } from '../types';
import { InterceptorManager } from './interceptors';

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeout?: number;
  retries?: number;
}

export class HttpClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private retryAttempts: number;
  private interceptors: InterceptorManager;

  constructor(
    baseUrl: string,
    options?: {
      timeout?: number;
      retryAttempts?: number;
      headers?: Record<string, string>;
    }
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = options?.timeout || 30000;
    this.retryAttempts = options?.retryAttempts || 3;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };
    this.interceptors = new InterceptorManager();
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
   * Make HTTP request
   */
  async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Execute request interceptors
    const finalOptions = await this.interceptors.executeRequestInterceptors(options);

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

        // Execute response interceptors
        return await this.interceptors.executeResponseInterceptors(data);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Execute error interceptors
        await this.interceptors.executeErrorInterceptors(lastError);

        // Don't retry on client errors (4xx)
        if (
          error instanceof ApiError &&
          error.statusCode !== undefined &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }
}
