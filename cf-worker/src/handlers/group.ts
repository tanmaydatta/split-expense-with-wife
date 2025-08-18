import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type {
	GroupBudgetData,
	GroupDetailsResponse,
	GroupMetadata,
	UpdateGroupMetadataRequest,
	UpdateGroupMetadataResponse,
	User,
} from "../../../shared-types";
import type { getDb } from "../db";
import type { GroupBudget } from "../db/schema/schema";
import { groupBudgets, groups } from "../db/schema/schema";
import type { CurrentSession } from "../types";
import {
	createErrorResponse,
	createJsonResponse,
	formatSQLiteTime,
	generateRandomId,
	withAuth,
} from "../utils";

// Handle getting group details
export async function handleGroupDetails(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "GET") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	return withAuth(request, env, async (session, db) => {
		// Get group data using Drizzle
		if (!session.group) {
			return createErrorResponse("Unauthorized", 401, request, env);
		}
		const groupResult = await db
			.select({
				groupid: groups.groupid,
				groupName: groups.groupName,
				userids: groups.userids,
				metadata: groups.metadata,
			})
			.from(groups)
			.where(eq(groups.groupid, String(session.group.groupid)))
			.limit(1);

		if (groupResult.length === 0) {
			return createErrorResponse("Group not found", 404, request, env);
		}

		const group = groupResult[0];

		// Parse user IDs from group data
		const usersResult = Object.values(session.usersById);
		// Get all users in the group using Drizzle

		// Convert to User type format
		const groupUsers: User[] = usersResult.map((user) => ({
			Id: user.id,
			username: user.username,
			FirstName: user.firstName,
			LastName: user.lastName,
			groupid: user.groupid,
		}));

		const response: GroupDetailsResponse = {
			groupName: group.groupName,
			groupid: group.groupid,
			budgets: session.group.budgets,
			users: groupUsers,
			metadata: JSON.parse(group.metadata || "{}") as GroupMetadata,
		};

		return createJsonResponse(response, 200, {}, request, env);
	});
}

// Handle updating group metadata
// Helper function to validate currency
function validateCurrency(currency: string): boolean {
	const validCurrencies = [
		"USD",
		"EUR",
		"GBP",
		"CAD",
		"AUD",
		"JPY",
		"CHF",
		"CNY",
		"INR",
		"SEK",
		"NOK",
		"DKK",
		"PLN",
		"CZK",
		"HUF",
		"BGN",
		"RON",
		"HRK",
		"RUB",
		"TRY",
		"BRL",
		"MXN",
		"ZAR",
		"KRW",
		"SGD",
		"HKD",
		"NZD",
		"THB",
		"MYR",
		"IDR",
		"PHP",
		"VND",
	];
	return validCurrencies.includes(currency);
}

// Helper function to check user membership
function validateUserMembership(
	defaultShare: Record<string, number>,
	groupUserIds: Set<string>,
): string | null {
	const shareUserIds = new Set(Object.keys(defaultShare));

	// Check if all group members are included
	for (const userId of groupUserIds) {
		if (!shareUserIds.has(userId)) {
			return "All group members must have a default share percentage";
		}
	}

	// Check if any invalid user IDs are included
	for (const userId of shareUserIds) {
		if (!groupUserIds.has(userId)) {
			return "Invalid user IDs: users not in group";
		}
	}

	return null;
}

// Helper function to validate percentages
function validatePercentages(percentages: number[]): string | null {
	if (percentages.some((p) => p < 0)) {
		return "Default share percentages must be positive";
	}

	const total = percentages.reduce((sum, p) => sum + p, 0);
	if (Math.abs(total - 100) > 0.001) {
		return "Default share percentages must add up to 100%";
	}

	return null;
}

// Helper function to validate default share
function validateDefaultShare(
	defaultShare: Record<string, number>,
	groupUserIds: Set<string>,
): string | null {
	if (Object.keys(defaultShare).length === 0) {
		return "All group members must have a default share percentage";
	}

	const membershipError = validateUserMembership(defaultShare, groupUserIds);
	if (membershipError) return membershipError;

	const percentages = Object.values(defaultShare);
	return validatePercentages(percentages);
}

// Helper function to validate group name
function validateGroupName(groupName: string): string | null {
	const trimmedName = groupName.trim();
	if (trimmedName.length === 0) {
		return "Group name cannot be empty";
	}
	return null;
}

