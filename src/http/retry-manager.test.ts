/**
 * RetryManager idempotency tests
 */

import { describe, it, expect } from 'vitest';
import { RetryManager, isRequestIdempotent } from './retry-manager';
import { ApiError } from '../types';

describe('isRequestIdempotent', () => {
  it('treats GET and HEAD as always idempotent', () => {
    expect(isRequestIdempotent({ method: 'GET' })).toBe(true);
    expect(isRequestIdempotent({ method: 'HEAD' })).toBe(true);
  });

  it('treats POST as non-idempotent by default', () => {
    expect(isRequestIdempotent({ method: 'POST' })).toBe(false);
  });

  it('allows POST when isIdempotent or Idempotency-Key is set', () => {
    expect(isRequestIdempotent({ method: 'POST', isIdempotent: true })).toBe(true);
    expect(
      isRequestIdempotent({ method: 'POST', headers: { 'idempotency-key': 'k1' } })
    ).toBe(true);
  });

  it('requires explicit flag for DELETE/PUT/PATCH', () => {
    expect(isRequestIdempotent({ method: 'DELETE' })).toBe(false);
    expect(isRequestIdempotent({ method: 'PUT' })).toBe(false);
    expect(isRequestIdempotent({ method: 'PATCH' })).toBe(false);
    expect(isRequestIdempotent({ method: 'DELETE', isIdempotent: true })).toBe(true);
  });
});

describe('RetryManager.isRetryableError', () => {
  it('returns false for POST without idempotency even on 500', () => {
    const error = new ApiError('fail', 500);
    expect(RetryManager.isRetryableError(error, { method: 'POST' })).toBe(false);
  });

  it('returns true for GET on 500', () => {
    const error = new ApiError('fail', 500);
    expect(RetryManager.isRetryableError(error, { method: 'GET' })).toBe(true);
  });

  it('returns true for POST with isIdempotent on 503', () => {
    const error = new ApiError('fail', 503);
    expect(
      RetryManager.isRetryableError(error, { method: 'POST', isIdempotent: true })
    ).toBe(true);
  });

  it('returns false for 400 even when idempotent', () => {
    const error = new ApiError('Duplicate tip', 400);
    expect(
      RetryManager.isRetryableError(error, { method: 'POST', isIdempotent: true })
    ).toBe(false);
  });

  it('preserves prior behavior when options omitted', () => {
    expect(RetryManager.isRetryableError(new ApiError('fail', 500))).toBe(true);
    expect(RetryManager.isRetryableError(new ApiError('fail', 400))).toBe(false);
  });
});
