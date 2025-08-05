import { ulid } from "ulid";
import { eq, and, desc, count } from "drizzle-orm";
import { scheduledActions, scheduledActionHistory } from "../db/schema/schema";
import { withAuth } from "../utils";
import {
	type CreateScheduledActionRequest,
	type UpdateScheduledActionRequest,
	type ScheduledActionListResponse,
	type ScheduledActionHistoryListResponse,
	type AddExpenseActionData,
	type AddBudgetActionData,
	CURRENCIES,
} from "../../../shared-types";

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
): string {
	const start = new Date(startDate);
	const now = new Date();
	now.setUTCHours(0, 0, 0, 0); // Reset to midnight UTC for date comparison

	// If start date is in the future, return start date
	if (start > now) {
		return startDate;
	}

	// For monthly frequency, remember the original target day
	const originalTargetDay = start.getUTCDate();

	// Calculate next execution based on frequency
	const next = new Date(start);

	while (next <= now) {
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

// Validation functions
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

// CRUD Operations
export async function handleScheduledActionCreate(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const body: CreateScheduledActionRequest = await request.json();
		// Validate input
		if (
			!body.actionType ||
			!body.frequency ||
			!body.startDate ||
			!body.actionData
		) {
			return new Response(
				JSON.stringify({ error: "Missing required fields" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Validate action type
		if (!["add_expense", "add_budget"].includes(body.actionType)) {
			return new Response(JSON.stringify({ error: "Invalid action type" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Validate frequency
		if (!["daily", "weekly", "monthly"].includes(body.frequency)) {
			return new Response(JSON.stringify({ error: "Invalid frequency" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Validate start date
		const startDate = new Date(body.startDate);
		if (Number.isNaN(startDate.getTime())) {
			return new Response(
				JSON.stringify({ error: "Invalid start date format" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Get group info for validation
		const group = session.group;
		if (!group) {
			return new Response(JSON.stringify({ error: "User not in a group" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Validate action data
		const validationError = validateActionData(
			body.actionType,
			body.actionData,
			group.userids,
			group.budgets,
		);
		if (validationError) {
			return new Response(JSON.stringify({ error: validationError }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Calculate next execution date
		const nextExecutionDate = calculateNextExecutionDate(
			body.startDate,
			body.frequency,
		);
		const now = new Date().toISOString();

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

		return new Response(
			JSON.stringify({
				message: "Scheduled action created successfully",
				id: actionId,
			}),
			{
				status: 201,
				headers: { "Content-Type": "application/json" },
			},
		);
	});
}

export async function handleScheduledActionList(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const url = new URL(request.url);
		const offset = Number.parseInt(url.searchParams.get("offset") || "0");
		const limit = Math.min(
			Number.parseInt(url.searchParams.get("limit") || "10"),
			50,
		);

		// Get total count
		const totalCountResult = await db
			.select({ count: count() })
			.from(scheduledActions)
			.where(eq(scheduledActions.userId, session.user.id));

		const totalCount = totalCountResult[0]?.count || 0;

		// Get scheduled actions
		const actions = await db
			.select()
			.from(scheduledActions)
			.where(eq(scheduledActions.userId, session.user.id))
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

		return new Response(JSON.stringify(response), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
}

export async function handleScheduledActionUpdate(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const body: UpdateScheduledActionRequest = await request.json();

		if (!body.id) {
			return new Response(JSON.stringify({ error: "Missing action ID" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Check if action exists and belongs to user
		const existingAction = await db
			.select()
			.from(scheduledActions)
			.where(
				and(
					eq(scheduledActions.id, body.id),
					eq(scheduledActions.userId, session.user.id),
				),
			)
			.limit(1);

		if (existingAction.length === 0) {
			return new Response(
				JSON.stringify({ error: "Scheduled action not found" }),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Build update object
		const updateData: ScheduledActionUpdateData = {
			updatedAt: new Date().toISOString(),
		};

		if (body.isActive !== undefined) {
			updateData.isActive = body.isActive;
		}

		if (body.frequency) {
			if (!["daily", "weekly", "monthly"].includes(body.frequency)) {
				return new Response(JSON.stringify({ error: "Invalid frequency" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
			updateData.frequency = body.frequency;
		}

		if (body.startDate) {
			const startDate = new Date(body.startDate);
			if (Number.isNaN(startDate.getTime())) {
				return new Response(
					JSON.stringify({ error: "Invalid start date format" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
			updateData.startDate = body.startDate;
		}

		if (body.actionData) {
			// Get group info for validation
			const group = session.group;
			if (!group) {
				return new Response(JSON.stringify({ error: "User not in a group" }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}

			// Validate action data
			const validationError = validateActionData(
				existingAction[0].actionType,
				body.actionData,
				group.userids,
				group.budgets,
			);
			if (validationError) {
				return new Response(JSON.stringify({ error: validationError }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}

			updateData.actionData = body.actionData;
		}

		// Recalculate next execution date if frequency or start date changed
		if (body.frequency || body.startDate) {
			const newFrequency = body.frequency || existingAction[0].frequency;
			const newStartDate = body.startDate || existingAction[0].startDate;
			updateData.nextExecutionDate = calculateNextExecutionDate(
				newStartDate,
				newFrequency as "daily" | "weekly" | "monthly",
			);
		}

		// Update the action
		await db
			.update(scheduledActions)
			.set(updateData)
			.where(
				and(
					eq(scheduledActions.id, body.id),
					eq(scheduledActions.userId, session.user.id),
				),
			);

		return new Response(
			JSON.stringify({
				message: "Scheduled action updated successfully",
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	});
}

export async function handleScheduledActionDelete(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const body: { id: string } = await request.json();

		if (!body.id) {
			return new Response(JSON.stringify({ error: "Missing action ID" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Check if action exists and belongs to user
		const existingAction = await db
			.select()
			.from(scheduledActions)
			.where(
				and(
					eq(scheduledActions.id, body.id),
					eq(scheduledActions.userId, session.user.id),
				),
			)
			.limit(1);

		if (existingAction.length === 0) {
			return new Response(
				JSON.stringify({ error: "Scheduled action not found" }),
				{
					status: 404,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Delete the action (cascade will handle history)
		await db
			.delete(scheduledActions)
			.where(
				and(
					eq(scheduledActions.id, body.id),
					eq(scheduledActions.userId, session.user.id),
				),
			);

		return new Response(
			JSON.stringify({
				message: "Scheduled action deleted successfully",
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	});
}

export async function handleScheduledActionHistory(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const url = new URL(request.url);
		const offset = Number.parseInt(url.searchParams.get("offset") || "0");
		const limit = Math.min(
			Number.parseInt(url.searchParams.get("limit") || "10"),
			50,
		);
		const scheduledActionId = url.searchParams.get("scheduledActionId");
		const actionType = url.searchParams.get("actionType");
		const executionStatus = url.searchParams.get("executionStatus");

		// Build where conditions
		const conditions = [eq(scheduledActionHistory.userId, session.user.id)];

		if (scheduledActionId) {
			conditions.push(
				eq(scheduledActionHistory.scheduledActionId, scheduledActionId),
			);
		}
		if (actionType && ["add_expense", "add_budget"].includes(actionType)) {
			conditions.push(
				eq(
					scheduledActionHistory.actionType,
					actionType as "add_expense" | "add_budget",
				),
			);
		}
		if (executionStatus && ["success", "failed"].includes(executionStatus)) {
			conditions.push(
				eq(
					scheduledActionHistory.executionStatus,
					executionStatus as "success" | "failed",
				),
			);
		}

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

		const response: ScheduledActionHistoryListResponse = {
			history: convertedHistory,
			totalCount,
			hasMore: offset + limit < totalCount,
		};

		return new Response(JSON.stringify(response), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
}
