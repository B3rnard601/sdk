/**
 * Dorisio SDK Types
 *
 * Public type exports for SDK consumers.
 * Re-exports all domain models and request/response types.
 */

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
} from './models';

import type { Transaction as TransactionModel } from './models';

/** A tip is a transaction. */
export type Tip = TransactionModel;

export type {
  Paginator,
  PageFetcher,
  PageItem,
  PaginationResult,
  QueryOptions,
} from '../lib/query-builder';

export type { TipRequest, CreateTipRequest } from './requests';
export type { ApiResponse, PaginationMeta, PaginatedResponse } from './api';
export {
  DorisioError,
  AuthError,
  WalletVerificationError,
  PaymentError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  ApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  NetworkError,
} from './errors';

// Schema exports for consumer validation
export {
  Schemas,
  AuthSchemas,
  PaymentSchemas,
  CreatorSchemas,
  WalletSchemas,
  type CreateTipInput,
  type TransactionDetails,
  type CreatorProfile as CreatorProfileSchema,
  type WalletInfo,
} from './schemas';
