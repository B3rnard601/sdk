/**
 * Wallet Methods
 *
 * SDK methods for wallet operations.
 */

import { Wallet, CreateWalletRequest, UpdateWalletRequest } from '../types/models';
import { normalizeWallet, normalizeWallets } from '../utils/normalizers';
import { DorisioClient } from '../client';
import { RequestValidator } from '../utils/validators';

/**
 * Connect a wallet to user account
 */
export async function connectWallet(
  this: DorisioClient,
  data: CreateWalletRequest
): Promise<Wallet> {
  RequestValidator.required(data, 'wallet data');
  RequestValidator.nonEmptyString(data.publicKey, 'publicKey');
  const response = await this.request('POST', '/wallets', data);

  if (!response.success || !response.data) {
    throw new Error('Failed to connect wallet');
  }

  return normalizeWallet(response.data);
}

/**
 * Disconnect a wallet from user account
 */
export async function disconnectWallet(this: DorisioClient, walletId: string): Promise<void> {
  RequestValidator.nonEmptyString(walletId, 'walletId');
  const response = await this.request('DELETE', `/wallets/${walletId}`);

  if (!response.success) {
    throw new Error(`Failed to disconnect wallet: ${walletId}`);
  }
}

/**
 * Get user's wallets
 */
export async function getWallets(this: DorisioClient, userId: string): Promise<Wallet[]> {
  RequestValidator.nonEmptyString(userId, 'userId');
  const response = await this.request('GET', `/users/${userId}/wallets`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch wallets for user: ${userId}`);
  }

  return normalizeWallets(Array.isArray(response.data) ? response.data : []);
}

/**
 * Get wallet by ID
 */
export async function getWallet(this: DorisioClient, walletId: string): Promise<Wallet> {
  RequestValidator.nonEmptyString(walletId, 'walletId');
  const response = await this.request('GET', `/wallets/${walletId}`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to fetch wallet: ${walletId}`);
  }

  return normalizeWallet(response.data);
}

/**
 * Update wallet details
 */
export async function updateWallet(
  this: DorisioClient,
  walletId: string,
  data: UpdateWalletRequest
): Promise<Wallet> {
  RequestValidator.nonEmptyString(walletId, 'walletId');
  const response = await this.request('PATCH', `/wallets/${walletId}`, data);

  if (!response.success || !response.data) {
    throw new Error(`Failed to update wallet: ${walletId}`);
  }

  return normalizeWallet(response.data);
}

/**
 * Verify wallet ownership (for Stellar wallets)
 */
export async function verifyWallet(this: DorisioClient, walletId: string): Promise<Wallet> {
  RequestValidator.nonEmptyString(walletId, 'walletId');
  const response = await this.request('POST', `/wallets/${walletId}/verify`);

  if (!response.success || !response.data) {
    throw new Error(`Failed to verify wallet: ${walletId}`);
  }

  return normalizeWallet(response.data);
}

/**
 * Get wallet balance
 */
export async function getBalance(this: DorisioClient, walletId: string): Promise<number> {
  const response = await this.request('GET', `/wallets/${walletId}/balance`);

  if (!response.success || response.data === undefined) {
    throw new Error(`Failed to fetch wallet balance: ${walletId}`);
  }

  return Number(response.data);
}
