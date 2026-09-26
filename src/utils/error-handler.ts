/**
 * Error Handler
 *
 * Utilities for handling and normalizing errors.
 */

import {
  DorisioError,
  ApiError,
  ValidationError,
  NetworkError,
  TimeoutError,
} from '../types/errors';

export class ApiErrorHandler {
  /**
   * Handle and normalize API errors
   */
  static handle(error: unknown): Error {
    if (error instanceof DorisioError) {
      return error;
    }

    if (error instanceof ApiError) {
      return error;
    }

    if (error instanceof ValidationError) {
      return error;
    }

    if (error instanceof NetworkError) {
      return error;
    }

    if (error instanceof Error) {
      // Check for common error messages
      if (error.message.includes('timeout') || error.message.includes('AbortError')) {
        return new TimeoutError('Request timeout');
      }

      if (error.message.includes('fetch') || error.message.includes('network')) {
        return new NetworkError(error.message);
      }

      return error;
    }

    return new Error(String(error));
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof DorisioError && error.statusCode) {
      // Retry on server errors (5xx) and rate limits (429)
      return error.statusCode >= 500 || error.statusCode === 429;
    }

    if (error instanceof ApiError && error.statusCode) {
      return error.statusCode >= 500 || error.statusCode === 429;
    }

    if (error instanceof NetworkError) {
      return true;
    }

    return false;
  }

  /**
   * Format error message for display
   */
  static format(error: unknown): string {
    const handled = this.handle(error);

    if (handled instanceof DorisioError) {
      const prefix = handled.code ? `${handled.code}: ` : '';
      return `${prefix}${handled.message}`;
    }

    if (handled instanceof ApiError) {
      const prefix = handled.code ? `${handled.code}: ` : '';
      return `${prefix}${handled.message}`;
    }

    return handled.message || 'An unknown error occurred';
  }
}
