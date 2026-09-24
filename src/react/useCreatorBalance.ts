/**
 * useCreatorBalance Hook
 *
 * Hook for fetching creator earnings and balance information.
 */

import { useState, useCallback, useEffect } from 'react';
import { useDorisio } from './DorisioProvider';
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
          },
          onError: (error) => setState((s) => ({ ...s, error, loading: false })),
        },
        async () => {
          // Fetch earnings data
          const earningsResponse = await client.request('GET', `/api/v1/creators/${id}/earnings`);

          if (!earningsResponse.success || !earningsResponse.data) {
            throw new Error(earningsResponse.error?.message || 'Failed to fetch creator earnings');
          }

          let balance: CreatorBalance = {
            totalEarnings: (earningsResponse.data as any).totalEarnings || 0,
            pendingBalance: (earningsResponse.data as any).pendingBalance || 0,
          };

          // Optionally fetch wallet balance
          if (walletId) {
            try {
              const balanceResponse = await client.request<any>(
                'GET',
                `/api/v1/wallet/${walletId}/balance`
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
    if (creatorId) {
      await fetchBalance(creatorId);
    }
  }, [creatorId, fetchBalance]);

  const reset = useCallback(() => {
    setState({
      loading: false,
    });
    setCreatorId(undefined);
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && initialCreatorId) {
      // Error is already reflected in hook state; just make sure it can't go unhandled.
      logRejection(fetchBalance(initialCreatorId), 'useCreatorBalance auto-fetch');
    }
  }, []);

  return {
    ...state,
    fetchBalance,
    refetch,
    reset,
  };
}
