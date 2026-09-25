/**
 * useCreateTip Hook
 *
 * Hook for creating and submitting tips with Stellar transaction support.
 * Handles the full tip lifecycle: create, build transaction, submit, and confirm.
 *
 * Error handling: every operation resolves with its result or rejects with the
 * original error. Failures also set `error`/`step: 'error'` on the hook and are
 * reported through the provider's `setError`; a throwing `onError` handler or
 * `setError` never masks the original error, and loading state is always cleared.
 * Always `await` the actions inside try/catch (or `.catch()`) in event handlers.
 */

import { useState, useCallback } from 'react';
import { useDorisio } from './DorisioProvider';
import { Transaction } from '../types/models';
import { runSafely } from './safe-async';
import type {
  CreateTipRequest,
  BuildTransactionRequest,
  BuildTransactionResponse,
  SubmitTransactionResponse,
} from '../client/transactions';

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

  const start = (step: UseCreateTipState['step']) => () =>
    setState((s) => ({ ...s, loading: true, step, error: undefined }));
  const fail = (error: string) => setState((s) => ({ ...s, error, step: 'error', loading: false }));

  const createTip = useCallback(
    (data: CreateTipRequest): Promise<Transaction> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'CREATE_TIP_ERROR',
          fallbackMessage: 'Failed to create tip',
          onStart: start('creating'),
          onError: fail,
        },
        async () => {
          const tip = await client.createTip(data);
          setState((s) => ({ ...s, data: tip, step: 'idle', loading: false }));
          return tip;
        }
      ),
    [client, setError, setIsLoading]
  );

  const buildTransaction = useCallback(
    (tipId: string, data: BuildTransactionRequest) =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'BUILD_TRANSACTION_ERROR',
          fallbackMessage: 'Failed to build transaction',
          onStart: start('building'),
          onError: fail,
        },
        async () => {
          const result = await client.buildPaymentTransaction(tipId, data);
          setState((s) => ({ ...s, step: 'idle', loading: false }));
          return result;
        }
      ),
    [client, setError, setIsLoading]
  );

  const submitTransaction = useCallback(
    (tipId: string, envelope: string) =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'SUBMIT_TRANSACTION_ERROR',
          fallbackMessage: 'Failed to submit transaction',
          onStart: start('submitting'),
          onError: fail,
        },
        async () => {
          const result = await client.submitPaymentTransaction(tipId, {
            transactionEnvelope: envelope,
          });
          setState((s) => ({ ...s, step: 'idle', loading: false }));
          return result;
        }
      ),
    [client, setError, setIsLoading]
  );

  const confirmTransaction = useCallback(
    (tipId: string): Promise<Transaction> =>
      runSafely(
        { setError, setIsLoading },
        {
          code: 'CONFIRM_TRANSACTION_ERROR',
          fallbackMessage: 'Failed to confirm transaction',
          onStart: start('confirming'),
          onError: fail,
        },
        async () => {
          const tip = await client.checkTransactionConfirmation(tipId);
          setState((s) => ({ ...s, data: tip, step: 'success', loading: false }));
          return tip;
        }
      ),
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
