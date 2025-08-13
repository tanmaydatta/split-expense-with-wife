import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { CURRENCIES } from "../../shared-types";
import { auth } from "./auth";
import { getDb } from "./db";
import { user } from "./db/schema/auth-schema";
import {
	budgetTotals,
	groups,
	transactionUsers,
	userBalances,
} from "./db/schema/schema";
import type {
	BudgetTotal,
	CurrentSession,
	GroupMetadata,
	ParsedGroup,
	Session,
	SplitAmount,
	UserBalance,
} from "./types";
// Generate random ID
export function generateRandomId(length = 16): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

// Format date for SQLite
export function formatSQLiteTime(date: Date = new Date()): string {
	return date.toISOString().replace("T", " ").slice(0, 19);
}

export async function enrichSession(
	session: Session,
	db: ReturnType<typeof getDb>,
): Promise<CurrentSession> {
	if (!session) {
		throw new Error("Session not found");
	}
	const userObj = session.user;
	const userGroup = await db
		.select({
			groupid: user.groupid,
			metadata: groups.metadata,
			budgets: groups.budgets,
			userids: groups.userids,
		})
		.from(user)
		.innerJoin(groups, eq(user.groupid, groups.groupid))
		.where(eq(user.id, userObj.id))
		.limit(1);
	const currentUser = await db
		.select()
		.from(user)
		.where(eq(user.id, userObj.id))
		.limit(1);
	if (!currentUser || currentUser.length === 0) {
		throw new Error("Current user not found");
	}
	const group: ParsedGroup | null = getGroup(userGroup);
	if (!group) {
		return {
			group: null,
			usersById: {},
			currentUser: currentUser[0],
		};
	}
	const userIds = group.userids;
	const usersInGroup = await db
		.select()
		.from(user)
		.where(inArray(user.id, userIds));

	const usersById: Record<string, typeof user.$inferSelect> = {};
	// biome-ignore lint/suspicious/noAssignInExpressions: concise object assignment
	usersInGroup.forEach((u) => (usersById[u.id] = u));
	return {
		group,
		usersById: usersById,
		currentUser: currentUser[0],
		currencies: [...CURRENCIES],
	};
}

function getGroup(
	userGroup: {
		groupid: string | null;
		metadata: string | null;
		budgets: string | null;
		userids: string | null;
	}[],
): ParsedGroup | null {
	if (!userGroup || userGroup.length === 0 || !userGroup[0]?.groupid) {
		return null;
	}

	try {
		const rawGroup = userGroup[0];
		if (!rawGroup.groupid) {
			throw new Error("Group ID is required");
		}
		const group: ParsedGroup = {
			groupid: rawGroup.groupid,
			budgets: JSON.parse(rawGroup.budgets || "[]") as string[],
			userids: JSON.parse(rawGroup.userids || "[]") as string[],
			metadata: JSON.parse(rawGroup.metadata || "{}") as GroupMetadata,
		};
		return group;
	} catch (error) {
		console.error("Error parsing group data:", error);
		// Return a safe default group
		return {
			groupid: userGroup[0].groupid || "",
			budgets: [],
			userids: [],
			metadata: { defaultShare: {}, defaultCurrency: "USD" },
		};
	}
}

// This function acts as a guard for our protected routes
export async function withAuth(
	request: Request,
	env: Env,
	handler: (
		session: Awaited<ReturnType<typeof enrichSession>> & Session,
		db: ReturnType<typeof getDb>,
	) => Promise<Response>,
): Promise<Response> {
	try {
		const authInstance = auth(env);
		const db = getDb(env);
		// Get session from better-auth
		const sessionData = await authInstance.api.getSession({
			headers: request.headers,
		});

		if (!sessionData || !sessionData.user) {
			return createErrorResponse("Unauthorized", 401, request, env);
		}
		const enrichedSession = await enrichSession(sessionData, db);
		// Call the handler with the session and database
		return await handler(
			{
				...sessionData,
				...enrichedSession,
			},
			db,
		);
	} catch (error) {
		console.error("Auth middleware error:", error);
		return createErrorResponse("Authentication failed", 401, request, env);
	}
}

