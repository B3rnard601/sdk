/**
 * useCreatorBalance Hook
 *
 * Hook for fetching creator earnings and balance information.
 */

import { useState, useCallback, useEffect } from 'react';
import { useDorisio } from './DorisioProvider';
import { ApiCreatorEarningsSchema } from '../types/schemas';

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
 * Optionally auto-fetches on mount if creatorId is provided.
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
    async (id: string, walletId?: string): Promise<CreatorBalance> => {
      try {
        setState((s) => ({ ...s, loading: true, error: undefined }));
        setIsLoading(true);
        setCreatorId(id);

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
        if (walletId) {
          try {
            const balanceResponse = await client.request<{
              lumens?: string;
              usdc?: string;
            }>('GET', `/api/v1/wallet/${walletId}/balance`);

            if (balanceResponse.success && balanceResponse.data) {
              const d = balanceResponse.data;
              balance = {
                ...balance,
                lumens: d.lumens,
                usdc: d.usdc,
              };
            }
          } catch (err) {
            // Silently fail wallet balance fetch
            console.warn('Failed to fetch wallet balance:', err);
          }
        }

        setState((s) => ({
          ...s,
          balance,
          lastUpdated: Date.now(),
          loading: false,
        }));

        return balance;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to fetch balance';
        setState((s) => ({ ...s, error, loading: false }));
        setError({ message: error, code: 'FETCH_BALANCE_ERROR' });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
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
      fetchBalance(initialCreatorId);
    }
  }, []);

  return {
    ...state,
    fetchBalance,
    refetch,
    reset,
  };
}
