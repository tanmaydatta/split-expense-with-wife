import { getDb } from '../db';
import { groups, transactions, transactionUsers, budget, userBalances, budgetTotals } from '../db/schema/schema';
import { user, session, account, verification } from '../db/schema/auth-schema';
import { sql } from 'drizzle-orm';
import { auth } from '../auth';

// Test user credentials that can be reused across tests
const TEST_USERS = {
  user1: {
    email: 'testuser@example.com',
    password: 'testpass',
    name: 'Test User',
    firstName: 'Test1',
    lastName: 'User'
  },
  user2: {
    email: 'testuser2@example.com',
    password: 'testpass',
    name: 'Test User 2',
    firstName: 'Test2',
    lastName: 'User 2'
  },
  user3: {
    email: 'testuser3@example.com',
    password: 'testpass',
    name: 'Test User 3',
    firstName: 'Test3',
    lastName: 'User 3'
  },
  user4: {
    email: 'testuser4@example.com',
    password: 'testpass',
    name: 'Test User 4',
    firstName: 'Test4',
    lastName: 'User 4'
  }
} as const;

// Database setup and management utilities for tests

export function createMockRequest(method: string, body?: object, cookies?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  // Don't include body for GET or HEAD requests
  const requestInit: RequestInit = {
    method,
    headers
  };

  if (body && method !== 'GET' && method !== 'HEAD') {
    requestInit.body = JSON.stringify(body);
  }

  return new Request('https://localhost:8787/test', requestInit);
}