// Helper function to validate budgets
function validateBudgets(budgets: GroupBudgetData[]): string | null {
	for (const budget of budgets) {
		if (!/^[a-zA-Z0-9\s\-_]+$/.test(budget.budgetName)) {
			return "Budget names can only contain letters, numbers, spaces, hyphens, and underscores";
		}
		if (budget.budgetName.trim().length === 0) {
			return "Budget names cannot be empty";
		}
		if (budget.budgetName.length > 60) {
			return "Budget names cannot exceed 60 characters";
		}
	}

	// Note: Duplicate checking is handled in the processing phase via deduplication
	return null;
}

// Helper function to validate currency
function validateCurrencyField(
	body: UpdateGroupMetadataRequest,
): string | null {
	if (
		body.defaultCurrency !== undefined &&
		!validateCurrency(body.defaultCurrency)
	) {
		return "Invalid currency code";
	}
	return null;
}

// Helper function to validate and process group name
function validateAndProcessGroupName(
	body: UpdateGroupMetadataRequest,
): string | null {
	if (body.groupName === undefined) return null;

	const error = validateGroupName(body.groupName);
	if (error) return error;

	body.groupName = body.groupName.trim();
	return null;
}

// Helper function to validate and process budgets
function validateAndProcessBudgets(
	body: UpdateGroupMetadataRequest,
): string | null {
	if (body.budgets === undefined) return null;

	const error = validateBudgets(body.budgets);
	if (error) return error;

	// Deduplicate budgets by ID first, then by name
	const uniqueBudgets = [];
	const seenIds = new Set<string>();
	const seenNames = new Set<string>();

	for (const budget of body.budgets) {
		const normalizedName = budget.budgetName.toLowerCase();

		// Skip if we've seen this ID or name before
		if (budget.id && seenIds.has(budget.id)) continue;
		if (seenNames.has(normalizedName)) continue;

		if (budget.id) seenIds.add(budget.id);
		seenNames.add(normalizedName);
		uniqueBudgets.push(budget);
	}

	body.budgets = uniqueBudgets;
	return null;
}

// Helper function to validate and process individual fields
function validateAndProcessFields(
	body: UpdateGroupMetadataRequest,
	groupUserIds: Set<string>,
): string | null {
	const currencyError = validateCurrencyField(body);
	if (currencyError) return currencyError;

	if (body.defaultShare !== undefined) {
		const error = validateDefaultShare(body.defaultShare, groupUserIds);
		if (error) return error;
	}

	const groupNameError = validateAndProcessGroupName(body);
	if (groupNameError) return groupNameError;

	const budgetsError = validateAndProcessBudgets(body);
	if (budgetsError) return budgetsError;

	return null;
}

// Helper function to check if any changes are provided
function hasAnyChanges(body: UpdateGroupMetadataRequest): boolean {
	return (
		body.defaultShare !== undefined ||
		body.defaultCurrency !== undefined ||
		body.groupName !== undefined ||
		body.budgets !== undefined
	);
}

// Helper function to validate request body
function validateRequestBody(
	body: UpdateGroupMetadataRequest,
	groupUserIds: Set<string>,
): string | null {
	const fieldError = validateAndProcessFields(body, groupUserIds);
	if (fieldError) return fieldError;

	if (!hasAnyChanges(body)) {
		return "No changes provided";
	}

	return null;
}

// Helper function to update metadata
async function updateMetadata(
	body: UpdateGroupMetadataRequest,
	session: CurrentSession,
	db: ReturnType<typeof getDb>,
): Promise<string | undefined> {
	if (body.defaultShare === undefined && body.defaultCurrency === undefined) {
		return undefined;
	}

	if (!session.group) {
		throw new Error("No group found for session");
	}

	const currentGroup = await db
		.select({ metadata: groups.metadata })
		.from(groups)
		.where(eq(groups.groupid, String(session.group.groupid)))
		.limit(1);

	const currentMetadata = JSON.parse(
		currentGroup[0]?.metadata || "{}",
	) as GroupMetadata;

	const newMetadata: GroupMetadata = {
		...currentMetadata,
		...(body.defaultShare !== undefined && {
			defaultShare: body.defaultShare,
		}),
		...(body.defaultCurrency !== undefined && {
			defaultCurrency: body.defaultCurrency,
		}),
	};

	// Set default USD currency if no currency is provided and none exists
	if (body.defaultCurrency === undefined && !currentMetadata.defaultCurrency) {
		newMetadata.defaultCurrency = "USD";
	}

	return JSON.stringify(newMetadata);
}

