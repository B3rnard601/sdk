/**
 * Dorisio SDK
 *
 * Client library for Dorisio payment infrastructure.
 * Provides type-safe API client and utilities for integrating Dorisio payments.
 */

export const SDK_VERSION = '0.1.0';

// Re-export client and utilities
export { DorisioClient, type ClientConfig } from './client';

// Re-export types
export type { ApiResponse, PaginationMeta, PaginatedResponse } from './types/api';
export {
  ApiError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  NetworkError,
  TimeoutError,
  DorisioError,
  AuthError,
  WalletVerificationError,
  PaymentError,
  RateLimitError,
} from './types/errors';

// Re-export domain models
export type {
  User,
  UserProfile,
  UpdateUserRequest,
  Wallet,
  CreateWalletRequest,
  UpdateWalletRequest,
  Creator,
  CreatorWithUser,
  CreatorProfile,
  CreateCreatorRequest,
  UpdateCreatorRequest,
  Transaction,
  TransactionWithDetails,
  TransactionHistory,
  TransactionStats,
  CreatorListResponse,
  WalletListResponse,
  CreatorEarningsResponse,
  TipRequest,
  CreateTipRequest,
} from './types';

// Re-export utils
export { ApiErrorHandler, RequestValidator } from './utils';

// Re-export webhook utilities
export {
  verifyWebhookSignature,
  parseWebhookPayload,
  WebhookEventType,
  type WebhookPayload,
  type WebhookEventHandler,
} from './utils/webhook-verifier';

// Re-export validation schemas for consumer use
export {
  Schemas,
  AuthSchemas,
  PaymentSchemas,
  CreatorSchemas,
  WalletSchemas,
  type CreateTipInput,
  type TransactionDetails,
  type WalletInfo,
} from './types/schemas';

// Re-export sandbox utilities
export { SandboxClient, createSandboxClient, type SandboxConfig } from './sandbox/sandbox-client';
export * as MockData from './sandbox/mock-data';

// Re-export query utilities
export {
  buildQueryString,
  parsePaginationMeta,
  listTips,
  listCreators,
  listCreatorTips,
  listVerifiedCreators,
  createPaginator,
  Paginator,
  type QueryOptions,
  type PaginationResult,
} from './lib/query-builder';

// Re-export mappers
export {
  CreatorMapper,
  UserMapper,
  TransactionMapper,
  WalletMapper,
  ResponseMapper,
} from './utils/mappers';

// Re-export normalizers
export {
  normalizeCreatorProfile,
  normalizeCreator,
  normalizeCreators,
  normalizeUser,
  normalizeWallet,
  normalizeWallets,
  normalizeTransaction,
  normalizeTransactions,
} from './utils/normalizers';

// Re-export transaction normalizers
export {
  normalizeTransactionHistoryResponse,
  calculatePaginationMetadata,
  normalizeTransactionWithDetails,
  normalizeTransactionsWithDetails,
  calculateTransactionStats,
  filterTransactionsByStatus,
  filterTransactionsByDateRange,
  groupTransactionsByCreator,
  enrichTransactionHistory,
} from './utils/transaction-normalizers';

// Re-export client method types
export type { BalanceInfo, AccountBalance } from './client/balance';
export type { VerificationStatus } from './client/verification';
export type { SessionInfo } from './client/auth';
