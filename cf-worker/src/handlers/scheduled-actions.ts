import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import {
	type AddBudgetActionData,
	AddBudgetActionSchema,
	type AddExpenseActionData,
	AddExpenseActionSchema,
	type CreateScheduledActionRequest,
	CURRENCIES,
	type ScheduledAction,
	ScheduledActionHistoryQuerySchema,
	ScheduledActionListQuerySchema,
	type ScheduledActionListResponse,
	type UpdateScheduledActionRequest,
	UpdateScheduledActionSchema,
} from "../../../shared-types";
import type { getDb } from "../db";
import { scheduledActionHistory, scheduledActions } from "../db/schema/schema";
import type { ParsedGroup } from "../types";
import {
	createErrorResponse,
	createJsonResponse,
	formatSQLiteTime,
	formatZodError,
	withAuth,
} from "../utils";
import { triggerImmediateRun } from "../workflows/scheduled-actions-processor";

// The database now returns properly typed JSON, so we don't need custom row types

// Type for update operations
type ScheduledActionUpdateData = {
	updatedAt: string;
	isActive?: boolean;
	frequency?: "daily" | "weekly" | "monthly";
	startDate?: string;
	actionData?: AddExpenseActionData | AddBudgetActionData;
	nextExecutionDate?: string;
};

// Date utility functions

// Helper function to add months while preserving the original intended day
function addMonthsSafely(
	date: Date,
	monthsToAdd: number,
	originalTargetDay?: number,
): Date {
	// If no original target day is provided, use the current date's day
	const targetDay = originalTargetDay ?? date.getUTCDate();
	const result = new Date(date);

	// Calculate target month and year using UTC
	const targetMonth = result.getUTCMonth() + monthsToAdd;
	const targetYear = result.getUTCFullYear() + Math.floor(targetMonth / 12);
	const normalizedMonth = ((targetMonth % 12) + 12) % 12;

	// Set to first day of target month first using UTC
	result.setUTCFullYear(targetYear, normalizedMonth, 1);

	// Get last day of this month to check if target day exists using UTC
	const lastDayOfMonth = new Date(
		Date.UTC(targetYear, normalizedMonth + 1, 0),
	).getUTCDate();

	// Use target day if it exists, otherwise use last day of month
	const actualDay = Math.min(targetDay, lastDayOfMonth);
	result.setUTCDate(actualDay);

	return result;
}

export function calculateNextExecutionDate(
	startDate: string,
	frequency: "daily" | "weekly" | "monthly",
	now: Date = new Date(),
): string {
	const start = new Date(startDate);
	// Reset to midnight UTC for date comparison based on provided "now"
	const today = new Date(now);
	today.setUTCHours(0, 0, 0, 0);

	// If start date is in the future, return start date
	if (start > today) {
		return startDate;
	}

	// For monthly frequency, remember the original target day
	const originalTargetDay = start.getUTCDate();

	// Calculate next execution based on frequency
	const next = new Date(start);

	while (next <= today) {
		switch (frequency) {
			case "daily":
				next.setUTCDate(next.getUTCDate() + 1);
				break;
			case "weekly":
				next.setUTCDate(next.getUTCDate() + 7);
				break;
			case "monthly": {
				const nextMonth = addMonthsSafely(next, 1, originalTargetDay);
				next.setTime(nextMonth.getTime());
				break;
			}
		}
	}

	return next.toISOString().split("T")[0]; // Return ISO date string
}