// CORS headers
export function getCORSHeaders(
	request: Request,
	env: Env,
): Record<string, string> {
	const origin = request.headers.get("Origin");
	const allowedOrigins = env.ALLOWED_ORIGINS
		? env.ALLOWED_ORIGINS.split(",")
		: [];

	let allowOrigin = origin || "http://localhost:3000";
	if (allowedOrigins.length > 0 && origin && allowedOrigins.includes(origin)) {
		allowOrigin = origin;
	} else if (allowedOrigins.length === 0) {
		// For development, allow localhost:3000 by default
		allowOrigin = origin || "http://localhost:3000";
	}

	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Max-Age": "86400",
	};
}

// Create OPTIONS response
export function createOptionsResponse(request: Request, env: Env): Response {
	return new Response(null, {
		status: 204,
		headers: getCORSHeaders(request, env),
	});
}

// Create JSON response with CORS headers
export function createJsonResponse(
	data: unknown,
	status = 200,
	headers: Record<string, string> = {},
	request?: Request,
	env?: Env,
): Response {
	const responseHeaders = {
		"Content-Type": "application/json",
		...headers,
	};

	if (request && env) {
		Object.assign(responseHeaders, getCORSHeaders(request, env));
	}

	return new Response(JSON.stringify(data), {
		status,
		headers: responseHeaders,
	});
}

// Create error response
export function createErrorResponse(
	error: string,
	status = 500,
	request?: Request,
	env?: Env,
): Response {
	return createJsonResponse(
		{ error, statusCode: status },
		status,
		{},
		request,
		env,
	);
}

// Create a local structural type for Zod issues to avoid deprecated ZodIssue
type ZIssue = {
	code: string;
	message: string;
	path?: Array<string | number>;
	errors?: ZIssue[][];
};

// Extract all individual issues from nested union errors
function isInvalidUnionIssue(
	issue: ZIssue,
): issue is ZIssue & { errors: ZIssue[][] } {
	return issue.code === "invalid_union" && Array.isArray(issue.errors);
}

function flattenZodIssues(issues: ZIssue[]): ZIssue[] {
	const flattened: ZIssue[] = [];

	for (const issue of issues) {
		if (isInvalidUnionIssue(issue)) {
			for (const unionError of issue.errors) {
				flattened.push(...flattenZodIssues(unionError));
			}
		} else {
			flattened.push(issue);
		}
	}

	return flattened;
}

// Helper function to check if error is a ZodError
function isZodError(error: unknown): error is z.ZodError {
	return (
		error !== null &&
		typeof error === "object" &&
		"issues" in error
	);
}

// Helper function to convert technical field names to user-friendly ones
function makeFriendlyPath(path: string): string {
	return path
		.replace("actionData.", "")
		.replace("paidByUserId", "paid by user")
		.replace("splitPctShares", "split percentages")
		.replace("budgetName", "budget name")
		.replace("startDate", "start date")
		.replace("actionType", "action type");
}

// Helper function to simplify error messages
function simplifyErrorMessage(message: string, friendlyPath: string): string {
	if (
		message.includes("Invalid input: expected") &&
		message.includes("received undefined")
	) {
		return friendlyPath ? `${friendlyPath} is required` : "Required field is missing";
	}
	if (message.includes("user not in group")) {
		return "Selected user is not in your group";
	}
	if (message.includes("not available in group")) {
		return "Selected budget is not available";
	}

	return friendlyPath ? `${friendlyPath}: ${message}` : message;
}

// Helper function to create user-friendly messages from issues
function createUserFriendlyMessages(allIssues: ZIssue[]): string[] {
	return allIssues.map((issue) => {
		const path = issue.path?.join(".") || "";
		const friendlyPath = makeFriendlyPath(path);
		return simplifyErrorMessage(issue.message, friendlyPath);
	});
}

