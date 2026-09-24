/**
 * Mock Data Generators for Sandbox Mode
 *
 * Generates realistic mock responses for testing without hitting testnet.
 */

import { v4 as uuidv4 } from 'uuid';

export interface MockDataOptions {
  count?: number;
  seed?: number;
}

/**
 * Pseudo-random number generator seeded by value
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Mock transaction generator
 */
export function generateMockTransaction(seed = Math.random() * 10000) {
  const id = uuidv4();
  const createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);

  return {
    id,
    amount: Math.floor(seededRandom(seed) * 500) + 1,
    currency: 'USD',
    status: (['pending', 'confirmed', 'failed'] as const)[Math.floor(seededRandom(seed + 1) * 3)] ?? 'pending',
    creatorId: uuidv4(),
    senderId: uuidv4(),
    message: [
      'Great content!',
      'Love your work',
      'Keep it up!',
      'Amazing video',
      'Thanks for sharing',
      undefined,
    ][Math.floor(seededRandom(seed + 2) * 6)],
    transactionHash: `0x${Math.random().toString(16).substring(2).padEnd(64, '0')}`,
    createdAt,
    confirmedAt: ['confirmed', 'failed'].includes(
      (['pending', 'confirmed', 'failed'] as const)[Math.floor(seededRandom(seed + 1) * 3)] ?? 'pending'
    )
      ? new Date(createdAt.getTime() + 5 * 60 * 1000)
      : null,
  };
}

/**
 * Mock transactions history generator
 */
export function generateMockTransactionHistory(options: MockDataOptions = {}) {
  const count = options.count || 20;
  const transactions = Array.from({ length: count }, (_, i) =>
    generateMockTransaction((options.seed || 0) + i)
  );

  return {
    transactions,
    total: Math.floor(Math.random() * 1000),
    page: 1,
    pageSize: count,
  };
}

/**
 * Mock creator generator
 */
export function generateMockCreator(seed = Math.random() * 10000) {
  const names = [
    'Alice Creator',
    'Bob Developer',
    'Carol Artist',
    'Dave Musician',
    'Eve Designer',
  ];
  const name = names[Math.floor(seededRandom(seed) * names.length)] ?? 'Alice Creator';

  return {
    id: uuidv4(),
    username: name.toLowerCase().replace(' ', '_'),
    displayName: name,
    bio: 'Creating amazing content for the community',
    verified: seededRandom(seed + 1) > 0.3,
    walletAddress: `GA${Math.random().toString(36).substring(2).toUpperCase().padEnd(56, '0')}`,
    totalEarnings: Math.floor(seededRandom(seed + 2) * 10000),
    followerCount: Math.floor(seededRandom(seed + 3) * 100000),
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Mock creators list generator
 */
export function generateMockCreators(options: MockDataOptions = {}) {
  const count = options.count || 10;
  const creators = Array.from({ length: count }, (_, i) =>
    generateMockCreator((options.seed || 0) + i)
  );

  return {
    creators,
    total: Math.floor(Math.random() * 100),
    page: 1,
    pageSize: count,
  };
}

/**
 * Mock wallet generator
 */
export function generateMockWallet(seed = Math.random() * 10000) {
  return {
    id: uuidv4(),
    address: `GA${Math.random().toString(36).substring(2).toUpperCase().padEnd(56, '0')}`,
    network: seededRandom(seed) > 0.5 ? 'mainnet' : 'testnet',
    balance: Math.floor(seededRandom(seed + 1) * 10000),
    currency: 'XLM',
    verified: true,
    linkedAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Mock user generator
 */
export function generateMockUser(seed = Math.random() * 10000) {
  const firstNames = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];
  const firstName = firstNames[Math.floor(seededRandom(seed) * firstNames.length)] ?? 'Alice';
  const lastName = lastNames[Math.floor(seededRandom(seed + 1) * lastNames.length)] ?? 'Smith';

  return {
    id: uuidv4(),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    name: `${firstName} ${lastName}`,
    role: ['fan', 'creator', 'admin'][Math.floor(seededRandom(seed + 2) * 3)],
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
    verified: seededRandom(seed + 3) > 0.2,
  };
}

/**
 * Mock session info generator
 */
export function generateMockSession(seed = Math.random() * 10000) {
  return {
    token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Math.random()
      .toString(36)
      .substring(2)}_${Math.random().toString(36).substring(2)}`,
    user: generateMockUser(seed),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

/**
 * Mock creator balance generator
 */
export function generateMockCreatorBalance(seed = Math.random() * 10000) {
  return {
    totalEarnings: Math.floor(seededRandom(seed) * 50000),
    pendingBalance: Math.floor(seededRandom(seed + 1) * 5000),
    confirmedBalance: Math.floor(seededRandom(seed + 2) * 45000),
    lumens: Math.floor(seededRandom(seed + 3) * 1000),
    usdc: Math.floor(seededRandom(seed + 4) * 10000),
  };
}

/**
 * Mock verification status generator
 */
export function generateMockVerificationStatus(seed = Math.random() * 10000) {
  const statuses = ['unverified', 'pending', 'verified'];
  return {
    status: statuses[Math.floor(seededRandom(seed) * statuses.length)],
    verifiedAt:
      seededRandom(seed + 1) > 0.3
        ? new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000)
        : null,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Mock challenge response generator
 */
export function generateMockChallenge() {
  return {
    challenge: uuidv4(),
    timeout: 5 * 60 * 1000, // 5 minutes
  };
}

/**
 * Mock tip response generator
 */
export function generateMockTip(seed = Math.random() * 10000) {
  const status = ['pending', 'confirmed', 'failed'];
  return {
    id: uuidv4(),
    amount: Math.floor(seededRandom(seed) * 500) + 1,
    currency: 'USD',
    creatorId: uuidv4(),
    senderId: uuidv4(),
    message: 'Thank you!',
    status: status[Math.floor(seededRandom(seed + 1) * status.length)],
    transactionHash: `0x${Math.random().toString(16).substring(2).padEnd(64, '0')}`,
    createdAt: new Date(),
    confirmedAt: null,
  };
}