// Build runtime Zod schemas with group-aware rules
function buildActionDataSchemas(userIds: string[], budgets: string[]) {
	const currencySchema = z
		.string()
		.refine((c) => CURRENCIES.includes(c as (typeof CURRENCIES)[number]), {
			message: `Invalid currency. Supported: ${CURRENCIES.join(", ")}`,
		});

	const ExpenseValid = AddExpenseActionSchema.extend({
		currency: currencySchema,
	}).superRefine((data, ctx) => {
		if (!userIds.includes(data.paidByUserId)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Invalid paidByUserId - user not in group",
				path: ["paidByUserId"],
			});
		}
		for (const userId of Object.keys(data.splitPctShares)) {
			if (!userIds.includes(userId)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Invalid user in split shares - not in group",
					path: ["splitPctShares", userId],
				});
			}
		}
	});

	const BudgetValid = AddBudgetActionSchema.extend({
		currency: currencySchema,
		budgetName: z.string().refine((name) => budgets.includes(name), {
			message: "Invalid budget name - not available in group",
		}),
	});

	return { ExpenseValid, BudgetValid } as const;
}

function buildCreateActionSchema(userIds: string[], budgets: string[]) {
	const { ExpenseValid, BudgetValid } = buildActionDataSchemas(
		userIds,
		budgets,
	);
	const BaseCommon = {
		frequency: z.union([
			z.literal("daily"),
			z.literal("weekly"),
			z.literal("monthly"),
		]),
		startDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.refine((v) => !Number.isNaN(Date.parse(v)), {
				message: "Invalid start date format",
			}),
	} as const;

	return z.union([
		z.object({
			actionType: z.literal("add_expense"),
			...BaseCommon,
			actionData: ExpenseValid,
		}),
		z.object({
			actionType: z.literal("add_budget"),
			...BaseCommon,
			actionData: BudgetValid,
		}),
	]);
}

// Common param/body schemas
const IdParamSchema = z.object({ id: z.string().min(1) });
const DeleteBodySchema = z.object({ id: z.string().min(1) });

// CRUD Operations
export async function handleScheduledActionCreate(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const json = (await request.json()) as CreateScheduledActionRequest;

		// All validation handled by Zod schema below

		// Get group info for validation
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}

		// Parse request strictly with Zod (no manual any checks)
		const parsed = buildCreateActionSchema(
			group.userids,
			group.budgets,
		).safeParse(json as unknown);
		if (!parsed.success) {
			return createErrorResponse(
				formatZodError(parsed.error),
				400,
				request,
				env,
			);
		}
		const body: CreateScheduledActionRequest = parsed.data;
		// group and actionData already validated by schema

		// Calculate next execution date
		const nextExecutionDate = calculateNextExecutionDate(
			body.startDate,
			body.frequency,
		);
		const now = formatSQLiteTime();

		// Create scheduled action
		const actionId = ulid();
		const newAction = {
			id: actionId,
			userId: session.user.id,
			actionType: body.actionType,
			frequency: body.frequency,
			startDate: body.startDate,
			isActive: true,
			createdAt: now,
			updatedAt: now,
			actionData: body.actionData,
			nextExecutionDate,
		};

		await db.insert(scheduledActions).values(newAction);

		return createJsonResponse(
			{ message: "Scheduled action created successfully", id: actionId },
			201,
			{},
			request,
			env,
		);
	});
}

export async function handleScheduledActionList(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}
		const url = new URL(request.url);
		const parseQuery = ScheduledActionListQuerySchema.safeParse({
			offset: url.searchParams.get("offset") ?? "0",
			limit: url.searchParams.get("limit") ?? "10",
		});
		if (!parseQuery.success) {
			return createErrorResponse(
				formatZodError(parseQuery.error),
				400,
				request,
				env,
			);
		}
		const { offset, limit } = parseQuery.data;

		// Get total count
		const totalCountResult = await db
			.select({ count: count() })
			.from(scheduledActions)
			.where(inArray(scheduledActions.userId, group.userids));

		const totalCount = totalCountResult[0]?.count || 0;

		// Get scheduled actions
		const actions = await db
			.select()
			.from(scheduledActions)
			.where(inArray(scheduledActions.userId, group.userids))
			.orderBy(desc(scheduledActions.createdAt))
			.limit(limit)
			.offset(offset);

		// Convert null to undefined for TypeScript compatibility
		const convertedActions = actions.map((action) => ({
			...action,
			lastExecutedAt: action.lastExecutedAt || undefined,
		}));

		const response: ScheduledActionListResponse = {
			scheduledActions: convertedActions,
			totalCount,
			hasMore: offset + limit < totalCount,
		};

		return createJsonResponse(response, 200, {}, request, env);
	});
}

