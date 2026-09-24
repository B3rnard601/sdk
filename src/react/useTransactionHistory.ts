/**
 * useTransactionHistory Hook
 *
 * Hook for fetching and managing transaction history with pagination support.
 */

import { useState, useCallback, useEffect } from 'react';
import { useDorisio } from './DorisioProvider';
import { logRejection, runSafely } from './safe-async';
import { Transaction } from '../types/models';

export interface TransactionHistoryOptions {
  page?: number;
  pageSize?: number;
}

export interface UseTransactionHistoryState {
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error?: string;
  lastUpdated?: number;
}

export interface UseTransactionHistoryActions {
  fetchHistory: (options?: TransactionHistoryOptions, creatorId?: string) => Promise<Transaction[]>;
  goToPage: (page: number) => Promise<void>;
  nextPage: () => Promise<void>;
  prevPage: () => Promise<void>;
  setPageSize: (size: number) => Promise<void>;
  refetch: () => Promise<void>;
  reset: () => void;
}

/**
 * useTransactionHistory
 *
 * Manages transaction history with built-in pagination support.
 * Can fetch user's tip history or creator's received tips. Auto-fetch failures are
 * exposed via `error` and logged rather than raised as unhandled rejections; manual
 * calls reject with the original error.
 *
 * @example
 * ```tsx
 * function TransactionList() {
 *   const { transactions, total, page, fetchHistory, nextPage, prevPage, loading } =
 *     useTransactionHistory();
 *
 *   useEffect(() => {
 *     fetchHistory({ page: 1, pageSize: 10 });
 *   }, []);
 *
 *   return (
 *     <div>
 *       {transactions.map((tx) => (
 *         <div key={tx.id}>
 *           {tx.amount} - {tx.status}
 *         </div>
 *       ))}
 *       <button onClick={prevPage}>Previous</button>
 *       <span>Page {page}</span>
 *       <button onClick={nextPage}>Next</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useTransactionHistory(
  initialOptions?: TransactionHistoryOptions,
  autoFetch = false
): UseTransactionHistoryState & UseTransactionHistoryActions {
  const { client, setError, setIsLoading } = useDorisio();

  const [state, setState] = useState<UseTransactionHistoryState>({
    transactions: [],
    total: 0,
    page: initialOptions?.page || 1,
    pageSize: initialOptions?.pageSize || 10,
    loading: false,
  });

  const [creatorId, setCreatorId] = useState<string | undefined>();
  const [lastOptions, setLastOptions] = useState(initialOptions);

  const fetchHistory = useCallback(
    (options?: TransactionHistoryOptions, creator?: string): Promise<Transaction[]> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'FETCH_HISTORY_ERROR',
          fallbackMessage: 'Failed to fetch history',
          onStart: () => setState((s) => ({ ...s, loading: true, error: undefined })),
          onError: (error) => setState((s) => ({ ...s, error, loading: false })),
        },
        async () => {
          const page = options?.page || state.page;
          const pageSize = options?.pageSize || state.pageSize;
          const endpoint = creator
            ? `/api/v1/transactions/creator/${creator}`
            : '/api/v1/transactions/history';
          const query = `?page=${page}&pageSize=${pageSize}`;

          const response = await client.request('GET', `${endpoint}${query}`);

          if (!response.success || !response.data) {
            throw new Error(response.error?.message || 'Failed to fetch transaction history');
          }

          const d = response.data as any;
          setState((s) => ({
            ...s,
            transactions: d.tips || [],
            total: d.total || 0,
            page: d.page || page,
            pageSize: d.pageSize || pageSize,
            lastUpdated: Date.now(),
            loading: false,
          }));

          setLastOptions({ page, pageSize });
          setCreatorId(creator);

          return d.tips || [];
        }
      ),
    [client, setError, setIsLoading, state.page, state.pageSize]
  );

  const goToPage = useCallback(
    async (page: number): Promise<void> => {
      if (page < 1) return;
      await fetchHistory({ page, pageSize: state.pageSize }, creatorId);
    },
    [fetchHistory, state.pageSize, creatorId]
  );

  const nextPage = useCallback(async (): Promise<void> => {
    const hasMore = state.page * state.pageSize < state.total;
    if (hasMore) {
      await goToPage(state.page + 1);
    }
  }, [goToPage, state.page, state.pageSize, state.total]);

  const prevPage = useCallback(async (): Promise<void> => {
    if (state.page > 1) {
      await goToPage(state.page - 1);
    }
  }, [goToPage, state.page]);

  const setPageSize = useCallback(
    async (size: number): Promise<void> => {
      if (size > 0 && size <= 100) {
        await fetchHistory({ page: 1, pageSize: size }, creatorId);
      }
    },
    [fetchHistory, creatorId]
  );

  const refetch = useCallback(async (): Promise<void> => {
    await fetchHistory(lastOptions, creatorId);
  }, [fetchHistory, lastOptions, creatorId]);

  const reset = useCallback((): void => {
    setState({
      transactions: [],
      total: 0,
      page: 1,
      pageSize: 10,
      loading: false,
    });
    setCreatorId(undefined);
    setLastOptions(undefined);
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      // Error is already reflected in hook state; just make sure it can't go unhandled.
      logRejection(fetchHistory(initialOptions), 'useTransactionHistory auto-fetch');
    }
  }, []);

  return {
    ...state,
    fetchHistory,
    goToPage,
    nextPage,
    prevPage,
    setPageSize,
    refetch,
    reset,
  };
}
