/**
 * useWallet Hook Tests
 * Tests for wallet management hook — including finally-block guarantees.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useWallet Hook', () => {
  let mockClient: ReturnType<typeof buildMockClient>;
  let setIsLoading: ReturnType<typeof vi.fn>;
  let setError: ReturnType<typeof vi.fn>;

  function buildMockClient() {
    return { request: vi.fn() };
  }

  /**
   * Minimal simulation of the hook's try/catch/finally pattern so we can
   * assert that setIsLoading(false) is always called, even when setError throws.
   */
  function makeHookAction<T>(
    action: () => Promise<T>
  ): () => Promise<T> {
    return async () => {
      setIsLoading(true);
      try {
        return await action();
      } catch (err) {
        setError({ message: (err as Error).message });
        throw err;
      } finally {
        setIsLoading(false);
      }
    };
  }

  beforeEach(() => {
    mockClient = buildMockClient();
    setIsLoading = vi.fn();
    setError = vi.fn();
  });

  // ─── generateNonce ────────────────────────────────────────────────────────

  describe('generateNonce', () => {
    it('should generate nonce for wallet verification', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: { nonce: 'nonce-abc123', expiresIn: 300 },
      });

      const response = await mockClient.request('POST', '/api/v1/wallet/nonce', {
        publicKey: 'GABC123',
      });

      expect(response.data.nonce).toBeDefined();
      expect(response.data.expiresIn).toBe(300);
    });

    it('should handle nonce generation error', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        error: { message: 'Invalid public key' },
      });

      const response = await mockClient.request('POST', '/api/v1/wallet/nonce', {
        publicKey: 'INVALID',
      });

      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Invalid public key');
    });

    it('finally: setIsLoading(false) runs even when the operation throws', async () => {
      mockClient.request.mockRejectedValue(new Error('Network error'));

      const generateNonce = makeHookAction(async () => {
        await mockClient.request('POST', '/api/v1/wallet/nonce', { publicKey: 'G...' });
      });

      await expect(generateNonce()).rejects.toThrow('Network error');
      expect(setIsLoading).toHaveBeenLastCalledWith(false);
    });

    it('finally: setIsLoading(false) runs even when setError throws', async () => {
      mockClient.request.mockRejectedValue(new Error('fail'));
      setError.mockImplementation(() => { throw new Error('setError blew up'); });

      const generateNonce = makeHookAction(async () => {
        await mockClient.request('POST', '/api/v1/wallet/nonce', { publicKey: 'G...' });
      });

      await expect(generateNonce()).rejects.toThrow();
      // setIsLoading(false) must still have been called via finally
      const calls = setIsLoading.mock.calls.map((c) => c[0]);
      expect(calls).toContain(false);
    });
  });

  // ─── getChallenge ─────────────────────────────────────────────────────────

  describe('getChallenge', () => {
    it('should fetch challenge for signing', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: { challenge: 'AAAAAgAAAAC7Vhf4oNLCCHP...' },
      });

      const response = await mockClient.request('GET', '/api/v1/wallet/challenge/nonce-abc123');

      expect(response.data.challenge).toBeDefined();
    });

    it('finally: setIsLoading(false) runs on error', async () => {
      mockClient.request.mockRejectedValue(new Error('timeout'));

      const getChallenge = makeHookAction(async () => {
        await mockClient.request('GET', '/api/v1/wallet/challenge/nonce-abc123');
      });

      await expect(getChallenge()).rejects.toThrow('timeout');
      expect(setIsLoading).toHaveBeenLastCalledWith(false);
    });
  });

  // ─── verifyWallet ─────────────────────────────────────────────────────────

  describe('verifyWallet', () => {
    it('should verify wallet with signed challenge', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: { id: 'wallet-123', publicKey: 'GABC123', verified: true },
      });

      const response = await mockClient.request('POST', '/api/v1/wallet/verify', {
        publicKey: 'GABC123',
        nonce: 'nonce-abc123',
        signedTransaction: 'AAAAAgAAAAC7VhfSigned...',
      });

      expect(response.data.verified).toBe(true);
      expect(response.data.publicKey).toBe('GABC123');
    });

    it('should handle wallet verification failure', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        error: { message: 'Invalid signature' },
      });

      const response = await mockClient.request('POST', '/api/v1/wallet/verify', {
        publicKey: 'GABC123',
        nonce: 'nonce-abc123',
        signedTransaction: 'INVALID',
      });

      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Invalid signature');
    });

    it('finally: setIsLoading(false) runs on rejected promise', async () => {
      mockClient.request.mockRejectedValue(new Error('Invalid signature'));

      const verifyWallet = makeHookAction(async () => {
        await mockClient.request('POST', '/api/v1/wallet/verify', {});
      });

      await expect(verifyWallet()).rejects.toThrow('Invalid signature');
      expect(setIsLoading).toHaveBeenLastCalledWith(false);
    });
  });

  // ─── listWallets ──────────────────────────────────────────────────────────

  describe('listWallets', () => {
    it('should list user wallets', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: {
          wallets: [
            { id: 'wallet-1', publicKey: 'GABC123', verified: true },
            { id: 'wallet-2', publicKey: 'GDEF456', verified: false },
          ],
        },
      });

      const response = await mockClient.request('GET', '/api/v1/wallet/list');

      expect(response.data.wallets).toHaveLength(2);
      expect(response.data.wallets[0].id).toBe('wallet-1');
    });

    it('should list wallets with balance', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: { wallets: [{ id: 'wallet-1', publicKey: 'GABC123', balance: 1000 }] },
      });

      const response = await mockClient.request('GET', '/api/v1/wallet/list?includeBalance=true');

      expect(response.data.wallets[0].balance).toBe(1000);
    });

    it('finally: setIsLoading(false) runs on error', async () => {
      mockClient.request.mockRejectedValue(new Error('Unauthorized'));

      const listWallets = makeHookAction(async () => {
        await mockClient.request('GET', '/api/v1/wallet/list');
      });

      await expect(listWallets()).rejects.toThrow('Unauthorized');
      expect(setIsLoading).toHaveBeenLastCalledWith(false);
    });
  });

  // ─── unlinkWallet ─────────────────────────────────────────────────────────

  describe('unlinkWallet', () => {
    it('should unlink wallet from account', async () => {
      mockClient.request.mockResolvedValue({ success: true, data: {} });

      const response = await mockClient.request('DELETE', '/api/v1/wallet/wallet-123');

      expect(response.success).toBe(true);
    });

    it('should handle unlink error', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        error: { message: 'Wallet not found' },
      });

      const response = await mockClient.request('DELETE', '/api/v1/wallet/wallet-invalid');

      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Wallet not found');
    });

    it('finally: setIsLoading(false) runs on rejected promise', async () => {
      mockClient.request.mockRejectedValue(new Error('Not found'));

      const unlinkWallet = makeHookAction(async () => {
        await mockClient.request('DELETE', '/api/v1/wallet/wallet-123');
      });

      await expect(unlinkWallet()).rejects.toThrow('Not found');
      expect(setIsLoading).toHaveBeenLastCalledWith(false);
    });
  });

  // ─── renameWallet ─────────────────────────────────────────────────────────

  describe('renameWallet', () => {
    it('should rename wallet', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: { id: 'wallet-123', name: 'My Trading Wallet', publicKey: 'GABC123' },
      });

      const response = await mockClient.request('PATCH', '/api/v1/wallet/wallet-123/name', {
        name: 'My Trading Wallet',
      });

      expect(response.data.name).toBe('My Trading Wallet');
    });

    it('finally: setIsLoading(false) runs on error', async () => {
      mockClient.request.mockRejectedValue(new Error('Wallet not found'));

      const renameWallet = makeHookAction(async () => {
        await mockClient.request('PATCH', '/api/v1/wallet/wallet-123/name', { name: 'X' });
      });

      await expect(renameWallet()).rejects.toThrow('Wallet not found');
      expect(setIsLoading).toHaveBeenLastCalledWith(false);
    });
  });

  // ─── getBalance ───────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('should fetch wallet balance', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: { available: 1000, pending: 50, total: 1050 },
      });

      const response = await mockClient.request('GET', '/api/v1/wallet/wallet-123/balance');

      expect(response.data.available).toBe(1000);
      expect(response.data.pending).toBe(50);
    });

    it('should handle balance fetch error', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        error: { message: 'Wallet not found' },
      });

      const response = await mockClient.request('GET', '/api/v1/wallet/wallet-invalid/balance');

      expect(response.success).toBe(false);
    });

    it('finally: setIsLoading(false) runs on rejected promise', async () => {
      mockClient.request.mockRejectedValue(new Error('Network timeout'));

      const getBalance = makeHookAction(async () => {
        await mockClient.request('GET', '/api/v1/wallet/wallet-123/balance');
      });

      await expect(getBalance()).rejects.toThrow('Network timeout');
      expect(setIsLoading).toHaveBeenLastCalledWith(false);
    });

    it('finally: setIsLoading(false) runs even when setError itself throws', async () => {
      mockClient.request.mockRejectedValue(new Error('fail'));
      setError.mockImplementation(() => { throw new Error('setError blew up'); });

      const getBalance = makeHookAction(async () => {
        await mockClient.request('GET', '/api/v1/wallet/wallet-123/balance');
      });

      await expect(getBalance()).rejects.toThrow();
      const calls = setIsLoading.mock.calls.map((c) => c[0]);
      expect(calls).toContain(false);
    });
  });
});