// Helper function to validate and get existing action
async function getExistingAction(
	db: ReturnType<typeof getDb>,
	actionId: string,
	groupUserIds: string[],
) {
	const existingAction = await db
		.select()
		.from(scheduledActions)
		.where(
			and(
				eq(scheduledActions.id, actionId),
				inArray(scheduledActions.userId, groupUserIds),
			),
		)
		.limit(1);

	if (existingAction.length === 0) {
		throw new Error("Scheduled action not found");
	}

	return existingAction[0];
}

// Helper function to build update data object
function buildUpdateData(
	body: UpdateScheduledActionRequest,
): ScheduledActionUpdateData {
	const updateData: ScheduledActionUpdateData = {
		updatedAt: formatSQLiteTime(),
	};

	if (body.isActive !== undefined) {
		updateData.isActive = body.isActive;
	}

	if (body.frequency) {
		updateData.frequency = body.frequency;
	}

	if (body.startDate) {
		updateData.startDate = body.startDate;
	}

	return updateData;
}

// Helper function to validate and set action data
// Type for database query result (has null instead of undefined)
type ScheduledActionDbResult = Omit<ScheduledAction, "lastExecutedAt"> & {
	lastExecutedAt: string | null;
};

function validateAndSetActionData(
	body: UpdateScheduledActionRequest,
	existingAction: ScheduledActionDbResult,
	group: ParsedGroup,
	updateData: ScheduledActionUpdateData,
): void {
	if (!body.actionData) {
		return;
	}

	// Validate action data via runtime Zod
	const { ExpenseValid, BudgetValid } = buildActionDataSchemas(
		group.userids,
		group.budgets,
	);

	const actionParsed =
		existingAction.actionType === "add_expense"
			? ExpenseValid.safeParse(body.actionData)
			: BudgetValid.safeParse(body.actionData);

	if (!actionParsed.success) {
		throw new Error(formatZodError(actionParsed.error));
	}

	updateData.actionData = actionParsed.data as
		| AddExpenseActionData
		| AddBudgetActionData;
}

// Helper function to calculate next execution date
function calculateAndSetNextExecutionDate(
	body: UpdateScheduledActionRequest,
	existingAction: ScheduledActionDbResult,
	updateData: ScheduledActionUpdateData,
): void {
	// 1) If explicit nextExecutionDate provided, accept it as-is
	if (body.nextExecutionDate) {
		updateData.nextExecutionDate = body.nextExecutionDate;
		return;
	}

	// 2) If skipNext is requested, compute next using calculateNextExecutionDate
	if (body.skipNext) {
		const currentNext = existingAction.nextExecutionDate;
		const freq = (body.frequency || existingAction.frequency) as
			| "daily"
			| "weekly"
			| "monthly";
		updateData.nextExecutionDate = calculateNextExecutionDate(
			currentNext,
			freq,
			new Date(currentNext),
		);
		return;
	}

	// 3) Recalculate next execution date if frequency or start date changed
	if ((body.frequency || body.startDate) && !updateData.nextExecutionDate) {
		const newFrequency = body.frequency || existingAction.frequency;
		const newStartDate = body.startDate || existingAction.startDate;
		updateData.nextExecutionDate = calculateNextExecutionDate(
			newStartDate,
			newFrequency as "daily" | "weekly" | "monthly",
		);
	}
}

