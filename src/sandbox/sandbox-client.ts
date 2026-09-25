/**
 * Sandbox Mode Client
 *
 * Convenience wrapper that constructs DorisioClient in sandbox mode.
 * Mock routing and request history are handled by HttpClient.
 */

import { DorisioClient, type ClientConfig } from '../client';
import { ApiResponse } from '../types/api';
import * as MockData from './mock-data';
import type { SandboxHistoryEntry } from './mock-router';

export interface SandboxConfig extends Omit<ClientConfig, 'mode'> {
  mode?: 'sandbox';
  /**
   * Simulate network delays (ms). Set to 0 for instant responses.
   */
  latency?: number;
  /**
   * Seed for deterministic mock data. Same seed = same data.
   */
  seed?: number;
  /**
   * Simulate errors randomly (0-1). 0 = no errors, 0.2 = 20% error rate.
   */
  errorRate?: number;
}

/**
 * Sandbox client — all API methods return mocks, no network I/O.
 *
 * @example
 * ```ts
 * const client = new SandboxClient({
 *   baseUrl: 'https://api.dorisio.com',
 *   latency: 50,
 *   seed: 42,
 * });
 *
 * const tip = await client.createTip({
 *   creatorId: 'mock-creator-123',
 *   amount: 50,
 *   message: 'Test tip',
 * });
 *
 * console.log(client.getSandboxHistory());
 * ```
 */
export class SandboxClient extends DorisioClient {
  private latency: number;
  private seed: number;
  private errorRate: number;
  private requestCounter = 0;
  private history: SandboxHistoryEntry[] = [];

  constructor(config: SandboxConfig) {
    const { latency, seed, errorRate, ...rest } = config;

    super({
      ...rest,
      baseUrl: rest.baseUrl || 'http://sandbox.dorisio.local',
      mode: 'sandbox',
      sandboxSeed: seed,
      sandboxLatency: latency,
      sandboxErrorRate: errorRate,
    });

    this.latency = latency ?? 100;
    this.seed = seed ?? Math.random() * 10000;
    this.errorRate = errorRate ?? 0;
  }

  /**
   * Simulate network delay
   */
  private async simulateLatency(): Promise<void> {
    if (this.latency > 0) {
      return new Promise((resolve) => setTimeout(resolve, this.latency));
    }
  }

  /**
   * Simulate random errors based on errorRate
   */
  private checkError(): void {
    if (Math.random() < this.errorRate) {
      throw new Error('Simulated network error in sandbox mode');
    }
  }

  /**
   * Override request method to return mocked responses
   */
  override async request<T = unknown>(method: string, path: string): Promise<ApiResponse<T>> {
    await this.simulateLatency();
    this.checkError();

    const seed = this.seed + this.requestCounter++;
    let data: unknown;

    if (path.includes('/transactions/tip')) {
      data = MockData.generateMockTip(seed);
    } else if (path.includes('/transactions/history')) {
      data = MockData.generateMockTransactionHistory({ seed });
    } else if (path.includes('/transactions/') && path.includes('/confirm')) {
      data = { ...MockData.generateMockTransaction(seed), status: 'confirmed' };
    } else if (path.includes('/transactions/')) {
      data = MockData.generateMockTransaction(seed);
    } else if (path.includes('/creators/')) {
      data = MockData.generateMockCreator(seed);
    } else if (path.includes('/creators') && method === 'GET') {
      data = MockData.generateMockCreators({ seed });
    } else if (path.includes('/wallet')) {
      data = MockData.generateMockWallet(seed);
    } else if (path.includes('/auth/login')) {
      data = MockData.generateMockSession(seed);
    } else if (path.includes('/auth/register')) {
      data = MockData.generateMockSession(seed);
    } else if (path.includes('/auth/refresh')) {
      data = {
        userId: `sandbox-user-${seed}`,
        email: 'sandbox@example.com',
        token: `sandbox.jwt.${MockData.seededId(seed, 'tok')}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        expiresIn: 86400,
      };
    } else if (path.includes('/auth/validate')) {
      data = MockData.generateMockSession(seed);
    } else if (path.includes('/auth/challenge')) {
      data = MockData.generateMockChallenge();
    } else if (path.includes('/users/me/summary')) {
      const summary = MockData.generateMockAccountSummary(seed);
      data = {
        userId: summary.user.id,
        email: summary.user.email,
        role: summary.user.role,
        balance: {
          total: summary.balance.totalEarnings,
          available: summary.balance.confirmedBalance,
          pending: summary.balance.pendingBalance,
          wallets: summary.wallets.map((wallet) => ({
            walletId: wallet.id,
            available: wallet.balance,
            pending: 0,
            currency: wallet.currency,
          })),
        },
      };
    } else if (path.includes('/users/me')) {
      data = MockData.generateMockUser(seed);
    } else if (path.includes('/users')) {
      data = MockData.generateMockUser(seed);
    } else {
      data = { id: 'mock-response' };
    }

    const response = {
      success: true,
      data: data as T,
      timestamp: new Date().toISOString(),
    };
    this.history.push({
      method,
      path,
      response,
      timestamp: response.timestamp,
      durationMs: 0,
    });
    return response;
  }

  override getSandboxHistory(): readonly SandboxHistoryEntry[] {
    return [...this.history];
  }

  override clearSandboxHistory(): void {
    this.history = [];
  }

  /**
   * Set latency for simulating network delays
   */
  setLatency(latency: number): void {
    this.configureSandbox({ latency });
  }

  /**
   * Set error rate for simulating failures (0-1)
   */
  setErrorRate(errorRate: number): void {
    this.configureSandbox({ errorRate });
  }

  /**
   * Set seed for deterministic responses
   */
  setSeed(seed: number): void {
    this.configureSandbox({ seed });
  }

  /**
   * Get current sandbox configuration
   */
  getSandboxConfig() {
    return {
      mode: this.getMode(),
      isSandbox: this.isSandboxMode(),
      historyLength: this.getSandboxHistory().length,
    };
  }
}

/**
 * Create a sandbox client easily
 *
 * @example
 * ```ts
 * import { createSandboxClient } from 'dorisio-sdk/sandbox';
 *
 * const client = createSandboxClient({
 *   latency: 200,
 *   seed: 42,
 * });
 * ```
 */
export function createSandboxClient(config: Partial<SandboxConfig> = {}) {
  return new SandboxClient({
    ...config,
    mode: 'sandbox',
    baseUrl: config.baseUrl || 'http://sandbox.dorisio.local',
  });
}
