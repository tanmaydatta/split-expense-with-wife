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
		userData.groupid || 0,
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
		groupid: userData.groupid,
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
): Promise<void> {
	const db = getDb(env);

	// Calculate next execution date
	const frequency = action.frequency as "daily" | "weekly" | "monthly";
	const nextExecutionDate = calculateNextExecutionDate(
		action.startDate,
		frequency,
	);

	// Add statement to update the scheduled action tracking
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

export async function processScheduledActionsBatch(
	env: Env,
	triggerDate: string,
	actionIds: string[],
	batchNumber: number,
): Promise<ProcessorResult> {
	const startTime = Date.now();
	const currentDate = triggerDate.split("T")[0];

	console.log(
		`Processing batch ${batchNumber} with ${actionIds.length} actions: ${actionIds.join(", ")}`,
	);

	const results: ActionExecutionResult[] = [];

	// Fetch all actions and their users
	const actionsResult = await fetchActionsWithUsers(env, actionIds);

	// Process each action
	for (const { scheduled_actions: action, user: userData } of actionsResult) {
		const actionStartTime = Date.now();
		const historyId = `hist_${action.id}-${currentDate}`;

		try {
			let resultData: ScheduledActionResultData;
			let dbStatements: Array<{ query: BatchItem<"sqlite"> }> = [];

			// Execute the specific action type
			switch (action.actionType) {
				case "add_expense": {
					const expenseResult = await processExpenseAction(
						env,
						action,
						userData,
						currentDate,
					);
					resultData = expenseResult.resultData;
					dbStatements = expenseResult.statements;
					break;
				}

				case "add_budget": {
					const budgetResult = await processBudgetAction(
						env,
						action,
						userData,
						currentDate,
					);
					resultData = budgetResult.resultData;
					dbStatements = budgetResult.statements;
					break;
				}

				default:
					throw new Error(`Unknown action type: ${action.actionType}`);
			}

			const executionDurationMs = Date.now() - actionStartTime;

			// Execute all database statements
			await executeActionStatements(
				env,
				action,
				historyId,
				executionDurationMs,
				resultData,
				dbStatements,
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
			const executionDurationMs = Date.now() - actionStartTime;

			// Handle the error
			await handleActionError(
				env,
				action.id,
				historyId,
				error as Error,
				executionDurationMs,
			);

			results.push({
				actionId: action.id,
				success: false,
				errorMessage,
				executionDurationMs,
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

export class ScheduledActionsProcessorWorkflow extends WorkflowEntrypoint {
	async run(
		event: WorkflowEvent<ProcessorWorkflowPayload>,
		step: WorkflowStep,
	) {
		const { triggerDate, actionIds, batchNumber } = event.payload;
		const startTime = Date.now();
		const currentDate = triggerDate.split("T")[0];

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
			const actionStartTime = Date.now();
			const historyId = `hist_${action.id}-${currentDate}`;

			try {
				let resultData: ScheduledActionResultData;
				let dbStatements: Array<{ query: BatchItem<"sqlite"> }> = [];

				// Execute the specific action type
				switch (action.actionType) {
					case "add_expense": {
						const expenseResult = (await step.do(
							`process-expense-${action.id}`,
							async () => {
								return await processExpenseAction(
									this.env as Env,
									action,
									userData,
									currentDate,
								);
							},
						)) as {
							resultData: ScheduledActionResultData;
							statements: Array<{ query: BatchItem<"sqlite"> }>;
						};
						resultData = expenseResult.resultData;
						dbStatements = expenseResult.statements;
						break;
					}

					case "add_budget": {
						const budgetResult = (await step.do(
							`process-budget-${action.id}`,
							async () => {
								return await processBudgetAction(
									this.env as Env,
									action,
									userData,
									currentDate,
								);
							},
						)) as {
							resultData: ScheduledActionResultData;
							statements: Array<{ query: BatchItem<"sqlite"> }>;
						};
						resultData = budgetResult.resultData;
						dbStatements = budgetResult.statements;
						break;
					}

					default:
						throw new Error(`Unknown action type: ${action.actionType}`);
				}

				const executionDurationMs = Date.now() - actionStartTime;

				// Execute all database statements
				await step.do(`execute-statements-${action.id}`, async () => {
					await executeActionStatements(
						this.env as Env,
						action,
						historyId,
						executionDurationMs,
						resultData,
						dbStatements,
					);
				});

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
				const executionDurationMs = Date.now() - actionStartTime;

				// Handle the error
				await step.do(`handle-error-${action.id}`, async () => {
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
					executionDurationMs,
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