// Helper function to process scheduled action update
async function processScheduledActionUpdate(
	body: UpdateScheduledActionRequest,
	group: ParsedGroup,
	db: ReturnType<typeof getDb>,
): Promise<void> {
	// Get existing action
	const existingAction = await getExistingAction(db, body.id, group.userids);

	// Build update data
	const updateData = buildUpdateData(body);

	// Validate and set action data if provided
	validateAndSetActionData(body, existingAction, group, updateData);

	// Calculate next execution date
	calculateAndSetNextExecutionDate(body, existingAction, updateData);

	// Update the action
	await db
		.update(scheduledActions)
		.set(updateData)
		.where(
			and(
				eq(scheduledActions.id, body.id),
				inArray(scheduledActions.userId, group.userids),
			),
		);
}

// Helper function to parse and validate update request
function parseUpdateRequest(
	json: unknown,
):
	| { success: true; data: UpdateScheduledActionRequest }
	| { success: false; error: string } {
	const parsed = UpdateScheduledActionSchema.safeParse(json);
	if (!parsed.success) {
		return { success: false, error: formatZodError(parsed.error) };
	}
	return { success: true, data: parsed.data };
}

// Helper function to handle update errors
function handleUpdateError(error: unknown): {
	message: string;
	status: number;
} {
	const message = error instanceof Error ? error.message : "Unknown error";
	const status = message === "Scheduled action not found" ? 404 : 400;
	return { message, status };
}

export async function handleScheduledActionUpdate(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}

		try {
			const json = (await request.json()) as unknown;
			const parseResult = parseUpdateRequest(json);
			if (!parseResult.success) {
				return createErrorResponse(parseResult.error, 400, request, env);
			}

			await processScheduledActionUpdate(parseResult.data, group, db);

			return createJsonResponse(
				{ message: "Scheduled action updated successfully" },
				200,
				{},
				request,
				env,
			);
		} catch (error) {
			const { message, status } = handleUpdateError(error);
			return createErrorResponse(message, status, request, env);
		}
	});
}

export async function handleScheduledActionDelete(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}
		const json = (await request.json()) as unknown;
		const parsed = DeleteBodySchema.safeParse(json);
		if (!parsed.success) {
			return createErrorResponse(
				formatZodError(parsed.error),
				400,
				request,
				env,
			);
		}
		const body = parsed.data;

		// Check if action exists and belongs to user
		const existingAction = await db
			.select()
			.from(scheduledActions)
			.where(
				and(
					eq(scheduledActions.id, body.id),
					inArray(scheduledActions.userId, group.userids),
				),
			)
			.limit(1);

		if (existingAction.length === 0) {
			return createErrorResponse(
				"Scheduled action not found",
				404,
				request,
				env,
			);
		}

		// Delete the action (cascade will handle history)
		await db
			.delete(scheduledActions)
			.where(
				and(
					eq(scheduledActions.id, body.id),
					inArray(scheduledActions.userId, group.userids),
				),
			);

		return createJsonResponse(
			{ message: "Scheduled action deleted successfully" },
			200,
			{},
			request,
			env,
		);
	});
}

// Helper function to build history query conditions
function buildHistoryConditions(
	group: ParsedGroup,
	scheduledActionId?: string,
	executionStatus?: string,
) {
	const conditions = [inArray(scheduledActionHistory.userId, group.userids)];

	if (scheduledActionId) {
		conditions.push(
			eq(scheduledActionHistory.scheduledActionId, scheduledActionId),
		);
	}
	if (
		executionStatus &&
		["success", "failed", "started"].includes(executionStatus)
	) {
		conditions.push(
			eq(
				scheduledActionHistory.executionStatus,
				executionStatus as "success" | "failed" | "started",
			),
		);
	}

	return conditions;
}

// Helper function to get history data
async function getHistoryData(
	db: ReturnType<typeof getDb>,
	conditions: Parameters<typeof and>,
	offset: number,
	limit: number,
) {
	// Get total count
	const totalCountResult = await db
		.select({ count: count() })
		.from(scheduledActionHistory)
		.where(and(...conditions));

	const totalCount = totalCountResult[0]?.count || 0;

	// Get history entries
	const history = await db
		.select()
		.from(scheduledActionHistory)
		.where(and(...conditions))
		.orderBy(desc(scheduledActionHistory.executedAt))
		.limit(limit)
		.offset(offset);

	// Convert null to undefined for TypeScript compatibility
	const convertedHistory = history.map((entry) => ({
		...entry,
		errorMessage: entry.errorMessage || undefined,
		executionDurationMs: entry.executionDurationMs || undefined,
	}));

	return {
		history: convertedHistory,
		totalCount,
		hasMore: offset + limit < totalCount,
	};
}

