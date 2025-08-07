import { env as testEnv } from "cloudflare:test";
import { and, eq, lte } from "drizzle-orm";
import { ulid } from "ulid";

import type {
    AddBudgetActionData,
    AddExpenseActionData,
} from "../../../shared-types";
import { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import {
    budget,
    groups,
    scheduledActionHistory,
    scheduledActions,
    transactions,
} from "../db/schema/schema";
import { handleCron } from "../handlers/cron";
import { formatSQLiteTime } from "../utils";
import { completeCleanupDatabase, setupAndCleanDatabase } from "./test-utils";

// Mock workflow instance
const mockWorkflowInstance = {
	id: "mock-workflow-id",
	status: vi.fn().mockResolvedValue({ status: "complete" }),
	result: vi.fn().mockResolvedValue({
		success: true,
		resultData: { type: "expense_created", transactionId: "test-tx" },
		executionDurationMs: 100,
	}),
};

describe("Scheduled Actions Workflows", () => {
	// biome-ignore lint/suspicious/noExplicitAny: Test database mock
	let db: any;
	let testUserId: string;
	let testActionId: string;
	beforeAll(async () => {
		await setupAndCleanDatabase(testEnv);
	});
	beforeEach(async () => {
		await completeCleanupDatabase(testEnv);
		db = getDb(testEnv);
		vi.clearAllMocks();

		// Mock the workflow bindings on the test environment
		testEnv.ORCHESTRATOR_WORKFLOW = {
			create: vi.fn().mockResolvedValue(mockWorkflowInstance),
			get: vi.fn().mockResolvedValue(mockWorkflowInstance),
		// biome-ignore lint/suspicious/noExplicitAny: Test workflow mock
		} as any;
		testEnv.PROCESSOR_WORKFLOW = {
			create: vi.fn().mockResolvedValue(mockWorkflowInstance),
			get: vi.fn().mockResolvedValue(mockWorkflowInstance),
		// biome-ignore lint/suspicious/noExplicitAny: Test workflow mock
		} as any;

		// Set required environment variables for cron handler
		testEnv.GROUP_IDS = "1";

		// Create test user
		testUserId = ulid();
		await db.insert(user).values({
			id: testUserId,
			email: "test@example.com",
			name: "Test User",
			firstName: "Test",
			lastName: "User",
			groupid: 1,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Create test scheduled action
		testActionId = ulid();
		const expenseActionData: AddExpenseActionData = {
			description: "Test recurring expense",
			amount: 50.0,
			currency: "GBP",
			paidByUserId: testUserId,
			splitPctShares: { [testUserId]: 100 },
		};

		await db.insert(scheduledActions).values({
			id: testActionId,
			userId: testUserId,
			actionType: "add_expense",
			frequency: "monthly",
			startDate: "2024-01-01",
			isActive: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			actionData: expenseActionData,
			nextExecutionDate: "2024-01-15",
		});
	});

	afterEach(async () => {
		// Complete cleanup for total test isolation
		await completeCleanupDatabase(testEnv);
	});

	describe("Cron Handler - Workflow Integration", () => {
		it("should trigger orchestrator workflow on daily cron", async () => {
			await handleCron(testEnv, "0 0 * * *");

			expect(testEnv.ORCHESTRATOR_WORKFLOW.create).toHaveBeenCalledWith({
				id: expect.stringMatching(/^orchestrator-\d{4}-\d{2}-\d{2}-\d+$/),
				params: {
					triggerDate: expect.stringMatching(
						/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
					),
				},
			});
		});

		it("should not trigger workflow for non-daily cron", async () => {
			await handleCron(testEnv, "0 */6 * * *"); // Every 6 hours

			expect(testEnv.ORCHESTRATOR_WORKFLOW.create).not.toHaveBeenCalled();
		});

		it("should handle workflow creation errors gracefully", async () => {
			// Mock workflow creation to throw an error
			testEnv.ORCHESTRATOR_WORKFLOW.create = vi
				.fn()
				.mockRejectedValue(new Error("Workflow creation failed"));

			await expect(handleCron(testEnv, "0 0 * * *")).rejects.toThrow(
				"Workflow creation failed",
			);
		});
	});

	// Helper function to create complete mock scheduled actions
	function createMockScheduledAction(overrides: Partial<typeof scheduledActions.$inferSelect> = {}): typeof scheduledActions.$inferSelect {
		const now = formatSQLiteTime(new Date());
		const currentDate = now.split("T")[0];
		
		const defaultActionData = {
			description: "Test expense",
			amount: 100,
			currency: "USD",
			paidByUserId: "test-user",
			splitPctShares: { "test-user": 100 },
			type: "add_expense" as const,
		};
		
		return {
			id: `test_action_${Date.now()}_${Math.random()}`,
			userId: "test-user",
			actionType: "add_expense" as const,
			actionData: defaultActionData,
			frequency: "daily" as const,
			startDate: currentDate,
			isActive: true,
			createdAt: now,
			updatedAt: now,
			lastExecutedAt: null,
			nextExecutionDate: currentDate,
			...overrides
		};
	}

	describe("Orchestrator Workflow Step Functions", () => {
		beforeEach(async () => {
			// Create a group for the users
			await db.insert(groups).values({
				groupid: 1,
				groupName: "Test Group",
				budgets: JSON.stringify(["house", "groceries"]),
			});
		});

		it("should get pending scheduled actions correctly", async () => {
			const { getPendingScheduledActions } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const currentDate = "2024-01-15";
			const pendingActions = await getPendingScheduledActions(
				testEnv,
				currentDate,
			);

			expect(pendingActions).toHaveLength(1);
			expect(pendingActions[0].id).toBe(testActionId);
			expect(pendingActions[0].isActive).toBe(true);
		});

		it("should filter actions without history correctly", async () => {
			const { filterActionsWithoutHistory } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const currentDate = "2024-01-15";
			const pendingActions = [createMockScheduledAction({ 
				id: testActionId,
				userId: testUserId,
			})];

			const result = await filterActionsWithoutHistory(
				testEnv,
				pendingActions,
				currentDate,
			);

			expect(result.actionsToProcess).toHaveLength(1);
			expect(result.alreadyProcessedResults).toHaveLength(0);
			expect(result.actionsToProcess[0].id).toBe(testActionId);
		});

		it("should create batch history entries", async () => {
			const { createBatchHistoryEntries } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const currentDate = "2024-01-15";
			const batchInstanceId = "batch-2024-01-15-1";
			const batchActions = [createMockScheduledAction({ 
				id: testActionId,
				userId: testUserId,
			})];

			const validActionIds = await createBatchHistoryEntries(
				testEnv,
				batchActions,
				batchInstanceId,
				currentDate,
			);

			expect(validActionIds).toHaveLength(1);
			expect(validActionIds[0]).toBe(testActionId);

			// Verify history entry was created
			const historyResult = await db
				.select()
				.from(scheduledActionHistory)
				.where(eq(scheduledActionHistory.scheduledActionId, testActionId))
				.limit(1);
			expect(historyResult).toHaveLength(1);
			expect(historyResult[0].executionStatus).toBe("started");
			expect(historyResult[0].workflowInstanceId).toBe(batchInstanceId);
		});

		it("should handle batch errors correctly", async () => {
			const { handleBatchError } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const currentDate = "2024-01-15";
			const batchInstanceId = "batch-2024-01-15-1";
			const batchActions = [createMockScheduledAction({ 
				id: testActionId,
				userId: testUserId,
			})];
			const error = new Error("Test batch error");

			const failedResults = await handleBatchError(
				testEnv,
				batchActions,
				batchInstanceId,
				currentDate,
				error,
			);

			expect(failedResults).toHaveLength(1);
			expect(failedResults[0].actionId).toBe(testActionId);
			expect(failedResults[0].status).toBe("failed");
			expect(failedResults[0].error).toBe("Test batch error");

			// Verify failed history entry was created
			const historyResult = await db
				.select()
				.from(scheduledActionHistory)
				.where(eq(scheduledActionHistory.scheduledActionId, testActionId))
				.limit(1);
			expect(historyResult).toHaveLength(1);
			expect(historyResult[0].executionStatus).toBe("failed");
			expect(historyResult[0].errorMessage).toBe("Test batch error");
		});
	});

	describe("Processor Workflow Step Functions", () => {
		beforeEach(async () => {
			// Create a group for the users
			await db.insert(groups).values({
				groupid: 1,
				groupName: "Test Group",
				budgets: JSON.stringify(["house", "groceries"]),
			});
		});

		it("should fetch actions with users correctly", async () => {
			const { fetchActionsWithUsers } = await import(
				"../workflows/scheduled-actions-processor"
			);

			const actionIds = [testActionId];
			const actionsResult = await fetchActionsWithUsers(testEnv, actionIds);

			expect(actionsResult).toHaveLength(1);
			expect(actionsResult[0].scheduled_actions.id).toBe(testActionId);
			expect(actionsResult[0].user.id).toBe(testUserId);
			expect(actionsResult[0].user.groupid).toBe(1);
		});

		it("should process expense action correctly", async () => {
			const { processExpenseAction } = await import(
				"../workflows/scheduled-actions-processor"
			);

			const action = createMockScheduledAction({
				id: testActionId,
				actionData: {
					description: "Test recurring expense",
					amount: 50.0,
					currency: "GBP",
					paidByUserId: testUserId,
					splitPctShares: { [testUserId]: 100 },
					type: "Credit" as const,
				},
			});
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
			const userData = { groupid: 1 } as any;
			const currentDate = "2024-01-15";

			const result = await processExpenseAction(
				testEnv,
				action,
				userData,
				currentDate,
			);

			expect(result.resultData).toBeDefined();
			expect(result.statements.length).toBeGreaterThan(0);
		});

		it("should process budget action correctly", async () => {
			const { processBudgetAction } = await import(
				"../workflows/scheduled-actions-processor"
			);

			const action = createMockScheduledAction({
				id: testActionId,
				actionType: "add_budget" as const,
				actionData: {
					description: "Monthly house budget",
					amount: 800.0,
					currency: "GBP",
					budgetName: "house",
					type: "Credit",
				},
			});
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
			const userData = { groupid: 1 } as any;
			const currentDate = "2024-01-15";

			const result = await processBudgetAction(
				testEnv,
				action,
				userData,
				currentDate,
			);

			expect(result.resultData).toBeDefined();
			expect(result.resultData?.message).toContain("Budget entry created");
			expect(result.statements.length).toBeGreaterThan(0);
		});

		it("should handle action errors correctly", async () => {
			const { handleActionError } = await import(
				"../workflows/scheduled-actions-processor"
			);

			const actionId = testActionId;
			const historyId = `hist_${testActionId}-2024-01-15`;
			const error = new Error("Test action error");
			const executionDurationMs = 100;

			// First create a history entry
			await db.insert(scheduledActionHistory).values({
				id: historyId,
				scheduledActionId: actionId,
				userId: testUserId,
				actionType: "add_expense",
				executedAt: "2024-01-15 10:00:00",
				executionStatus: "started",
				workflowInstanceId: "test-workflow",
				workflowStatus: "running",
				actionData: { description: "Test expense" },
			});

			await handleActionError(
				testEnv,
				actionId,
				historyId,
				error,
				executionDurationMs,
			);

			// Verify history was updated with error
			const historyResult = await db
				.select()
				.from(scheduledActionHistory)
				.where(eq(scheduledActionHistory.id, historyId))
				.limit(1);
			expect(historyResult).toHaveLength(1);
			expect(historyResult[0].executionStatus).toBe("failed");
			expect(historyResult[0].errorMessage).toBe("Test action error");
			expect(historyResult[0].executionDurationMs).toBe(100);
		});
	});

	describe("Workflow Utility Functions", () => {
		beforeEach(async () => {
			// Create a group for the users
			await db.insert(groups).values({
				groupid: 1,
				groupName: "Test Group",
				budgets: JSON.stringify(["house", "groceries"]),
			});
		});

		it("should generate deterministic transaction IDs", async () => {
			const { generateDeterministicTransactionId } = await import(
				"../utils/scheduled-action-execution"
			);

			const actionId = "test-action-123";
			const date = "2024-01-15";

			const id1 = generateDeterministicTransactionId(actionId, date);
			const id2 = generateDeterministicTransactionId(actionId, date);

			expect(id1).toBe(id2);
			expect(id1).toBe(`tx_${actionId}_${date}`);
		});

		it("should generate deterministic budget IDs", async () => {
			const { generateDeterministicBudgetId } = await import(
				"../utils/scheduled-action-execution"
			);

			const actionId = "test-action-123";
			const date = "2024-01-15";

			const id1 = generateDeterministicBudgetId(actionId, date);
			const id2 = generateDeterministicBudgetId(actionId, date);

			expect(id1).toBe(id2);
			expect(id1).toBe(`bg_${actionId}_${date}`);
		});

		it("should create split transaction statements with deterministic ID", async () => {
			const { createSplitTransactionStatements } = await import(
				"../utils/scheduled-action-execution"
			);

			const expenseData: AddExpenseActionData = {
				description: "Test recurring expense",
				amount: 50.0,
				currency: "GBP",
				paidByUserId: testUserId,
				splitPctShares: { [testUserId]: 100 },
			};

			const transactionId = "test-tx-123";
			const result = await createSplitTransactionStatements(
				expenseData,
				1,
				db,
				testEnv,
				transactionId,
			);

			expect(result.resultData).toBeDefined();
			expect(result.resultData?.transactionId).toBe(transactionId);
			expect(result.statements.length).toBeGreaterThan(0);

			// Execute the statements
			const queries = result.statements.map((stmt) => stmt.query);
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch requires any type
		await db.batch(queries as [any, ...any[]]);

			// Verify transaction was created with the specified ID
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, transactionId))
				.limit(1);
			expect(transactionResult).toHaveLength(1);
			expect(transactionResult[0].transactionId).toBe(transactionId);
		});

		it("should create budget entry statements with deterministic ID", async () => {
			const { createBudgetEntryStatementsForScheduledAction } = await import(
				"../utils/scheduled-action-execution"
			);

			const budgetRequest = {
				amount: 800,
				description: "Monthly house budget",
				name: "house",
				groupid: 1,
				currency: "GBP" as const,
			};

			const budgetId = "test-budget-123";
			const result = await createBudgetEntryStatementsForScheduledAction(
				budgetRequest,
				db,
				budgetId,
			);

			expect(result.resultData).toBeDefined();
			expect(result.resultData?.message).toContain("Budget entry created");
			expect(result.statements.length).toBeGreaterThan(0);

			// Execute the statements
			const queries = result.statements.map((stmt) => stmt.query);
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch requires any type
		await db.batch(queries as [any, ...any[]]);

			// Verify budget was created with the specified ID
			const budgetResult = await db
				.select()
				.from(budget)
				.where(eq(budget.budgetId, budgetId))
				.limit(1);
			expect(budgetResult).toHaveLength(1);
			expect(budgetResult[0].budgetId).toBe(budgetId);
			expect(budgetResult[0].amount).toBe(800);
		});

		it("should handle idempotent transaction creation", async () => {
			const { createSplitTransactionStatements } = await import(
				"../utils/scheduled-action-execution"
			);

			const expenseData: AddExpenseActionData = {
				description: "Test recurring expense",
				amount: 50.0,
				currency: "GBP",
				paidByUserId: testUserId,
				splitPctShares: { [testUserId]: 100 },
			};

			const transactionId = "test-tx-duplicate";

			// Create transaction first time
			const result1 = await createSplitTransactionStatements(
				expenseData,
				1,
				db,
				testEnv,
				transactionId,
			);

			const queries1 = result1.statements.map((stmt) => stmt.query);
			await db.batch(queries1);

			// Try to create the same transaction again
			const result2 = await createSplitTransactionStatements(
				expenseData,
				1,
				db,
				testEnv,
				transactionId,
			);

			// Should return existing transaction data
			expect(result2.resultData).toBeDefined();
			expect(result2.resultData?.transactionId).toBe(transactionId);
			expect(result2.statements.length).toBe(0); // No new statements needed

			// Verify only one transaction exists
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, transactionId));
			expect(transactionResult).toHaveLength(1);
		});

		it("should handle idempotent budget creation", async () => {
			const { createBudgetEntryStatementsForScheduledAction } = await import(
				"../utils/scheduled-action-execution"
			);

			const budgetRequest = {
				amount: 800,
				description: "Monthly house budget",
				name: "house",
				groupid: 1,
				currency: "GBP" as const,
			};

			const budgetId = "test-budget-duplicate";

			// Create budget first time
			const result1 = await createBudgetEntryStatementsForScheduledAction(
				budgetRequest,
				db,
				budgetId,
			);

			const queries1 = result1.statements.map((stmt) => stmt.query);
			await db.batch(queries1);

			// Try to create the same budget again
			const result2 = await createBudgetEntryStatementsForScheduledAction(
				budgetRequest,
				db,
				budgetId,
			);

			// Should return existing budget data
			expect(result2.resultData).toBeDefined();
			expect(result2.resultData?.message).toContain("Budget already exists");
			expect(result2.statements.length).toBe(0); // No new statements needed

			// Verify only one budget entry exists
			const budgetResult = await db
				.select()
				.from(budget)
				.where(eq(budget.budgetId, budgetId));
			expect(budgetResult).toHaveLength(1);
		});
	});

	describe("Integration Tests", () => {
		beforeEach(async () => {
			// Create a group for the users
			await db.insert(groups).values({
				groupid: 1,
				groupName: "Test Group",
				budgets: JSON.stringify(["house", "groceries"]),
			});
		});

		it("should handle end-to-end expense workflow simulation", async () => {
			// Simulate the workflow process without directly instantiating workflow classes
			const triggerDate = "2024-01-15T00:00:00Z";
			const currentDate = triggerDate.split("T")[0];

			// Step 1: Check if action should be processed (simulating orchestrator logic)
			const actionsToRun = await db
				.select()
				.from(scheduledActions)
				.where(
					and(
						eq(scheduledActions.isActive, true),
						lte(scheduledActions.nextExecutionDate, currentDate),
					),
				);

			expect(actionsToRun.length).toBe(1);
			expect(actionsToRun[0].id).toBe(testActionId);

			// Step 2: Create history entry (simulating orchestrator)
			const historyId = `hist_${testActionId}-${currentDate}`;
			await db.insert(scheduledActionHistory).values({
				id: historyId,
				scheduledActionId: testActionId,
				userId: testUserId,
				actionType: "add_expense",
				executedAt: "2024-01-15 10:00:00",
				executionStatus: "started",
				workflowInstanceId: `batch-${currentDate}-1`,
				workflowStatus: "running",
				actionData: actionsToRun[0].actionData,
			});

			// Step 3: Process the action (simulating processor logic)
			const action = actionsToRun[0];
			const expenseData = action.actionData as AddExpenseActionData;
			const transactionId = `tx_${action.id}_${currentDate}`;

			const { createSplitTransactionStatements } = await import(
				"../utils/scheduled-action-execution"
			);
			const splitResult = await createSplitTransactionStatements(
				expenseData,
				1,
				db,
				testEnv,
				transactionId,
			);

			// Step 4: Execute all database operations in batch
			const allStatements = [
				...splitResult.statements,
				// Update scheduled action
				{
					query: db
						.update(scheduledActions)
						.set({
							lastExecutedAt: "2024-01-15 10:00:00",
							nextExecutionDate: "2024-02-15", // Next month
							updatedAt: "2024-01-15 10:00:00",
						})
						.where(eq(scheduledActions.id, action.id)),
				},
				// Update history to success
				{
					query: db
						.update(scheduledActionHistory)
						.set({
							executionStatus: "success",
							workflowStatus: "complete",
							resultData: splitResult.resultData,
							executionDurationMs: 100,
						})
						.where(eq(scheduledActionHistory.id, historyId)),
				},
			];

			const queries = allStatements.map((stmt) => stmt.query);
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch requires any type
		await db.batch(queries as [any, ...any[]]);

			// Step 5: Verify the complete workflow result
			const transactionResult = await db
				.select()
				.from(transactions)
				.where(eq(transactions.transactionId, transactionId))
				.limit(1);
			expect(transactionResult).toHaveLength(1);
			expect(transactionResult[0].description).toBe("Test recurring expense");

			const historyResult = await db
				.select()
				.from(scheduledActionHistory)
				.where(eq(scheduledActionHistory.id, historyId))
				.limit(1);
			expect(historyResult[0].executionStatus).toBe("success");
			expect(historyResult[0].workflowStatus).toBe("complete");

			const actionResult = await db
				.select()
				.from(scheduledActions)
				.where(eq(scheduledActions.id, testActionId))
				.limit(1);
			expect(actionResult[0].lastExecutedAt).toBe("2024-01-15 10:00:00");
			expect(actionResult[0].nextExecutionDate).toBe("2024-02-15");
		});

		it("should handle end-to-end budget workflow simulation", async () => {
			// Create a budget action
			const budgetActionId = ulid();
			const budgetActionData: AddBudgetActionData = {
				description: "Monthly house budget",
				amount: 800.0,
				currency: "GBP",
				budgetName: "house",
				type: "Credit",
			};

			await db.insert(scheduledActions).values({
				id: budgetActionId,
				userId: testUserId,
				actionType: "add_budget",
				frequency: "monthly",
				startDate: "2024-01-01",
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				actionData: budgetActionData,
				nextExecutionDate: "2024-01-15",
			});

			const triggerDate = "2024-01-15T00:00:00Z";
			const currentDate = triggerDate.split("T")[0];

			// Process the budget action
			const historyId = `hist_${budgetActionId}-${currentDate}`;
			await db.insert(scheduledActionHistory).values({
				id: historyId,
				scheduledActionId: budgetActionId,
				userId: testUserId,
				actionType: "add_budget",
				executedAt: "2024-01-15 10:00:00",
				executionStatus: "started",
				workflowInstanceId: `batch-${currentDate}-1`,
				workflowStatus: "running",
				actionData: budgetActionData,
			});

			const budgetRequest = {
				amount:
					budgetActionData.type === "Credit"
						? budgetActionData.amount
						: -budgetActionData.amount,
				description: budgetActionData.description,
				name: budgetActionData.budgetName,
				groupid: 1,
				currency: budgetActionData.currency,
			};

			const budgetId = `bg_${budgetActionId}_${currentDate}`;
			const { createBudgetEntryStatements } = await import(
				"../utils/scheduled-action-execution"
			);
			const budgetResult = await createBudgetEntryStatements(
				budgetRequest,
				db,
				budgetId,
			);

			// Execute all operations
			const allStatements = [
				...budgetResult.statements,
				// Update history to success
				{
					query: db
						.update(scheduledActionHistory)
						.set({
							executionStatus: "success",
							workflowStatus: "complete",
							resultData: budgetResult.resultData,
							executionDurationMs: 100,
						})
						.where(eq(scheduledActionHistory.id, historyId)),
				},
			];

			const queries = allStatements.map((stmt) => stmt.query);
			// biome-ignore lint/suspicious/noExplicitAny: Drizzle batch requires any type
		await db.batch(queries as [any, ...any[]]);

			// Verify results
			const budgetEntryResult = await db
				.select()
				.from(budget)
				.where(eq(budget.budgetId, budgetId))
				.limit(1);
			expect(budgetEntryResult).toHaveLength(1);
			expect(budgetEntryResult[0].amount).toBe(800);
			expect(budgetEntryResult[0].name).toBe("house");

			const historyResult = await db
				.select()
				.from(scheduledActionHistory)
				.where(eq(scheduledActionHistory.id, historyId))
				.limit(1);
			expect(historyResult[0].executionStatus).toBe("success");
			expect(historyResult[0].workflowStatus).toBe("complete");
		});
	});
});
