import {
	env as testEnv,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
// Vitest globals are available through the test environment
import worker from "../index";
import {
	setupAndCleanDatabase,
	createTestUserData,
	populateMaterializedTables,
	signInAndGetCookies,
} from "./test-utils";
import type {
	BudgetMonthlyResponse,
	MonthlyBudget,
	AverageSpendPeriod,
} from "../../../shared-types";
import type { UserBalancesByUser } from "../types";
import { getDb } from "../db";
import { budget, transactionUsers, transactions } from "../db/schema/schema";

// Type aliases for API responses
type BudgetTotalResponse = Array<{ currency: string; amount: number }>;

const env = testEnv as unknown as Env;

describe("Budget Handlers", () => {
	let TEST_USERS: Record<string, Record<string, string>>;
	beforeEach(async () => {
		await setupAndCleanDatabase(env);
		TEST_USERS = await createTestUserData(env);
	});

	describe("handleBalances", () => {
		it("should return calculated balances for the user", async () => {
			// Set up test data
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Add some transaction data to create balances
			const db = getDb(env);
			await db.insert(transactions).values({
				transactionId: "test-tx-1",
				description: "Test transaction",
				amount: 100,
				currency: "USD",
				groupId: 1,
				createdAt: "2024-01-01 00:00:00",
			});
			await db.insert(transactionUsers).values([
				{
					transactionId: "test-tx-1",
					userId: TEST_USERS.user1.id,
					amount: 50,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "test-tx-1",
					userId: TEST_USERS.user2.id,
					amount: 20,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-30);
		});

		it("should handle 2-user scenario where current user is owed money", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// User 2 owes 75 to user 1, user 1 owes 25 to user 2
			// Net: user 2 owes 50 to user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-2",
					userId: TEST_USERS.user2.id,
					amount: 75,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-2",
					userId: TEST_USERS.user1.id,
					amount: 25,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(50); // User 2 owes 50 to user 1
		});

		it("should handle 3-user triangular debt scenario", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Create triangular debt:
			// User 1 owes 30 to user 2
			// User 2 owes 40 to user 3
			// User 3 owes 20 to user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-3a",
					userId: TEST_USERS.user1.id,
					amount: 30,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-3b",
					userId: TEST_USERS.user2.id,
					amount: 40,
					owedToUserId: TEST_USERS.user3.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-3c",
					userId: TEST_USERS.user3.id,
					amount: 20,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-30); // user 1 owes 30 to user 2
			expect(json[TEST_USERS.user3.firstName].USD).toBe(20); // user 3 owes 20 to user 1
		});

		it("should handle 4-user complex debt scenario", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Complex scenario with 4 users:
			// User 1 owes 50 to user 2
			// User 3 owes 30 to user 1
			// User 4 owes 40 to user 1
			// User 1 owes 20 to user 4
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-4a",
					userId: TEST_USERS.user1.id,
					amount: 50,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-4b",
					userId: TEST_USERS.user3.id,
					amount: 30,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-4c",
					userId: TEST_USERS.user4.id,
					amount: 40,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-4d",
					userId: TEST_USERS.user1.id,
					amount: 20,
					owedToUserId: TEST_USERS.user4.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-50); // user 1 owes 50 to user 2
			expect(json[TEST_USERS.user3.firstName].USD).toBe(30); // user 3 owes 30 to user 1
			expect(json[TEST_USERS.user4.firstName].USD).toBe(20); // user 4 owes 20 to user 1 (40 - 20 = 20)
		});

		it("should handle multi-currency balances", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Multi-currency scenario:
			// User 1 owes 50 USD to user 2, user 2 owes 30 EUR to user 1
			// User 3 owes 100 GBP to user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-5a",
					userId: TEST_USERS.user1.id,
					amount: 50,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-5b",
					userId: TEST_USERS.user2.id,
					amount: 30,
					owedToUserId: TEST_USERS.user1.id,
					currency: "EUR",
					groupId: 1,
				},
				{
					transactionId: "tx-5c",
					userId: TEST_USERS.user3.id,
					amount: 100,
					owedToUserId: TEST_USERS.user1.id,
					currency: "GBP",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-50); // user 1 owes 50 USD to user 2
			expect(json[TEST_USERS.user2.firstName].EUR).toBe(30); // user 2 owes 30 EUR to user 1
			expect(json[TEST_USERS.user3.firstName].GBP).toBe(100); // user 3 owes 100 GBP to user 1
		});

		it("should return empty object when no balances exist", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// No transaction_users entries

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json).toEqual({});
		});

		it("should ignore self-owed amounts", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Add some self-owed amounts (should be ignored) and real balances
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-6a",
					userId: TEST_USERS.user1.id,
					amount: 100,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-6b",
					userId: TEST_USERS.user2.id,
					amount: 50,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-6c",
					userId: TEST_USERS.user1.id,
					amount: 40,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-40); // Only the real debt should be counted
		});

		it("should handle complex multiple transactions between same users", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Multiple transactions between users:
			// Transaction 1: User 1 owes 60 to user 2, user 2 owes 10 to user 1
			// Transaction 2: User 1 owes 30 to user 2, user 2 owes 20 to user 1
			// Transaction 3: User 3 owes 50 to user 1
			// Net result: User 1 owes 60 to user 2, user 3 owes 50 to user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-7a",
					userId: TEST_USERS.user1.id,
					amount: 60,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-7b",
					userId: TEST_USERS.user2.id,
					amount: 10,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-7c",
					userId: TEST_USERS.user1.id,
					amount: 30,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-7d",
					userId: TEST_USERS.user2.id,
					amount: 20,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-7e",
					userId: TEST_USERS.user3.id,
					amount: 50,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-60); // user 1 owes 60 to user 2 (90 - 30 = 60)
			expect(json[TEST_USERS.user3.firstName].USD).toBe(50); // user 3 owes 50 to user 1
		});

		it("should handle balances for different session users", async () => {
			// Set up test data
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user2.email,
				TEST_USERS.user2.password,
			);
			// User 1 owes 50 to user 2, user 2 owes 30 to user 3
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-8a",
					userId: TEST_USERS.user1.id,
					amount: 50,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-8b",
					userId: TEST_USERS.user2.id,
					amount: 30,
					owedToUserId: TEST_USERS.user3.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user1.firstName].USD).toBe(50); // user 1 owes 50 to user 2
			expect(json[TEST_USERS.user3.firstName].USD).toBe(-30); // user 2 owes 30 to user 3
		});

		it("should handle 3-user scenario where one user owes multiple others", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// User 1 owes 100 to user 2 and 75 to user 3
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-9a",
					userId: TEST_USERS.user1.id,
					amount: 100,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-9b",
					userId: TEST_USERS.user1.id,
					amount: 75,
					owedToUserId: TEST_USERS.user3.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-100); // user 1 owes 100 to user 2
			expect(json[TEST_USERS.user3.firstName].USD).toBe(-75); // user 1 owes 75 to user 3
		});

		it("should handle 3-user scenario where multiple users owe one user", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// User 2 owes 60 to user 1 and user 3 owes 40 to user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-10a",
					userId: TEST_USERS.user2.id,
					amount: 60,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-10b",
					userId: TEST_USERS.user3.id,
					amount: 40,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(60); // user 2 owes 60 to user 1
			expect(json[TEST_USERS.user3.firstName].USD).toBe(40); // user 3 owes 40 to user 1
		});

		it("should handle 3-user chain debt scenario", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Chain: User 1 owes 50 to user 2, user 2 owes 30 to user 3, user 3 owes 20 to user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-11a",
					userId: TEST_USERS.user1.id,
					amount: 50,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-11b",
					userId: TEST_USERS.user2.id,
					amount: 30,
					owedToUserId: TEST_USERS.user3.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-11c",
					userId: TEST_USERS.user3.id,
					amount: 20,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-50); // user 1 owes 50 to user 2
			expect(json[TEST_USERS.user3.firstName].USD).toBe(20); // user 3 owes 20 to user 1
		});

		it("should handle 4-user scenario where one user owes all others", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// User 1 owes money to all other users
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-12a",
					userId: TEST_USERS.user1.id,
					amount: 25,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-12b",
					userId: TEST_USERS.user1.id,
					amount: 35,
					owedToUserId: TEST_USERS.user3.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-12c",
					userId: TEST_USERS.user1.id,
					amount: 45,
					owedToUserId: TEST_USERS.user4.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-25); // user 1 owes 25 to user 2
			expect(json[TEST_USERS.user3.firstName].USD).toBe(-35); // user 1 owes 35 to user 3
			expect(json[TEST_USERS.user4.firstName].USD).toBe(-45); // user 1 owes 45 to user 4
		});

		it("should handle 4-user scenario where all others owe one user", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// All other users owe money to user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-13a",
					userId: TEST_USERS.user2.id,
					amount: 80,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-13b",
					userId: TEST_USERS.user3.id,
					amount: 65,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-13c",
					userId: TEST_USERS.user4.id,
					amount: 55,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(80); // user 2 owes 80 to user 1
			expect(json[TEST_USERS.user3.firstName].USD).toBe(65); // user 3 owes 65 to user 1
			expect(json[TEST_USERS.user4.firstName].USD).toBe(55); // user 4 owes 55 to user 1
		});

		it("should handle 4-user scenario with two pairs of debt", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Two pairs: User 1 owes user 2, user 3 owes user 4
			// But we're user 1, so we only see our relationship with user 2
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-14a",
					userId: TEST_USERS.user1.id,
					amount: 90,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-14b",
					userId: TEST_USERS.user3.id,
					amount: 70,
					owedToUserId: TEST_USERS.user4.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-90); // user 1 owes 90 to user 2
			expect(json[TEST_USERS.user3.firstName]).toBeUndefined(); // user 3 doesn't have debt with user 1
			expect(json[TEST_USERS.user4.firstName]).toBeUndefined(); // user 4 doesn't have debt with user 1
		});

		it("should handle 3-user multi-currency complex scenario", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Complex multi-currency with 3 users:
			// User 1 owes 100 USD to user 2, user 2 owes 50 EUR to user 1
			// User 3 owes 200 GBP to user 1, user 1 owes 75 EUR to user 3
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-15a",
					userId: TEST_USERS.user1.id,
					amount: 100,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-15b",
					userId: TEST_USERS.user2.id,
					amount: 50,
					owedToUserId: TEST_USERS.user1.id,
					currency: "EUR",
					groupId: 1,
				},
				{
					transactionId: "tx-15c",
					userId: TEST_USERS.user3.id,
					amount: 200,
					owedToUserId: TEST_USERS.user1.id,
					currency: "GBP",
					groupId: 1,
				},
				{
					transactionId: "tx-15d",
					userId: TEST_USERS.user1.id,
					amount: 75,
					owedToUserId: TEST_USERS.user3.id,
					currency: "EUR",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-100); // user 1 owes 100 USD to user 2
			expect(json[TEST_USERS.user2.firstName].EUR).toBe(50); // user 2 owes 50 EUR to user 1
			expect(json[TEST_USERS.user3.firstName].GBP).toBe(200); // user 3 owes 200 GBP to user 1
			expect(json[TEST_USERS.user3.firstName].EUR).toBe(-75); // user 1 owes 75 EUR to user 3
		});

		it("should handle 4-user web of debt scenario", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Complex web: Multiple interconnected debts
			// User 1 owes 40 to user 2, user 2 owes 30 to user 1 (net: user 1 owes 10 to user 2)
			// User 3 owes 60 to user 1, user 1 owes 20 to user 3 (net: user 3 owes 40 to user 1)
			// User 4 owes 80 to user 1, user 1 owes 35 to user 4 (net: user 4 owes 45 to user 1)
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-16a",
					userId: TEST_USERS.user1.id,
					amount: 40,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-16b",
					userId: TEST_USERS.user2.id,
					amount: 30,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-16c",
					userId: TEST_USERS.user3.id,
					amount: 60,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-16d",
					userId: TEST_USERS.user1.id,
					amount: 20,
					owedToUserId: TEST_USERS.user3.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-16e",
					userId: TEST_USERS.user4.id,
					amount: 80,
					owedToUserId: TEST_USERS.user1.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-16f",
					userId: TEST_USERS.user1.id,
					amount: 35,
					owedToUserId: TEST_USERS.user4.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-10); // user 1 owes 10 to user 2 (40 - 30)
			expect(json[TEST_USERS.user3.firstName].USD).toBe(40); // user 3 owes 40 to user 1 (60 - 20)
			expect(json[TEST_USERS.user4.firstName].USD).toBe(45); // user 4 owes 45 to user 1 (80 - 35)
		});

		it("should handle 3-user scenario with one user having no debt", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			// Only debt between user 1 and user 2, user 3 has no debt with user 1
			const db = getDb(env);
			await db.insert(transactionUsers).values([
				{
					transactionId: "tx-17a",
					userId: TEST_USERS.user1.id,
					amount: 85,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
				{
					transactionId: "tx-17b",
					userId: TEST_USERS.user3.id,
					amount: 50,
					owedToUserId: TEST_USERS.user2.id,
					currency: "USD",
					groupId: 1,
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);
			const request = new Request(
				"http://localhost:8787/.netlify/functions/balances",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);
			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[TEST_USERS.user2.firstName].USD).toBe(-85); // testuser owes 85 to Other
			expect(json[TEST_USERS.user3.firstName]).toBeUndefined(); // Third has no debt with testuser
		});
	});

	describe("handleBudget", () => {
		it("should create a budget entry successfully", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						amount: 100,
						description: "Groceries",
						name: "house",
						groupid: 1,
						currency: "USD",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json.message).toBe("200");
		});

		it("should return 401 if not authorized for budget", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						amount: 100,
						description: "Groceries",
						name: "unauthorized_budget",
						groupid: 1,
						currency: "USD",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(401);
		});
	});

	describe("handleBudgetDelete", () => {
		it("should delete a budget entry successfully", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const db = getDb(env);

			// Create a budget entry to delete with correct schema
			await db.insert(budget).values({
				id: 1,
				description: "Test entry",
				price: "+100.00",
				addedTime: "2024-01-01 00:00:00",
				amount: 100,
				name: "house",
				groupid: 1,
				currency: "USD",
			});

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_delete",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						id: 1,
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json.message).toBe("Successfully deleted budget entry");
		});
	});

	describe("handleBudgetList", () => {
		it("should return a list of budget entries", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const db = getDb(env);

			// Create budget entries with correct schema
			await db.insert(budget).values({
				id: 1,
				description: "Groceries",
				price: "+100.00",
				addedTime: "2024-01-01 00:00:00",
				amount: 100,
				name: "house",
				groupid: 1,
				currency: "USD",
			});

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_list",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: "house",
						offset: 0,
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as UserBalancesByUser;
			expect(json[0].description).toBe("Groceries");
		});
	});

	describe("handleBudgetMonthly", () => {
		it("should return monthly budget totals with average calculations", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const db = getDb(env);

			// Create dynamic dates - use recent months for reliable testing
			const now = new Date();
			const month1 = new Date(now.getFullYear(), now.getMonth() - 2, 15); // 2 months ago
			const month2 = new Date(now.getFullYear(), now.getMonth() - 1, 15); // 1 month ago
			const month3 = new Date(now.getFullYear(), now.getMonth(), 15); // Current month

			const formatDate = (date: Date) => {
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 00:00:00`;
			};

			const monthNames = [
				"January",
				"February",
				"March",
				"April",
				"May",
				"June",
				"July",
				"August",
				"September",
				"October",
				"November",
				"December",
			];

			// Create budget entries with negative amounts for monthly totals (different months)
			await db.insert(budget).values([
				{
					description: "Month1 expense",
					price: "-500.00",
					addedTime: formatDate(month1),
					amount: -500,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month2 expense",
					price: "-600.00",
					addedTime: formatDate(month2),
					amount: -600,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month3 expense",
					price: "-400.00",
					addedTime: formatDate(month3),
					amount: -400,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
			]);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_monthly",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: "house",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as BudgetMonthlyResponse;

			// Check that the response has the new structure
			expect(json).toHaveProperty("monthlyBudgets");
			expect(json).toHaveProperty("averageMonthlySpend");
			expect(json).toHaveProperty("periodAnalyzed");

			// Check monthly budgets structure
			expect(Array.isArray(json.monthlyBudgets)).toBe(true);
			// Should include all months from today back to oldest data date
			// The function generates from current month back to oldest month with actual data
			const today = new Date();
			const currentDate = new Date(today.getFullYear(), today.getMonth()); // Start of current month
			const oldestDataDate = new Date(month1.getFullYear(), month1.getMonth()); // Oldest test data month

			// Calculate months between start and end dates
			let monthCount = 0;
			const tempDate = new Date(currentDate);
			while (tempDate >= oldestDataDate) {
				monthCount++;
				tempDate.setMonth(tempDate.getMonth() - 1);
			}

			expect(json.monthlyBudgets.length).toBe(monthCount);

			// Check that the months with data show correct amounts
			const month1Budget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[month1.getMonth()] &&
					b.year === month1.getFullYear(),
			);
			const month2Budget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[month2.getMonth()] &&
					b.year === month2.getFullYear(),
			);
			const month3Budget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[month3.getMonth()] &&
					b.year === month3.getFullYear(),
			);

			expect(month1Budget).toBeTruthy();
			expect((month1Budget as MonthlyBudget).amounts[0].amount).toBe(500);
			expect(month2Budget).toBeTruthy();
			expect((month2Budget as MonthlyBudget).amounts[0].amount).toBe(600);
			expect(month3Budget).toBeTruthy();
			expect((month3Budget as MonthlyBudget).amounts[0].amount).toBe(400);

			// Check rolling average monthly spend calculations
			expect(Array.isArray(json.averageMonthlySpend)).toBe(true);

			// Since we have 3 months of data (July, August, September 2024), we should get 3 periods
			// The number of periods depends on the current date when the test runs, so let's check more flexibly
			expect(json.averageMonthlySpend.length).toBeGreaterThan(0);

			// Check 1-month average (should exist)
			const oneMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 1,
			);
			expect(oneMonthAverage).toBeTruthy();
			expect((oneMonthAverage as AverageSpendPeriod).averages.length).toBe(1);
			expect((oneMonthAverage as AverageSpendPeriod).averages[0].currency).toBe(
				"USD",
			);

			// Check 2-month average (should exist)
			const twoMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 2,
			);
			expect(twoMonthAverage).toBeTruthy();
			expect((twoMonthAverage as AverageSpendPeriod).averages.length).toBe(1);
			expect((twoMonthAverage as AverageSpendPeriod).averages[0].currency).toBe(
				"USD",
			);

			// Check 3-month average (should exist)
			const threeMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 3,
			);
			expect(threeMonthAverage).toBeTruthy();
			expect((threeMonthAverage as AverageSpendPeriod).averages.length).toBe(1);
			expect(
				(threeMonthAverage as AverageSpendPeriod).averages[0].currency,
			).toBe("USD");

			// Check period analyzed
			expect(json.periodAnalyzed).toHaveProperty("startDate");
			expect(json.periodAnalyzed).toHaveProperty("endDate");
		});

		it("should handle empty budget data and return default averages", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// No budget entries

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_monthly",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: "house",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as BudgetMonthlyResponse;

			// Check that the response has the new structure
			expect(json).toHaveProperty("monthlyBudgets");
			expect(json).toHaveProperty("averageMonthlySpend");
			expect(json).toHaveProperty("periodAnalyzed");

			// Check monthly budgets structure (should still show all months, just with 0 amounts)
			expect(Array.isArray(json.monthlyBudgets)).toBe(true);
			// Should include all months from today back to 2 years ago, even with no data
			// The function generates from current month back to oldest month (2 years ago)
			const today = new Date();
			const currentDate = new Date(today.getFullYear(), today.getMonth()); // Start of current month
			const oldestData = new Date();
			oldestData.setFullYear(oldestData.getFullYear() - 2);
			const endDate = new Date(oldestData.getFullYear(), oldestData.getMonth()); // Start of oldest month

			// Calculate months between start and end dates
			let monthCount = 0;
			const tempDate = new Date(currentDate);
			while (tempDate >= endDate) {
				monthCount++;
				tempDate.setMonth(tempDate.getMonth() - 1);
			}

			expect(json.monthlyBudgets.length).toBe(monthCount);

			// All months should have 0 amounts since no budget data exists
			// biome-ignore lint/complexity/noForEach: test assertion iteration
			json.monthlyBudgets.forEach((budget: MonthlyBudget) => {
				expect(budget.amounts[0].amount).toBe(0);
				expect(budget.amounts[0].currency).toBe("USD");
			});

			// Check average data - should have multiple periods even with no spending data
			expect(Array.isArray(json.averageMonthlySpend)).toBe(true);
			expect(json.averageMonthlySpend.length).toBeGreaterThan(0);

			// Check the first period (1-month average)
			const oneMonthPeriod = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 1,
			);
			expect(oneMonthPeriod).toBeTruthy();
			expect((oneMonthPeriod as AverageSpendPeriod).averages.length).toBe(1);
			expect((oneMonthPeriod as AverageSpendPeriod).averages[0].currency).toBe(
				"USD",
			);
			expect(
				(oneMonthPeriod as AverageSpendPeriod).averages[0].totalSpend,
			).toBe(0);
			expect(
				(oneMonthPeriod as AverageSpendPeriod).averages[0].averageMonthlySpend,
			).toBe(0);
			expect(
				(oneMonthPeriod as AverageSpendPeriod).averages[0].monthsAnalyzed,
			).toBe(1);
		});

		it("should calculate rolling averages correctly for different time periods", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const db = getDb(env);

			// Create budget entries across 6 recent months that would be within rolling window
			const currentDate = new Date();
			const getRecentDate = (monthsBack: number) => {
				const date = new Date(currentDate);
				date.setMonth(date.getMonth() - monthsBack);
				return date
					.toISOString()
					.replace("T", " ")
					.replace(/\.\d{3}Z$/, "");
			};

			await db.insert(budget).values([
				{
					description: "Month 1 expense",
					price: "-1000.00",
					addedTime: getRecentDate(5),
					amount: -1000,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month 2 expense",
					price: "-1200.00",
					addedTime: getRecentDate(4),
					amount: -1200,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month 3 expense",
					price: "-800.00",
					addedTime: getRecentDate(3),
					amount: -800,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month 4 expense",
					price: "-1100.00",
					addedTime: getRecentDate(2),
					amount: -1100,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month 5 expense",
					price: "-900.00",
					addedTime: getRecentDate(1),
					amount: -900,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month 6 expense",
					price: "-1300.00",
					addedTime: getRecentDate(0),
					amount: -1300,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
			]);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_monthly",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: "house",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as BudgetMonthlyResponse;

			// Check that we have rolling averages for different periods
			// Since we have 6 months of recent data, we should get periods based on current date
			expect(json.averageMonthlySpend.length).toBeGreaterThan(0);

			// Find and check 1-month average
			const oneMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 1,
			);
			expect(oneMonthAverage).toBeTruthy();
			expect((oneMonthAverage as AverageSpendPeriod).averages[0].currency).toBe(
				"USD",
			);

			// Find and check 2-month average
			const twoMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 2,
			);
			expect(twoMonthAverage).toBeTruthy();
			expect((twoMonthAverage as AverageSpendPeriod).averages[0].currency).toBe(
				"USD",
			);

			// Find and check 3-month average
			const threeMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 3,
			);
			expect(threeMonthAverage).toBeTruthy();
			expect(
				(threeMonthAverage as AverageSpendPeriod).averages[0].currency,
			).toBe("USD");

			// Find and check 6-month average (should include months within the 6-month window)
			const sixMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 6,
			);
			if (sixMonthAverage) {
				expect(sixMonthAverage.averages[0].currency).toBe("USD");
				expect(sixMonthAverage.averages[0].totalSpend).toBeGreaterThan(0);
				expect(sixMonthAverage.averages[0].monthsAnalyzed).toBeGreaterThan(0);
				expect(sixMonthAverage.averages[0].averageMonthlySpend).toBe(
					sixMonthAverage.averages[0].totalSpend /
						sixMonthAverage.averages[0].monthsAnalyzed,
				);
			}
		});

		it("should handle mixed positive and negative amounts correctly", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const db = getDb(env);

			// Create dynamic dates - use recent months for reliable testing
			const now = new Date();
			const month1 = new Date(now.getFullYear(), now.getMonth() - 3, 15); // 3 months ago
			const month2 = new Date(now.getFullYear(), now.getMonth() - 2, 15); // 2 months ago
			const month3 = new Date(now.getFullYear(), now.getMonth() - 1, 15); // 1 month ago
			const month4 = new Date(now.getFullYear(), now.getMonth(), 15); // Current month

			const formatDate = (date: Date) => {
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 00:00:00`;
			};

			const monthNames = [
				"January",
				"February",
				"March",
				"April",
				"May",
				"June",
				"July",
				"August",
				"September",
				"October",
				"November",
				"December",
			];

			// Create a comprehensive scenario with mixed amounts across multiple months and currencies
			// Month 1: +800 USD budget allocation, -250 USD groceries, -150 USD utilities
			await db.insert(budget).values([
				{
					description: "Month1 Budget",
					price: "+800.00",
					addedTime: formatDate(month1),
					amount: 800,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Groceries",
					price: "-250.00",
					addedTime: formatDate(
						new Date(month1.getTime() + 5 * 24 * 60 * 60 * 1000),
					), // 5 days later
					amount: -250,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Utilities",
					price: "-150.00",
					addedTime: formatDate(
						new Date(month1.getTime() + 10 * 24 * 60 * 60 * 1000),
					), // 10 days later
					amount: -150,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
			]);

			// Month 2: +800 USD budget, -300 USD groceries, -200 USD utilities, +50 GBP extra budget, -75 GBP transport
			await db.insert(budget).values([
				{
					description: "Month2 Budget",
					price: "+800.00",
					addedTime: formatDate(month2),
					amount: 800,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Groceries Month2",
					price: "-300.00",
					addedTime: formatDate(
						new Date(month2.getTime() + 3 * 24 * 60 * 60 * 1000),
					), // 3 days later
					amount: -300,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Utilities Month2",
					price: "-200.00",
					addedTime: formatDate(
						new Date(month2.getTime() + 7 * 24 * 60 * 60 * 1000),
					), // 7 days later
					amount: -200,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Extra Budget GBP",
					price: "+50.00",
					addedTime: formatDate(
						new Date(month2.getTime() - 5 * 24 * 60 * 60 * 1000),
					), // 5 days before
					amount: 50,
					name: "house",
					groupid: 1,
					currency: "GBP",
				},
				{
					description: "Transport",
					price: "-75.00",
					addedTime: formatDate(
						new Date(month2.getTime() + 13 * 24 * 60 * 60 * 1000),
					), // 13 days later
					amount: -75,
					name: "house",
					groupid: 1,
					currency: "GBP",
				},
			]);

			// Month 3: Only positive amounts (budget allocations), no expenses
			await db.insert(budget).values([
				{
					description: "Month3 Budget",
					price: "+900.00",
					addedTime: formatDate(month3),
					amount: 900,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month3 Bonus",
					price: "+100.00",
					addedTime: formatDate(
						new Date(month3.getTime() + 5 * 24 * 60 * 60 * 1000),
					), // 5 days later
					amount: 100,
					name: "house",
					groupid: 1,
					currency: "GBP",
				},
			]);

			// Month 4: Only negative amounts (expenses), no budget allocations
			await db.insert(budget).values([
				{
					description: "Month4 Groceries",
					price: "-400.00",
					addedTime: formatDate(month4),
					amount: -400,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month4 Utilities",
					price: "-180.00",
					addedTime: formatDate(
						new Date(month4.getTime() + 5 * 24 * 60 * 60 * 1000),
					), // 5 days later
					amount: -180,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Month4 Transport",
					price: "-60.00",
					addedTime: formatDate(
						new Date(month4.getTime() + 10 * 24 * 60 * 60 * 1000),
					), // 10 days later
					amount: -60,
					name: "house",
					groupid: 1,
					currency: "GBP",
				},
			]);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_monthly",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: "house",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as BudgetMonthlyResponse;

			// Verify response structure
			expect(json).toHaveProperty("monthlyBudgets");
			expect(json).toHaveProperty("averageMonthlySpend");
			expect(json).toHaveProperty("periodAnalyzed");

			// Find specific months to verify net amounts are calculated correctly
			// Note: monthlyBudgets should show only expenses (negative amounts)
			const month1Budget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[month1.getMonth()] &&
					b.year === month1.getFullYear(),
			);
			const month2Budget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[month2.getMonth()] &&
					b.year === month2.getFullYear(),
			);
			const month3Budget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[month3.getMonth()] &&
					b.year === month3.getFullYear(),
			);
			const month4Budget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[month4.getMonth()] &&
					b.year === month4.getFullYear(),
			);

			// Month 1: -250 - 150 = 400 USD expenses (shown as positive)
			expect(month1Budget).toBeTruthy();
			const month1USD = (month1Budget as MonthlyBudget).amounts.find(
				(a) => a.currency === "USD",
			);
			expect(month1USD?.amount).toBe(400);

			// Month 2: -300 - 200 = 500 USD, 75 GBP expenses (shown as positive)
			expect(month2Budget).toBeTruthy();
			const month2USD = (month2Budget as MonthlyBudget).amounts.find(
				(a) => a.currency === "USD",
			);
			const month2GBP = (month2Budget as MonthlyBudget).amounts.find(
				(a) => a.currency === "GBP",
			);
			expect(month2USD?.amount).toBe(500);
			expect(month2GBP?.amount).toBe(75);

			// Month 3: No expenses, so no entries should exist
			expect(month3Budget).toBeTruthy();
			const month3USD = (month3Budget as MonthlyBudget).amounts.find(
				(a) => a.currency === "USD",
			);
			const month3GBP = (month3Budget as MonthlyBudget).amounts.find(
				(a) => a.currency === "GBP",
			);
			expect(month3USD?.amount).toBe(0); // No expenses = 0
			expect(month3GBP?.amount).toBe(0); // No expenses = 0

			// Month 4: -400 - 180 = 580 USD, 60 GBP expenses (shown as positive)
			expect(month4Budget).toBeTruthy();
			const month4USD = (month4Budget as MonthlyBudget).amounts.find(
				(a) => a.currency === "USD",
			);
			const month4GBP = (month4Budget as MonthlyBudget).amounts.find(
				(a) => a.currency === "GBP",
			);
			expect(month4USD?.amount).toBe(580);
			expect(month4GBP?.amount).toBe(60);

			// Verify average spending calculations (should ONLY count negative amounts)
			expect(json.averageMonthlySpend.length).toBeGreaterThan(0);

			// Check 1-month average (most recent month's expenses only)
			const oneMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 1,
			);
			expect(oneMonthAverage).toBeTruthy();

			// The most recent month should be based on current date, but let's verify the logic
			// April had 640 USD spending (400 + 180) and 60 GBP spending
			const oneMonthUSD = (oneMonthAverage as AverageSpendPeriod).averages.find(
				(a) => a.currency === "USD",
			);
			const oneMonthGBP = (oneMonthAverage as AverageSpendPeriod).averages.find(
				(a) => a.currency === "GBP",
			);

			// Verify that spending calculations are correct
			if (oneMonthUSD) {
				expect(oneMonthUSD.averageMonthlySpend).toBeGreaterThan(0);
				expect(oneMonthUSD.totalSpend).toBeGreaterThan(0);
			}
			if (oneMonthGBP) {
				expect(oneMonthGBP.averageMonthlySpend).toBeGreaterThan(0);
				expect(oneMonthGBP.totalSpend).toBeGreaterThan(0);
			}

			// Check 2-month average
			const twoMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 2,
			);
			expect(twoMonthAverage).toBeTruthy();

			// Check 4-month average (should include all our test months)
			const fourMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 4,
			);
			if (fourMonthAverage) {
				const fourMonthUSD = fourMonthAverage.averages.find(
					(a) => a.currency === "USD",
				);
				const fourMonthGBP = fourMonthAverage.averages.find(
					(a) => a.currency === "GBP",
				);

				if (fourMonthUSD) {
					// Total USD expenses across all months:
					// Jan: 250 + 150 = 400
					// Feb: 300 + 200 = 500
					// Mar: 0 (no expenses)
					// Apr: 400 + 180 = 580
					// Total: 400 + 500 + 0 + 580 = 1480
					// Average: 1480 / 4 = 370
					expect(fourMonthUSD.totalSpend).toBe(1480);
					expect(fourMonthUSD.averageMonthlySpend).toBe(370);
					expect(fourMonthUSD.monthsAnalyzed).toBe(4);
				}

				if (fourMonthGBP) {
					// Total GBP expenses across all months:
					// Jan: 0
					// Feb: 75
					// Mar: 0 (no expenses)
					// Apr: 60
					// Total: 0 + 75 + 0 + 60 = 135
					// Average: 135 / 4 = 33.75
					expect(fourMonthGBP.totalSpend).toBe(135);
					expect(fourMonthGBP.averageMonthlySpend).toBe(33.75);
					expect(fourMonthGBP.monthsAnalyzed).toBe(4);
				}
			}
		});

		it("should handle currencies with zero spending correctly", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);
			const db = getDb(env);

			// Create dynamic dates - use recent month for reliable testing
			const now = new Date();
			const testMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15); // 1 month ago

			const formatDate = (date: Date) => {
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} 00:00:00`;
			};

			const monthNames = [
				"January",
				"February",
				"March",
				"April",
				"May",
				"June",
				"July",
				"August",
				"September",
				"October",
				"November",
				"December",
			];

			// Create scenario where one currency has only positive amounts
			await db.insert(budget).values([
				{
					description: "USD Expense",
					price: "-500.00",
					addedTime: formatDate(testMonth),
					amount: -500,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "GBP Budget Only",
					price: "+100.00",
					addedTime: formatDate(
						new Date(testMonth.getTime() + 5 * 24 * 60 * 60 * 1000),
					), // 5 days later
					amount: 100,
					name: "house",
					groupid: 1,
					currency: "GBP",
				},
			]);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_monthly",
				{
					method: "POST",
					headers: {
						Cookie: cookies,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: "house",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as BudgetMonthlyResponse;
			// Find test month data
			const testMonthBudget = json.monthlyBudgets.find(
				(b: MonthlyBudget) =>
					b.month === monthNames[testMonth.getMonth()] &&
					b.year === testMonth.getFullYear(),
			);
			expect(testMonthBudget).toBeTruthy();
			console.log("testMonthBudget", JSON.stringify(testMonthBudget, null, 2));
			const testUSD = (testMonthBudget as MonthlyBudget).amounts.find(
				(a) => a.currency === "USD",
			);
			const testGBP = (testMonthBudget as MonthlyBudget).amounts.find(
				(a) => a.currency === "GBP",
			);
			console.log("testUSD", JSON.stringify(testUSD, null, 2));
			// USD should show 500 (expense shown as positive), GBP should not appear since it had no expenses
			expect(testUSD?.amount).toBe(500);
			expect(testGBP?.amount).toBeUndefined();

			// Check that average spending only counts USD (which had expenses)
			const oneMonthAverage = json.averageMonthlySpend.find(
				(avg: AverageSpendPeriod) => avg.periodMonths === 1,
			);
			expect(oneMonthAverage).toBeTruthy();

			const avgUSD = (oneMonthAverage as AverageSpendPeriod).averages.find(
				(a) => a.currency === "USD",
			);
			const avgGBP = (oneMonthAverage as AverageSpendPeriod).averages.find(
				(a) => a.currency === "GBP",
			);

			// USD should have spending data, but 1-month average starts from current month (0 spending)
			expect(avgUSD?.totalSpend).toBe(0);
			expect(avgUSD?.averageMonthlySpend).toBe(0);

			// GBP should not appear in averages since it had no expenses
			expect(avgGBP).toBeUndefined();

			// Check a longer period that would include January 2024 data
			// Since test data is from Jan 2024 and we're likely running in 2025,
			// we need to check a 24-month period to capture that data
			const maxPeriod = Math.max(
				...json.averageMonthlySpend.map((avg) => avg.periodMonths),
			);
			if (maxPeriod >= 12) {
				// Find the longest period available (should be around 24 months)
				const longPeriodAverage = json.averageMonthlySpend.find(
					(avg: AverageSpendPeriod) => avg.periodMonths === maxPeriod,
				);
				if (longPeriodAverage) {
					const longPeriodUSD = longPeriodAverage.averages.find(
						(a) => a.currency === "USD",
					);
					if (longPeriodUSD) {
						expect(longPeriodUSD.totalSpend).toBe(500);
						expect(longPeriodUSD.averageMonthlySpend).toBe(500 / maxPeriod); // $500 spread across all months
					}
				}
			}
		});
	});

	describe("handleBudgetTotal", () => {
		it("should return budget totals", async () => {
			// Set up test data

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const db = getDb(env);

			// Create budget entries with correct schema
			await db.insert(budget).values([
				{
					description: "Entry 1",
					price: "+500.00",
					addedTime: "2024-01-01 00:00:00",
					amount: 500,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
				{
					description: "Entry 2",
					price: "+1000.00",
					addedTime: "2024-02-01 00:00:00",
					amount: 1000,
					name: "house",
					groupid: 1,
					currency: "USD",
				},
			]);

			// Populate materialized tables for optimized queries
			await populateMaterializedTables(env);

			const request = new Request(
				"http://localhost:8787/.netlify/functions/budget_total",
				{
					method: "POST",
					headers: {
						Cookie: cookies, // Use session cookies from sign-in
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: "house",
					}),
				},
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);
			const json = (await response.json()) as BudgetTotalResponse;
			expect(json[0].amount).toBe(1500);
		});
	});
});
