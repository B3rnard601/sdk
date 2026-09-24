/**
 * useWallet Hook
 *
 * Hook for wallet management with challenge-response verification flow.
 * Handles wallet linking, verification, and unlinking.
 *
 * Error handling: see {@link runSafely} — actions reject with the original error,
 * report through the provider's `setError` without ever masking it, and always
 * clear loading state.
 */

import { useState, useCallback } from 'react';
import { useDorisio } from './DorisioProvider';
import { Wallet } from '../types/models';
import { runSafely } from './safe-async';

export interface UseWalletState {
  wallets: Wallet[];
  selectedWallet?: Wallet;
  loading: boolean;
  error?: string;
  nonce?: string;
  challengeStep:
    'idle' | 'nonce-generated' | 'challenge-ready' | 'verifying' | 'verified' | 'error';
}

export interface UseWalletActions {
  generateNonce: (publicKey: string) => Promise<{ nonce: string; expiresIn: number }>;
  getChallenge: (nonce: string) => Promise<string>;
  verifyWallet: (publicKey: string, nonce: string, signedTransaction: string) => Promise<Wallet>;
  listWallets: (includeBalance?: boolean) => Promise<Wallet[]>;
  selectWallet: (wallet: Wallet) => void;
  unlinkWallet: (walletId: string) => Promise<void>;
  renameWallet: (walletId: string, name: string) => Promise<Wallet>;
  getBalance: (walletId: string) => Promise<any>;
  reset: () => void;
}

/**
 * useWallet
 *
 * Manages wallet operations including challenge-response verification with Freighter.
 */
export function useWallet(): UseWalletState & UseWalletActions {
  const { client, setError, setIsLoading } = useDorisio();

  const [state, setState] = useState<UseWalletState>({
    wallets: [],
    loading: false,
    challengeStep: 'idle',
  });

  const begin =
    (extra: Partial<UseWalletState> = {}) =>
    () =>
      setState((s) => ({ ...s, loading: true, error: undefined, ...extra }));
  // Steps of the challenge flow also surface the failure in `challengeStep`.
  const failStep = (error: string) =>
    setState((s) => ({ ...s, error, challengeStep: 'error', loading: false }));
  const fail = (error: string) => setState((s) => ({ ...s, error, loading: false }));

  const generateNonce = useCallback(
    (publicKey: string): Promise<{ nonce: string; expiresIn: number }> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'NONCE_GENERATION_ERROR',
          fallbackMessage: 'Failed to generate nonce',
          onStart: begin(),
          onError: failStep,
        },
        async () => {
          const response = await client.request<any>('POST', '/api/v1/wallet/nonce', {
            publicKey,
          });

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to generate nonce');
          }

          const data = response.data;
          setState((s) => ({
            ...s,
            nonce: data.nonce,
            challengeStep: 'nonce-generated',
            loading: false,
          }));

          return { nonce: data.nonce, expiresIn: data.expiresIn || 300 };
        }
      ),
    [client, setError, setIsLoading]
  );

  const getChallenge = useCallback(
    (nonce: string): Promise<string> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'CHALLENGE_ERROR',
          fallbackMessage: 'Failed to get challenge',
          onStart: begin(),
          onError: failStep,
        },
        async () => {
          const response = await client.request<any>('GET', `/api/v1/wallet/challenge/${nonce}`);

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to get challenge');
          }

          const data = response.data;
          setState((s) => ({ ...s, challengeStep: 'challenge-ready', loading: false }));

          return data.challenge || data;
        }
      ),
    [client, setError, setIsLoading]
  );

  const verifyWallet = useCallback(
    (publicKey: string, nonce: string, signedTransaction: string): Promise<Wallet> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'WALLET_VERIFICATION_ERROR',
          fallbackMessage: 'Failed to verify wallet',
          onStart: begin({ challengeStep: 'verifying' }),
          onError: failStep,
        },
        async () => {
          const response = await client.request<Wallet>('POST', '/api/v1/wallet/verify', {
            publicKey,
            nonce,
            signedTransaction,
          });

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to verify wallet');
          }

          const wallet = response.data;

          setState((s) => ({
            ...s,
            wallets: [...s.wallets, wallet],
            selectedWallet: wallet,
            challengeStep: 'verified',
            loading: false,
            nonce: undefined,
          }));

          return wallet;
        }
      ),
    [client, setError, setIsLoading]
  );

  const listWallets = useCallback(
    (includeBalance = false): Promise<Wallet[]> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'LIST_WALLETS_ERROR',
          fallbackMessage: 'Failed to list wallets',
          onStart: begin(),
          onError: fail,
        },
        async () => {
          const query = includeBalance ? '?includeBalance=true' : '';
          const response = await client.request<any>('GET', `/api/v1/wallet/list${query}`);

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to list wallets');
          }

          const data = response.data;
          const wallets = (data.wallets || data) as Wallet[];

          setState((s) => ({ ...s, wallets, loading: false }));

          return wallets;
        }
      ),
    [client, setError, setIsLoading]
  );

  const selectWallet = useCallback((wallet: Wallet) => {
    setState((s) => ({ ...s, selectedWallet: wallet }));
  }, []);

  const unlinkWallet = useCallback(
    (walletId: string): Promise<void> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'UNLINK_WALLET_ERROR',
          fallbackMessage: 'Failed to unlink wallet',
          onStart: begin(),
          onError: fail,
        },
        async () => {
          const response = await client.request('DELETE', `/api/v1/wallet/${walletId}`);

          if (!response.success) {
            throw new Error(response.error?.message || 'Failed to unlink wallet');
          }

          setState((s) => ({
            ...s,
            wallets: s.wallets.filter((w) => w.id !== walletId),
            selectedWallet: s.selectedWallet?.id === walletId ? undefined : s.selectedWallet,
            loading: false,
          }));
        }
      ),
    [client, setError, setIsLoading]
  );

  const renameWallet = useCallback(
    (walletId: string, name: string): Promise<Wallet> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'RENAME_WALLET_ERROR',
          fallbackMessage: 'Failed to rename wallet',
          onStart: begin(),
          onError: fail,
        },
        async () => {
          const response = await client.request<Wallet>(
            'PATCH',
            `/api/v1/wallet/${walletId}/name`,
            {
              name,
            }
          );

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to rename wallet');
          }

          const updatedWallet = response.data;

          setState((s) => ({
            ...s,
            wallets: s.wallets.map((w) => (w.id === walletId ? updatedWallet : w)),
            selectedWallet: s.selectedWallet?.id === walletId ? updatedWallet : s.selectedWallet,
            loading: false,
          }));

          return updatedWallet;
        }
      ),
    [client, setError, setIsLoading]
  );

  const getBalance = useCallback(
    (walletId: string): Promise<any> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'GET_BALANCE_ERROR',
          fallbackMessage: 'Failed to fetch balance',
          onStart: begin(),
          onError: fail,
        },
        async () => {
          const response = await client.request<any>('GET', `/api/v1/wallet/${walletId}/balance`);

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to fetch balance');
          }

          setState((s) => ({ ...s, loading: false }));
          return response.data;
        }
      ),
    [client, setError, setIsLoading]
  );

  const reset = useCallback(() => {
    setState({
      wallets: [],
      loading: false,
      challengeStep: 'idle',
    });
  }, []);

  return {
    ...state,
    generateNonce,
    getChallenge,
    verifyWallet,
    listWallets,
    selectWallet,
    unlinkWallet,
    renameWallet,
    getBalance,
    reset,
  };
}
