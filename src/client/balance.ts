/**
 * Balance Methods
 *
 * SDK methods for balance and account queries.
 */

import { DorisioClient } from '../client';
import {
  ApiAccountBalanceSchema,
  ApiAccountSummarySchema,
  ApiBalanceInfoSchema,
  ApiCreatorPendingPayoutSchema,
} from '../types/schemas';

export interface BalanceInfo {
  walletId: string;
  available: number;
  pending: number;
  total: number;
  currency: string;
}

export interface AccountBalance {
  total: number;
  available: number;
  pending: number;
  wallets: BalanceInfo[];
}

/**
 * Get user's total balance across all wallets
 */
export async function getBalance(this: DorisioClient, userId: string): Promise<AccountBalance> {
  const response = await this.request('GET', `/users/${userId}/balance`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch balance for user: ${userId}`);
  }

  const parsed = ApiAccountBalanceSchema.parse(response.data);
  return {
    total: parsed.total,
    available: parsed.available,
    pending: parsed.pending,
    wallets: parsed.wallets.map((w) => ({
      walletId: w.walletId,
      available: w.available,
      pending: w.pending,
      total: w.available + w.pending,
      currency: w.currency,
    })),
  };
}

/**
 * Get single wallet balance
 */
export async function getWalletBalance(
  this: DorisioClient,
  walletId: string
): Promise<BalanceInfo> {
  const response = await this.request('GET', `/wallets/${walletId}/balance`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch wallet balance: ${walletId}`);
  }

  const parsed = ApiBalanceInfoSchema.parse(
    // The balance endpoint may return an object without walletId; inject it.
    { walletId, ...(response.data as object) }
  );

  return {
    walletId: parsed.walletId,
    available: parsed.available,
    pending: parsed.pending,
    total: parsed.available + parsed.pending,
    currency: parsed.currency,
  };
}

/**
 * Get creator's pending payout
 */
export async function getCreatorPendingPayout(
  this: DorisioClient,
  creatorId: string
): Promise<{
  pending: number;
  nextPayoutDate?: string;
  minimumThreshold: number;
}> {
  const response = await this.request('GET', `/creators/${creatorId}/payout-pending`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch pending payout for creator: ${creatorId}`);
  }

  const parsed = ApiCreatorPendingPayoutSchema.parse(response.data);
  return {
    pending: parsed.pending,
    nextPayoutDate: parsed.nextPayoutDate,
    minimumThreshold: parsed.minimumThreshold,
  };
}

/**
 * Check if minimum payout threshold is reached
 */
export async function canPayout(this: DorisioClient, creatorId: string): Promise<boolean> {
  const response = await this.request('GET', `/creators/${creatorId}/can-payout`);

  if (!response.success || response.data === undefined) {
    throw new Error(`Failed to check payout eligibility for creator: ${creatorId}`);
  }

  return Boolean(response.data);
}

/**
 * Get account summary with balance and stats
 */
export async function getAccountSummary(this: DorisioClient): Promise<{
  userId: string;
  email: string;
  role: string;
  balance: AccountBalance;
  totalTipsSent?: number;
  totalEarnings?: number;
  lastActivityDate?: string;
}> {
  const response = await this.request('GET', '/users/me/summary');

  if (!response.success || !response.data) {
    throw new Error('Failed to fetch account summary');
  }

  const parsed = ApiAccountSummarySchema.parse(response.data);
  const balanceRaw = parsed.balance ?? { total: 0, available: 0, pending: 0, wallets: [] };

  return {
    userId: parsed.userId,
    email: parsed.email,
    role: parsed.role,
    balance: {
      total: balanceRaw.total,
      available: balanceRaw.available,
      pending: balanceRaw.pending,
      wallets: balanceRaw.wallets.map((w) => ({
        walletId: w.walletId,
        available: w.available,
        pending: w.pending,
        total: w.available + w.pending,
        currency: w.currency,
      })),
    },
    totalTipsSent: parsed.totalTipsSent,
    totalEarnings: parsed.totalEarnings,
    lastActivityDate: parsed.lastActivityDate,
  };
}
