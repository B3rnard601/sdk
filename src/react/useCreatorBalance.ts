/**
 * useCreatorBalance Hook
 *
 * Hook for fetching creator earnings and balance information.
 *
 * Dependency chain:
 * - `fetchBalance` is stable (client + context setters only).
 * - Latest `creatorId` / `walletId` live in refs so `refetch` never loses
 *   the wallet filter or hits a stale creator after rapid switches.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDorisio } from './DorisioProvider';
import { ApiCreatorEarningsSchema } from '../types/schemas';
import { logRejection, runSafely } from './safe-async';

export interface CreatorBalance {
  totalEarnings: number;
  pendingBalance: number;
  lumens?: string;
  usdc?: string;
}

export interface UseCreatorBalanceState {
  balance?: CreatorBalance;
  loading: boolean;
  error?: string;
  lastUpdated?: number;
}

export interface UseCreatorBalanceActions {
  fetchBalance: (creatorId: string, walletId?: string) => Promise<CreatorBalance>;
  refetch: () => Promise<void>;
  reset: () => void;
}

/**
 * useCreatorBalance
 *
 * Fetches creator earnings and wallet balance information.
 * Optionally auto-fetches on mount if creatorId is provided. Auto-fetch failures are
 * exposed via `error` and logged to the console rather than raised as unhandled
 * rejections; manual `fetchBalance()` / `refetch()` calls reject with the original error.
 *
 * @example
 * ```tsx
 * function CreatorDashboard() {
 *   const { balance, loading, error, fetchBalance } = useCreatorBalance();
 *
 *   useEffect(() => {
 *     fetchBalance('creator-123');
 *   }, []);
 *
 *   if (loading) return <p>Loading...</p>;
 *   if (error) return <p>Error: {error}</p>;
 *
 *   return (
 *     <div>
 *       <p>Total Earnings: ${balance?.totalEarnings}</p>
 *       <p>Pending: ${balance?.pendingBalance}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCreatorBalance(
  initialCreatorId?: string,
  autoFetch = true
): UseCreatorBalanceState & UseCreatorBalanceActions {
  const { client, setError, setIsLoading } = useDorisio();

  const [state, setState] = useState<UseCreatorBalanceState>({
    loading: false,
  });

  const [creatorId, setCreatorId] = useState(initialCreatorId);

  const creatorIdRef = useRef(creatorId);
  creatorIdRef.current = creatorId;
  const walletIdRef = useRef<string | undefined>(undefined);

  const fetchBalance = useCallback(
    (id: string, walletId?: string): Promise<CreatorBalance> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'FETCH_BALANCE_ERROR',
          fallbackMessage: 'Failed to fetch balance',
          onStart: () => {
            setState((s) => ({ ...s, loading: true, error: undefined }));
            setCreatorId(id);
            creatorIdRef.current = id;
          },
          onError: (error) => setState((s) => ({ ...s, error, loading: false })),
        },
        async () => {
          // Persist walletId when provided so refetch keeps the same filter.
          const resolvedWalletId = walletId !== undefined ? walletId : walletIdRef.current;
          if (walletId !== undefined) {
            walletIdRef.current = walletId;
          }

          // Fetch earnings data
          const earningsResponse = await client.request<{
            totalEarnings: number;
            pendingBalance: number;
            lumens?: string;
            usdc?: string;
          }>('GET', `/api/v1/creators/${id}/earnings`);

          if (!earningsResponse.success || !earningsResponse.data) {
            throw new Error(earningsResponse.error?.message || 'Failed to fetch creator earnings');
          }

          const earningsSchema = ApiCreatorEarningsSchema.parse(earningsResponse.data);

          let balance: CreatorBalance = {
            totalEarnings: earningsSchema.totalEarnings,
            pendingBalance: earningsSchema.pendingBalance,
          };

          // Optionally fetch wallet balance
          if (resolvedWalletId) {
            try {
              const balanceResponse = await client.request<any>(
                'GET',
                `/api/v1/wallet/${resolvedWalletId}/balance`
              );

              if (balanceResponse.success && balanceResponse.data) {
                const d = balanceResponse.data;
                balance = { ...balance, lumens: d.lumens, usdc: d.usdc };
              }
            } catch (err) {
              // Wallet balance is optional; earnings still succeed.
              console.warn('Failed to fetch wallet balance:', err);
            }
          }

          setState((s) => ({ ...s, balance, lastUpdated: Date.now(), loading: false }));

          return balance;
        }
      ),
    [client, setError, setIsLoading]
  );

  const refetch = useCallback(async () => {
    const id = creatorIdRef.current;
    if (id) {
      await fetchBalance(id, walletIdRef.current);
    }
  }, [fetchBalance]);

  const reset = useCallback(() => {
    setState({
      loading: false,
    });
    setCreatorId(undefined);
    creatorIdRef.current = undefined;
    walletIdRef.current = undefined;
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && initialCreatorId) {
      // Error is already reflected in hook state; just make sure it can't go unhandled.
      logRejection(fetchBalance(initialCreatorId), 'useCreatorBalance auto-fetch');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only autoFetch
  }, []);

  return {
    ...state,
    fetchBalance,
    refetch,
    reset,
  };
}
