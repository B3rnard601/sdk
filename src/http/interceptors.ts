/**
 * Request/Response Interceptors
 *
 * Allows hooks into request and response lifecycle.
 */

import { RequestOptions } from './http-client';

export type RequestInterceptor = (
  options: RequestOptions
) => RequestOptions | Promise<RequestOptions>;
export type ResponseInterceptor = <T>(response: T) => T | Promise<T>;
export type ErrorInterceptor = (error: unknown) => unknown | Promise<unknown>;

export class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  /**
   * Execute request interceptors
   */
  async executeRequestInterceptors(options: RequestOptions): Promise<RequestOptions> {
    let result = options;
    for (const interceptor of this.requestInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * Execute response interceptors
   */
  async executeResponseInterceptors<T>(response: T): Promise<T> {
    let result = response;
    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * Execute error interceptors
   */
  async executeErrorInterceptors(error: unknown): Promise<unknown> {
    let result = error;
    for (const interceptor of this.errorInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  /**
   * #48 - Remove all registered interceptors and release closure references.
   *
   * Call this when the owning HttpClient is no longer needed (e.g. on logout
   * or in test teardown) to prevent long-lived interceptor closures from
   * retaining references to auth tokens, loggers, or other large objects.
   */
  cleanup(): void {
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.errorInterceptors = [];
  }

  /**
   * Return the number of registered interceptors of each type.
   * Useful for tests and diagnostics.
   */
  getCount(): { request: number; response: number; error: number } {
    return {
      request: this.requestInterceptors.length,
      response: this.responseInterceptors.length,
      error: this.errorInterceptors.length,
    };
  }
}
