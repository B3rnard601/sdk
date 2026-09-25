import { z } from 'zod';

/**
 * Authentication schemas
 */
export const AuthSchemas = {
  /**
   * User login credentials
   */
  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),

  /**
   * User registration data
   */
  register: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required'),
  }),

  /**
   * Wallet linking challenge response
   */
  walletChallenge: z.object({
    challenge: z.string(),
    timeout: z.number().positive(),
  }),

  /**
   * Signed challenge submission
   */
  walletVerification: z.object({
    challenge: z.string(),
    signature: z.string(),
    publicKey: z.string(),
  }),
};

/**
 * Payment schemas
 */
export const PaymentSchemas = {
  /**
   * Create tip request (with optional idempotency key and extra backend fields)
   */
  createTip: z.object({
    amount: z.number().positive('Amount must be greater than 0'),
    currency: z.enum(['USD', 'EUR', 'XLM']),
    creatorId: z.string().uuid('Invalid creator ID'),
    message: z.string().max(500).optional(),
    idempotencyKey: z.string().uuid().optional(),
    timezone: z.string().optional(),
    metadata: z.record(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),

  /**
   * Transaction details
   */
  transaction: z.object({
    id: z.string(),
    hash: z.string(),
    amount: z.number(),
    currency: z.string(),
    status: z.enum(['pending', 'confirmed', 'failed']),
    createdAt: z.date(),
    confirmedAt: z.date().optional(),
  }),

  /**
   * Payment history filter
   */
  historyFilter: z.object({
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    status: z.enum(['pending', 'confirmed', 'failed']).optional(),
    limit: z.number().positive().max(100).default(20),
    offset: z.number().nonnegative().default(0),
  }),
};

/**
 * Creator schemas
 */
export const CreatorSchemas = {
  /**
   * Creator profile
   */
  profile: z.object({
    id: z.string().uuid(),
    username: z.string().min(3).max(50),
    displayName: z.string().min(1).max(100),
    bio: z.string().max(500).optional(),
    verified: z.boolean(),
    walletAddress: z.string().optional(),
  }),

  /**
   * Creator verification request
   */
  verification: z.object({
    creatorId: z.string().uuid(),
    verificationMethod: z.enum(['email', 'phone', 'identity']),
  }),

  /**
   * Creator payout request
   */
  payout: z.object({
    creatorId: z.string().uuid(),
    amount: z.number().positive(),
    currency: z.enum(['USD', 'EUR', 'XLM']),
    destination: z.string(),
  }),
};

/**
 * Wallet schemas
 */
export const WalletSchemas = {
  /**
   * Wallet info
   */
  wallet: z.object({
    address: z.string(),
    network: z.enum(['testnet', 'mainnet']),
    balance: z.number().nonnegative(),
    currency: z.string(),
  }),

  /**
   * Wallet link request
   */
  linkWallet: z.object({
    publicKey: z.string(),
    network: z.enum(['testnet', 'mainnet']),
  }),
};

// ---------------------------------------------------------------------------
// Response schemas — used to validate raw API data before normalising
// ---------------------------------------------------------------------------

/**
 * Raw API response shape for a User entity.
 */
export const ApiUserSchema = z.object({
  id: z.string(),
  email: z.string().optional().default(''),
  name: z.string().nullable().optional(),
  role: z.enum(['fan', 'creator', 'admin']).catch('fan'),
  verified: z.boolean().optional().default(false),
  avatar: z.string().nullable().optional(),
  createdAt: z.string().optional().default(new Date().toISOString()),
  updatedAt: z.string().optional(),
});

/**
 * Raw API response shape for a Creator entity.
 */
export const ApiCreatorSchema = z.object({
  id: z.string(),
  userId: z.string().optional().default(''),
  username: z.string().optional().default(''),
  displayName: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  verified: z.boolean().optional().default(false),
  isPublic: z.boolean().optional().default(true),
  totalEarnings: z.number().optional().default(0),
  pendingBalance: z.number().optional().default(0),
  createdAt: z.string().optional().default(new Date().toISOString()),
  updatedAt: z.string().optional(),
});

/**
 * Raw API response shape for a Wallet entity.
 */
export const ApiWalletSchema = z.object({
  id: z.string(),
  userId: z.string().optional().default(''),
  publicKey: z.string().optional().default(''),
  name: z.string().nullable().optional(),
  verified: z.boolean().optional().default(false),
  createdAt: z.string().optional().default(new Date().toISOString()),
  updatedAt: z.string().optional(),
});

/**
 * Raw API response shape for a Transaction entity.
 */
export const ApiTransactionSchema = z.object({
  id: z.string(),
  fromUserId: z.string().optional().default(''),
  creatorId: z.string().optional().default(''),
  amount: z.number().optional().default(0),
  message: z.string().nullable().optional(),
  /** Backend may use stellarStatus or status; also accept 'completed' from updateTipStatus */
  stellarStatus: z.enum(['pending', 'confirmed', 'failed']).optional(),
  status: z.string().optional(),
  stellarTxHash: z.string().nullable().optional(),
  createdAt: z.string().optional().default(new Date().toISOString()),
  updatedAt: z.string().optional(),
});

/**
 * Raw API response shape for a paginated list-creators endpoint.
 */
export const ApiListCreatorsSchema = z.object({
  creators: z.array(ApiCreatorSchema),
  total: z.number().optional().default(0),
  page: z.number().optional().default(1),
  pageSize: z.number().optional().default(20),
});

/**
 * Raw API response shape for a paginated transaction history endpoint.
 */
export const ApiTransactionHistorySchema = z.object({
  transactions: z.array(ApiTransactionSchema),
  total: z.number().optional().default(0),
  page: z.number().optional().default(1),
  pageSize: z.number().optional().default(20),
});

/**
 * Raw API response shape for a transaction stats endpoint.
 */
export const ApiTransactionStatsSchema = z.object({
  totalTransactions: z.number().optional().default(0),
  totalAmount: z.number().optional().default(0),
  averageAmount: z.number().optional().default(0),
  lastTransactionDate: z.string().nullable().optional(),
});

/**
 * Raw API response for a session / auth endpoint.
 */
export const ApiSessionSchema = z.object({
  userId: z.string(),
  email: z.string(),
  token: z.string(),
  expiresAt: z.string(),
  expiresIn: z.number().optional().default(3600),
});

/**
 * Raw API response for a session-expiry endpoint.
 */
export const ApiSessionExpirySchema = z.object({
  expiresAt: z.string(),
  expiresIn: z.number().optional().default(0),
});

/**
 * Raw API response for a balance entity.
 */
export const ApiBalanceInfoSchema = z.object({
  walletId: z.string(),
  available: z.number().optional().default(0),
  pending: z.number().optional().default(0),
  currency: z.string().optional().default('USDC'),
});

export const ApiAccountBalanceSchema = z.object({
  total: z.number().optional().default(0),
  available: z.number().optional().default(0),
  pending: z.number().optional().default(0),
  wallets: z.array(ApiBalanceInfoSchema).optional().default([]),
});

/**
 * Raw API response for creator earnings endpoint.
 */
export const ApiCreatorEarningsSchema = z.object({
  totalEarnings: z.number().optional().default(0),
  pendingBalance: z.number().optional().default(0),
  confirmedBalance: z.number().optional().default(0),
  transactionCount: z.number().optional().default(0),
});

/**
 * Raw API response for creator pending payout endpoint.
 */
export const ApiCreatorPendingPayoutSchema = z.object({
  pending: z.number().optional().default(0),
  nextPayoutDate: z.string().optional(),
  minimumThreshold: z.number().optional().default(10),
});

/**
 * Raw API response for account summary endpoint.
 */
export const ApiAccountSummarySchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.string().optional().default('fan'),
  balance: ApiAccountBalanceSchema.optional(),
  totalTipsSent: z.number().optional(),
  totalEarnings: z.number().optional(),
  lastActivityDate: z.string().optional(),
});