// Helper function to categorize existing budgets
function categorizeBudgets(existingBudgets: GroupBudget[]) {
	const activeBudgets = new Map<string, GroupBudget>();
	const deletedBudgets = new Map<string, GroupBudget>();
	const allBudgets = new Map<string, GroupBudget>();

	for (const budget of existingBudgets) {
		allBudgets.set(budget.id, budget);
		if (budget.deleted) {
			deletedBudgets.set(budget.id, budget);
		} else {
			activeBudgets.set(budget.id, budget);
		}
	}

	return { activeBudgets, deletedBudgets, allBudgets };
}

// Helper function to handle active budget updates
function handleActiveBudgetUpdate(
	budget: GroupBudgetData,
	activeBudgets: Map<string, GroupBudget>,
	currentTime: string,
	db: ReturnType<typeof getDb>,
) {
	if (!budget.id) return null;
	const existing = activeBudgets.get(budget.id);
	if (
		existing &&
		(existing.budgetName !== budget.budgetName ||
			existing.description !== budget.description)
	) {
		return db
			.update(groupBudgets)
			.set({
				budgetName: budget.budgetName,
				description: budget.description || null,
				updatedAt: currentTime,
			})
			.where(eq(groupBudgets.id, budget.id));
	}
	return null;
}

// Helper function to handle deleted budget resurrection
function handleDeletedBudgetResurrection(
	budget: GroupBudgetData,
	currentTime: string,
	db: ReturnType<typeof getDb>,
) {
	if (!budget.id) throw new Error("Budget ID required for resurrection");
	return db
		.update(groupBudgets)
		.set({
			budgetName: budget.budgetName,
			description: budget.description || null,
			deleted: null,
			updatedAt: currentTime,
		})
		.where(eq(groupBudgets.id, budget.id));
}

// Helper function to handle new budget creation
function handleNewBudgetCreation(
	budget: GroupBudgetData,
	activeBudgets: Map<string, GroupBudget>,
	groupId: string,
	currentTime: string,
	db: ReturnType<typeof getDb>,
) {
	const nameConflict = Array.from(activeBudgets.values()).find(
		(b) => b.budgetName.toLowerCase() === budget.budgetName.toLowerCase(),
	);

	if (nameConflict) {
		if (
			nameConflict.budgetName !== budget.budgetName ||
			nameConflict.description !== budget.description
		) {
			return {
				statement: db
					.update(groupBudgets)
					.set({
						budgetName: budget.budgetName,
						description: budget.description || null,
						updatedAt: currentTime,
					})
					.where(eq(groupBudgets.id, nameConflict.id)),
				budgetId: nameConflict.id,
			};
		}
		return { statement: null, budgetId: nameConflict.id };
	}

	const budgetId = `budget_${generateRandomId()}`;
	return {
		statement: db.insert(groupBudgets).values({
			id: budgetId,
			groupId: groupId,
			budgetName: budget.budgetName,
			description: budget.description || null,
			createdAt: currentTime,
			updatedAt: currentTime,
		}),
		budgetId,
	};
}

// Helper function to process a single budget
function processSingleBudget(
	budget: GroupBudgetData,
	activeBudgets: Map<string, GroupBudget>,
	deletedBudgets: Map<string, GroupBudget>,
	groupId: string,
	currentTime: string,
	db: ReturnType<typeof getDb>,
) {
	if (budget.id && activeBudgets.has(budget.id)) {
		const statement = handleActiveBudgetUpdate(budget, activeBudgets, currentTime, db);
		return { statement, budgetId: budget.id };
	}

	if (budget.id && deletedBudgets.has(budget.id)) {
		const statement = handleDeletedBudgetResurrection(budget, currentTime, db);
		return { statement, budgetId: budget.id };
	}

	return handleNewBudgetCreation(budget, activeBudgets, groupId, currentTime, db);
}

// Helper function to process budget updates and creates
function processBudgetUpdates(
	newBudgets: GroupBudgetData[],
	activeBudgets: Map<string, GroupBudget>,
	deletedBudgets: Map<string, GroupBudget>,
	groupId: string,
	currentTime: string,
	db: ReturnType<typeof getDb>,
) {
	const batchStatements: BatchItem<"sqlite">[] = [];
	const budgetsToKeep = new Set<string>();

	for (const budget of newBudgets) {
		const { statement, budgetId } = processSingleBudget(
			budget,
			activeBudgets,
			deletedBudgets,
			groupId,
			currentTime,
			db,
		);
		budgetsToKeep.add(budgetId);
		if (statement) batchStatements.push(statement);
	}

	return { batchStatements, budgetsToKeep };
}

