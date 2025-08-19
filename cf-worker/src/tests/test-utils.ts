import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { auth } from "../auth";
import { getDb } from "../db";
import { account, session, user, verification } from "../db/schema/auth-schema";
import {
	budgetEntries,
	budgetTotals,
	groupBudgets,
	groups,
	scheduledActionHistory,
	scheduledActions,
	transactions,
	transactionUsers,
	userBalances,
} from "../db/schema/schema";

// Test user credentials that can be reused across tests
const TEST_USERS = {
	user1: {
		email: "testuser@example.com",
		password: "testpass",
		name: "Test User",
		firstName: "Test1",
		lastName: "User",
	},
	user2: {
		email: "testuser2@example.com",
		password: "testpass",
		name: "Test User 2",
		firstName: "Test2",
		lastName: "User 2",
	},
	user3: {
		email: "testuser3@example.com",
		password: "testpass",
		name: "Test User 3",
		firstName: "Test3",
		lastName: "User 3",
	},
	user4: {
		email: "testuser4@example.com",
		password: "testpass",
		name: "Test User 4",
		firstName: "Test4",
		lastName: "User 4",
	},
} as const;

// Database setup and management utilities for tests

export function createMockRequest(
	method: string,
	body?: object,
	cookies?: string,
): Request {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (cookies) {
		// biome-ignore lint/complexity/useLiteralKeys: dynamic header assignment
		headers["Cookie"] = cookies;
	}

	// Don't include body for GET or HEAD requests
	const requestInit: RequestInit = {
		method,
		headers,
	};

	if (body && method !== "GET" && method !== "HEAD") {
		requestInit.body = JSON.stringify(body);
	}

	return new Request("https://localhost:8787/test", requestInit);
}

