import {
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
} from "cloudflare:workers";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { scheduledActionHistory, scheduledActions } from "../db/schema/schema";
import { formatSQLiteTime } from "../utils";

type ScheduledActionSelect = typeof scheduledActions.$inferSelect;

interface OrchestratorWorkflowPayload {
	triggerDate: string;
}

export interface OrchestratorResult {
	totalProcessed: number;
	succeeded: number;
	failed: number;
	started: number;
	stillRunning: number;
	results: Array<{
		actionId: string;
		status: string;
		workflowInstanceId?: string;
		batchNumber?: number;
		error?: string;
	}>;
}

export async function getPendingScheduledActions(
	env: Env,
	currentDate: string,
): Promise<ScheduledActionSelect[]> {
	const db = getDb(env);

	// Get all actions that should run today
	const actionsToRun = await db
		.select()
		.from(scheduledActions)
		.where(
			and(
				eq(scheduledActions.isActive, true),
				lte(scheduledActions.nextExecutionDate, currentDate),
			),
		);

	if (actionsToRun.length === 0) {
		console.log("No pending actions found");
		return [];
	}

	console.log(`Found ${actionsToRun.length} total actions`);

	// Check which actions have already been successfully executed today
	const actionIds = actionsToRun.map((action) => action.id);
	const alreadyExecuted = await db
		.select({ scheduledActionId: scheduledActionHistory.scheduledActionId })
		.from(scheduledActionHistory)
		.where(
			and(
				inArray(scheduledActionHistory.scheduledActionId, actionIds),
				sql`DATE(${scheduledActionHistory.executedAt}) = ${currentDate}`,
				eq(scheduledActionHistory.executionStatus, "success"),
			),
		);

	const executedActionIds = new Set(
		alreadyExecuted.map((h) => h.scheduledActionId),
	);

	// Filter out already executed actions
	const pendingActions = actionsToRun.filter(
		(action) => !executedActionIds.has(action.id),
	);

	console.log(
		`Found ${actionsToRun.length} total actions, ${executedActionIds.size} already executed, ${pendingActions.length} pending`,
	);

	return pendingActions;
}

export async function filterActionsWithoutHistory(
	env: Env,
	pendingActions: ScheduledActionSelect[],
	currentDate: string,
): Promise<{
	actionsToProcess: ScheduledActionSelect[];
	alreadyProcessedResults: Array<{ actionId: string; status: string }>;
}> {
	const db = getDb(env);
	const actionsToProcess = [];
	const alreadyProcessedResults = [];

	// Filter out actions that already have history entries (any status)
	for (const action of pendingActions) {
		const historyId = `hist_${action.id}-${currentDate}`;

		const existingHistory = await db
			.select()
			.from(scheduledActionHistory)
			.where(
				and(
					eq(scheduledActionHistory.id, historyId),
					eq(scheduledActionHistory.executionStatus, "success"),
				),
			)
			.limit(1);

		if (existingHistory.length > 0) {
			console.log(`Action ${action.id} already has history entry, skipping`);
			alreadyProcessedResults.push({
				actionId: action.id,
				status: "already_processed",
			});
			continue;
		}

		actionsToProcess.push(action);
	}

	return { actionsToProcess, alreadyProcessedResults };
}

export async function createBatchHistoryEntries(
	env: Env,
	batchActions: ScheduledActionSelect[],
	batchInstanceId: string,
	currentDate: string,
): Promise<string[]> {
	const db = getDb(env);

	// Create history entries for all actions in this batch at once
	const historyEntries = batchActions.map((action) => ({
		id: `hist_${action.id}-${currentDate}`,
		scheduledActionId: action.id,
		userId: action.userId,
		actionType: action.actionType,
		executedAt: formatSQLiteTime(),
		executionStatus: "started" as const,
		workflowInstanceId: batchInstanceId,
		workflowStatus: "running" as const,
		actionData: action.actionData,
	}));

	await db
		.insert(scheduledActionHistory)
		.values(historyEntries)
		.onConflictDoUpdate({
			target: scheduledActionHistory.id,
			set: {
				executionStatus: "started",
				workflowStatus: "running",
			},
		});

	console.log(`Created ${historyEntries.length} history entries for batch`);

	// Return action IDs that successfully got history entries
	return historyEntries.map((entry) => entry.scheduledActionId);
}

export async function handleBatchError(
	env: Env,
	batchActions: ScheduledActionSelect[],
	batchInstanceId: string,
	currentDate: string,
	error: Error,
): Promise<Array<{ actionId: string; status: string; error: string }>> {
	const db = getDb(env);
	const errorMessage = error.message;
	const failedResults = [];

	// Mark all actions in this batch as failed
	for (const action of batchActions) {
		const historyId = `hist_${action.id}-${currentDate}`;

		try {
			await db
				.insert(scheduledActionHistory)
				.values({
					id: historyId,
					scheduledActionId: action.id,
					userId: action.userId,
					actionType: action.actionType,
					executedAt: formatSQLiteTime(),
					executionStatus: "failed",
					workflowInstanceId: batchInstanceId,
					workflowStatus: "terminated",
					actionData: action.actionData,
					errorMessage,
				})
				.onConflictDoUpdate({
					target: scheduledActionHistory.id,
					set: {
						executionStatus: "failed",
						workflowStatus: "terminated",
						errorMessage,
						executedAt: formatSQLiteTime(),
					},
				});
		} catch (historyError) {
			console.error(
				`Failed to create failed history entry for ${action.id}:`,
				historyError,
			);
		}

		failedResults.push({
			actionId: action.id,
			status: "failed",
			error: errorMessage,
		});
	}

	return failedResults;
}

