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

export class RetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = {
      maxAttempts: config.maxAttempts ?? 3,
      initialDelayMs: config.initialDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
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
   * Calculate exponential backoff delay
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay =
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
    const delay = Math.min(exponentialDelay, this.config.maxDelayMs);
    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.max(0, delay + jitter);
  }

  /**
   * Determine if error is retryable.
   * When method/idempotency options are provided, non-idempotent calls never retry.
   */
  static isRetryableError(error: unknown, options?: IdempotencyOptions): boolean {
    if (options && !isRequestIdempotent(options)) {
      return false;
    }

    if (error instanceof ApiError && error.statusCode) {
      // Retry on server errors (5xx) and rate limits (429), timeouts (408)
      return error.statusCode >= 500 || error.statusCode === 429 || error.statusCode === 408;
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