// Legacy function for backward compatibility with tests - now uses cookies
export function createTestRequest(
	endpoint: string,
	method = "POST",
	body?: unknown,
	cookies?: string,
	isNetlifyFunction = true,
): Request {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (cookies) {
		// biome-ignore lint/complexity/useLiteralKeys: dynamic header assignment
		headers["Cookie"] = cookies;
	}

	const url = isNetlifyFunction
		? `https://localhost:8787/.netlify/functions/${endpoint}`
		: `https://localhost:8787/api/${endpoint}`;

	return new Request(url, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
}

// Helper function to setup the database schema
export async function setupDatabase(env: Env): Promise<void> {
	// Create better-auth tables first (in correct order for foreign keys)

	// User table (better-auth)
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, username TEXT UNIQUE, display_username TEXT, groupid TEXT, first_name TEXT NOT NULL, last_name TEXT NOT NULL)",
	);

	// Session table (better-auth)
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE)",
	);

	// Account table (better-auth)
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE)",
	);

	// Verification table (better-auth)
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER, updated_at INTEGER)",
	);

	// Create legacy tables (for backward compatibility during migration)
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS budget_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, budget_entry_id VARCHAR(100), description VARCHAR(100) NOT NULL, added_time DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, price VARCHAR(100), amount REAL NOT NULL, name VARCHAR(100) NOT NULL, deleted DATETIME DEFAULT NULL, groupid TEXT NOT NULL, currency VARCHAR(10) DEFAULT 'GBP' NOT NULL)",
	);
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS groups (groupid TEXT PRIMARY KEY, group_name VARCHAR(50) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, userids VARCHAR(1000), metadata TEXT)",
	);
	
	// Create new group_budgets table
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS group_budgets (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, budget_name TEXT NOT NULL, description TEXT, created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL, updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL, deleted TEXT, FOREIGN KEY (group_id) REFERENCES groups(groupid))",
	);
	
	// Create indexes for group_budgets table
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS group_budgets_group_id_idx ON group_budgets (group_id)",
	);
	await env.DB.exec(
		"CREATE UNIQUE INDEX IF NOT EXISTS group_budgets_group_name_active_idx ON group_budgets (group_id, budget_name) WHERE deleted IS NULL",
	);
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS sessions_old (username VARCHAR(255) NOT NULL, sessionid VARCHAR(255) NOT NULL, expiry_time DATETIME NOT NULL)",
	);
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS transaction_users (transaction_id VARCHAR(100) NOT NULL, user_id TEXT NOT NULL, amount DECIMAL(10,2) NOT NULL, owed_to_user_id TEXT NOT NULL, group_id TEXT NOT NULL, currency VARCHAR(10) NOT NULL, deleted DATETIME DEFAULT NULL)",
	);
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, description VARCHAR(255) NOT NULL, amount DECIMAL(10,2) NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, metadata TEXT, currency VARCHAR(10) NOT NULL, transaction_id VARCHAR(100), group_id TEXT NOT NULL, deleted DATETIME DEFAULT NULL)",
	);
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS users_old (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(50) NOT NULL, password VARCHAR(255) NOT NULL, first_name VARCHAR(50), last_name VARCHAR(50), groupid TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)",
	);

	// Create materialized views for performance
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS user_balances (group_id TEXT NOT NULL, user_id TEXT NOT NULL, owed_to_user_id TEXT NOT NULL, currency VARCHAR(10) NOT NULL, balance REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, user_id, owed_to_user_id, currency))",
	);

	// Create budget totals table
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS budget_totals (group_id TEXT NOT NULL, name VARCHAR(100) NOT NULL, currency VARCHAR(10) NOT NULL, total_amount REAL NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY (group_id, name, currency))",
	);

	// Create scheduled actions tables
	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS scheduled_actions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action_type TEXT NOT NULL, frequency TEXT NOT NULL, start_date TEXT NOT NULL, is_active INTEGER DEFAULT 1 NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, action_data TEXT NOT NULL, last_executed_at TEXT, next_execution_date TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE no action)",
	);

	await env.DB.exec(
		"CREATE TABLE IF NOT EXISTS scheduled_action_history (id TEXT PRIMARY KEY, scheduled_action_id TEXT NOT NULL, user_id TEXT NOT NULL, action_type TEXT NOT NULL, executed_at TEXT NOT NULL, execution_status TEXT NOT NULL, workflow_instance_id TEXT, workflow_status TEXT, action_data TEXT NOT NULL, result_data TEXT, error_message TEXT, execution_duration_ms INTEGER, FOREIGN KEY (scheduled_action_id) REFERENCES scheduled_actions(id) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE no action)",
	);

	// Create indexes for performance
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS user_balances_group_user_idx ON user_balances (group_id, user_id, currency)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS transaction_users_balances_idx ON transaction_users (group_id, deleted, user_id, owed_to_user_id, currency)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS budget_totals_group_name_idx ON budget_totals (group_id, name)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS scheduled_actions_user_next_execution_idx ON scheduled_actions (user_id, next_execution_date)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS scheduled_actions_user_active_idx ON scheduled_actions (user_id, is_active)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS scheduled_action_history_user_executed_idx ON scheduled_action_history (user_id, executed_at)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS scheduled_action_history_scheduled_action_idx ON scheduled_action_history (scheduled_action_id, executed_at)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS scheduled_action_history_status_idx ON scheduled_action_history (execution_status)",
	);
	await env.DB.exec(
		"CREATE INDEX IF NOT EXISTS scheduled_action_history_workflow_instance_idx ON scheduled_action_history (workflow_instance_id)",
	);
}

// Complete database cleanup - ensures total isolation between tests
export async function completeCleanupDatabase(env: Env): Promise<void> {
	const db = getDb(env);
	// Delete data from all tables in reverse order of creation/dependency
	await db.delete(scheduledActionHistory);
	await db.delete(scheduledActions);
	await db.delete(session); // Delete sessions before users
	await db.delete(account);
	await db.delete(verification);
	await db.delete(user);
	await db.delete(budgetTotals);
	await db.delete(userBalances);
	await db.delete(transactionUsers);
	await db.delete(transactions);
	await db.delete(budgetEntries);
	await db.delete(groupBudgets); // Delete group budgets before groups
	await db.delete(groups);

	// Reset autoincrement sequence for tables that have it
	try {
		await db.run(
			sql`DELETE FROM sqlite_sequence WHERE name IN ('budget_entries', 'groups', 'transactions')`,
		);
	} catch (_error) {
		// Ignore if sqlite_sequence doesn't exist (e.g., first run)
	}
}

