/**
 * useWallet Hook
 *
 * Hook for wallet management with challenge-response verification flow.
 * Handles wallet linking, verification, and unlinking.
 *
 * Error-safety guarantee
 * ─────────────────────
 * Every async operation uses try/catch/finally so that:
 *   1. `setIsLoading(false)` always runs, even if `setError()` throws.
 *   2. `loading: false` is set in `finally` via setState, so it runs
 *      even if the catch-block's setState throws.
 *   3. Callers still receive the rejected error so they can handle it.
 */

import { useState, useCallback } from 'react';
import { useDorisio } from './DorisioProvider';
import { Wallet } from '../types/models';

export interface UseWalletState {
  wallets: Wallet[];
  selectedWallet?: Wallet;
  loading: boolean;
  error?: string;
  nonce?: string;
  challengeStep:
    | 'idle'
    | 'nonce-generated'
    | 'challenge-ready'
    | 'verifying'
    | 'verified'
    | 'error';
}

export interface UseWalletActions {
  generateNonce: (publicKey: string) => Promise<{ nonce: string; expiresIn: number }>;
  getChallenge: (nonce: string) => Promise<string>;
  verifyWallet: (publicKey: string, nonce: string, signedTransaction: string) => Promise<Wallet>;
  listWallets: (includeBalance?: boolean) => Promise<Wallet[]>;
  selectWallet: (wallet: Wallet) => void;
  unlinkWallet: (walletId: string) => Promise<void>;
  renameWallet: (walletId: string, name: string) => Promise<Wallet>;
  getBalance: (walletId: string) => Promise<{ available: number; pending: number; total: number }>;
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

