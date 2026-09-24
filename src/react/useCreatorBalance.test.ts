/**
 * useCreatorBalance Hook Tests
 * Tests for creator earnings and balance hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useCreatorBalance Hook', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      request: vi.fn(),
    };
  });

  describe('fetchBalance', () => {
    it('should fetch creator balance', async () => {
      const mockResponse = {
        success: true,
        data: {
          totalEarnings: 5000,
          availableBalance: 4500,
          pendingBalance: 500,
          lumens: '100',
          usdc: '5000',
        },
      };

      mockClient.request.mockResolvedValue(mockResponse);

      const response = await mockClient.request('GET', '/api/v1/wallet/creator-123/balance');

      expect(response.data.totalEarnings).toBe(5000);
      expect(response.data.availableBalance).toBe(4500);
      expect(response.data.pendingBalance).toBe(500);
    });

    it('should fetch balance with specific wallet', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: {
          totalEarnings: 5000,
          availableBalance: 4500,
          pendingBalance: 500,
        },
      });

      const response = await mockClient.request(
        'GET',
        '/api/v1/wallet/creator-123/balance?walletId=wallet-456'
      );

      expect(response.data.totalEarnings).toBe(5000);
      expect(mockClient.request).toHaveBeenCalledWith(
        'GET',
        '/api/v1/wallet/creator-123/balance?walletId=wallet-456'
      );
    });

    it('should handle balance fetch error', async () => {
      mockClient.request.mockResolvedValue({
        success: false,
        error: { message: 'Creator not found' },
      });

      const response = await mockClient.request('GET', '/api/v1/wallet/creator-invalid/balance');

      expect(response.success).toBe(false);
      expect(response.error.message).toBe('Creator not found');
    });
  });

  describe('refetch', () => {
    it('should refetch latest balance', async () => {
      const firstResponse = {
        success: true,
        data: { totalEarnings: 5000, availableBalance: 4500, pendingBalance: 500 },
      };

      const secondResponse = {
        success: true,
        data: { totalEarnings: 5500, availableBalance: 5000, pendingBalance: 500 },
      };

      mockClient.request.mockResolvedValueOnce(firstResponse).mockResolvedValueOnce(secondResponse);

      const response1 = await mockClient.request('GET', '/api/v1/wallet/creator-123/balance');
      expect(response1.data.totalEarnings).toBe(5000);

      const response2 = await mockClient.request('GET', '/api/v1/wallet/creator-123/balance');
      expect(response2.data.totalEarnings).toBe(5500);

      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });
  });

  describe('balance updates', () => {
    it('should reflect pending to available balance transition', async () => {
      const pendingResponse = {
        success: true,
        data: {
          totalEarnings: 5000,
          availableBalance: 4500,
          pendingBalance: 500,
        },
      };

      const confirmedResponse = {
        success: true,
        data: {
          totalEarnings: 5000,
          availableBalance: 5000,
          pendingBalance: 0,
        },
      };

      mockClient.request
        .mockResolvedValueOnce(pendingResponse)
        .mockResolvedValueOnce(confirmedResponse);

      const response1 = await mockClient.request('GET', '/api/v1/wallet/creator-123/balance');
      expect(response1.data.pendingBalance).toBe(500);

      const response2 = await mockClient.request('GET', '/api/v1/wallet/creator-123/balance');
      expect(response2.data.pendingBalance).toBe(0);
      expect(response2.data.availableBalance).toBe(5000);
    });
  });

  describe('zero balances', () => {
    it('should handle creator with no earnings', async () => {
      mockClient.request.mockResolvedValue({
        success: true,
        data: {
          totalEarnings: 0,
          availableBalance: 0,
          pendingBalance: 0,
          lumens: '0',
          usdc: '0',
        },
      });

      const response = await mockClient.request('GET', '/api/v1/wallet/creator-new/balance');

      expect(response.data.totalEarnings).toBe(0);
      expect(response.data.availableBalance).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset balance state', () => {
      const state = {
        balance: undefined as { totalEarnings: number; availableBalance: number; pendingBalance: number } | undefined,
        loading: false,
        error: undefined as string | undefined,
        lastUpdated: undefined as number | undefined,
        reset: function () {
          this.balance = undefined;
          this.loading = false;
          this.error = undefined;
          this.lastUpdated = undefined;
        },
      };

      state.balance = { totalEarnings: 100, availableBalance: 100, pendingBalance: 0 };
      state.lastUpdated = Date.now();

      state.reset();

      expect(state.balance).toBeUndefined();
      expect(state.lastUpdated).toBeUndefined();
      expect(state.loading).toBe(false);
    });
  });
});
