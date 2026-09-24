/**
 * Authentication Methods
 *
 * SDK methods for session and token management.
 */

import { User } from '../types/models';
import { ApiSessionExpirySchema, ApiSessionSchema } from '../types/schemas';
import { normalizeUser } from '../utils/normalizers';
import { DorisioClient } from '../client';

export interface SessionInfo {
  userId: string;
  email: string;
  token: string;
  expiresAt: string;
  expiresIn: number;
}

/**
 * Refresh user session and get new token
 */
export async function refreshSession(this: DorisioClient): Promise<SessionInfo> {
  const response = await this.request('POST', '/auth/refresh');

  if (!response.success || !response.data) {
    throw new Error('Failed to refresh session');
  }

  const parsed = ApiSessionSchema.parse(response.data);

  if (parsed.token) {
    this.setToken(parsed.token);
  }

  return {
    userId: parsed.userId,
    email: parsed.email,
    token: parsed.token,
    expiresAt: parsed.expiresAt,
    expiresIn: parsed.expiresIn,
  };
}

/**
 * Validate current session
 */
export async function validateSession(this: DorisioClient): Promise<User> {
  const response = await this.request('GET', '/auth/validate');

  if (!response.success || !response.data) {
    throw new Error('Invalid or expired session');
  }

  return normalizeUser(response.data);
}

/**
 * Get current user info
 */
export async function getCurrentUser(this: DorisioClient): Promise<User> {
  const response = await this.request('GET', '/users/me');

  if (!response.success || !response.data) {
    throw new Error('Failed to fetch current user');
  }

  return normalizeUser(response.data);
}

/**
 * Logout and invalidate session
 */
export async function logout(this: DorisioClient): Promise<void> {
  try {
    await this.request('POST', '/auth/logout');
  } finally {
    this.clearToken();
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(this: DorisioClient): Promise<boolean> {
  try {
    await this.validateSession();
    return true;
  } catch {
    return false;
  }
}

/**
 * Extend session expiry (keep-alive)
 */
export async function extendSession(this: DorisioClient): Promise<SessionInfo> {
  const response = await this.request('POST', '/auth/extend');

  if (!response.success || !response.data) {
    throw new Error('Failed to extend session');
  }

  const parsed = ApiSessionSchema.parse(response.data);

  if (parsed.token) {
    this.setToken(parsed.token);
  }

  return {
    userId: parsed.userId,
    email: parsed.email,
    token: parsed.token,
    expiresAt: parsed.expiresAt,
    expiresIn: parsed.expiresIn,
  };
}

/**
 * Get session expiry time
 */
export async function getSessionExpiry(this: DorisioClient): Promise<{
  expiresAt: string;
  expiresIn: number;
  isExpired: boolean;
}> {
  const response = await this.request('GET', '/auth/expiry');

  if (!response.success || !response.data) {
    throw new Error('Failed to fetch session expiry');
  }

  const parsed = ApiSessionExpirySchema.parse(response.data);
  const expiresIn = Math.max(0, parsed.expiresIn);

  return {
    expiresAt: parsed.expiresAt,
    expiresIn,
    isExpired: expiresIn <= 0,
  };
}
