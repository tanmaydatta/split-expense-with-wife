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
	budgetEntries,
	groups,
	scheduledActionHistory,
	scheduledActions,
	transactions,
} from "../db/schema/schema";
import { handleCron } from "../handlers/cron";
import { createHistoryId, formatSQLiteTime } from "../utils";
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
	let testGroupId: string;
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

		// Create test group
		testGroupId = ulid();
		await db.insert(groups).values({
			groupid: testGroupId,
			groupName: "Test Group",
			userids: "[]", // Will update after creating user
			budgets: '["house", "food"]',
			metadata: "{}",
		});

		// Set required environment variables for cron handler
		testEnv.GROUP_IDS = "";

		// Create test user
		testUserId = ulid();
		await db.insert(user).values({
			id: testUserId,
			email: "test@example.com",
			name: "Test User",
			firstName: "Test",
			lastName: "User",
			groupid: testGroupId,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		// Create test scheduled action (active)
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
						/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
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
	function createMockScheduledAction(
		overrides: Partial<typeof scheduledActions.$inferSelect> = {},
	): typeof scheduledActions.$inferSelect {
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
			...overrides,
		};
	}

	describe("Orchestrator Workflow Step Functions", () => {
		beforeEach(async () => {
			// Create a group for the users
			await db.insert(groups).values({
				groupid: "1",
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

		it("should exclude inactive actions from pending list", async () => {
			const { getPendingScheduledActions } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);
			// Mark existing action inactive
			await db
				.update(scheduledActions)
				.set({ isActive: false })
				.where(eq(scheduledActions.id, testActionId));

			const currentDate = "2024-01-15";
			const pending = await getPendingScheduledActions(testEnv, currentDate);
			expect(pending).toHaveLength(0);
		});

		it("should return empty when no actions are due today", async () => {
			const { getPendingScheduledActions } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			// Make the existing action not due today
			await db
				.update(scheduledActions)
				.set({ nextExecutionDate: "2099-12-31" })
				.where(eq(scheduledActions.id, testActionId));

			const pending = await getPendingScheduledActions(testEnv, "2024-01-15");
			expect(pending).toHaveLength(0);
		});

		it("should filter out actions already executed today", async () => {
			const { getPendingScheduledActions } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);
			const currentDate = "2024-01-15";
			// Mark history as success for today
			await db.insert(scheduledActionHistory).values({
				id: createHistoryId(testActionId, currentDate),
				scheduledActionId: testActionId,
				userId: testUserId,
				actionType: "add_expense",
				executedAt: `${currentDate} 08:00:00`,
				executionStatus: "success",
				workflowInstanceId: "wf1",
				workflowStatus: "complete",
				actionData: { description: "done" },
			});

			const pending = await getPendingScheduledActions(testEnv, currentDate);
			expect(pending).toHaveLength(0);
		});

		it("should filter actions without history correctly", async () => {
			const { filterActionsWithoutHistory } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const currentDate = "2024-01-15";
			const pendingActions = [
				createMockScheduledAction({
					id: testActionId,
					userId: testUserId,
				}),
			];

			const result = await filterActionsWithoutHistory(
				testEnv,
				pendingActions,
				currentDate,
			);

			expect(result.actionsToProcess).toHaveLength(1);
			expect(result.alreadyProcessedResults).toHaveLength(0);
			expect(result.actionsToProcess[0].id).toBe(testActionId);
		});

		it("should flag already processed when success history exists", async () => {
			const { filterActionsWithoutHistory } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);
			const currentDate = "2024-01-15";
			const historyId = createHistoryId(testActionId, currentDate);
			await db.insert(scheduledActionHistory).values({
				id: historyId,
				scheduledActionId: testActionId,
				userId: testUserId,
				actionType: "add_expense",
				executedAt: `${currentDate} 01:00:00`,
				executionStatus: "success",
				workflowInstanceId: "wf2",
				workflowStatus: "complete",
				actionData: { description: "done" },
			});
			const pendingActions = [
				createMockScheduledAction({ id: testActionId, userId: testUserId }),
			];
			const res = await filterActionsWithoutHistory(
				testEnv,
				pendingActions,
				currentDate,
			);
			expect(res.actionsToProcess).toHaveLength(0);
			expect(res.alreadyProcessedResults).toEqual([
				{ actionId: testActionId, status: "already_processed" },
			]);
		});

		it("should create batch history entries", async () => {
			const { createBatchHistoryEntries } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const currentDate = "2024-01-15";
			const batchInstanceId = "batch-2024-01-15-1";
			const batchActions = [
				createMockScheduledAction({
					id: testActionId,
					userId: testUserId,
				}),
			];

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

		it("should update existing history entries to started/running", async () => {
			const { createBatchHistoryEntries } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);
			const currentDate = "2024-01-15";
			const batchInstanceId = "batch-2024-01-15-9";
			const batchActions = [
				createMockScheduledAction({ id: testActionId, userId: testUserId }),
			];
			// Seed history with failed/terminated to check onConflictDoUpdate path
			await db.insert(scheduledActionHistory).values({
				id: createHistoryId(testActionId, currentDate),
				scheduledActionId: testActionId,
				userId: testUserId,
				actionType: "add_expense",
				executedAt: `${currentDate} 00:00:00`,
				executionStatus: "failed",
				workflowInstanceId: "old",
				workflowStatus: "terminated",
				actionData: { description: "old" },
			});

			const valid = await createBatchHistoryEntries(
				testEnv,
				batchActions,
				batchInstanceId,
				currentDate,
			);
			expect(valid).toEqual([testActionId]);
			const hist = await db
				.select()
				.from(scheduledActionHistory)
				.where(
					eq(scheduledActionHistory.id, createHistoryId(testActionId, currentDate)),
				)
				.limit(1);
			expect(hist[0].executionStatus).toBe("started");
			expect(hist[0].workflowStatus).toBe("running");
			// Instance stays as previously set by design
			expect(hist[0].workflowInstanceId).toBe("old");
		});

		it("should handle batch errors correctly", async () => {
			const { handleBatchError } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const currentDate = "2024-01-15";
			const batchInstanceId = "batch-2024-01-15-1";
			const batchActions = [
				createMockScheduledAction({
					id: testActionId,
					userId: testUserId,
				}),
			];
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

	describe("Additional Orchestrator Coverage", () => {
		beforeEach(async () => {
			// Ensure processor createBatch is mocked
			// biome-ignore lint/suspicious/noExplicitAny: Test workflow mock
			testEnv.PROCESSOR_WORKFLOW = {
				create: vi.fn().mockResolvedValue(mockWorkflowInstance),
				get: vi.fn().mockResolvedValue(mockWorkflowInstance),
				createBatch: vi.fn().mockResolvedValue([{ id: "i1" }, { id: "i2" }]),
			} as any;

			// Seed three actions in DB so history inserts respect FK constraints
			const nowIso = new Date().toISOString();
			const seedActions: (typeof scheduledActions.$inferInsert)[] = [
				{
					id: "act-1",
					userId: testUserId,
					actionType: "add_expense",
					frequency: "daily",
					startDate: "2024-01-01",
					isActive: true,
					createdAt: nowIso,
					updatedAt: nowIso,
					actionData: {
						description: "A1",
						amount: 10,
						currency: "GBP",
						paidByUserId: testUserId,
						splitPctShares: { [testUserId]: 100 },
					},
					lastExecutedAt: null,
					nextExecutionDate: "2024-01-15",
				},
				{
					id: "act-2",
					userId: testUserId,
					actionType: "add_expense",
					frequency: "daily",
					startDate: "2024-01-01",
					isActive: true,
					createdAt: nowIso,
					updatedAt: nowIso,
					actionData: {
						description: "A2",
						amount: 20,
						currency: "GBP",
						paidByUserId: testUserId,
						splitPctShares: { [testUserId]: 100 },
					},
					lastExecutedAt: null,
					nextExecutionDate: "2024-01-15",
				},
				{
					id: "act-3",
					userId: testUserId,
					actionType: "add_budget",
					frequency: "daily",
					startDate: "2024-01-01",
					isActive: true,
					createdAt: nowIso,
					updatedAt: nowIso,
					actionData: {
						description: "B1",
						amount: 30,
						currency: "GBP",
						budgetName: "house",
						type: "Credit" as const,
					},
					lastExecutedAt: null,
					nextExecutionDate: "2024-01-15",
				},
			];
			await db.insert(scheduledActions).values(seedActions);
		});

		it("should batch-create processor workflows using createBatch", async () => {
			const { processBatchesAndCreateWorkflows } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const actionsToProcess: Array<typeof scheduledActions.$inferSelect> = [
				{
					id: "act-1",
					userId: testUserId,
					actionType: "add_expense" as const,
					frequency: "daily" as const,
					startDate: "2024-01-01",
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					actionData: {
						description: "A1",
						amount: 10,
						currency: "GBP",
						paidByUserId: testUserId,
						splitPctShares: { [testUserId]: 100 },
					},
					lastExecutedAt: null,
					nextExecutionDate: "2024-01-15",
				},
				{
					id: "act-2",
					userId: testUserId,
					actionType: "add_expense" as const,
					frequency: "daily" as const,
					startDate: "2024-01-01",
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					actionData: {
						description: "A2",
						amount: 20,
						currency: "GBP",
						paidByUserId: testUserId,
						splitPctShares: { [testUserId]: 100 },
					},
					lastExecutedAt: null,
					nextExecutionDate: "2024-01-15",
				},
				{
					id: "act-3",
					userId: testUserId,
					actionType: "add_budget" as const,
					frequency: "daily" as const,
					startDate: "2024-01-01",
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					actionData: {
						description: "B1",
						amount: 30,
						currency: "GBP",
						budgetName: "house",
						type: "Credit" as const,
					},
					lastExecutedAt: null,
					nextExecutionDate: "2024-01-15",
				},
			];

			const triggerDate = "2024-01-15 00:00:00";
			const currentDate = "2024-01-15";

			const results = await processBatchesAndCreateWorkflows(
				testEnv,
				actionsToProcess,
				triggerDate,
				currentDate,
				2,
			);

			expect(testEnv.PROCESSOR_WORKFLOW.createBatch).toHaveBeenCalledTimes(1);
			const args = (testEnv.PROCESSOR_WORKFLOW.createBatch as any).mock
				.calls[0][0];
			expect(Array.isArray(args)).toBe(true);
			// Expect two batch instances for batchSize=2 and 3 actions
			expect(args.length).toBe(2);
			// Verify results marked started
			expect(results.filter((r) => r.status === "started").length).toBe(3);
		});

		it("should handle errors from createBatchHistoryEntries and mark failures", async () => {
			const orchestrator = await import(
				"../workflows/scheduled-actions-orchestrator"
			);

			const actionsToProcess: Array<typeof scheduledActions.$inferSelect> = [
				{
					id: "act-Err1",
					userId: testUserId,
					actionType: "add_expense" as const,
					frequency: "daily" as const,
					startDate: "2024-01-01",
					isActive: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					actionData: {
						description: "A1",
						amount: 10,
						currency: "GBP",
						paidByUserId: testUserId,
						splitPctShares: { [testUserId]: 100 },
					},
					lastExecutedAt: null,
					nextExecutionDate: "2024-01-15",
				},
			];

			const results = await orchestrator.processBatchesAndCreateWorkflows(
				testEnv,
				actionsToProcess,
				"2024-01-15 00:00:00",
				"2024-01-15",
				10,
			);

			expect(results.length).toBe(1);
			expect(results[0].status).toBe("failed");
			// createBatch should not be called since history creation failed
			expect(
				(testEnv.PROCESSOR_WORKFLOW.createBatch as any)?.mock?.calls?.length ??
					0,
			).toBe(0);
		});

		it("should not call createBatch when no actions to process", async () => {
			const { processBatchesAndCreateWorkflows } = await import(
				"../workflows/scheduled-actions-orchestrator"
			);
			// reset mock calls
			if ((testEnv.PROCESSOR_WORKFLOW.createBatch as any)?.mock) {
				(testEnv.PROCESSOR_WORKFLOW.createBatch as any).mockClear();
			}
			const results = await processBatchesAndCreateWorkflows(
				testEnv,
				[],
				"2024-01-15 00:00:00",
				"2024-01-15",
				3,
			);

			expect(results).toEqual([]);
			expect(
				(testEnv.PROCESSOR_WORKFLOW.createBatch as any)?.mock?.calls?.length ??
					0,
			).toBe(0);
		});
	});

	describe("Additional Processor Coverage", () => {
		beforeEach(async () => {
			// seed scheduled action and history (started)
			const nowIso = new Date().toISOString();
			await db.insert(scheduledActions).values({
				id: "proc-1",
				userId: testUserId,
				actionType: "add_expense",
				frequency: "monthly",
				startDate: "2024-01-01",
				isActive: true,
				createdAt: nowIso,
				updatedAt: nowIso,
				actionData: {
					description: "PX",
					amount: 12,
					currency: "GBP",
					paidByUserId: testUserId,
					splitPctShares: { [testUserId]: 100 },
				},
				nextExecutionDate: "2024-01-15",
			});
			await db.insert(scheduledActionHistory).values({
				id: createHistoryId("proc-1", "2024-01-15"),
				scheduledActionId: "proc-1",
				userId: testUserId,
				actionType: "add_expense",
				executedAt: "2024-01-15 10:00:00",
				executionStatus: "started",
				workflowInstanceId: "w1",
				workflowStatus: "running",
				actionData: { description: "PX" },
			});
		});

		it("should execute action statements and mark history success with correct next date using provided now", async () => {
			const { executeActionStatements } = await import(
				"../workflows/scheduled-actions-processor"
			);

			const action = (
				await db
					.select()
					.from(scheduledActions)
					.where(eq(scheduledActions.id, "proc-1"))
					.limit(1)
			)[0]!;

			// a harmless statement executed before tracking updates
			const stmts = [
				{
					query: db
						.update(scheduledActions)
						.set({ updatedAt: "2024-01-15 10:00:01" })
						.where(eq(scheduledActions.id, "proc-1")),
				},
			];

			await executeActionStatements(
				testEnv,
				action,
				createHistoryId("proc-1", "2024-01-15"),
				123,
				{ message: "ok" },
				stmts,
				new Date("2024-01-15T00:00:00Z"),
			);

			// Verify scheduled action tracking updated and next date computed from now
			const actionAfter = (
				await db
					.select()
					.from(scheduledActions)
					.where(eq(scheduledActions.id, "proc-1"))
					.limit(1)
			)[0]!;
			expect(actionAfter.lastExecutedAt).toBeTruthy();
			expect(actionAfter.nextExecutionDate).toBe("2024-02-01");

			// Verify history success updated last with result data
			const hist = (
				await db
					.select()
					.from(scheduledActionHistory)
					.where(eq(scheduledActionHistory.id, createHistoryId("proc-1", "2024-01-15")))
					.limit(1)
			)[0]!;
			expect(hist.executionStatus).toBe("success");
			expect(hist.workflowStatus).toBe("complete");
			expect(hist.resultData).toEqual({ message: "ok" });
			expect(hist.executionDurationMs).toBe(123);
		});
	});

	describe("Processor Workflow Step Functions", () => {
		beforeEach(async () => {
			// Create a group for the users
			await db.insert(groups).values({
				groupid: "1",
				groupName: "Test Group",
				budgets: JSON.stringify(["house", "groceries"]),
			});
		});
		it("fetchActionsWithUsers throws when no matching actions", async () => {
			const { fetchActionsWithUsers } = await import(
				"../workflows/scheduled-actions-processor"
			);
			await expect(
				fetchActionsWithUsers(testEnv, ["non-existent-id"]),
			).rejects.toThrow(/No actions found/);
		});

		it("processBudgetAction throws when user has no groupid", async () => {
			const { processBudgetAction } = await import(
				"../workflows/scheduled-actions-processor"
			);
			const action = createMockScheduledAction({
				id: "proc-no-group",
				actionType: "add_budget" as const,
				actionData: {
					description: "Monthly house budget",
					amount: 100,
					currency: "GBP",
					budgetName: "house",
					type: "Credit",
				},
			});
			// biome-ignore lint/suspicious/noExplicitAny: test
			const userData: any = { groupid: null };
			await expect(
				processBudgetAction(testEnv, action, userData, "2024-01-15"),
			).rejects.toThrow(/groupid is required/);
		});

		it("executeActionStatements works when no additional action statements are provided", async () => {
			const { executeActionStatements } = await import(
				"../workflows/scheduled-actions-processor"
			);
			// seed scheduled action and history
			const nowIso = new Date().toISOString();
			await db.insert(scheduledActions).values({
				id: "proc-2",
				userId: testUserId,
				actionType: "add_expense",
				frequency: "weekly",
				startDate: "2024-01-01",
				isActive: true,
				createdAt: nowIso,
				updatedAt: nowIso,
				actionData: {
					description: "PX2",
					amount: 5,
					currency: "GBP",
					paidByUserId: testUserId,
					splitPctShares: { [testUserId]: 100 },
				},
				nextExecutionDate: "2024-01-15",
			});
			await db.insert(scheduledActionHistory).values({
				id: createHistoryId("proc-2", "2024-01-15"),
				scheduledActionId: "proc-2",
				userId: testUserId,
				actionType: "add_expense",
				executedAt: "2024-01-15 10:00:00",
				executionStatus: "started",
				workflowInstanceId: "w2",
				workflowStatus: "running",
				actionData: { description: "PX2" },
			});

			const action = (
				await db
					.select()
					.from(scheduledActions)
					.where(eq(scheduledActions.id, "proc-2"))
					.limit(1)
			)[0]!;

			await executeActionStatements(
				testEnv,
				action,
				createHistoryId("proc-2", "2024-01-15"),
				200,
				{ message: "ok2" },
				[],
				new Date("2024-01-15T00:00:00Z"),
			);

			const actionAfter = (
				await db
					.select()
					.from(scheduledActions)
					.where(eq(scheduledActions.id, "proc-2"))
					.limit(1)
			)[0]!;
			expect(actionAfter.lastExecutedAt).toBeTruthy();
			const hist = (
				await db
					.select()
					.from(scheduledActionHistory)
					.where(eq(scheduledActionHistory.id, createHistoryId("proc-2", "2024-01-15")))
					.limit(1)
			)[0]!;
			expect(hist.executionStatus).toBe("success");
			expect(hist.executionDurationMs).toBe(200);
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
			expect(actionsResult[0].user.groupid).toBe(testGroupId);
		});

		it("fetchActionsWithUsers throws when no matching actions", async () => {
			const { fetchActionsWithUsers } = await import(
				"../workflows/scheduled-actions-processor"
			);
			await expect(
				fetchActionsWithUsers(testEnv, ["non-existent-id"]),
			).rejects.toThrow(/No actions found/);
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
			const userData = { groupid: "1" } as any;
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
					type: "Credit" as const,
				},
			});
			// biome-ignore lint/suspicious/noExplicitAny: Test mock
			const userData = { groupid: "1" } as any;
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

		it("processBudgetAction throws when user has no groupid", async () => {
			const { processBudgetAction } = await import(
				"../workflows/scheduled-actions-processor"
			);
			const action = createMockScheduledAction({
				id: "proc-no-group",
				actionType: "add_budget" as const,
				actionData: {
					description: "Monthly house budget",
					amount: 100,
					currency: "GBP",
					budgetName: "house",
					type: "Credit",
				},
			});
			// biome-ignore lint/suspicious/noExplicitAny: test
			const userData: any = { groupid: null };
			await expect(
				processBudgetAction(testEnv, action, userData, "2024-01-15"),
			).rejects.toThrow(/groupid is required/);
		});

		it("should handle action errors correctly", async () => {
			const { handleActionError } = await import(
				"../workflows/scheduled-actions-processor"
			);

			const actionId = testActionId;
			const historyId = createHistoryId(testActionId, "2024-01-15");
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
				groupid: "1",
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
				testGroupId,
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
				groupid: "1",
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
				.from(budgetEntries)
				.where(eq(budgetEntries.budgetEntryId, budgetId))
				.limit(1);
			expect(budgetResult).toHaveLength(1);
			expect(budgetResult[0].budgetEntryId).toBe(budgetId);
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
				testGroupId,
				db,
				testEnv,
				transactionId,
			);

			const queries1 = result1.statements.map((stmt) => stmt.query);
			await db.batch(queries1);

			// Try to create the same transaction again
			const result2 = await createSplitTransactionStatements(
				expenseData,
				testGroupId,
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
				groupid: "1",
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
				.from(budgetEntries)
				.where(eq(budgetEntries.budgetEntryId, budgetId));
			expect(budgetResult).toHaveLength(1);
		});
	});

	describe("Integration Tests", () => {
		beforeEach(async () => {
			// Create a group for the users
			await db.insert(groups).values({
				groupid: "1",
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
			const historyId = createHistoryId(testActionId, currentDate);
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
				testGroupId,
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
			const historyId = createHistoryId(budgetActionId, currentDate);
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
				groupid: "1",
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
				.from(budgetEntries)
				.where(eq(budgetEntries.budgetEntryId, budgetId))
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

	describe("Manual Run Functions", () => {
		describe("triggerImmediateRun", () => {
			it("should create history entry and workflow successfully", async () => {
				// Create a scheduled action
				const actionId = ulid();
				const triggerDate = "2024-01-15 00:00:00";
				const currentDate = "2024-01-15";

				await db.insert(scheduledActions).values({
					id: actionId,
					userId: testUserId,
					actionType: "add_expense",
					actionData: {
						description: "Test manual run",
						amount: 150,
						currency: "USD",
						paidByUserId: testUserId,
						paidByShares: { [testUserId]: 150 },
						splitPctShares: { [testUserId]: 100 },
					} as AddExpenseActionData,
					frequency: "daily",
					startDate: "2024-01-15",
					nextExecutionDate: "2024-01-15",
					createdAt: formatSQLiteTime(),
					updatedAt: formatSQLiteTime(),
				});

				// Import the function to test
				const { triggerImmediateRun } = await import("../workflows/scheduled-actions-processor");

				// Call the function
				const workflowInstanceId = await triggerImmediateRun(testEnv, actionId, triggerDate);

				// Verify workflow was created
				expect(testEnv.PROCESSOR_WORKFLOW.create).toHaveBeenCalledWith({
					id: `immediate-2024-01-15-00-00-00-${actionId}`,
					params: {
						triggerDate,
						actionIds: [actionId],
						batchNumber: 1,
					},
				});

				// Verify history entry was created
				const historyEntries = await db
					.select()
					.from(scheduledActionHistory)
					.where(eq(scheduledActionHistory.scheduledActionId, actionId));

				expect(historyEntries).toHaveLength(1);
				const entry = historyEntries[0];
				expect(entry.id).toBe(createHistoryId(actionId, currentDate));
				expect(entry.scheduledActionId).toBe(actionId);
				expect(entry.userId).toBe(testUserId);
				expect(entry.actionType).toBe("add_expense");
				expect(entry.executionStatus).toBe("started");
				expect(entry.workflowInstanceId).toBe(workflowInstanceId);
				expect(entry.workflowStatus).toBe("running");
			});

			it("should throw error when action already has history entry", async () => {
				// Create a scheduled action
				const actionId = ulid();
				const triggerDate = "2024-01-15 00:00:00";
				const currentDate = "2024-01-15";

				await db.insert(scheduledActions).values({
					id: actionId,
					userId: testUserId,
					actionType: "add_expense",
					actionData: {
						description: "Test duplicate run",
						amount: 150,
						currency: "USD",
						paidByUserId: testUserId,
						paidByShares: { [testUserId]: 150 },
						splitPctShares: { [testUserId]: 100 },
					} as AddExpenseActionData,
					frequency: "daily",
					startDate: "2024-01-15",
					nextExecutionDate: "2024-01-15",
					createdAt: formatSQLiteTime(),
					updatedAt: formatSQLiteTime(),
				});

				// Create existing history entry
				await db.insert(scheduledActionHistory).values({
					id: createHistoryId(actionId, currentDate),
					scheduledActionId: actionId,
					userId: testUserId,
					actionType: "add_expense",
					executedAt: formatSQLiteTime(),
					executionStatus: "started",
					workflowInstanceId: "existing-workflow",
					workflowStatus: "running",
					actionData: {
						description: "Test duplicate run",
						amount: 150,
						currency: "USD",
						paidByUserId: testUserId,
						paidByShares: { [testUserId]: 150 },
						splitPctShares: { [testUserId]: 100 },
					} as AddExpenseActionData,
				});

				// Import the function to test
				const { triggerImmediateRun } = await import("../workflows/scheduled-actions-processor");

				// Call the function and expect it to throw
				await expect(
					triggerImmediateRun(testEnv, actionId, triggerDate)
				).rejects.toThrow(`Action has already been executed for date ${currentDate}`);

				// Verify no workflow was created
				expect(testEnv.PROCESSOR_WORKFLOW.create).not.toHaveBeenCalled();

				// Verify history entry count unchanged
				const historyEntries = await db
					.select()
					.from(scheduledActionHistory)
					.where(eq(scheduledActionHistory.scheduledActionId, actionId));

				expect(historyEntries).toHaveLength(1); // Still only the original entry
			});

			it("should throw error when scheduled action not found", async () => {
				const nonExistentActionId = ulid();
				const triggerDate = "2024-01-15 00:00:00";

				// Import the function to test
				const { triggerImmediateRun } = await import("../workflows/scheduled-actions-processor");

				// Call the function and expect it to throw
				await expect(
					triggerImmediateRun(testEnv, nonExistentActionId, triggerDate)
				).rejects.toThrow(`Scheduled action ${nonExistentActionId} not found`);

				// Verify no workflow was created
				expect(testEnv.PROCESSOR_WORKFLOW.create).not.toHaveBeenCalled();

				// Verify no history entry was created
				const historyEntries = await db
					.select()
					.from(scheduledActionHistory)
					.where(eq(scheduledActionHistory.scheduledActionId, nonExistentActionId));

				expect(historyEntries).toHaveLength(0);
			});

			it("should generate correct workflow instance ID format", async () => {
				// Create a scheduled action
				const actionId = ulid();
				const triggerDate = "2024-01-15 00:00:00";

				await db.insert(scheduledActions).values({
					id: actionId,
					userId: testUserId,
					actionType: "add_expense",
					actionData: {
						description: "Test workflow ID format",
						amount: 200,
						currency: "USD",
						paidByUserId: testUserId,
						paidByShares: { [testUserId]: 200 },
						splitPctShares: { [testUserId]: 100 },
					} as AddExpenseActionData,
					frequency: "daily",
					startDate: "2024-01-15",
					nextExecutionDate: "2024-01-15",
					createdAt: formatSQLiteTime(),
					updatedAt: formatSQLiteTime(),
				});

				// Import the function to test
				const { triggerImmediateRun } = await import("../workflows/scheduled-actions-processor");

				// Call the function
				const workflowInstanceId = await triggerImmediateRun(testEnv, actionId, triggerDate);

				// Verify workflow instance ID format
				expect(workflowInstanceId).toBe(`immediate-2024-01-15-00-00-00-${actionId}`);

				// Verify history entry links to correct workflow
				const historyEntries = await db
					.select()
					.from(scheduledActionHistory)
					.where(eq(scheduledActionHistory.scheduledActionId, actionId));

				expect(historyEntries).toHaveLength(1);
				expect(historyEntries[0].workflowInstanceId).toBe(workflowInstanceId);
			});

			it("should handle workflow creation failure gracefully", async () => {
				// Create a scheduled action
				const actionId = ulid();
				const triggerDate = "2024-01-15 00:00:00";

				await db.insert(scheduledActions).values({
					id: actionId,
					userId: testUserId,
					actionType: "add_expense",
					actionData: {
						description: "Test workflow failure",
						amount: 100,
						currency: "USD",
						paidByUserId: testUserId,
						paidByShares: { [testUserId]: 100 },
						splitPctShares: { [testUserId]: 100 },
					} as AddExpenseActionData,
					frequency: "daily",
					startDate: "2024-01-15",
					nextExecutionDate: "2024-01-15",
					createdAt: formatSQLiteTime(),
					updatedAt: formatSQLiteTime(),
				});

				// Mock workflow creation to fail
				testEnv.PROCESSOR_WORKFLOW.create = vi.fn().mockRejectedValue(new Error("Workflow service unavailable"));

				// Import the function to test
				const { triggerImmediateRun } = await import("../workflows/scheduled-actions-processor");

				// Call the function and expect it to throw
				await expect(
					triggerImmediateRun(testEnv, actionId, triggerDate)
				).rejects.toThrow("Workflow service unavailable");

				// Verify history entry was still created (since it's created first)
				const historyEntries = await db
					.select()
					.from(scheduledActionHistory)
					.where(eq(scheduledActionHistory.scheduledActionId, actionId));

				expect(historyEntries).toHaveLength(1);
				expect(historyEntries[0].executionStatus).toBe("started");
			});
		});
	});
});