export async function processBatchesAndCreateWorkflows(
	env: Env,
	actionsToProcess: ScheduledActionSelect[],
	triggerDate: string,
	currentDate: string,
	batchSize: number = 10,
): Promise<
	Array<{
		actionId: string;
		status: string;
		workflowInstanceId?: string;
		batchNumber?: number;
		error?: string;
	}>
> {
	const processResults = [];
	const workflowInstances = [];

	// Process actions in batches
	for (let i = 0; i < actionsToProcess.length; i += batchSize) {
		const batchActions = actionsToProcess.slice(i, i + batchSize);
		const batchNumber = Math.floor(i / batchSize) + 1;
		const batchInstanceId = `batch-${currentDate}-${batchNumber}-${Date.now()}`;

		try {
			const validActionIds = await createBatchHistoryEntries(
				env,
				batchActions,
				batchInstanceId,
				currentDate,
			);

			// Create processor workflow for this batch
			workflowInstances.push({
				id: batchInstanceId,
				params: {
					triggerDate,
					actionIds: validActionIds,
					batchNumber,
				},
			});

			console.log(
				`Created batch workflow ${batchInstanceId} for ${validActionIds.length} actions`,
			);

			for (const actionId of validActionIds) {
				processResults.push({
					actionId,
					status: "started",
					workflowInstanceId: batchInstanceId,
					batchNumber,
				});
			}
		} catch (error) {
			console.error(`Failed to process batch ${batchNumber}:`, error);

			const failedResults = await handleBatchError(
				env,
				batchActions,
				batchInstanceId,
				currentDate,
				error as Error,
			);

			processResults.push(...failedResults);
		}
	}

	// Create all processor workflows at once
	if (workflowInstances.length > 0) {
		await env.PROCESSOR_WORKFLOW.createBatch(workflowInstances);
	}

	return processResults;
}

/* istanbul ignore next */
export class ScheduledActionsOrchestratorWorkflow extends WorkflowEntrypoint {
	async run(
		event: WorkflowEvent<OrchestratorWorkflowPayload>,
		step: WorkflowStep,
	) {
		const { triggerDate } = event.payload;
		const currentDate = triggerDate.split(" ")[0];

		console.log(`Starting scheduled actions orchestration for ${currentDate}`);

		// Step 1: Get all pending actions for the date
		const pendingActions = await step.do("get-pending-actions", async () => {
			return await getPendingScheduledActions(this.env as Env, currentDate);
		});

		if (pendingActions.length === 0) {
			console.log("No pending actions to process");
			return {
				totalProcessed: 0,
				succeeded: 0,
				failed: 0,
				started: 0,
				stillRunning: 0,
				results: [],
			};
		}

		// Step 2: Filter out actions that already have history entries
		const { actionsToProcess, alreadyProcessedResults } = await step.do(
			"filter-actions-without-history",
			async () => {
				return await filterActionsWithoutHistory(
					this.env as Env,
					pendingActions,
					currentDate,
				);
			},
		);

		if (actionsToProcess.length === 0) {
			console.log("No actions need processing");
			return {
				totalProcessed: alreadyProcessedResults.length,
				succeeded: 0,
				failed: 0,
				started: 0,
				stillRunning: 0,
				results: alreadyProcessedResults,
			};
		}

		// Step 3: Process actions in batches and create workflows
		const batchResults = await step.do(
			"process-batches-and-create-workflows",
			async () => {
				return await processBatchesAndCreateWorkflows(
					this.env as Env,
					actionsToProcess,
					triggerDate,
					currentDate,
				);
			},
		);

		// Combine all results
		const allResults = [...alreadyProcessedResults, ...batchResults];

		// Summary
		const totalProcessed = allResults.length;
		const succeeded = allResults.filter(
			(r) => r.status === "completed" || r.status === "already_completed",
		).length;
		const failed = allResults.filter((r) => r.status === "failed").length;
		const started = allResults.filter((r) => r.status === "started").length;
		const stillRunning = allResults.filter(
			(r) => r.status === "still_running",
		).length;

		console.log(
			`Orchestration completed: ${totalProcessed} total, ${succeeded} succeeded, ${failed} failed, ${started} started, ${stillRunning} still running`,
		);

		return {
			totalProcessed,
			succeeded,
			failed,
			started,
			stillRunning,
			results: allResults,
		};
	}
}