/**
 * Raw API response for verification status endpoint.
 */
export const ApiVerificationStatusSchema = z.object({
  verified: z.boolean().optional().default(false),
  verifiedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  status: z.string().optional(),
});

/**
 * Raw API response for wallet verification challenge endpoint.
 */
export const ApiWalletChallengeSchema = z.object({
  challenge: z.string(),
  expiresIn: z.number().optional().default(300),
});

/**
 * Combine all schemas into a single export
 */
export const Schemas = {
  Auth: AuthSchemas,
  Payment: PaymentSchemas,
  Creator: CreatorSchemas,
  Wallet: WalletSchemas,
};

/**
 * Type inference helpers for commonly used schemas
 */
export type CreateTipInput = z.infer<typeof PaymentSchemas.createTip>;
export type TransactionDetails = z.infer<typeof PaymentSchemas.transaction>;
export type CreatorProfile = z.infer<typeof CreatorSchemas.profile>;
export type WalletInfo = z.infer<typeof WalletSchemas.wallet>;

// Inferred types for API response schemas
export type ApiUser = z.infer<typeof ApiUserSchema>;
export type ApiCreator = z.infer<typeof ApiCreatorSchema>;
export type ApiWallet = z.infer<typeof ApiWalletSchema>;
export type ApiTransaction = z.infer<typeof ApiTransactionSchema>;
export type ApiListCreators = z.infer<typeof ApiListCreatorsSchema>;
export type ApiTransactionHistory = z.infer<typeof ApiTransactionHistorySchema>;
export type ApiTransactionStats = z.infer<typeof ApiTransactionStatsSchema>;
export type ApiSession = z.infer<typeof ApiSessionSchema>;
export type ApiBalanceInfo = z.infer<typeof ApiBalanceInfoSchema>;
export type ApiAccountBalance = z.infer<typeof ApiAccountBalanceSchema>;