// Legacy function for backward compatibility with tests - now uses cookies
export function createTestRequest(
  endpoint: string,
  method: string = 'POST',
  body?: unknown,
  cookies?: string,
  isNetlifyFunction: boolean = true
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (cookies) {
    headers['Cookie'] = cookies;
  }

  const url = isNetlifyFunction
    ? `https://localhost:8787/.netlify/functions/${endpoint}`
    : `https://localhost:8787/api/${endpoint}`;

  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

// Helper function to setup the database schema
export async function setupDatabase(env: Env): Promise<void> {
  // Create better-auth tables first (in correct order for foreign keys)

  // User table (better-auth)
  await env.DB.exec('CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, username TEXT UNIQUE, display_username TEXT, groupid INTEGER, first_name TEXT NOT NULL, last_name TEXT NOT NULL)');

  // Session table (better-auth)
  await env.DB.exec('CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE)');

  // Account table (better-auth)
  await env.DB.exec('CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE)');

  // Verification table (better-auth)
  await env.DB.exec('CREATE TABLE IF NOT EXISTS verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER, updated_at INTEGER)');

  // Create legacy tables (for backward compatibility during migration)
  await env.DB.exec("CREATE TABLE IF NOT EXISTS budget (id INTEGER PRIMARY KEY AUTOINCREMENT, description VARCHAR(100) NOT NULL, added_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, price VARCHAR(100), amount REAL NOT NULL, name VARCHAR(100) NOT NULL, deleted DATETIME DEFAULT NULL, groupid INTEGER NOT NULL DEFAULT 1, currency VARCHAR(10) DEFAULT 'GBP' NOT NULL)");
  await env.DB.exec('CREATE TABLE IF NOT EXISTS groups (groupid INTEGER PRIMARY KEY AUTOINCREMENT, group_name VARCHAR(50) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, userids VARCHAR(1000), budgets VARCHAR(1000), metadata TEXT)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS sessions_old (username VARCHAR(255) NOT NULL, sessionid VARCHAR(255) NOT NULL, expiry_time DATETIME NOT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS transaction_users (transaction_id VARCHAR(100) NOT NULL, user_id INTEGER NOT NULL, amount DECIMAL(10,2) NOT NULL, owed_to_user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, currency VARCHAR(10) NOT NULL, deleted DATETIME DEFAULT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, description VARCHAR(255) NOT NULL, amount DECIMAL(10,2) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, metadata TEXT, currency VARCHAR(10) NOT NULL, transaction_id VARCHAR(100), group_id INTEGER NOT NULL, deleted DATETIME DEFAULT NULL)');
  await env.DB.exec('CREATE TABLE IF NOT EXISTS users_old (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(50) NOT NULL, password VARCHAR(255) NOT NULL, first_name VARCHAR(50), last_name VARCHAR(50), groupid INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)');

  // Create materialized views for performance
  await env.DB.exec('CREATE TABLE IF NOT EXISTS user_balances (group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, owed_to_user_id INTEGER NOT NULL, currency VARCHAR(10) NOT NULL, balance REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, user_id, owed_to_user_id, currency))');

  // Create budget totals table
  await env.DB.exec('CREATE TABLE IF NOT EXISTS budget_totals (group_id INTEGER NOT NULL, name VARCHAR(100) NOT NULL, currency VARCHAR(10) NOT NULL, total_amount REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, name, currency))');

  // Create indexes for performance
  await env.DB.exec('CREATE INDEX IF NOT EXISTS user_balances_group_user_idx ON user_balances (group_id, user_id, currency)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS transaction_users_balances_idx ON transaction_users (group_id, deleted, user_id, owed_to_user_id, currency)');
  await env.DB.exec('CREATE INDEX IF NOT EXISTS budget_totals_group_name_idx ON budget_totals (group_id, name)');
}

// Clean up database for tests
export async function cleanupDatabase(env: Env): Promise<void> {
  const db = getDb(env);

  // Clean better-auth tables first (delete child tables before parent due to foreign keys)
  await db.delete(session); // Child table (references user)
  await db.delete(account); // Child table (references user)
  await db.delete(verification); // Independent table
  await db.delete(user); // Parent table

  // Clean legacy tables
  await db.delete(transactionUsers);
  await db.delete(transactions);
  await db.delete(budget);
  await db.delete(groups);
  await db.delete(userBalances);
  await db.delete(budgetTotals);
}

// Setup and clean database for testing - convenience function
export async function setupAndCleanDatabase(env: Env): Promise<void> {
  await setupDatabase(env);
  await cleanupDatabase(env);
}

// Create test user and group data
export async function createTestUserData(env: Env): Promise<Record<string, Record<string, string>>> {
  const authInstance = auth(env);
  const user1 = await authInstance.api.signUpEmail({
    body: {
      ...TEST_USERS.user1,
      groupid: 1
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  const user2 = await authInstance.api.signUpEmail({
    body: {
      ...TEST_USERS.user2,
      groupid: 1
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  const user3 = await authInstance.api.signUpEmail({
    body: {
      ...TEST_USERS.user3,
      groupid: 1
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  const user4 = await authInstance.api.signUpEmail({
    body: {
      ...TEST_USERS.user4,
      groupid: 1
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  const db = getDb(env);

  await db.insert(groups).values({
    groupid: 1,
    groupName: 'Test Group',
    userids: `["${user1.user.id}", "${user2.user.id}", "${user3.user.id}", "${user4.user.id}"]`,
    budgets: '["house", "food"]',
    metadata: `{"defaultShare": {"${user1.user.id}": 25, "${user2.user.id}": 25, "${user3.user.id}": 25, "${user4.user.id}": 25}, "defaultCurrency": "USD"}`
  });

  return {
    user1: { ...TEST_USERS.user1, id: user1.user.id },
    user2: { ...TEST_USERS.user2, id: user2.user.id },
    user3: { ...TEST_USERS.user3, id: user3.user.id },
    user4: { ...TEST_USERS.user4, id: user4.user.id }
  };
}

// Populate materialized tables for balance calculation
export async function populateMaterializedTables(env: Env): Promise<void> {
  const db = getDb(env);

  // Clear existing data
  await db.delete(userBalances);
  await db.delete(budgetTotals);

  // Rebuild user balances from transaction data
  await db.run(sql`
    INSERT INTO user_balances (group_id, user_id, owed_to_user_id, currency, balance, updated_at)
    SELECT
      group_id,
      user_id,
      owed_to_user_id,
      currency,
      SUM(amount) as balance,
      datetime('now') as updated_at
    FROM transaction_users
    WHERE deleted IS NULL
    GROUP BY group_id, user_id, owed_to_user_id, currency
    HAVING SUM(amount) != 0
  `);

  // Rebuild budget totals
  await db.run(sql`
    INSERT INTO budget_totals (group_id, name, currency, total_amount, updated_at)
    SELECT
      groupid as group_id,
      name,
      currency,
      SUM(amount) as total_amount,
      datetime('now') as updated_at
    FROM budget
    WHERE deleted IS NULL
    GROUP BY groupid, name, currency
  `);
}

// Better-auth sign-in and cookie extraction utility
export async function signInAndGetCookies(env: Env, email: string, password: string): Promise<string> {
  const authInstance = auth(env);
  const signInRequest = new Request('http://localhost:8787/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password
    })
  });

  const signInResponse = await authInstance.handler(signInRequest);

  if (signInResponse.status !== 200) {
    throw new Error(`Sign-in failed with status ${signInResponse.status} for user ${email}`);
  }

  // Extract session cookies from the sign-in response
  const setCookieHeaders = signInResponse.headers.get('Set-Cookie');
  if (!setCookieHeaders) {
    throw new Error('No session cookies received from sign in');
  }

  return setCookieHeaders;
}