// Convert a ZodError into a human-readable string and log full details
export function formatZodError(error: unknown): string {
	if (!isZodError(error)) {
		console.error("Non-Zod validation error:", error);
		return error instanceof Error ? error.message : "Invalid input";
	}

	// Log full error details for debugging
	console.error("Zod validation error:", JSON.stringify(error.issues, null, 2));

	// Flatten all nested union issues
	const allIssues = flattenZodIssues(error.issues as unknown as ZIssue[]);

	// Create user-friendly messages
	const userMessages = createUserFriendlyMessages(allIssues);

	// De-duplicate and return first few messages
	const unique = Array.from(new Set(userMessages)).filter(Boolean);
	const result = unique.slice(0, 3).join(". ");

	// If we couldn't create meaningful messages, return a generic one
	return result || "Please check your input and try again";
}

// Add CORS headers to any response
export function addCORSHeaders(
	response: Response,
	request: Request,
	env: Env,
): Response {
	const corsHeaders = getCORSHeaders(request, env);
	const newHeaders = new Headers(response.headers);

	// Add CORS headers
	Object.entries(corsHeaders).forEach(([key, value]) => {
		newHeaders.set(key, value);
	});

	// Clone the response with new headers
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

// Helper function to check if user is authorized for a budget
export function isAuthorizedForBudget(
	session: CurrentSession,
	budgetName: string,
): boolean {
	if (!session.group) {
		return false;
	}
	return session.group.budgets.includes(budgetName);
}

// Currency validation now uses CURRENCIES from shared-types

// Helper function to validate currency
export function isValidCurrency(currency: string): boolean {
	return CURRENCIES.includes(currency as (typeof CURRENCIES)[number]);
}

// Helper function to validate split percentages
export function validateSplitPercentages(
	splitPctShares: Record<string, number>,
): boolean {
	const totalPct = Object.values(splitPctShares).reduce(
		(sum, pct) => sum + pct,
		0,
	);
	return Math.abs(totalPct - 100) < 0.01; // Allow small floating point errors
}

// Helper function to validate paid amounts
export function validatePaidAmounts(
	paidByShares: Record<string, number>,
	totalAmount: number,
): boolean {
	const totalPaid = Object.values(paidByShares).reduce(
		(sum, amount) => sum + amount,
		0,
	);
	return Math.abs(totalPaid - totalAmount) < 0.01; // Allow small floating point errors
}

// Helper function to calculate net positions for users
function calculateNetPositions(
	amount: number,
	paidByShares: Record<string, number>,
	splitPctShares: Record<string, number>,
): Record<string, number> {
	const netPositions: Record<string, number> = {};

	// Calculate what each user owes based on split percentages
	for (const [userIdStr, splitPct] of Object.entries(splitPctShares)) {
		const owedAmount = (amount * splitPct) / 100;
		netPositions[userIdStr] = (netPositions[userIdStr] || 0) - owedAmount;
	}

	// Add what each user paid
	for (const [userIdStr, paidAmount] of Object.entries(paidByShares)) {
		netPositions[userIdStr] = (netPositions[userIdStr] || 0) + paidAmount;
	}

	return netPositions;
}

// Helper function to separate creditors and debtors
function separateCreditorsAndDebtors(netPositions: Record<string, number>) {
	const creditors: Array<{ userId: string; amount: number }> = [];
	const debtors: Array<{ userId: string; amount: number }> = [];

	for (const [userIdStr, netAmount] of Object.entries(netPositions)) {
		if (netAmount > 0.001) {
			creditors.push({ userId: userIdStr, amount: netAmount });
		} else if (netAmount < -0.01) {
			debtors.push({ userId: userIdStr, amount: -netAmount });
		}
	}

	return { creditors, debtors };
}

// Helper function to create debt relationships
function createDebtRelationships(
	creditors: Array<{ userId: string; amount: number }>,
	debtors: Array<{ userId: string; amount: number }>,
	currency: string,
): SplitAmount[] {
	const splitAmounts: SplitAmount[] = [];
	const totalCreditorAmount = creditors.reduce((sum, c) => sum + c.amount, 0);

	for (const debtor of debtors) {
		for (const creditor of creditors) {
			const proportionToCreditor = creditor.amount / totalCreditorAmount;
			const amountOwedToCreditor = debtor.amount * proportionToCreditor;

			if (amountOwedToCreditor > 0.001) {
				splitAmounts.push({
					user_id: debtor.userId,
					amount: Math.round(amountOwedToCreditor * 100) / 100,
					owed_to_user_id: creditor.userId,
					currency: currency,
				});
			}
		}
	}

	return splitAmounts;
}

// Calculate split amounts for transactions using net settlement logic
export function calculateSplitAmounts(
	amount: number,
	paidByShares: Record<string, number>,
	splitPctShares: Record<string, number>,
	currency: string,
): SplitAmount[] {
	// Calculate net position for each user (positive = owed money, negative = owes money)
	const netPositions = calculateNetPositions(amount, paidByShares, splitPctShares);
	
	// Separate creditors (net positive) and debtors (net negative)
	const { creditors, debtors } = separateCreditorsAndDebtors(netPositions);
	
	// Create debt relationships: debtors owe proportionally to creditors
	return createDebtRelationships(creditors, debtors, currency);
}

// Generate Drizzle balance update statements
export function generateDrizzleBalanceUpdates(
	env: Env,
	splitAmounts: SplitAmount[],
	groupId: string,
	operation: "add" | "remove",
) {
	const db = getDb(env);
	const multiplier = operation === "add" ? 1 : -1;
	const currentTime = formatSQLiteTime();

	return splitAmounts.map((split) =>
		db
			.insert(userBalances)
			.values({
				groupId: groupId,
				userId: split.user_id,
				owedToUserId: split.owed_to_user_id,
				currency: split.currency,
				balance: split.amount * multiplier,
				updatedAt: currentTime,
			})
			.onConflictDoUpdate({
				target: [
					userBalances.groupId,
					userBalances.userId,
					userBalances.owedToUserId,
					userBalances.currency,
				],
				set: {
					balance: sql`${userBalances.balance} + ${split.amount * multiplier}`,
					updatedAt: currentTime,
				},
			}),
	);
}

// Utility function to rebuild balances for a specific group (for data integrity)
export async function rebuildGroupBalances(
	env: Env,
	groupId: string,
): Promise<void> {
	const db = getDb(env);
	const currentTime = formatSQLiteTime();
	// Delete existing balances for the group using Drizzle
	await db.delete(userBalances).where(eq(userBalances.groupId, groupId));

	// Get aggregated transaction data using Drizzle
	const aggregatedBalances = await db
		.select({
			groupId: transactionUsers.groupId,
			userId: transactionUsers.userId,
			owedToUserId: transactionUsers.owedToUserId,
			currency: transactionUsers.currency,
			balance: sql<number>`sum(${transactionUsers.amount})`.as("balance"),
		})
		.from(transactionUsers)
		.where(
			and(
				eq(transactionUsers.groupId, groupId),
				isNull(transactionUsers.deleted),
			),
		)
		.groupBy(
			transactionUsers.groupId,
			transactionUsers.userId,
			transactionUsers.owedToUserId,
			transactionUsers.currency,
		);

	// Insert the aggregated balances using Drizzle
	if (aggregatedBalances.length > 0) {
		const balanceValues = aggregatedBalances.map((balance) => ({
			groupId: balance.groupId,
			userId: balance.userId,
			owedToUserId: balance.owedToUserId,
			currency: balance.currency,
			balance: balance.balance,
			updatedAt: currentTime,
		}));

		await db.insert(userBalances).values(balanceValues);
	}
}

// Get balances from materialized table using Drizzle
export async function getUserBalances(
	env: Env,
	groupId: string,
): Promise<UserBalance[]> {
	const db = getDb(env);

	const balances = await db
		.select({
			user_id: userBalances.userId,
			owed_to_user_id: userBalances.owedToUserId,
			currency: userBalances.currency,
			amount: userBalances.balance,
		})
		.from(userBalances)
		.where(
			sql`${userBalances.groupId} = ${groupId} AND ${userBalances.balance} != 0`,
		);

	return balances;
}

// Get budget totals using Drizzle
export async function getBudgetTotals(
	env: Env,
	groupId: string,
	name: string,
): Promise<BudgetTotal[]> {
	const db = getDb(env);

	const totals = await db
		.select({
			currency: budgetTotals.currency,
			amount: budgetTotals.totalAmount,
		})
		.from(budgetTotals)
		.where(
			sql`${budgetTotals.groupId} = ${groupId} AND ${budgetTotals.name} = ${name}`,
		);

	return totals;
}