export async function handleScheduledActionHistory(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}
		const url = new URL(request.url);
		const parseQuery = ScheduledActionHistoryQuerySchema.safeParse({
			offset: url.searchParams.get("offset") ?? "0",
			limit: url.searchParams.get("limit") ?? "10",
			scheduledActionId: url.searchParams.get("scheduledActionId") ?? undefined,
			executionStatus: url.searchParams.get("executionStatus") ?? undefined,
		});
		if (!parseQuery.success) {
			return createErrorResponse(
				formatZodError(parseQuery.error),
				400,
				request,
				env,
			);
		}
		const { offset, limit, scheduledActionId, executionStatus } =
			parseQuery.data;

		const conditions = buildHistoryConditions(
			group,
			scheduledActionId,
			executionStatus,
		);
		const response = await getHistoryData(db, conditions, offset, limit);

		return createJsonResponse(response, 200, {}, request, env);
	});
}

export async function handleScheduledActionDetails(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}
		const url = new URL(request.url);
		const parsed = IdParamSchema.safeParse({ id: url.searchParams.get("id") });
		if (!parsed.success) {
			return createErrorResponse(
				formatZodError(parsed.error),
				400,
				request,
				env,
			);
		}
		const { id } = parsed.data;

		const rows = await db
			.select()
			.from(scheduledActions)
			.where(
				and(
					eq(scheduledActions.id, id),
					inArray(scheduledActions.userId, group.userids),
				),
			)
			.limit(1);

		if (rows.length === 0) {
			return createErrorResponse(
				"Scheduled action not found",
				404,
				request,
				env,
			);
		}

		return createJsonResponse(rows[0], 200, {}, request, env);
	});
}

export async function handleScheduledActionHistoryDetails(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}
		const url = new URL(request.url);
		const parsed = IdParamSchema.safeParse({ id: url.searchParams.get("id") });
		if (!parsed.success) {
			return createErrorResponse(
				formatZodError(parsed.error),
				400,
				request,
				env,
			);
		}
		const { id } = parsed.data;

		const rows = await db
			.select()
			.from(scheduledActionHistory)
			.where(
				and(
					eq(scheduledActionHistory.id, id),
					inArray(scheduledActionHistory.userId, group.userids),
				),
			)
			.limit(1);

		if (rows.length === 0) {
			return createErrorResponse("History entry not found", 404, request, env);
		}

		return createJsonResponse(rows[0], 200, {}, request, env);
	});
}

export async function handleScheduledActionRunNow(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}
		const json = (await request.json()) as { id?: string };
		const id = json?.id;
		if (!id) {
			return createErrorResponse("Missing id", 400, request, env);
		}
		// Validate ownership: action must belong to a user in the same group
		const rows = await db
			.select()
			.from(scheduledActions)
			.where(
				and(
					eq(scheduledActions.id, id),
					inArray(scheduledActions.userId, group.userids),
				),
			)
			.limit(1);
		if (rows.length === 0) {
			return createErrorResponse(
				"Scheduled action not found",
				404,
				request,
				env,
			);
		}
		// Use the action's nextExecutionDate as the trigger date (00:00:00 time)
		const nextDate = rows[0].nextExecutionDate;
		const triggerDate = `${nextDate} 00:00:00`;
		const workflowInstanceId = await triggerImmediateRun(env, id, triggerDate);
		return createJsonResponse(
			{ message: "Run started", workflowInstanceId },
			200,
			{},
			request,
			env,
		);
	});
}
