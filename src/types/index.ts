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
  CreatorListResponse,
  WalletListResponse,
  CreatorEarningsResponse,
} from './models';

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