// Setup and clean database for testing - convenience function
export async function setupAndCleanDatabase(env: Env): Promise<void> {
	// This function is now simplified to just set up the database.
	// Cleanup is handled by completeCleanupDatabase in beforeEach.
	await setupDatabase(env);
}

// Create test user and group data
export async function createTestUserData(
	env: Env,
): Promise<{
	user1: Record<string, string>;
	user2: Record<string, string>;
	user3: Record<string, string>;
	user4: Record<string, string>;
	testGroupId: string;
}> {
	const authInstance = auth(env);
	const emails = [
		generateEmail(),
		generateEmail(),
		generateEmail(),
		generateEmail(),
	];
	const testGroupId = ulid();
	try {
		const user1 = await authInstance.api.signUpEmail({
			body: {
				...TEST_USERS.user1,
				groupid: testGroupId,
				email: emails[0],
				// biome-ignore lint/suspicious/noExplicitAny: test user type assertion
			} as any,
		});
		const user2 = await authInstance.api.signUpEmail({
			body: {
				...TEST_USERS.user2,
				groupid: testGroupId,
				email: emails[1],
				// biome-ignore lint/suspicious/noExplicitAny: test user type assertion
			} as any,
		});
		const user3 = await authInstance.api.signUpEmail({
			body: {
				...TEST_USERS.user3,
				groupid: testGroupId,
				email: emails[2],
				// biome-ignore lint/suspicious/noExplicitAny: test user type assertion
			} as any,
		});
		const user4 = await authInstance.api.signUpEmail({
			body: {
				...TEST_USERS.user4,
				groupid: testGroupId,
				email: emails[3],
				// biome-ignore lint/suspicious/noExplicitAny: test user type assertion
			} as any,
		});

		const db = getDb(env);

		await db.insert(groups).values({
			groupid: testGroupId,
			groupName: "Test Group",
			userids: `["${user1.user.id}", "${user2.user.id}", "${user3.user.id}", "${user4.user.id}"]`,
			metadata: `{"defaultShare": {"${user1.user.id}": 25, "${user2.user.id}": 25, "${user3.user.id}": 25, "${user4.user.id}": 25}, "defaultCurrency": "USD"}`,
		});

		// Insert budgets into the new group_budgets table
		await db.insert(groupBudgets).values([
			{
				id: `budget_${Date.now()}_1`,
				groupId: testGroupId,
				budgetName: "house",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: `budget_${Date.now()}_2`,
				groupId: testGroupId,
				budgetName: "food",
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		]);

		return {
			user1: { ...TEST_USERS.user1, id: user1.user.id, email: emails[0] },
			user2: { ...TEST_USERS.user2, id: user2.user.id, email: emails[1] },
			user3: { ...TEST_USERS.user3, id: user3.user.id, email: emails[2] },
			user4: { ...TEST_USERS.user4, id: user4.user.id, email: emails[3] },
			testGroupId,
		};
	} catch (error) {
		console.error("Failed to create test user data:", error);
		// biome-ignore lint/suspicious/noExplicitAny: custom error class
		throw new (Error as any)("Failed to create user", { cause: error });
	}
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
    FROM budget_entries
    WHERE deleted IS NULL
    GROUP BY groupid, name, currency
  `);
}

// Better-auth sign-in and cookie extraction utility
export async function signInAndGetCookies(
	env: Env,
	email: string,
	password: string,
): Promise<string> {
	const authInstance = auth(env);
	const signInRequest = new Request(
		"http://localhost:8787/auth/sign-in/email",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email,
				password,
			}),
		},
	);

	const signInResponse = await authInstance.handler(signInRequest);

	if (signInResponse.status !== 200) {
		throw new Error(
			`Sign-in failed with status ${signInResponse.status} for user ${email}`,
		);
	}

	// Extract session cookies from the sign-in response
	const setCookieHeaders = signInResponse.headers.get("Set-Cookie");
	if (!setCookieHeaders) {
		throw new Error("No session cookies received from sign in");
	}

	return setCookieHeaders;
}
function generateEmail() {
	return `testuser${Math.floor(Math.random() * 1000000)}@example.com`;
}
