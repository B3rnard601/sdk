import { DorisioClient } from '../client';
import { Creator, Transaction, TransactionHistory } from '../types/models';
import { BalanceInfo } from './balance';

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('concurrency must be at least 1');
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function getCreators(
  this: DorisioClient,
  creatorIds: string[],
  concurrency = 4
): Promise<Creator[]> {
  return mapWithConcurrency(creatorIds, concurrency, (id) => this.getCreator(id));
}

export async function getAllWalletBalances(
  this: DorisioClient,
  walletIds: string[],
  concurrency = 4
): Promise<BalanceInfo[]> {
  return mapWithConcurrency(walletIds, concurrency, (id) => this.getWalletBalance(id));
}

export async function getAllTransactionHistory(
  this: DorisioClient,
  pageSize = 100
): Promise<TransactionHistory> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('pageSize must be between 1 and 100');
  }
  const transactions: Transaction[] = [];
  let page = 1;
  let total = 0;
  let hasMore = true;
  while (hasMore) {
    const result = await this.getTransactionHistory({ page, pageSize });
    transactions.push(...result.transactions);
    total = result.total;
    hasMore = !(
      result.transactions.length === 0 ||
      transactions.length >= total ||
      result.transactions.length < pageSize
    );
    page += 1;
  }
  return { transactions, total, page: 1, pageSize: transactions.length || pageSize };
}
