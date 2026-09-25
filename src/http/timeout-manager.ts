/**
 * Timeout Manager
 *
 * Manages timeout handling for requests.
 */

import { TimeoutError } from '../types/errors';

export interface TimeoutConfig {
  default: number;
  min: number;
  max: number;
}

export class TimeoutManager {
  private config: TimeoutConfig;

  constructor(config: Partial<TimeoutConfig> = {}) {
    this.config = {
      default: config.default ?? 30000,
      min: config.min ?? 1000,
      max: config.max ?? 300000,
    };
  }

  /**
   * Validate and normalize timeout value
   */
  normalizeTimeout(timeout?: number): number {
    if (timeout === undefined) {
      return this.config.default;
    }

    if (timeout < this.config.min) {
      return this.config.min;
    }

    if (timeout > this.config.max) {
      return this.config.max;
    }

    return timeout;
  }

  /**
   * Create abort signal with timeout
   */
  createAbortSignal(timeout?: number): AbortSignal {
    const normalizedTimeout = this.normalizeTimeout(timeout);
    return AbortSignal.timeout(normalizedTimeout);
  }

  /**
   * Execute `fn` with a timeout.
   *
   * The timeout exists to bound how long a caller waits, so two things happen:
   * `fn` is handed the `AbortSignal` (so a cooperative operation can cancel its
   * own work) *and* the operation is raced against the deadline (so a caller is
   * not left waiting when the operation ignores the signal). Whichever settles
   * first wins; if the deadline wins, a `TimeoutError` is thrown.
   *
   * The timer is cleared before returning, so an operation that finishes early
   * never leaves a pending abort that would fire after the fact.
   */
  async executeWithTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
    timeout?: number
  ): Promise<T> {
    const normalizedTimeout = this.normalizeTimeout(timeout);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), normalizedTimeout);

    const deadline = new Promise<never>((_, reject) => {
      const onAbort = () =>
        reject(
          new TimeoutError(
            `Request timed out after ${normalizedTimeout}ms`,
            normalizedTimeout
          )
        );

      if (controller.signal.aborted) {
        onAbort();
        return;
      }
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });

    try {
      return await Promise.race([fn(controller.signal), deadline]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<TimeoutConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TimeoutConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
