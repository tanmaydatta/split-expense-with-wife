import {
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
} from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type {
	AddBudgetActionData,
	AddExpenseActionData,
	BudgetRequest,
	ScheduledActionResultData,
} from "../../../shared-types";
import { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import { scheduledActionHistory, scheduledActions } from "../db/schema/schema";
import { calculateNextExecutionDate } from "../handlers/scheduled-actions";
import { formatSQLiteTime } from "../utils";
import {
	createBudgetEntryStatementsForScheduledAction,
	createSplitTransactionStatements,
	generateDeterministicBudgetId,
	generateDeterministicTransactionId,
} from "../utils/scheduled-action-execution";

// Helper function to check if action was already executed
async function checkActionAlreadyExecuted(
	env: Env,
	historyId: string,
): Promise<boolean> {
	const db = getDb(env);
	const existing = await db
		.select({ status: scheduledActionHistory.executionStatus })
		.from(scheduledActionHistory)
		.where(eq(scheduledActionHistory.id, historyId))
		.limit(1);
	return existing.length > 0 && existing[0].status === "success";
}

// Helper function to process action by type
async function processActionByType(
	env: Env,
	action: ScheduledActionSelect,
	userData: UserSelect,
	currentDate: string,
): Promise<{
	resultData: ScheduledActionResultData;
	statements: Array<{ query: BatchItem<"sqlite"> }>;
}> {
	switch (action.actionType) {
		case "add_expense": {
			return await processExpenseAction(env, action, userData, currentDate);
		}
		case "add_budget": {
			return await processBudgetAction(env, action, userData, currentDate);
		}
		default:
			throw new Error(`Unknown action type: ${action.actionType}`);
	}
}

// Helper function to execute action with error handling
async function executeActionSafely(
	env: Env,
	action: ScheduledActionSelect,
	userData: UserSelect,
	currentDate: string,
	historyId: string,
	triggerDate: string,
): Promise<{
	resultData: ScheduledActionResultData;
	executionDurationMs: number;
}> {
	const innerStartTime = Date.now();

	// Check if already executed
	const alreadyExecuted = await checkActionAlreadyExecuted(env, historyId);
	if (alreadyExecuted) {
		return {
			resultData: { message: "Already executed" } as ScheduledActionResultData,
			executionDurationMs: 0,
		};
	}

	// Process action
	const { resultData, statements } = await processActionByType(
		env,
		action,
		userData,
		currentDate,
	);
	const executionDurationMs = Date.now() - innerStartTime;

	// Execute statements
	await executeActionStatements(
		env,
		action,
		historyId,
		executionDurationMs,
		resultData,
		statements,
		new Date(triggerDate),
	);

	if (!resultData) {
		throw new Error("No result data generated for action execution");
	}

	return { resultData, executionDurationMs };
}

type ScheduledActionSelect = typeof scheduledActions.$inferSelect;
type UserSelect = typeof user.$inferSelect;

interface ProcessorWorkflowPayload {
	triggerDate: string;
	actionIds: string[];
	batchNumber: number;
}

export interface ActionExecutionResult {
	actionId: string;
	success: boolean;
	resultData?: ScheduledActionResultData;
	errorMessage?: string;
	executionDurationMs: number;
}

export interface ProcessorResult {
	batchNumber: number;
	totalProcessed: number;
	succeeded: number;
	failed: number;
	totalDurationMs: number;
	results: ActionExecutionResult[];
}

// Trigger processing of a single scheduled action immediately by creating
// a processor workflow with a single-action batch. Returns the workflow id.
export async function triggerImmediateRun(
	env: Env,
	actionId: string,
	triggerDate: string,
): Promise<string> {
	const batchNumber = 1;
	const instanceId = `immediate-${triggerDate.replace(/[:\s]/g, "-")}-${actionId}`;
	await env.PROCESSOR_WORKFLOW.create({
		id: instanceId,
		params: {
			triggerDate,
			actionIds: [actionId],
			batchNumber,
		},
	});
	return instanceId;
}

export async function fetchActionsWithUsers(
	env: Env,
	actionIds: string[],
): Promise<
	Array<{
		scheduled_actions: ScheduledActionSelect;
		user: UserSelect;
	}>
> {
	const db = getDb(env);

	// Fetch all actions and their users
	const actionsResult = await db
		.select()
		.from(scheduledActions)
		.innerJoin(user, eq(scheduledActions.userId, user.id))
		.where(inArray(scheduledActions.id, actionIds));

	if (actionsResult.length === 0) {
		throw new Error(`No actions found for IDs: ${actionIds.join(", ")}`);
	}

	return actionsResult;
}

export async function processExpenseAction(
	env: Env,
	action: ScheduledActionSelect,
	userData: UserSelect,
	currentDate: string,
): Promise<{
	resultData: ScheduledActionResultData;
	statements: Array<{ query: BatchItem<"sqlite"> }>;
}> {
	const db = getDb(env);
	const expenseData = action.actionData as AddExpenseActionData;
	const transactionId = generateDeterministicTransactionId(
		action.id,
		currentDate,
	);

	const splitResult = await createSplitTransactionStatements(
		expenseData,
		userData.groupid || "",
		db,
		env,
		transactionId,
	);

	return {
		resultData: splitResult.resultData,
		statements: splitResult.statements,
	};
}

export async function processBudgetAction(
	env: Env,
	action: ScheduledActionSelect,
	userData: UserSelect,
	currentDate: string,
): Promise<{
	resultData: ScheduledActionResultData;
	statements: Array<{ query: BatchItem<"sqlite"> }>;
}> {
	if (!userData.groupid) {
		throw new Error("User groupid is required");
	}
	const db = getDb(env);
	const budgetData = action.actionData as AddBudgetActionData;
	const budgetRequest: BudgetRequest = {
		amount:
			budgetData.type === "Credit" ? budgetData.amount : -budgetData.amount,
		description: budgetData.description,
		name: budgetData.budgetName,
		groupid: userData.groupid || "",
		currency: budgetData.currency,
	};

	const budgetId = generateDeterministicBudgetId(action.id, currentDate);
	const budgetResult = await createBudgetEntryStatementsForScheduledAction(
		budgetRequest,
		db,
		budgetId,
	);

	return {
		resultData: budgetResult.resultData,
		statements: budgetResult.statements,
	};
}

export async function executeActionStatements(
	env: Env,
	action: ScheduledActionSelect,
	historyId: string,
	executionDurationMs: number,
	resultData: ScheduledActionResultData,
	actionStatements: Array<{ query: BatchItem<"sqlite"> }>,
	now: Date = new Date(),
): Promise<void> {
	const db = getDb(env);

	// Calculate next execution date
	const frequency = action.frequency as "daily" | "weekly" | "monthly";
	const nextExecutionDate = calculateNextExecutionDate(
		action.startDate,
		frequency,
		now,
	);

	// Add statements ensuring we mark history success LAST to ensure idempotency
	const allStatements = [
		...actionStatements,
		{
			query: db
				.update(scheduledActions)
				.set({
					lastExecutedAt: formatSQLiteTime(),
					nextExecutionDate,
					updatedAt: formatSQLiteTime(),
				})
				.where(eq(scheduledActions.id, action.id)),
		},
		{
			query: db
				.update(scheduledActionHistory)
				.set({
					executionStatus: "success",
					workflowStatus: "complete",
					errorMessage: null,
					resultData,
					executionDurationMs,
				})
				.where(eq(scheduledActionHistory.id, historyId)),
		},
	];

	// Execute all statements in a transaction for this action
	if (allStatements.length > 0) {
		const queries = allStatements.map((stmt) => stmt.query);
		await db.batch([queries[0], ...queries.slice(1)]);
	}
}

export async function handleActionError(
	env: Env,
	actionId: string,
	historyId: string,
	error: Error,
	executionDurationMs: number,
): Promise<void> {
	console.log("handleActionError", {
		actionId,
		historyId,
		error,
		executionDurationMs,
	});
	const db = getDb(env);
	const errorMessage = error.message;

	// Update history as failed
	try {
		await db
			.update(scheduledActionHistory)
			.set({
				executionStatus: "failed",
				workflowStatus: "complete",
				errorMessage,
				executionDurationMs,
			})
			.where(eq(scheduledActionHistory.id, historyId));
	} catch (historyError) {
		console.error(
			`Failed to update history for failed action ${actionId}:`,
			historyError,
		);
	}
}
/* istanbul ignore next */
export class ScheduledActionsProcessorWorkflow extends WorkflowEntrypoint {
	async run(
		event: WorkflowEvent<ProcessorWorkflowPayload>,
		step: WorkflowStep,
	) {
		const { triggerDate, actionIds, batchNumber } = event.payload;
		const startTime = Date.now();
		const currentDate = triggerDate.split(" ")[0];

		console.log(
			`Processing batch ${batchNumber} with ${actionIds.length} actions: ${actionIds.join(", ")}`,
		);

		// Step 1: Fetch all actions and their users
		const actionsResult = await step.do(
			"fetch-actions-with-users",
			async () => {
				return await fetchActionsWithUsers(this.env as Env, actionIds);
			},
		);

		const results: ActionExecutionResult[] = [];

		// Step 2: Process each action
		for (const { scheduled_actions: action, user: userData } of actionsResult) {
			const historyId = `hist_${action.id}-${currentDate}`;
			const actionStartTime = Date.now();

			try {
				const { resultData, executionDurationMs } = await step.do(
					`process-and-execute-${action.id}`,
					async () => {
						return await executeActionSafely(
							this.env as Env,
							action,
							userData,
							currentDate,
							historyId,
							triggerDate,
						);
					},
				);

				results.push({
					actionId: action.id,
					success: true,
					resultData,
					executionDurationMs,
				});

				console.log(
					`Successfully processed action ${action.id} in ${executionDurationMs}ms`,
				);
			} catch (error) {
				console.error(`Failed to process action ${action.id}:`, error);
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";

				// Handle the error within its own step (no non-serializable values)
				await step.do(`handle-error-${action.id}-${batchNumber}`, async () => {
					const executionDurationMs = Date.now() - actionStartTime;
					await handleActionError(
						this.env as Env,
						action.id,
						historyId,
						error as Error,
						executionDurationMs,
					);
				});

				results.push({
					actionId: action.id,
					success: false,
					errorMessage,
					executionDurationMs: Date.now() - actionStartTime,
				});
			}
		}

		const totalDuration = Date.now() - startTime;
		const succeeded = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;

		console.log(
			`Completed batch ${batchNumber}: ${succeeded} succeeded, ${failed} failed in ${totalDuration}ms`,
		);

		return {
			batchNumber,
			totalProcessed: results.length,
			succeeded,
			failed,
			totalDurationMs: totalDuration,
			results,
		};
	}
}