// Helper function to process budget deletions
function processBudgetDeletions(
	activeBudgets: Map<string, GroupBudget>,
	budgetsToKeep: Set<string>,
	currentTime: string,
	db: ReturnType<typeof getDb>,
) {
	const deletionStatements: BatchItem<"sqlite">[] = [];

	for (const [budgetId] of activeBudgets) {
		if (!budgetsToKeep.has(budgetId)) {
			deletionStatements.push(
				db
					.update(groupBudgets)
					.set({
						deleted: currentTime,
						updatedAt: currentTime,
					})
					.where(eq(groupBudgets.id, budgetId)),
			);
		}
	}

	return deletionStatements;
}

// Helper function to update group budgets using D1 batch transactions
async function updateGroupBudgets(
	newBudgets: GroupBudgetData[],
	groupId: string,
	db: ReturnType<typeof getDb>,
): Promise<void> {
	const currentTime = formatSQLiteTime();

	// Get ALL existing budgets for this group
	const existingBudgets = await db
		.select()
		.from(groupBudgets)
		.where(eq(groupBudgets.groupId, groupId));

	const { activeBudgets, deletedBudgets } = categorizeBudgets(existingBudgets);

	const { batchStatements, budgetsToKeep } = processBudgetUpdates(
		newBudgets,
		activeBudgets,
		deletedBudgets,
		groupId,
		currentTime,
		db,
	);

	const deletionStatements = processBudgetDeletions(
		activeBudgets,
		budgetsToKeep,
		currentTime,
		db,
	);

	const allStatements = [...batchStatements, ...deletionStatements];

	if (allStatements.length > 0) {
		await db.batch(
			allStatements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
		);
	}
}

// Helper function to build updates object
async function buildUpdatesObject(
	body: UpdateGroupMetadataRequest,
	session: CurrentSession,
	db: ReturnType<typeof getDb>,
): Promise<{ metadata?: string; groupName?: string }> {
	const updates: { metadata?: string; groupName?: string } = {};

	// Update metadata if provided
	const metadata = await updateMetadata(body, session, db);
	if (metadata) {
		updates.metadata = metadata;
	}

	// Update group name if provided
	if (body.groupName !== undefined) {
		updates.groupName = body.groupName;
	}

	// Update budgets if provided
	if (body.budgets !== undefined && session.group) {
		await updateGroupBudgets(body.budgets, session.group.groupid, db);
	}

	return updates;
}

export async function handleUpdateGroupMetadata(
	request: Request,
	env: Env,
): Promise<Response> {
	console.log("handleUpdateGroupMetadata", request.method);
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	return withAuth(request, env, async (session, db) => {
		console.log("session", session);
		if (!session.group) {
			console.log("No group found for session");
			return createErrorResponse(
				"No group found for session",
				401,
				request,
				env,
			);
		}
		const body = (await request.json()) as UpdateGroupMetadataRequest;

		// Check if user is authorized to modify this group
		if (body.groupid && body.groupid !== session.group.groupid) {
			console.log("group id mismatch", body.groupid, session.group.groupid);
			return createErrorResponse("group id mismatch", 401, request, env);
		}

		// Validate request body
		const groupUserIds = new Set(Object.keys(session.usersById));
		const validationError = validateRequestBody(body, groupUserIds);
		if (validationError) {
			return createErrorResponse(validationError, 400, request, env);
		}

		// Build updates object
		const updates = await buildUpdatesObject(body, session, db);
		// Update group using Drizzle
		if (Object.keys(updates).length > 0) {
			await db
				.update(groups)
				.set(updates)
				.where(eq(groups.groupid, String(session.group.groupid)));
		}

		// Get updated metadata for response
		const updatedGroup = await db
			.select({ metadata: groups.metadata })
			.from(groups)
			.where(eq(groups.groupid, String(session.group.groupid)))
			.limit(1);

		const updatedMetadata = JSON.parse(
			updatedGroup[0]?.metadata || "{}",
		) as GroupMetadata;

		const response: UpdateGroupMetadataResponse = {
			message: "Group metadata updated successfully",
			metadata: updatedMetadata,
		};

		return createJsonResponse(response, 200, {}, request, env);
	});
}
