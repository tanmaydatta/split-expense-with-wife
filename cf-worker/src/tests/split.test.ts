import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
// Vitest globals are available through the test environment
import worker from "../index";
import {
	setupAndCleanDatabase,
	createTestUserData,
	createTestRequest,
	signInAndGetCookies,
} from "./test-utils";
import { getDb } from "../db";
import { groups, transactions, transactionUsers } from "../db/schema/schema";
import { eq } from "drizzle-orm";
import type {
	ErrorResponse,
	ApiEndpoints,
	TransactionsListResponse,
} from "../../../shared-types";

// Type aliases for API responses
type SplitCreateResponse = ApiEndpoints["/split_new"]["response"];
type SplitDeleteResponse = ApiEndpoints["/split_delete"]["response"];

// Database result types removed - now using Drizzle schema types directly

describe("Split handlers", () => {
	let TEST_USERS: Record<string, Record<string, string>>;

	beforeEach(async () => {
		await setupAndCleanDatabase(env);
		TEST_USERS = await createTestUserData(env);
	});

	describe("Split creation", () => {
		it("should create a split transaction successfully", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 100,
					description: "Test split",
					currency: "USD",
					paidByShares: {
						[TEST_USERS.user1.id]: 60,
						[TEST_USERS.user2.id]: 40,
					},
					splitPctShares: {
						[TEST_USERS.user1.id]: 50,
						[TEST_USERS.user2.id]: 50,
					},
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitCreateResponse;
			expect(json.message).toContain("successfully");
			expect(json.transactionId).toBeDefined();

			// Verify transaction was created in database
			const db = getDb(env);
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, json.transactionId));
			expect(transactionResult).toHaveLength(1);
			const transaction = transactionResult[0];
			expect(transaction.description).toBe("Test split");
			expect(transaction.amount).toBe(100);
			expect(transaction.currency).toBe("USD");
		});

		it("should create a complex split with multiple users successfully", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 120,
					description: "Group dinner",
					currency: "USD",
					paidByShares: {
						[TEST_USERS.user1.id]: 80,
						[TEST_USERS.user2.id]: 40,
					},
					splitPctShares: {
						[TEST_USERS.user1.id]: 60,
						[TEST_USERS.user2.id]: 40,
					},
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitCreateResponse;
			expect(json.message).toContain("successfully");

			// Check that transaction details were created with correct amounts using net settlement
			// User 1: paid $80, owes $72 (60% of $120) → net +$8 (creditor)
			// User 2: paid $40, owes $48 (40% of $120) → net -$8 (debtor)
			// Expected: User 2 owes User 1 $8
			const db = getDb(env);
			const userTransactions = await db
				.select()
				.from(transactionUsers)
				.where(eq(transactionUsers.transactionId, json.transactionId));
			expect(userTransactions).toHaveLength(1);

			const debt = userTransactions[0];
			expect(debt.amount).toBeCloseTo(8, 2); // User 2's debt to User 1
		});

		it("should return error for invalid split percentages", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 100,
					description: "Invalid split",
					currency: "USD",
					paidByShares: { [TEST_USERS.user1.id]: 100 },
					splitPctShares: {
						[TEST_USERS.user1.id]: 60,
						[TEST_USERS.user2.id]: 30,
					}, // Only adds up to 90%
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);

			const json = (await response.json()) as ErrorResponse;
			expect(json.error).toContain("100%");
		});

		it("should return error for invalid paid amounts", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 100,
					description: "Invalid paid amounts",
					currency: "USD",
					paidByShares: {
						[TEST_USERS.user1.id]: 60,
						[TEST_USERS.user2.id]: 30,
					}, // Only adds up to 90
					splitPctShares: {
						[TEST_USERS.user1.id]: 50,
						[TEST_USERS.user2.id]: 50,
					},
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);

			const json = (await response.json()) as ErrorResponse;
			expect(json.error).toContain("total amount");
		});
	});

	describe("Split deletion", () => {
		it("should delete a split transaction successfully", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Insert a test transaction using Drizzle
			const db = getDb(env);
			await db.insert(transactions).values({
				transactionId: "123",
				description: "Test split",
				amount: 100,
				currency: "USD",
				groupId: 1,
				createdAt: "2024-01-01 00:00:00",
			});
			await db.insert(transactionUsers).values({
				transactionId: "123",
				userId: TEST_USERS.user1.id,
				amount: 50,
				owedToUserId: TEST_USERS.user2.id,
				currency: "USD",
				groupId: 1,
			});

			const request = createTestRequest(
				"split_delete",
				"POST",
				{
					id: "123",
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitDeleteResponse;
			expect(json.message).toContain("successfully");
		});

		it("should handle deletion of non-existent transaction", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_delete",
				"POST",
				{
					id: "non-existent",
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(404);

			const json = (await response.json()) as ErrorResponse;
			expect(json.error).toContain("not found");
		});
	});

	describe("Split creation (split_new)", () => {
		it("should create a new split with generated transaction ID", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 75,
					description: "New split test",
					currency: "EUR",
					paidByShares: {
						[TEST_USERS.user1.id]: 45,
						[TEST_USERS.user2.id]: 30,
					},
					splitPctShares: {
						[TEST_USERS.user1.id]: 70,
						[TEST_USERS.user2.id]: 30,
					},
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitCreateResponse;
			expect(json.transactionId).toBeDefined();
			expect(json.transactionId.length).toBeGreaterThan(0);

			// Verify transaction was created in database
			const db = getDb(env);
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, json.transactionId));
			expect(transactionResult).toHaveLength(1);
			const transaction = transactionResult[0];
			expect(transaction.description).toBe("New split test");
			expect(transaction.amount).toBe(75);
			expect(transaction.currency).toBe("EUR");
		});

		it("should create transaction users for new split", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 90,
					description: "Multi-user split",
					currency: "GBP",
					paidByShares: {
						[TEST_USERS.user1.id]: 60,
						[TEST_USERS.user2.id]: 30,
					},
					splitPctShares: {
						[TEST_USERS.user1.id]: 40,
						[TEST_USERS.user2.id]: 60,
						[TEST_USERS.user3.id]: 0,
						[TEST_USERS.user4.id]: 0,
					},
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitCreateResponse;

			// Check transaction users were created using net settlement
			// User 1: paid £60, owes £36 (40% of £90) → net +£24 (creditor)
			// User 2: paid £30, owes £54 (60% of £90) → net -£24 (debtor)
			// Expected: User 2 owes User 1 £24
			const db = getDb(env);
			const userTransactions = await db
				.select()
				.from(transactionUsers)
				.where(eq(transactionUsers.transactionId, json.transactionId));
			expect(userTransactions).toHaveLength(1);

			const debt = userTransactions[0];
			expect(debt.currency).toBe("GBP");
			expect(debt.groupId).toBe(1);
			expect(debt.amount).toBeCloseTo(24, 2); // User 2's debt to User 1
		});

		it("should return error for unauthenticated request", async () => {
			const request = createTestRequest("split_new", "POST", {
				amount: 50,
				description: "Unauthenticated split",
				currency: "USD",
				paidByShares: { 1: 50 },
				splitPctShares: { 1: 100 },
			});

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(401);

			const json = (await response.json()) as ErrorResponse;
			expect(json.error).toBe("Unauthorized");
		});

		it("should return error for invalid currency", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 100,
					description: "Invalid currency split",
					currency: "INVALID",
					paidByShares: { [TEST_USERS.user1.id]: 100 },
					splitPctShares: { [TEST_USERS.user1.id]: 100 },
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(400);

			const json = (await response.json()) as ErrorResponse;
			expect(json.error).toContain("currency");
		});

		it("should handle multiple payers with multiple people splitting", async () => {
			// Set up test data for 3-person group using existing TEST_USERS
			const db = getDb(env);

			await db.insert(groups).values({
				groupid: 2,
				groupName: "Multi-person Group",
				userids: `["${TEST_USERS.user1.id}", "${TEST_USERS.user2.id}", "${TEST_USERS.user3.id}"]`,
				metadata: `{"defaultCurrency": "EUR", "defaultShare": {"${TEST_USERS.user1.id}": 40, "${TEST_USERS.user2.id}": 30, "${TEST_USERS.user3.id}": 30}}`,
			});

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Test multi-payer scenario:
			// Alice pays €80, Bob pays €70 (total €150)
			// Split: Alice 40% (€60), Bob 35% (€52.50), Charlie 25% (€37.50)
			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 150,
					description: "Multi-payer group expense",
					currency: "EUR",
					paidByShares: {
						[TEST_USERS.user1.id]: 80,
						[TEST_USERS.user2.id]: 70,
					}, // User1 pays €80, User2 pays €70
					splitPctShares: {
						[TEST_USERS.user1.id]: 40,
						[TEST_USERS.user2.id]: 35,
						[TEST_USERS.user3.id]: 25,
					}, // User1 40%, User2 35%, User3 25%
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitCreateResponse;
			expect(json.transactionId).toBeDefined();
			expect(json.message).toBe("Transaction created successfully");

			// Verify transaction was created with correct metadata
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, json.transactionId))
				.get();

			expect(transactionResult).toBeDefined();
			if (!transactionResult) {
				throw new Error("Transaction result should be defined");
			}
			expect(transactionResult.description).toBe("Multi-payer group expense");
			expect(transactionResult.amount).toBe(150);
			expect(transactionResult.currency).toBe("EUR");

			// Verify metadata contains correct paidByShares with first names
			const metadata = transactionResult.metadata || {
				paidByShares: {},
				owedAmounts: {},
				owedToAmounts: {},
			};

			expect(metadata.paidByShares).toEqual({
				[TEST_USERS.user1.firstName]: 80,
				[TEST_USERS.user2.firstName]: 70,
			});

			// Verify owedAmounts (each person's total share of the expense)
			expect(metadata.owedAmounts).toEqual({
				[TEST_USERS.user1.firstName]: 60, // 40% of €150
				[TEST_USERS.user2.firstName]: 52.5, // 35% of €150
				[TEST_USERS.user3.firstName]: 37.5, // 25% of €150
			});

			// Verify owedToAmounts (net amounts owed to each person)
			expect(metadata.owedToAmounts).toEqual({
				[TEST_USERS.user1.firstName]: 20, // User1 paid €80, owes €60, so he's owed €20
				[TEST_USERS.user2.firstName]: 17.5, // User2 paid €70, owes €52.50, so he's owed €17.50
				// User3 not included since he owes money (paid €0, owes €37.50)
			});

			// Verify transaction_users records contain the correct debt relationships
			const userRecords = await db
				.select({
					user_id: transactionUsers.userId,
					amount: transactionUsers.amount,
					owed_to_user_id: transactionUsers.owedToUserId,
				})
				.from(transactionUsers)
				.where(eq(transactionUsers.transactionId, json.transactionId))
				.orderBy(transactionUsers.userId, transactionUsers.owedToUserId);

			// Using net settlement logic, only debtors owe to creditors:
			// Alice: paid €80, owes €60 → net +€20 (creditor, doesn't owe anyone)
			// Bob: paid €70, owes €52.50 → net +€17.50 (creditor, doesn't owe anyone)
			// Charlie: paid €0, owes €37.50 → net -€37.50 (debtor, owes €37.50 total)
			//
			// Charlie's €37.50 debt is distributed proportionally to creditors:
			// - To Alice: €37.50 × (€20/€37.50) = €20
			// - To Bob: €37.50 × (€17.50/€37.50) = €17.50

			expect(userRecords).toHaveLength(2);

			const expectedRelationships = [
				{
					user_id: TEST_USERS.user3.id,
					owed_to_user_id: TEST_USERS.user1.id,
					amount: 20,
				}, // User3 owes User1 €20
				{
					user_id: TEST_USERS.user3.id,
					owed_to_user_id: TEST_USERS.user2.id,
					amount: 17.5,
				}, // User3 owes User2 €17.50
			];

			for (const expected of expectedRelationships) {
				const actual = userRecords.find(
					(r) =>
						r.user_id === expected.user_id &&
						r.owed_to_user_id === expected.owed_to_user_id,
				);
				expect(actual).toBeDefined();
				if (!actual) {
					throw new Error("Actual record should be defined");
				}
				expect(actual.amount).toBeCloseTo(expected.amount, 2);
			}

			// Verify total debt amounts equal Charlie's total debt (€37.50)
			const totalTransactionAmounts = userRecords.reduce(
				(sum, r) => sum + r.amount,
				0,
			);
			expect(totalTransactionAmounts).toBeCloseTo(37.5, 2);
		});

		it("should handle user who pays but still owes money in multi-person group", async () => {
			// Set up test data for 3-person group using existing TEST_USERS
			const db = getDb(env);

			await db.insert(groups).values({
				groupid: 3,
				groupName: "Mixed Payment Group",
				userids: `["${TEST_USERS.user1.id}", "${TEST_USERS.user2.id}", "${TEST_USERS.user3.id}"]`,
				metadata: `{"defaultCurrency": "EUR", "defaultShare": {"${TEST_USERS.user1.id}": 50, "${TEST_USERS.user2.id}": 30, "${TEST_USERS.user3.id}": 20}}`,
			});

			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Test scenario where Alice pays but still owes money:
			// Total: €120, Split: Alice 50% (€60), Bob 30% (€36), Charlie 20% (€24)
			// Payments: Alice pays €40, Bob pays €80, Charlie pays €0
			// Net positions: Alice -€20 (debtor), Bob +€44 (creditor), Charlie -€24 (debtor)
			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 120,
					description: "Mixed payment scenario",
					currency: "EUR",
					paidByShares: {
						[TEST_USERS.user1.id]: 40,
						[TEST_USERS.user2.id]: 80,
					}, // User1 pays €40, User2 pays €80, User3 pays €0
					splitPctShares: {
						[TEST_USERS.user1.id]: 50,
						[TEST_USERS.user2.id]: 30,
						[TEST_USERS.user3.id]: 20,
					}, // User1 50%, User2 30%, User3 20%
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitCreateResponse;
			expect(json.transactionId).toBeDefined();
			expect(json.message).toBe("Transaction created successfully");

			// Verify transaction was created with correct metadata
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, json.transactionId))
				.get();

			expect(transactionResult).toBeDefined();
			if (!transactionResult) {
				throw new Error("Transaction result should be defined");
			}
			expect(transactionResult.description).toBe("Mixed payment scenario");
			expect(transactionResult.amount).toBe(120);
			expect(transactionResult.currency).toBe("EUR");

			// Verify metadata contains correct values
			const metadata = transactionResult.metadata || {
				paidByShares: {},
				owedAmounts: {},
				owedToAmounts: {},
			};

			expect(metadata.paidByShares).toEqual({
				[TEST_USERS.user1.firstName]: 40,
				[TEST_USERS.user2.firstName]: 80,
			});

			// Verify owedAmounts (each person's total share of the expense)
			expect(metadata.owedAmounts).toEqual({
				[TEST_USERS.user1.firstName]: 60, // 50% of €120
				[TEST_USERS.user2.firstName]: 36, // 30% of €120
				[TEST_USERS.user3.firstName]: 24, // 20% of €120
			});

			// Verify owedToAmounts (only User2 is owed money since he's the only net creditor)
			expect(metadata.owedToAmounts).toEqual({
				[TEST_USERS.user2.firstName]: 44, // User2 paid €80, owes €36, so he's owed €44
				// User1 and User3 not included since they have net debt
			});

			// Verify transaction_users records contain the correct debt relationships
			const userRecords = await db
				.select({
					user_id: transactionUsers.userId,
					amount: transactionUsers.amount,
					owed_to_user_id: transactionUsers.owedToUserId,
				})
				.from(transactionUsers)
				.where(eq(transactionUsers.transactionId, json.transactionId))
				.orderBy(transactionUsers.userId, transactionUsers.owedToUserId);

			// Expected debt relationships using net settlement:
			// Alice: paid €40, owes €60 → net -€20 (debtor, owes €20)
			// Bob: paid €80, owes €36 → net +€44 (creditor, owed €44)
			// Charlie: paid €0, owes €24 → net -€24 (debtor, owes €24)
			//
			// Both Alice and Charlie owe to Bob:
			// - Alice owes Bob €20
			// - Charlie owes Bob €24

			expect(userRecords).toHaveLength(2);

			const expectedRelationships = [
				{
					user_id: TEST_USERS.user1.id,
					owed_to_user_id: TEST_USERS.user2.id,
					amount: 20,
				}, // User1 owes User2 €20
				{
					user_id: TEST_USERS.user3.id,
					owed_to_user_id: TEST_USERS.user2.id,
					amount: 24,
				}, // User3 owes User2 €24
			];

			for (const expected of expectedRelationships) {
				const actual = userRecords.find(
					(r) =>
						r.user_id === expected.user_id &&
						r.owed_to_user_id === expected.owed_to_user_id,
				);
				expect(actual).toBeDefined();
				if (!actual) {
					throw new Error("Actual record should be defined");
				}
				expect(actual.amount).toBeCloseTo(expected.amount, 2);
			}

			// Verify total debt amounts equal Bob's credit (€44)
			const totalTransactionAmounts = userRecords.reduce(
				(sum, r) => sum + r.amount,
				0,
			);
			expect(totalTransactionAmounts).toBeCloseTo(44, 2);

			console.log("✅ Mixed payment scenario test completed successfully");
		});

		it("should handle 2 debtors owing to 2 different creditors with everyone paying", async () => {
			// Set up test data for 4-person group using existing TEST_USERS
			const db = getDb(env);

			await db.insert(groups).values({
				groupid: 4,
				groupName: "Four Person Group",
				userids: `["${TEST_USERS.user1.id}", "${TEST_USERS.user2.id}", "${TEST_USERS.user3.id}", "${TEST_USERS.user4.id}"]`,
				metadata: `{"defaultCurrency": "USD", "defaultShare": {"${TEST_USERS.user1.id}": 40, "${TEST_USERS.user2.id}": 20, "${TEST_USERS.user3.id}": 25, "${TEST_USERS.user4.id}": 15}}`,
			});
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Test scenario with 4 people where 2 owe to 2 different creditors:
			// Total: $200, Split: Alice 40% ($80), Bob 20% ($40), Charlie 25% ($50), David 15% ($30)
			// Payments: Alice pays $60, Bob pays $70, Charlie pays $30, David pays $40
			// Net positions: Alice -$20, Bob +$30, Charlie -$20, David +$10
			// Debt distribution proportional to creditor amounts:
			// - Bob gets 75% (30/40) of each debt, David gets 25% (10/40)
			const request = createTestRequest(
				"split_new",
				"POST",
				{
					amount: 200,
					description: "Four person expense scenario",
					currency: "USD",
					paidByShares: {
						[TEST_USERS.user1.id]: 60,
						[TEST_USERS.user2.id]: 70,
						[TEST_USERS.user3.id]: 30,
						[TEST_USERS.user4.id]: 40,
					}, // Everyone pays something
					splitPctShares: {
						[TEST_USERS.user1.id]: 40,
						[TEST_USERS.user2.id]: 20,
						[TEST_USERS.user3.id]: 25,
						[TEST_USERS.user4.id]: 15,
					}, // Split percentages
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as SplitCreateResponse;
			expect(json.transactionId).toBeDefined();
			expect(json.message).toBe("Transaction created successfully");

			// Verify transaction was created with correct metadata
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, json.transactionId))
				.get();

			expect(transactionResult).toBeDefined();
			if (!transactionResult) {
				throw new Error("Transaction result should be defined");
			}
			expect(transactionResult.description).toBe(
				"Four person expense scenario",
			);
			expect(transactionResult.amount).toBe(200);
			expect(transactionResult.currency).toBe("USD");

			// Verify metadata contains correct values
			const metadata = transactionResult.metadata || {
				paidByShares: {},
				owedAmounts: {},
				owedToAmounts: {},
			};

			expect(metadata.paidByShares).toEqual({
				[TEST_USERS.user1.firstName]: 60,
				[TEST_USERS.user2.firstName]: 70,
				[TEST_USERS.user3.firstName]: 30,
				[TEST_USERS.user4.firstName]: 40,
			});

			// Verify owedAmounts (each person's total share of the expense)
			expect(metadata.owedAmounts).toEqual({
				[TEST_USERS.user1.firstName]: 80, // 40% of $200
				[TEST_USERS.user2.firstName]: 40, // 20% of $200
				[TEST_USERS.user3.firstName]: 50, // 25% of $200
				[TEST_USERS.user4.firstName]: 30, // 15% of $200
			});

			// Verify owedToAmounts (only net creditors are included)
			expect(metadata.owedToAmounts).toEqual({
				[TEST_USERS.user2.firstName]: 30, // User2 paid $70, owes $40, so he's owed $30
				[TEST_USERS.user4.firstName]: 10, // User4 paid $40, owes $30, so he's owed $10
				// User1 and User3 not included since they have net debt
			});

			// Verify transaction_users records contain the correct debt relationships
			const userRecords = await db
				.select({
					user_id: transactionUsers.userId,
					amount: transactionUsers.amount,
					owed_to_user_id: transactionUsers.owedToUserId,
				})
				.from(transactionUsers)
				.where(eq(transactionUsers.transactionId, json.transactionId))
				.orderBy(transactionUsers.userId, transactionUsers.owedToUserId);

			// Expected debt relationships using net settlement:
			// Alice: paid $60, owes $80 → net -$20 (debtor)
			// Bob: paid $70, owes $40 → net +$30 (creditor)
			// Charlie: paid $30, owes $50 → net -$20 (debtor)
			// David: paid $40, owes $30 → net +$10 (creditor)
			//
			// Total creditor amount: $30 + $10 = $40
			// Bob gets 75% (30/40) of debts, David gets 25% (10/40) of debts
			//
			// Alice's $20 debt: $15 to Bob, $5 to David
			// Charlie's $20 debt: $15 to Bob, $5 to David

			expect(userRecords).toHaveLength(4);

			const expectedRelationships = [
				{
					user_id: TEST_USERS.user1.id,
					owed_to_user_id: TEST_USERS.user2.id,
					amount: 15,
				}, // User1 owes User2 $15
				{
					user_id: TEST_USERS.user1.id,
					owed_to_user_id: TEST_USERS.user4.id,
					amount: 5,
				}, // User1 owes User4 $5
				{
					user_id: TEST_USERS.user3.id,
					owed_to_user_id: TEST_USERS.user2.id,
					amount: 15,
				}, // User3 owes User2 $15
				{
					user_id: TEST_USERS.user3.id,
					owed_to_user_id: TEST_USERS.user4.id,
					amount: 5,
				}, // User3 owes User4 $5
			];

			for (const expected of expectedRelationships) {
				const actual = userRecords.find(
					(r) =>
						r.user_id === expected.user_id &&
						r.owed_to_user_id === expected.owed_to_user_id,
				);
				expect(actual).toBeDefined();
				if (!actual) {
					throw new Error("Actual record should be defined");
				}
				expect(actual.amount).toBeCloseTo(expected.amount, 2);
			}

			// Verify total debt amounts equal total creditor amount ($40)
			const totalTransactionAmounts = userRecords.reduce(
				(sum, r) => sum + r.amount,
				0,
			);
			expect(totalTransactionAmounts).toBeCloseTo(40, 2);

			// Verify amounts owed to each creditor
			const bobTotal = userRecords
				.filter((r) => r.owed_to_user_id === TEST_USERS.user2.id)
				.reduce((sum, r) => sum + r.amount, 0);
			expect(bobTotal).toBeCloseTo(30, 2); // User2 should receive $30 total

			const davidTotal = userRecords
				.filter((r) => r.owed_to_user_id === TEST_USERS.user4.id)
				.reduce((sum, r) => sum + r.amount, 0);
			expect(davidTotal).toBeCloseTo(10, 2); // User4 should receive $10 total

			console.log(
				"✅ Four person debt distribution test completed successfully",
			);
		});
	});

	describe("Transactions list", () => {
		it("should return list of transactions", async () => {
			const cookies = await signInAndGetCookies(
				env,
				TEST_USERS.user1.email,
				TEST_USERS.user1.password,
			);

			// Add a test transaction using Drizzle
			const db = getDb(env);
			await db.insert(transactions).values({
				transactionId: "1",
				description: "Transaction 1",
				amount: 100,
				currency: "USD",
				groupId: 1,
				createdAt: "2024-01-01 00:00:00",
			});

			const request = createTestRequest(
				"transactions_list",
				"POST",
				{
					offset: 0,
				},
				cookies,
			);

			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env, ctx);
			await waitOnExecutionContext(ctx);

			expect(response.status).toBe(200);

			const json = (await response.json()) as TransactionsListResponse;
			expect(json.transactions).toHaveLength(1);
			expect(json.transactions[0].description).toBe("Transaction 1");
			expect(json.transactionDetails).toBeDefined();
		});
	});
});
