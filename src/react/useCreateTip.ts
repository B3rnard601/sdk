/**
 * useCreateTip Hook
 *
 * Hook for creating and submitting tips with Stellar transaction support.
 * Handles the full tip lifecycle: create, build transaction, submit, and confirm.
 */

import { useState, useCallback } from 'react';
import { useDorisio } from './DorisioProvider';
import { Transaction } from '../types/models';
import type { CreateTipRequest, BuildTransactionRequest, BuildTransactionResponse, SubmitTransactionResponse } from '../client/transactions';

export interface UseCreateTipState {
  data?: Transaction;
  loading: boolean;
  error?: string;
  step: 'idle' | 'creating' | 'building' | 'submitting' | 'confirming' | 'success' | 'error';
}

export interface UseCreateTipActions {
  createTip: (data: CreateTipRequest) => Promise<Transaction>;
  buildTransaction: (
    tipId: string,
    data: BuildTransactionRequest
  ) => Promise<BuildTransactionResponse>;
  submitTransaction: (tipId: string, envelope: string) => Promise<SubmitTransactionResponse>;
  confirmTransaction: (tipId: string) => Promise<Transaction>;
  reset: () => void;
}

/**
 * useCreateTip
 *
 * Manages the tip creation workflow including Stellar transaction building and submission.
 *
 * @example
 * ```tsx
 * function TipComponent() {
 *   const { createTip, buildTransaction, submitTransaction, confirmTransaction, state } = useCreateTip();
 *
 *   const handleCreateTip = async () => {
 *     // Step 1: Create tip
 *     const tip = await createTip({
 *       creatorId: 'creator-123',
 *       amount: 100,
 *       message: 'Great content!',
 *     });
 *
 *     // Step 2: Build Stellar transaction
 *     const { transactionEnvelope } = await buildTransaction(tip.id, {
 *       senderPublicKey: userWallet.publicKey,
 *       creatorPublicKey: creator.walletPublicKey,
 *       amount: '100',
 *     });
 *
 *     // Step 3: Sign with Freighter wallet
 *     const signedEnvelope = await signWithFreighter(transactionEnvelope);
 *
 *     // Step 4: Submit signed transaction
 *     await submitTransaction(tip.id, signedEnvelope);
 *
 *     // Step 5: Confirm on blockchain
 *     const confirmed = await confirmTransaction(tip.id);
 *   };
 *
 *   return (
 *     <div>
 *       {state.loading && <p>Loading...</p>}
 *       {state.error && <p>Error: {state.error}</p>}
 *       <button onClick={handleCreateTip}>Send Tip</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useCreateTip(): UseCreateTipState & UseCreateTipActions {
  const { client, setError, setIsLoading } = useDorisio();

  const [state, setState] = useState<UseCreateTipState>({
    loading: false,
    step: 'idle',
  });

  const createTip = useCallback(
    async (data: CreateTipRequest): Promise<Transaction> => {
      try {
        setState((s) => ({ ...s, loading: true, step: 'creating', error: undefined }));
        setIsLoading(true);

        const tip = await client.createTip(data);

        setState((s) => ({
          ...s,
          data: tip,
          step: 'idle',
          loading: false,
        }));

        return tip;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to create tip';
        setState((s) => ({ ...s, error, step: 'error', loading: false }));
        setError({ message: error, code: 'CREATE_TIP_ERROR' });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const buildTransaction = useCallback(
    async (tipId: string, data: BuildTransactionRequest) => {
      try {
        setState((s) => ({ ...s, loading: true, step: 'building', error: undefined }));
        setIsLoading(true);

        const result = await client.buildPaymentTransaction(tipId, data);

        setState((s) => ({
          ...s,
          step: 'idle',
          loading: false,
        }));

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to build transaction';
        setState((s) => ({ ...s, error, step: 'error', loading: false }));
        setError({ message: error, code: 'BUILD_TRANSACTION_ERROR' });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const submitTransaction = useCallback(
    async (tipId: string, envelope: string) => {
      try {
        setState((s) => ({ ...s, loading: true, step: 'submitting', error: undefined }));
        setIsLoading(true);

        const result = await client.submitPaymentTransaction(tipId, {
          transactionEnvelope: envelope,
        });

        setState((s) => ({
          ...s,
          step: 'idle',
          loading: false,
        }));

        return result;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to submit transaction';
        setState((s) => ({ ...s, error, step: 'error', loading: false }));
        setError({ message: error, code: 'SUBMIT_TRANSACTION_ERROR' });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const confirmTransaction = useCallback(
    async (tipId: string): Promise<Transaction> => {
      try {
        setState((s) => ({ ...s, loading: true, step: 'confirming', error: undefined }));
        setIsLoading(true);

        const tip = await client.checkTransactionConfirmation(tipId);

        setState((s) => ({
          ...s,
          data: tip,
          step: 'success',
          loading: false,
        }));

        return tip;
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to confirm transaction';
        setState((s) => ({ ...s, error, step: 'error', loading: false }));
        setError({ message: error, code: 'CONFIRM_TRANSACTION_ERROR' });
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [client, setError, setIsLoading]
  );

  const reset = useCallback(() => {
    setState({
      loading: false,
      step: 'idle',
    });
  }, []);

  return {
    ...state,
    createTip,
    buildTransaction,
    submitTransaction,
    confirmTransaction,
    reset,
  };
}
