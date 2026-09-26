/**
 * Retry Manager
 *
 * Manages retry logic for failed requests.
 */

import { ApiError } from '../types';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  /** When true (default), adds ±10% random jitter to prevent thundering herd. */
  jitter?: boolean;
  /**
   * HTTP status codes that trigger a retry.
   * Defaults to [408, 429, 500, 502, 503, 504].
   */
  retryableStatusCodes?: number[];
}

export type IdempotencyOptions = {
  method?: string;
  isIdempotent?: boolean;
  headers?: Record<string, string>;
};

/**
 * Detect Idempotency-Key header (case-insensitive).
 */
export function hasIdempotencyKey(headers?: Record<string, string>): boolean {
  if (!headers) {
    return false;
  }
  return Object.keys(headers).some((key) => key.toLowerCase() === 'idempotency-key');
}

/**
 * Determine whether a request is safe to retry.
 *
 * - GET / HEAD: always idempotent
 * - POST / PUT / PATCH / DELETE: only when `isIdempotent: true` or Idempotency-Key is set
 */
export function isRequestIdempotent(options: IdempotencyOptions): boolean {
  const method = (options.method || 'GET').toUpperCase();

  if (method === 'GET' || method === 'HEAD') {
    return true;
  }

  if (options.isIdempotent === true) {
    return true;
  }

  if (hasIdempotencyKey(options.headers)) {
    return true;
  }

  return false;
}

const DEFAULT_RETRYABLE_STATUS_CODES: readonly number[] = [408, 429, 500, 502, 503, 504];

export class RetryManager {
  private config: Required<RetryConfig>;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      initialDelayMs: config.initialDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      jitter: config.jitter ?? true,
      retryableStatusCodes: config.retryableStatusCodes ?? [...DEFAULT_RETRYABLE_STATUS_CODES],
    };
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    isRetryable?: (error: unknown) => boolean
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if retryable
        if (isRetryable && !isRetryable(error)) {
          throw error;
        }

        // Don't wait after last attempt
        if (attempt < this.config.maxAttempts - 1) {
          const delay = this.calculateDelay(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Calculate exponential backoff delay with optional jitter.
   */
  calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
    const delay = Math.min(exponentialDelay, this.config.maxDelayMs);
    if (!this.config.jitter) {
      return delay;
    }
    // ±10% jitter to prevent thundering herd
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }

  /**
   * Determine if an error should trigger a retry based on this instance's
   * configured retryableStatusCodes. When method/idempotency options are
   * provided, non-idempotent calls never retry.
   */
  isRetryableError(error: unknown, options?: IdempotencyOptions): boolean {
    return RetryManager.isRetryableError(error, options, this.config.retryableStatusCodes);
  }

  /**
   * Static convenience — uses the default retryable codes unless overridden.
   */
  static isRetryableError(
    error: unknown,
    options?: IdempotencyOptions,
    retryableStatusCodes: readonly number[] = DEFAULT_RETRYABLE_STATUS_CODES,
  ): boolean {
    if (options && !isRequestIdempotent(options)) {
      return false;
    }

    if (error instanceof ApiError && error.statusCode) {
      return retryableStatusCodes.includes(error.statusCode);
    }

    if (error instanceof Error) {
      // Retry on network/timeout errors
      return (
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND')
      );
    }

    return false;
  }
}
