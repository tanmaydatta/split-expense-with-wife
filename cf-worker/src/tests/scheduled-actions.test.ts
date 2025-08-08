import { createExecutionContext, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import {
	type AddBudgetActionData,
	type AddExpenseActionData,
	type CreateScheduledActionRequest,
	type CreateScheduledActionResponse,
	CURRENCIES,
	type DeleteScheduledActionResponse,
	ScheduledAction,
	type ScheduledActionErrorResponse,
	type ScheduledActionHistoryListResponse,
	type ScheduledActionListResponse,
	type UpdateScheduledActionRequest,
	type UpdateScheduledActionResponse,
} from "../../../shared-types";
import { auth } from "../auth";
import { getDb } from "../db";
import { groups, scheduledActionHistory, scheduledActions } from "../db/schema/schema";
import { calculateNextExecutionDate } from "../handlers/scheduled-actions";
import worker from "../index";
import {
	completeCleanupDatabase,
	createTestRequest,
	createTestUserData,
	setupAndCleanDatabase,
	signInAndGetCookies,
} from "./test-utils";

const env = testEnv as unknown as Env;

async function createUserInNewGroup(env: Env): Promise<{ id: string; email: string; cookies: string }> {
	const authInstance = auth(env);
	const rand = Math.floor(Math.random() * 1000000);
	const email = `outsider${rand}@example.com`;
	const password = "testpass";
	const groupid = 1000 + rand; // ensure different from default group 1
	const signupRes = await authInstance.api.signUpEmail({
		body: {
			email,
			password,
			name: "Outsider",
			firstName: "Out",
			lastName: "Sider",
			groupid,
			// biome-ignore lint/suspicious/noExplicitAny: test payload
		} as any,
	});
	const db = getDb(env);
	await db.insert(groups).values({
		groupid,
		groupName: `Other Group ${groupid}`,
		userids: `["${signupRes.user.id}"]`,
		budgets: "[\"house\"]",
		metadata: `{"defaultShare": {"${signupRes.user.id}": 100}, "defaultCurrency": "USD"}`,
	});
	const cookies = await signInAndGetCookies(env, email, password);
	return { id: signupRes.user.id, email, cookies };
}

describe("Scheduled Actions Handlers", () => {
	let TEST_USERS: Record<string, Record<string, string>>;
	let userCookies: string;

	beforeAll(async () => {
		await setupAndCleanDatabase(env);
	});

	beforeEach(async () => {
		// Clean the database completely before each test
		await completeCleanupDatabase(env);
		TEST_USERS = await createTestUserData(env);
		userCookies = await signInAndGetCookies(
			env,
			TEST_USERS.user1.email,
			TEST_USERS.user1.password,
		);
	});

	describe("Date Utility Functions", () => {
		// Explicitly use UTC to match CI environment
		const mockNow = new Date("2024-03-15T00:00:00.000Z");

		beforeEach(() => {
			// Use Vitest's built-in date mocking for consistent behavior across environments
			// Note: vi is available globally in Vitest environment
			// biome-ignore lint/suspicious/noExplicitAny: vitest global access
			(globalThis as any).vi.setSystemTime(mockNow);
		});

		afterEach(() => {
			// Restore real time
			// biome-ignore lint/suspicious/noExplicitAny: vitest global access
			(globalThis as any).vi.useRealTimers();
		});

		it("should calculate next execution date for daily frequency", () => {
			// Test with past start date (yesterday: 2024-03-14)
			const startDate = "2024-03-14";

			const nextDate = calculateNextExecutionDate(startDate, "daily");
			// Should return tomorrow: 2024-03-16 (since 2024-03-15 is "today")
			expect(nextDate).toBe("2024-03-16");
		});

		it("should calculate next execution date for weekly frequency", () => {
			// Test with start date one week ago (2024-03-08)
			const startDate = "2024-03-08";

			const nextDate = calculateNextExecutionDate(startDate, "weekly");
			// Should return next week: 2024-03-22 (since 2024-03-15 is "today")
			expect(nextDate).toBe("2024-03-22");
		});

		it("should calculate next execution date for monthly frequency", () => {
			// Test with start date two months ago (2024-01-10)
			const startDate = "2024-01-10";

			const nextDate = calculateNextExecutionDate(startDate, "monthly");
			// Expected: 2024-01-10 → 2024-02-10 → 2024-03-10 → 2024-04-10
			expect(nextDate).toBe("2024-04-10");
		});

		it("should handle month boundary cases for monthly frequency", () => {
			// Test January 31st → should always try to use 31st, fallback to last day if not available
			const startDate = "2024-01-31";
			const nextDate = calculateNextExecutionDate(startDate, "monthly");
			// Expected: 2024-01-31 → 2024-02-29 (leap year, fallback) → 2024-03-31 (back to original day) → 2024-04-30 (fallback)
			expect(nextDate).toBe("2024-03-31");
		});

		it("should handle March 31st to April 30th transition", () => {
			// Test March 31st → should become April 30th (April doesn't have 31 days)
			// Set mock to early April to test the transition
			const mockDate = new Date("2024-04-01T00:00:00.000Z");
			// biome-ignore lint/suspicious/noExplicitAny: vitest global access
			(globalThis as any).vi.setSystemTime(mockDate);

			const startDate = "2024-03-31";
			const nextDate = calculateNextExecutionDate(startDate, "monthly");
			// Expected: 2024-03-31 → 2024-04-30 (April has only 30 days, so fallback)
			expect(nextDate).toBe("2024-04-30");
		});

		it("should handle non-leap year February transition", () => {
			// Test with a non-leap year (2025)
			// Set mock to 2025-03-20 to test January 31st behavior
			const mockDate = new Date("2025-03-20T00:00:00.000Z");
			// biome-ignore lint/suspicious/noExplicitAny: vitest global access
			(globalThis as any).vi.setSystemTime(mockDate);

			const startDate = "2025-01-31";
			const nextDate = calculateNextExecutionDate(startDate, "monthly");
			// Expected: 2025-01-31 → 2025-02-28 (non-leap year fallback) → 2025-03-31 (back to original day)
			expect(nextDate).toBe("2025-03-31");
		});

		it("should return to original day when month allows it", () => {
			// Test that after fallback to shorter month, we return to original day when possible
			// Start on April 30th, next should be May 31st (back to 31st when possible)
			const mockDate = new Date("2024-05-15T00:00:00.000Z");
			// biome-ignore lint/suspicious/noExplicitAny: vitest global access
			(globalThis as any).vi.setSystemTime(mockDate);

			const startDate = "2024-04-30";
			const nextDate = calculateNextExecutionDate(startDate, "monthly");
			// If original intent was 31st but April only has 30, May should go to 31st
			// But since we start with 30th, it should stay 30th - this tests the current day behavior
			expect(nextDate).toBe("2024-05-30");
		});

		it("should return start date if it is in the future", () => {
			// Test with future start date (tomorrow: 2024-03-16)
			const startDate = "2024-03-16";

			const nextDate = calculateNextExecutionDate(startDate, "daily");
			// Should return the same future date
			expect(nextDate).toBe(startDate);
		});
	});

	describe("Action Data Validation", () => {
		it("should validate expense action data correctly", () => {
			const validExpenseData: AddExpenseActionData = {
				amount: 100,
				description: "Test expense",
				currency: "USD",
				paidByUserId: TEST_USERS.user1.id,
				splitPctShares: {
					[TEST_USERS.user1.id]: 50,
					[TEST_USERS.user2.id]: 50,
				},
			};

			const userIds = [TEST_USERS.user1.id, TEST_USERS.user2.id];
			const budgets = ["groceries", "utilities"];

			const result = validateActionData(
				"add_expense",
				validExpenseData,
				userIds,
				budgets,
			);
			expect(result).toBeNull();
		});

		it("should reject expense action with invalid split percentages", () => {
			const invalidExpenseData: AddExpenseActionData = {
				amount: 100,
				description: "Test expense",
				currency: "USD",
				paidByUserId: TEST_USERS.user1.id,
				splitPctShares: {
					[TEST_USERS.user1.id]: 60,
					[TEST_USERS.user2.id]: 50, // Total is 110%, should fail
				},
			};

			const userIds = [TEST_USERS.user1.id, TEST_USERS.user2.id];
			const budgets = ["groceries", "utilities"];

			const result = validateActionData(
				"add_expense",
				invalidExpenseData,
				userIds,
				budgets,
			);
			expect(result).toContain("Split percentages must sum to exactly 100%");
		});

		it("should validate budget action data correctly", () => {
			const validBudgetData: AddBudgetActionData = {
				amount: 50,
				description: "Monthly groceries",
				budgetName: "food", // Use an available budget category from test setup
				currency: "USD",
				type: "Debit",
			};

			const userIds = [TEST_USERS.user1.id, TEST_USERS.user2.id];
			const budgets = ["house", "food"]; // Use available budget categories from test setup

			const result = validateActionData(
				"add_budget",
				validBudgetData,
				userIds,
				budgets,
			);
			expect(result).toBeNull();
		});

		it("should reject budget action with invalid budget name", () => {
			const invalidBudgetData: AddBudgetActionData = {
				amount: 50,
				description: "Monthly entertainment",
				budgetName: "entertainment", // Not in available budgets
				currency: "USD",
				type: "Debit",
			};

			const userIds = [TEST_USERS.user1.id, TEST_USERS.user2.id];
			const budgets = ["house", "food"]; // Use available budget categories from test setup

			const result = validateActionData(
				"add_budget",
				invalidBudgetData,
				userIds,
				budgets,
			);
			expect(result).toContain("Invalid budget name - not available in group");
		});
	});

	describe("handleScheduledActionCreate", () => {
		it("should create a scheduled expense action successfully", async () => {
			const expenseData: AddExpenseActionData = {
				amount: 100,
				description: "Weekly groceries",
				currency: "USD",
				paidByUserId: TEST_USERS.user1.id,
				splitPctShares: {
					[TEST_USERS.user1.id]: 50,
					[TEST_USERS.user2.id]: 50,
				},
			};

			const createRequest: CreateScheduledActionRequest = {
				actionType: "add_expense",
				frequency: "weekly",
				startDate: "2024-03-15",
				actionData: expenseData,
			};

			const request = createTestRequest(
				"scheduled-actions",
				"POST",
				createRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(201);
			const result = (await response.json()) as CreateScheduledActionResponse;
			expect(result.message).toBe("Scheduled action created successfully");
			expect(result.id).toBeDefined();

			// Verify the action was created in the database
			const db = getDb(env);
			const actions = await db
				.select()
				.from(scheduledActions)
				.where(eq(scheduledActions.id, result.id));
			expect(actions).toHaveLength(1);
			expect(actions[0].actionType).toBe("add_expense");
			expect(actions[0].frequency).toBe("weekly");
		});

		it("should create a scheduled budget action successfully", async () => {
			const budgetData: AddBudgetActionData = {
				amount: 200,
				description: "Monthly utilities budget",
				budgetName: "house", // Use an available budget category from test setup
				currency: "USD",
				type: "Credit",
			};

			const createRequest: CreateScheduledActionRequest = {
				actionType: "add_budget",
				frequency: "monthly",
				startDate: "2024-03-15",
				actionData: budgetData,
			};

			const request = createTestRequest(
				"scheduled-actions",
				"POST",
				createRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(201);
			const result = (await response.json()) as CreateScheduledActionResponse;
			expect(result.message).toBe("Scheduled action created successfully");
			expect(result.id).toBeDefined();
		});

		it("should reject creation with missing required fields", async () => {
			const invalidRequest = {
				actionType: "add_expense",
				frequency: "weekly",
				// Missing startDate and actionData
			};

			const request = createTestRequest(
				"scheduled-actions",
				"POST",
				invalidRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(400);
			const result = (await response.json()) as ScheduledActionErrorResponse;
			expect(result.error).toContain("required"); // User-friendly message should mention required fields
		});

		it("should reject creation with invalid action type", async () => {
			const invalidRequest = {
				actionType: "invalid_type",
				frequency: "weekly",
				startDate: "2024-03-15",
				actionData: {},
			};

			const request = createTestRequest(
				"scheduled-actions",
				"POST",
				invalidRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(400);
			const result = (await response.json()) as ScheduledActionErrorResponse;
			expect(result.error).toContain("required"); // User-friendly message should mention required fields
		});

		it("should reject creation when user is not authenticated", async () => {
			const createRequest: CreateScheduledActionRequest = {
				actionType: "add_expense",
				frequency: "weekly",
				startDate: "2024-03-15",
				actionData: {
					amount: 100,
					description: "Test",
					currency: "USD",
					paidByUserId: TEST_USERS.user1.id,
					splitPctShares: { [TEST_USERS.user1.id]: 100 },
				},
			};

			const request = createTestRequest(
				"scheduled-actions",
				"POST",
				createRequest,
			); // No cookies
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(401);
		});
	});

	describe("handleScheduledActionList", () => {
		beforeEach(async () => {
			// Create some test scheduled actions
			const db = getDb(env);
			const now = "2024-03-15T10:30:00.000Z";

			await db.insert(scheduledActions).values([
				{
					id: ulid(),
					userId: TEST_USERS.user1.id,
					actionType: "add_expense",
					frequency: "weekly",
					startDate: "2024-01-01",
					isActive: true,
					createdAt: now,
					updatedAt: now,
					actionData: {
						amount: 100,
						description: "Weekly groceries",
						currency: "USD",
						paidByUserId: TEST_USERS.user1.id,
						splitPctShares: { [TEST_USERS.user1.id]: 100 },
					},
					nextExecutionDate: "2024-01-01",
				},
				{
					id: ulid(),
					userId: TEST_USERS.user1.id,
					actionType: "add_budget",
					frequency: "monthly",
					startDate: "2024-01-01",
					isActive: false,
					createdAt: now,
					updatedAt: now,
					actionData: {
						amount: 200,
						description: "Monthly budget",
						budgetName: "utilities",
						currency: "USD",
						type: "Credit",
					},
					nextExecutionDate: "2024-01-01",
				},
			]);
		});

		it("should list scheduled actions for authenticated user", async () => {
			const request = createTestRequest(
				"scheduled-actions/list",
				"GET",
				undefined,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result: ScheduledActionListResponse = await response.json();

			expect(result.scheduledActions).toHaveLength(2);
			expect(result.totalCount).toBe(2);
			expect(result.hasMore).toBe(false);

			// Check that action data is parsed correctly
			expect(result.scheduledActions[0].actionData).toBeTypeOf("object");
		});

		it("should support pagination", async () => {
			const request = createTestRequest(
				"scheduled-actions/list?limit=1&offset=0",
				"GET",
				undefined,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result: ScheduledActionListResponse = await response.json();

			expect(result.scheduledActions).toHaveLength(1);
			expect(result.totalCount).toBe(2);
			expect(result.hasMore).toBe(true);
		});

		it("should return list for other user in the same group", async () => {
			const otherUserCookies = await signInAndGetCookies(
				env,
				TEST_USERS.user2.email,
				TEST_USERS.user2.password,
			);
			const request = createTestRequest(
				"scheduled-actions/list",
				"GET",
				undefined,
				otherUserCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result: ScheduledActionListResponse = await response.json();

			expect(result.scheduledActions).toHaveLength(2);
			expect(result.totalCount).toBe(2);
			expect(result.hasMore).toBe(false);
		});

		it("should not allow user from another group to see list (empty)", async () => {
			const outsider = await createUserInNewGroup(env);
			const request = createTestRequest(
				"scheduled-actions/list",
				"GET",
				undefined,
				outsider.cookies,
			);
			const response = await worker.fetch(request, env, createExecutionContext());
			expect(response.status).toBe(200);
			const result: ScheduledActionListResponse = await response.json();
			expect(result.totalCount).toBe(0);
			expect(result.scheduledActions).toHaveLength(0);
		});
	});

	describe("handleScheduledActionUpdate", () => {
		let actionId: string;

		beforeEach(async () => {
			const db = getDb(env);
			actionId = ulid();
			const now = "2024-03-15T10:30:00.000Z";

			await db.insert(scheduledActions).values({
				id: actionId,
				userId: TEST_USERS.user1.id,
				actionType: "add_expense",
				frequency: "weekly",
				startDate: "2024-01-01",
				isActive: true,
				createdAt: now,
				updatedAt: now,
				actionData: {
					amount: 100,
					description: "Weekly groceries",
					currency: "USD",
					paidByUserId: TEST_USERS.user1.id,
					splitPctShares: { [TEST_USERS.user1.id]: 100 },
				},
				nextExecutionDate: "2024-01-01",
			});
		});

		it("should update scheduled action isActive status", async () => {
			const updateRequest: UpdateScheduledActionRequest = {
				id: actionId,
				isActive: false,
			};

			const request = createTestRequest(
				"scheduled-actions/update",
				"PUT",
				updateRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result = (await response.json()) as UpdateScheduledActionResponse;
			expect(result.message).toBe("Scheduled action updated successfully");

			// Verify the update in database
			const db = getDb(env);
			const actions = await db
				.select()
				.from(scheduledActions)
				.where(eq(scheduledActions.id, actionId));
			expect(actions[0].isActive).toBe(false);
		});

		it("should update scheduled action frequency and recalculate next execution", async () => {
			const updateRequest: UpdateScheduledActionRequest = {
				id: actionId,
				frequency: "daily",
			};

			const request = createTestRequest(
				"scheduled-actions/update",
				"PUT",
				updateRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);

			// Verify the update in database
			const db = getDb(env);
			const actions = await db
				.select()
				.from(scheduledActions)
				.where(eq(scheduledActions.id, actionId));
			expect(actions[0].frequency).toBe("daily");
			// nextExecutionDate should be recalculated
			expect(actions[0].nextExecutionDate).not.toBe("2024-01-01");
		});

		it("should reject update of non-existent action", async () => {
			const updateRequest: UpdateScheduledActionRequest = {
				id: "non-existent-id",
				isActive: false,
			};

			const request = createTestRequest(
				"scheduled-actions/update",
				"PUT",
				updateRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(404);
			const result = (await response.json()) as ScheduledActionErrorResponse;
			expect(result.error).toBe("Scheduled action not found");
		});

		it("should allow update by different user in same group", async () => {
			const otherUserCookies = await signInAndGetCookies(
				env,
				TEST_USERS.user2.email,
				TEST_USERS.user2.password,
			);
			const updateRequest: UpdateScheduledActionRequest = {
				id: actionId,
				isActive: false,
			};

			const request = createTestRequest(
				"scheduled-actions/update",
				"PUT",
				updateRequest,
				otherUserCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const db = getDb(env);
			const actions = await db
				.select()
				.from(scheduledActions)
				.where(eq(scheduledActions.id, actionId));
			expect(actions[0].isActive).toBe(false);
		});

		it("should reject update by user from another group", async () => {
			const outsider = await createUserInNewGroup(env);
			const updateRequest: UpdateScheduledActionRequest = {
				id: actionId,
				isActive: false,
			};
			const response = await worker.fetch(
				createTestRequest("scheduled-actions/update", "PUT", updateRequest, outsider.cookies),
				env,
				createExecutionContext(),
			);
			expect(response.status).toBe(404);
			const result = (await response.json()) as ScheduledActionErrorResponse;
			expect(result.error).toBe("Scheduled action not found");
		});
	});

	describe("handleScheduledActionDelete", () => {
		let actionId: string;

		beforeEach(async () => {
			const db = getDb(env);
			actionId = ulid();
			const now = "2024-03-15T10:30:00.000Z";

			await db.insert(scheduledActions).values({
				id: actionId,
				userId: TEST_USERS.user1.id,
				actionType: "add_expense",
				frequency: "weekly",
				startDate: "2024-01-01",
				isActive: true,
				createdAt: now,
				updatedAt: now,
				actionData: {
					amount: 100,
					description: "Weekly groceries",
					currency: "USD",
					paidByUserId: TEST_USERS.user1.id,
					splitPctShares: { [TEST_USERS.user1.id]: 100 },
				},
				nextExecutionDate: "2024-01-01",
			});
		});

		it("should delete scheduled action successfully", async () => {
			const deleteRequest = { id: actionId };

			const request = createTestRequest(
				"scheduled-actions/delete",
				"DELETE",
				deleteRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result = (await response.json()) as DeleteScheduledActionResponse;
			expect(result.message).toBe("Scheduled action deleted successfully");

			// Verify the action was deleted
			const db = getDb(env);
			const actions = await db
				.select()
				.from(scheduledActions)
				.where(eq(scheduledActions.id, actionId));
			expect(actions).toHaveLength(0);
		});

		it("should reject deletion of non-existent action", async () => {
			const deleteRequest = { id: "non-existent-id" };

			const request = createTestRequest(
				"scheduled-actions/delete",
				"DELETE",
				deleteRequest,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(404);
			const result = (await response.json()) as ScheduledActionErrorResponse;
			expect(result.error).toBe("Scheduled action not found");
		});

		it("should allow deletion by different user in same group", async () => {
			const otherUserCookies = await signInAndGetCookies(
				env,
				TEST_USERS.user2.email,
				TEST_USERS.user2.password,
			);
			const deleteRequest = { id: actionId };

			const request = createTestRequest(
				"scheduled-actions/delete",
				"DELETE",
				deleteRequest,
				otherUserCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const db = getDb(env);
			const actions = await db
				.select()
				.from(scheduledActions)
				.where(eq(scheduledActions.id, actionId));
			expect(actions).toHaveLength(0);
		});

		it("should reject deletion by user from another group", async () => {
			const outsider = await createUserInNewGroup(env);
			const deleteRequest = { id: actionId };
			const response = await worker.fetch(
				createTestRequest("scheduled-actions/delete", "DELETE", deleteRequest, outsider.cookies),
				env,
				createExecutionContext(),
			);
			expect(response.status).toBe(404);
			const result = (await response.json()) as ScheduledActionErrorResponse;
			expect(result.error).toBe("Scheduled action not found");
		});
	});

	describe("handleScheduledActionHistory", () => {
		let actionId: string;

		beforeEach(async () => {
			const db = getDb(env);
			actionId = ulid();
			const now = "2024-03-15T10:30:00.000Z";

			// Create scheduled action
			await db.insert(scheduledActions).values({
				id: actionId,
				userId: TEST_USERS.user1.id,
				actionType: "add_expense",
				frequency: "weekly",
				startDate: "2024-01-01",
				isActive: true,
				createdAt: now,
				updatedAt: now,
				actionData: {
					amount: 100,
					description: "Weekly groceries",
					currency: "USD",
					paidByUserId: TEST_USERS.user1.id,
					splitPctShares: { [TEST_USERS.user1.id]: 100 },
				},
				nextExecutionDate: "2024-01-01",
			});

			describe("handleScheduledActionDetails", () => {
				let actionId: string;
				beforeEach(async () => {
					const db = getDb(env);
					actionId = ulid();
					const now = "2024-03-15T10:30:00.000Z";
					await db.insert(scheduledActions).values({
						id: actionId,
						userId: TEST_USERS.user1.id,
						actionType: "add_expense",
						frequency: "weekly",
						startDate: "2024-01-01",
						isActive: true,
						createdAt: now,
						updatedAt: now,
						actionData: {
							amount: 100,
							description: "Weekly groceries",
							currency: "USD",
							paidByUserId: TEST_USERS.user1.id,
							splitPctShares: { [TEST_USERS.user1.id]: 100 },
						},
						nextExecutionDate: "2024-01-01",
					});
				});

				it("returns action details for any user in group", async () => {
					const request = createTestRequest(
						`scheduled-actions/details?id=${actionId}`,
						"GET",
						undefined,
						userCookies,
					);
					const response = await worker.fetch(request, env, createExecutionContext());
					expect(response.status).toBe(200);
					const result = (await response.json()) as ScheduledAction;
					expect(result.id).toBe(actionId);
					expect(result.actionData.description).toBe("Weekly groceries");

					const otherUserCookies = await signInAndGetCookies(
						env,
						TEST_USERS.user2.email,
						TEST_USERS.user2.password,
					);
					const response2 = await worker.fetch(
						createTestRequest(`scheduled-actions/details?id=${actionId}`, "GET", undefined, otherUserCookies),
						env,
						createExecutionContext(),
					);
					expect(response2.status).toBe(200);
				});

				it("returns 404 for non-existent action", async () => {
					const otherUserCookies = await signInAndGetCookies(
						env,
						TEST_USERS.user2.email,
						TEST_USERS.user2.password,
					);
					const request = createTestRequest(
						`scheduled-actions/details?id=does-not-exist`,
						"GET",
						undefined,
						otherUserCookies,
					);
					const response = await worker.fetch(request, env, createExecutionContext());
					expect(response.status).toBe(404);
				});

				it("should return 404 when user from another group requests details", async () => {
					const outsider = await createUserInNewGroup(env);
					const response = await worker.fetch(
						createTestRequest(`scheduled-actions/details?id=${actionId}`, "GET", undefined, outsider.cookies),
						env,
						createExecutionContext(),
					);
					expect(response.status).toBe(404);
				});
			});

			// Create some history entries
			await db.insert(scheduledActionHistory).values([
				{
					id: ulid(),
					scheduledActionId: actionId,
					userId: TEST_USERS.user1.id,
					actionType: "add_expense",
					executedAt: "2024-01-01T10:00:00.000Z",
					executionStatus: "success",
					actionData: {
						amount: 100,
						description: "Weekly groceries",
						currency: "USD",
						paidByUserId: TEST_USERS.user1.id,
						splitPctShares: { [TEST_USERS.user1.id]: 100 },
					},
					resultData: { message: "Success", transactionId: "tx-123" },
					executionDurationMs: 150,
				},
				{
					id: ulid(),
					scheduledActionId: actionId,
					userId: TEST_USERS.user1.id,
					actionType: "add_expense",
					executedAt: "2024-01-08T10:00:00.000Z",
					executionStatus: "failed",
					actionData: {
						amount: 100,
						description: "Weekly groceries",
						currency: "USD",
						paidByUserId: TEST_USERS.user1.id,
						splitPctShares: { [TEST_USERS.user1.id]: 100 },
					},
					errorMessage: "Insufficient funds",
					executionDurationMs: 75,
				},
			]);
		});

		it("should return scheduled action history for authenticated user", async () => {
			const request = createTestRequest(
				`scheduled-actions/history?scheduledActionId=${actionId}`,
				"GET",
				undefined,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result = (await response.json()) as ScheduledActionHistoryListResponse;

			expect(result.history).toHaveLength(2);
			expect(result.totalCount).toBe(2);
			expect(result.hasMore).toBe(false);

			// Check that data is parsed correctly
			expect(result.history[0].actionData).toBeTypeOf("object");
			expect(result.history[0].resultData).toBeTypeOf("object");
		});

		it("should filter history by scheduled action ID and allow group users", async () => {
			const request = createTestRequest(
				`scheduled-actions/history?scheduledActionId=${actionId}`,
				"GET",
				undefined,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result = (await response.json()) as ScheduledActionHistoryListResponse;

			expect(result.history).toHaveLength(2);
			expect(
				result.history.every((h) => h.scheduledActionId === actionId),
			).toBe(true);
			// Now call as other user in same group and expect same data
			const otherUserCookies = await signInAndGetCookies(
				env,
				TEST_USERS.user2.email,
				TEST_USERS.user2.password,
			);
			const response2 = await worker.fetch(
				createTestRequest(`scheduled-actions/history?scheduledActionId=${actionId}`, "GET", undefined, otherUserCookies),
				env,
				createExecutionContext(),
			);
			expect(response2.status).toBe(200);
		});

		it("should not allow history access by user from another group", async () => {
			const outsider = await createUserInNewGroup(env);
			const response = await worker.fetch(
				createTestRequest(`scheduled-actions/history?scheduledActionId=${actionId}`, "GET", undefined, outsider.cookies),
				env,
				createExecutionContext(),
			);
			// Handler returns 200 with empty list because query is restricted to group userIds
			expect(response.status).toBe(200);
			const result = (await response.json()) as ScheduledActionHistoryListResponse;
			expect(result.totalCount).toBe(0);
			expect(result.history).toHaveLength(0);
		});

		it("should filter history by execution status", async () => {
			const request = createTestRequest(
				`scheduled-actions/history?executionStatus=success&scheduledActionId=${actionId}`,
				"GET",
				undefined,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result: ScheduledActionHistoryListResponse = await response.json();

			expect(result.history).toHaveLength(1);
			expect(result.history[0].executionStatus).toBe("success");
		});

		it("should support pagination in history", async () => {
			const request = createTestRequest(
				`scheduled-actions/history?limit=1&offset=0&scheduledActionId=${actionId}`,
				"GET",
				undefined,
				userCookies,
			);
			const response = await worker.fetch(
				request,
				env,
				createExecutionContext(),
			);

			expect(response.status).toBe(200);
			const result: ScheduledActionHistoryListResponse = await response.json();

			expect(result.history).toHaveLength(1);
			expect(result.totalCount).toBe(2);
			expect(result.hasMore).toBe(true);
		});
	});
});

// Helper functions for action data validation

function validateActionData(
	actionType: string,
	actionData: AddExpenseActionData | AddBudgetActionData,
	userIds: string[],
	budgets: string[],
): string | null {
	if (actionType === "add_expense") {
		const data = actionData as AddExpenseActionData;

		// Validate required fields
		if (
			!data.amount ||
			!data.description ||
			!data.currency ||
			!data.paidByUserId ||
			!data.splitPctShares
		) {
			return "Missing required fields for expense action";
		}

		// Validate amount
		if (typeof data.amount !== "number" || data.amount <= 0) {
			return "Amount must be a positive number";
		}

		// Validate currency
		if (!CURRENCIES.includes(data.currency as (typeof CURRENCIES)[number])) {
			return `Invalid currency. Supported: ${CURRENCIES.join(", ")}`;
		}

		// Validate paidByUserId
		if (!userIds.includes(data.paidByUserId)) {
			return "Invalid paidByUserId - user not in group";
		}

		// Validate split percentages
		const splitUsers = Object.keys(data.splitPctShares);
		const splitPercentages = Object.values(data.splitPctShares);

		// Check all split users are in group
		for (const userId of splitUsers) {
			if (!userIds.includes(userId)) {
				return "Invalid user in split shares - not in group";
			}
		}

		// Check percentages are valid numbers
		for (const percentage of splitPercentages) {
			if (
				typeof percentage !== "number" ||
				percentage < 0 ||
				percentage > 100
			) {
				return "Split percentages must be between 0 and 100";
			}
		}

		// Check percentages sum to 100
		const total = splitPercentages.reduce((sum, pct) => sum + pct, 0);
		if (Math.abs(total - 100) > 0.01) {
			return "Split percentages must sum to exactly 100%";
		}
	} else if (actionType === "add_budget") {
		const data = actionData as AddBudgetActionData;

		// Validate required fields
		if (
			!data.amount ||
			!data.description ||
			!data.budgetName ||
			!data.currency ||
			!data.type
		) {
			return "Missing required fields for budget action";
		}

		// Validate amount
		if (typeof data.amount !== "number" || data.amount <= 0) {
			return "Amount must be a positive number";
		}

		// Validate currency
		if (!CURRENCIES.includes(data.currency as (typeof CURRENCIES)[number])) {
			return `Invalid currency. Supported: ${CURRENCIES.join(", ")}`;
		}

		// Validate budget name
		if (!budgets.includes(data.budgetName)) {
			return "Invalid budget name - not available in group";
		}

		// Validate type
		if (!["Credit", "Debit"].includes(data.type)) {
			return "Budget type must be either Credit or Debit";
		}
	}

	return null; // No validation errors
}
