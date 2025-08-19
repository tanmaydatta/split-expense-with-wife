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
import { UpdateGroupMetadataRequestSchema } from "../../../shared-types";
import type { getDb } from "../db";
import type { GroupBudget } from "../db/schema/schema";
import { groupBudgets, groups } from "../db/schema/schema";
import type { CurrentSession } from "../types";
import {
	createErrorResponse,
	createJsonResponse,
	formatSQLiteTime,
	formatZodError,
	generateRandomId,
	withAuth,
} from "../utils";

// Custom error classes
export class BudgetConflictError extends Error {
	constructor(budgetName: string, existingBudgetId: string) {
		super(
			`Budget name '${budgetName}' already exists (ID: ${existingBudgetId})`,
		);
		this.name = "BudgetConflictError";
	}
}

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
	// Check for name conflicts and throw error
	const nameConflict = Array.from(activeBudgets.values()).find(
		(b) => b.budgetName.toLowerCase() === budget.budgetName.toLowerCase(),
	);

	if (nameConflict) {
		throw new BudgetConflictError(budget.budgetName, nameConflict.id);
	}

	// Create new budget - use provided ID or generate random one
	const budgetId = budget.id || `budget_${generateRandomId()}`;
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
		const statement = handleActiveBudgetUpdate(
			budget,
			activeBudgets,
			currentTime,
			db,
		);
		return { statement, budgetId: budget.id };
	}

	if (budget.id && deletedBudgets.has(budget.id)) {
		const statement = handleDeletedBudgetResurrection(budget, currentTime, db);
		return { statement, budgetId: budget.id };
	}

	return handleNewBudgetCreation(
		budget,
		activeBudgets,
		groupId,
		currentTime,
		db,
	);
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

// Helper function to prepare group budget statements for batch execution
async function updateGroupBudgets(
	newBudgets: GroupBudgetData[],
	groupId: string,
	db: ReturnType<typeof getDb>,
): Promise<BatchItem<"sqlite">[]> {
	const currentTime = formatSQLiteTime();

	// Get ALL existing budgets for this group
	const existingBudgets = await db
		.select()
		.from(groupBudgets)
		.where(eq(groupBudgets.groupId, String(groupId)));

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

	return [...batchStatements, ...deletionStatements];
}

// Helper function to build updates object and statements
async function buildUpdatesObject(
	body: UpdateGroupMetadataRequest,
	session: CurrentSession,
	db: ReturnType<typeof getDb>,
): Promise<{
	updates: { metadata?: string; groupName?: string };
	statements: BatchItem<"sqlite">[];
}> {
	const updates: { metadata?: string; groupName?: string } = {};
	const statements: BatchItem<"sqlite">[] = [];

	// Update metadata if provided
	const metadata = await updateMetadata(body, session, db);
	if (metadata) {
		updates.metadata = metadata;
	}

	// Update group name if provided
	if (body.groupName !== undefined) {
		updates.groupName = body.groupName;
	}

	// Get budget statements if provided
	if (body.budgets !== undefined && session.group) {
		const budgetStatements = await updateGroupBudgets(
			body.budgets,
			String(session.group.groupid),
			db,
		);
		statements.push(...budgetStatements);
	}

	return { updates, statements };
}

// Helper function to validate user shares
function validateUserShares(
	defaultShare: Record<string, number>,
	session: CurrentSession,
	request: Request,
	env: Env,
): { success: false; response: Response } | null {
	const groupUserIds = new Set(Object.keys(session.usersById));
	const shareUserIds = new Set(Object.keys(defaultShare));

	// Check if all group members are included
	for (const userId of groupUserIds) {
		if (!shareUserIds.has(userId)) {
			return {
				success: false,
				response: createErrorResponse(
					"All group members must have a default share percentage",
					400,
					request,
					env,
				),
			};
		}
	}

	// Check if any invalid user IDs are included
	for (const userId of shareUserIds) {
		if (!groupUserIds.has(userId)) {
			return {
				success: false,
				response: createErrorResponse(
					"Invalid user IDs: users not in group",
					400,
					request,
					env,
				),
			};
		}
	}

	return null; // No validation errors
}

// Helper function to validate request using Zod schema
async function validateUpdateRequest(
	request: Request,
	session: CurrentSession,
	env: Env,
): Promise<
	| { success: true; body: UpdateGroupMetadataRequest }
	| { success: false; response: Response }
> {
	try {
		const rawBody = await request.json();

		// Parse and validate with Zod schema
		const body = UpdateGroupMetadataRequestSchema.parse(rawBody);

		// Additional validation: Check if user is authorized to modify this group
		if (session.group && body.groupid !== String(session.group.groupid)) {
			return {
				success: false,
				response: createErrorResponse("group id mismatch", 401, request, env),
			};
		}

		// Additional validation: Check user membership for defaultShare
		if (body.defaultShare) {
			const shareValidation = validateUserShares(
				body.defaultShare,
				session,
				request,
				env,
			);
			if (shareValidation) {
				return shareValidation;
			}
		}

		return { success: true, body: body as UpdateGroupMetadataRequest };
	} catch (error) {
		const errorMessage = formatZodError(error);
		return {
			success: false,
			response: createErrorResponse(errorMessage, 400, request, env),
		};
	}
}

// Helper function to prepare the response after updates
async function prepareUpdateResponse(
	session: CurrentSession,
	db: ReturnType<typeof getDb>,
	request: Request,
	env: Env,
): Promise<Response> {
	if (!session.group) {
		return createErrorResponse("No group found", 401, request, env);
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
}

// Helper function to execute the update logic
async function executeUpdate(
	validation: { success: true; body: UpdateGroupMetadataRequest },
	session: CurrentSession,
	db: ReturnType<typeof getDb>,
	request: Request,
	env: Env,
): Promise<Response> {
	// Build updates and statements
	const { updates, statements } = await buildUpdatesObject(
		validation.body,
		session,
		db,
	);
	const allStatements: BatchItem<"sqlite">[] = [];

	// Add group table update statement if there are updates
	if (Object.keys(updates).length > 0) {
		allStatements.push(
			db
				.update(groups)
				.set(updates)
				.where(eq(groups.groupid, String(session.group?.groupid))),
		);
	}

	// Add budget statements
	allStatements.push(...statements);

	// Execute all statements in a single batch transaction
	if (allStatements.length > 0) {
		await db.batch(
			allStatements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
		);
	}

	// Prepare and return response
	return await prepareUpdateResponse(session, db, request, env);
}

export async function handleUpdateGroupMetadata(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	return withAuth(request, env, async (session, db) => {
		if (!session.group) {
			console.log("No group found for session");
			return createErrorResponse(
				"No group found for session",
				401,
				request,
				env,
			);
		}

		// Validate and normalize the request
		const validation = await validateUpdateRequest(request, session, env);
		if (!validation.success) {
			return validation.response;
		}

		try {
			return await executeUpdate(validation, session, db, request, env);
		} catch (error) {
			// Handle budget conflicts and other errors
			if (error instanceof BudgetConflictError) {
				return createErrorResponse(error.message, 400, request, env);
			}
			console.error("Error updating group metadata:", error);
			return createErrorResponse(
				"Failed to update group metadata",
				500,
				request,
				env,
			);
		}
	});
}
