/**
 * Verification Methods
 *
 * SDK methods for creator and wallet verification.
 */

import { Creator, Wallet } from '../types/models';
import {
  ApiVerificationStatusSchema,
  ApiWalletChallengeSchema,
} from '../types/schemas';
import { normalizeCreator, normalizeWallet } from '../utils/normalizers';
import { DorisioClient } from '../client';

export interface VerificationStatus {
  verified: boolean;
  verifiedAt?: string;
  expiresAt?: string;
}

/**
 * Verify creator identity (requires proof/admin approval)
 */
export async function verifyCreator(this: DorisioClient, creatorId: string): Promise<Creator> {
  const response = await this.request('POST', `/creators/${creatorId}/verify`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to verify creator: ${creatorId}`);
  }

  return normalizeCreator(response.data);
}

/**
 * Request creator verification (submits for review)
 */
export async function requestCreatorVerification(
  this: DorisioClient,
  creatorId: string,
  data: {
    documentType: string;
    documentUrl?: string;
    description?: string;
  }
): Promise<VerificationStatus> {
  const response = await this.request(
    'POST',
    `/creators/${creatorId}/request-verification`,
    data
  );

  if (!response.success || !response.data) {
    throw new Error(`Failed to request verification for creator: ${creatorId}`);
  }

  const parsed = ApiVerificationStatusSchema.parse(response.data);
  return {
    verified: parsed.verified,
    verifiedAt: parsed.verifiedAt,
    expiresAt: parsed.expiresAt,
  };
}

/**
 * Get creator verification status
 */
export async function getCreatorVerificationStatus(
  this: DorisioClient,
  creatorId: string
): Promise<VerificationStatus & { status: string }> {
  const response = await this.request('GET', `/creators/${creatorId}/verification-status`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch verification status for creator: ${creatorId}`);
  }

  const parsed = ApiVerificationStatusSchema.parse(response.data);
  return {
    verified: parsed.verified,
    verifiedAt: parsed.verifiedAt,
    expiresAt: parsed.expiresAt,
    status: parsed.status ?? 'unverified',
  };
}

/**
 * Verify wallet ownership (challenge/response)
 */
export async function verifyWallet(
  this: DorisioClient,
  walletId: string,
  proof: string
): Promise<Wallet> {
  const response = await this.request('POST', `/wallets/${walletId}/verify`, { proof });

  if (!response.success || !response.data) {
    throw new Error(`Failed to verify wallet: ${walletId}`);
  }

  return normalizeWallet(response.data);
}

/**
 * Get wallet verification status
 */
export async function getWalletVerificationStatus(
  this: DorisioClient,
  walletId: string
): Promise<VerificationStatus> {
  const response = await this.request('GET', `/wallets/${walletId}/verification-status`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch verification status for wallet: ${walletId}`);
  }

  const parsed = ApiVerificationStatusSchema.parse(response.data);
  return {
    verified: parsed.verified,
    verifiedAt: parsed.verifiedAt,
    expiresAt: parsed.expiresAt,
  };
}

/**
 * Request wallet verification challenge
 */
export async function requestWalletVerificationChallenge(
  this: DorisioClient,
  walletId: string
): Promise<{ challenge: string; expiresIn: number }> {
  const response = await this.request('POST', `/wallets/${walletId}/verification-challenge`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to request verification challenge for wallet: ${walletId}`);
  }

  const parsed = ApiWalletChallengeSchema.parse(response.data);
  return {
    challenge: parsed.challenge,
    expiresIn: parsed.expiresIn,
  };
}

/**
 * Check if transaction requires verification
 */
export async function isTransactionVerified(
  this: DorisioClient,
  transactionId: string
): Promise<boolean> {
  const response = await this.request('GET', `/transactions/${transactionId}/verified`);

  if (!response.success || response.data === undefined) {
    throw new Error(`Failed to check verification status for transaction: ${transactionId}`);
  }

  return Boolean(response.data);
}