  const generateNonce = useCallback(
    async (publicKey: string): Promise<{ nonce: string; expiresIn: number }> => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      setIsLoading(true);
      try {
        const response = await client.request<{ nonce: string; expiresIn?: number }>(
          'POST',
          '/api/v1/wallet/nonce',
          { publicKey }
        );

        if (!response.success || !response.data) {
          throw new Error(response.error?.message ?? 'Failed to generate nonce');
        }

        const data = response.data;
        setState((s) => ({
          ...s,
          nonce: data.nonce,
          challengeStep: 'nonce-generated',
        }));

        return { nonce: data.nonce, expiresIn: data.expiresIn ?? 300 };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate nonce';
        setState((s) => ({ ...s, error: message, challengeStep: 'error' }));
        setError({ message, code: 'NONCE_GENERATION_ERROR' });
        throw err;
      } finally {
        setState((s) => ({ ...s, loading: false }));
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const getChallenge = useCallback(
    async (nonce: string): Promise<string> => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      setIsLoading(true);
      try {
        const response = await client.request<{ challenge: string } | string>(
          'GET',
          `/api/v1/wallet/challenge/${nonce}`
        );

        if (!response.success || !response.data) {
          throw new Error(response.error?.message ?? 'Failed to get challenge');
        }

        const data = response.data;
        const challenge =
          typeof data === 'string' ? data : (data as { challenge: string }).challenge;

        setState((s) => ({ ...s, challengeStep: 'challenge-ready' }));

        return challenge;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get challenge';
        setState((s) => ({ ...s, error: message, challengeStep: 'error' }));
        setError({ message, code: 'CHALLENGE_ERROR' });
        throw err;
      } finally {
        setState((s) => ({ ...s, loading: false }));
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const verifyWallet = useCallback(
    async (publicKey: string, nonce: string, signedTransaction: string): Promise<Wallet> => {
      setState((s) => ({ ...s, loading: true, error: undefined, challengeStep: 'verifying' }));
      setIsLoading(true);
      try {
        const response = await client.request<Wallet>('POST', '/api/v1/wallet/verify', {
          publicKey,
          nonce,
          signedTransaction,
        });

        if (!response.success || !response.data) {
          throw new Error(response.error?.message ?? 'Failed to verify wallet');
        }

        const wallet = response.data;
        setState((s) => ({
          ...s,
          wallets: [...s.wallets, wallet],
          selectedWallet: wallet,
          challengeStep: 'verified',
          nonce: undefined,
        }));

        return wallet;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to verify wallet';
        setState((s) => ({ ...s, error: message, challengeStep: 'error' }));
        setError({ message, code: 'WALLET_VERIFICATION_ERROR' });
        throw err;
      } finally {
        setState((s) => ({ ...s, loading: false }));
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const listWallets = useCallback(
    async (includeBalance = false): Promise<Wallet[]> => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      setIsLoading(true);
      try {
        const query = includeBalance ? '?includeBalance=true' : '';
        const response = await client.request<{ wallets?: Wallet[] } | Wallet[]>(
          'GET',
          `/api/v1/wallet/list${query}`
        );

        if (!response.success || !response.data) {
          throw new Error(response.error?.message ?? 'Failed to list wallets');
        }

        const data = response.data;
        const wallets: Wallet[] = Array.isArray(data)
          ? data
          : ((data as { wallets?: Wallet[] }).wallets ?? []);

        setState((s) => ({ ...s, wallets }));

        return wallets;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to list wallets';
        setState((s) => ({ ...s, error: message }));
        setError({ message, code: 'LIST_WALLETS_ERROR' });
        throw err;
      } finally {
        setState((s) => ({ ...s, loading: false }));
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const selectWallet = useCallback((wallet: Wallet) => {
    setState((s) => ({ ...s, selectedWallet: wallet }));
  }, []);

  const unlinkWallet = useCallback(
    async (walletId: string): Promise<void> => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      setIsLoading(true);
      try {
        const response = await client.request('DELETE', `/api/v1/wallet/${walletId}`);

        if (!response.success) {
          throw new Error(response.error?.message ?? 'Failed to unlink wallet');
        }

        setState((s) => ({
          ...s,
          wallets: s.wallets.filter((w) => w.id !== walletId),
          selectedWallet: s.selectedWallet?.id === walletId ? undefined : s.selectedWallet,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to unlink wallet';
        setState((s) => ({ ...s, error: message }));
        setError({ message, code: 'UNLINK_WALLET_ERROR' });
        throw err;
      } finally {
        setState((s) => ({ ...s, loading: false }));
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const renameWallet = useCallback(
    async (walletId: string, name: string): Promise<Wallet> => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      setIsLoading(true);
      try {
        const response = await client.request<Wallet>(
          'PATCH',
          `/api/v1/wallet/${walletId}/name`,
          { name }
        );

        if (!response.success || !response.data) {
          throw new Error(response.error?.message ?? 'Failed to rename wallet');
        }

        const updatedWallet = response.data;
        setState((s) => ({
          ...s,
          wallets: s.wallets.map((w) => (w.id === walletId ? updatedWallet : w)),
          selectedWallet: s.selectedWallet?.id === walletId ? updatedWallet : s.selectedWallet,
        }));

        return updatedWallet;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to rename wallet';
        setState((s) => ({ ...s, error: message }));
        setError({ message, code: 'RENAME_WALLET_ERROR' });
        throw err;
      } finally {
        setState((s) => ({ ...s, loading: false }));
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const getBalance = useCallback(
    async (walletId: string): Promise<{ available: number; pending: number; total: number }> => {
      setState((s) => ({ ...s, loading: true, error: undefined }));
      setIsLoading(true);
      try {
        const response = await client.request<{ available: number; pending: number; total: number }>(
          'GET',
          `/api/v1/wallet/${walletId}/balance`
        );

        if (!response.success || !response.data) {
          throw new Error(response.error?.message ?? 'Failed to fetch balance');
        }

        return response.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch balance';
        setState((s) => ({ ...s, error: message }));
        setError({ message, code: 'GET_BALANCE_ERROR' });
        throw err;
      } finally {
        setState((s) => ({ ...s, loading: false }));
        setIsLoading(false);
      }
    },
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
