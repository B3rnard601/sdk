/**
 * Creator Methods
 *
 * SDK methods for creator operations.
 */

import { Creator, CreatorProfile } from '../types/models';
import { normalizeCreator, normalizeListCreatorsResponse } from '../utils/normalizers';
import { DorisioClient } from '../client';
import { RequestValidator } from '../utils/validators';

/**
 * Get creator by ID
 */
export async function getCreator(this: DorisioClient, creatorId: string): Promise<Creator> {
  RequestValidator.nonEmptyString(creatorId, 'creatorId');
  const response = await this.request('GET', `/creators/${creatorId}`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch creator: ${creatorId}`);
  }

  return normalizeCreator(response.data);
}

/**
 * List creators with pagination
 */
export async function listCreators(
  this: DorisioClient,
  options?: {
    page?: number;
    pageSize?: number;
    verified?: boolean;
  }
): Promise<{ creators: Creator[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();

  if (options?.page) params.append('page', String(options.page));
  if (options?.pageSize) params.append('pageSize', String(options.pageSize));
  if (options?.verified !== undefined) params.append('verified', String(options.verified));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await this.request('GET', `/creators${query}`);

  if (!response.success || !response.data) {
    throw new Error('Failed to fetch creators list');
  }

  return normalizeListCreatorsResponse(response.data);
}

/**
 * Get public creator profile by username
 */
export async function getCreatorProfile(
  this: DorisioClient,
  username: string
): Promise<CreatorProfile> {
  RequestValidator.nonEmptyString(username, 'username');
  RequestValidator.stringLength(username, 1, 100, 'username');
  const response = await this.request('GET', `/creators/profile/${username}`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch creator profile: ${username}`);
  }

  const data = response.data as Record<string, unknown>;
  const creator = normalizeCreator(data);

  const rawStats = data['stats'];
  const stats =
    rawStats && typeof rawStats === 'object'
      ? (rawStats as { totalTips?: number; averageTip?: number; lastTipDate?: string | null })
      : undefined;

  return {
    ...creator,
    stats: {
      totalTips: stats?.totalTips ?? 0,
      averageTip: stats?.averageTip ?? 0,
      lastTipDate: stats?.lastTipDate ?? null,
    },
  };
}

/**
 * Verify creator identity (admin only)
 */
export async function verifyCreator(
  this: DorisioClient,
  creatorId: string,
  verified: boolean
): Promise<Creator> {
  const response = await this.request('PATCH', `/creators/${creatorId}/verify`, {
    verified,
  });

  if (!response.success || !response.data) {
    throw new Error(`Failed to verify creator: ${creatorId}`);
  }

  return normalizeCreator(response.data);
}
