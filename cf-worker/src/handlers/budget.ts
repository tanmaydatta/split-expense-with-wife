import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type {
	AverageSpendData,
	AverageSpendPeriod,
	BudgetDeleteRequest,
	BudgetListRequest,
	BudgetMonthlyRequest,
	BudgetMonthlyResponse,
	BudgetRequest,
	BudgetTotalRequest,
} from "../../../shared-types";
import type { getDb } from "../db";
import type { user } from "../db/schema/auth-schema";
import { budgetEntries, budgetTotals, userBalances } from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	formatSQLiteTime,
	getBudgetTotals,
	isAuthorizedForBudget,
	withAuth,
} from "../utils";

import { createBudgetEntryStatements } from "../utils/scheduled-action-execution";

// Helper function to get monthly budget data from database
async function getMonthlyBudgetData(
	db: ReturnType<typeof getDb>,
	name: string,
	groupId: string,
	oldestData: Date,
) {
	return await db
		.select({
			month: sql<number>`CAST(strftime('%m', added_time) AS INTEGER)`.as(
				"month",
			),
			year: sql<number>`CAST(strftime('%Y', added_time) AS INTEGER)`.as("year"),
			currency: budgetEntries.currency,
			amount: sql<number>`SUM(amount)`.as("amount"),
		})
		.from(budgetEntries)
		.where(
			and(
				eq(budgetEntries.name, name),
				eq(budgetEntries.groupid, groupId),
				isNull(budgetEntries.deleted),
				gte(budgetEntries.addedTime, formatSQLiteTime(oldestData)),
				lt(budgetEntries.amount, 0), // Only negative amounts (expenses)
			),
		)
		.groupBy(
			sql`strftime('%Y', added_time)`,
			sql`strftime('%m', added_time)`,
			budgetEntries.currency,
		)
		.orderBy(
			sql`strftime('%Y', added_time) DESC`,
			sql`strftime('%m', added_time) DESC`,
		);
}

// Helper function to process monthly data and find date range
function processMonthlyDataAndFindRange(
	monthlyData: Array<{
		month: number;
		year: number;
		currency: string;
		amount: number;
	}>,
) {
	const allCurrencies = new Set<string>();
	let oldestDate = new Date();
	const today = new Date();

	monthlyData.forEach((data) => {
		allCurrencies.add(data.currency);
		const dataDate = new Date(data.year, data.month - 1);
		if (dataDate < oldestDate) {
			oldestDate = dataDate;
		}
	});

	// If no data, use a reasonable default (2 years back)
	if (monthlyData.length === 0) {
		oldestDate = new Date();
		oldestDate.setFullYear(oldestDate.getFullYear() - 2);
		allCurrencies.add("USD"); // Default currency if no data
	}

	return { allCurrencies, oldestDate, today };
}

// Helper function to create data map from monthly data
function createDataMap(
	monthlyData: Array<{
		month: number;
		year: number;
		currency: string;
		amount: number;
	}>,
) {
	const dataMap: Record<string, Record<string, number>> = {};
	for (const data of monthlyData) {
		const key = `${data.year}-${data.month}`;
		if (!dataMap[key]) {
			dataMap[key] = {};
		}
		dataMap[key][data.currency] = data.amount;
	}
	return dataMap;
}

// Helper function to generate monthly budgets array
function generateMonthlyBudgets(
	allCurrencies: Set<string>,
	dataMap: Record<string, Record<string, number>>,
	oldestDate: Date,
	today: Date,
) {
	const monthToName = [
		"",
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];

	const monthlyBudgets: Array<{
		month: string;
		year: number;
		amounts: Array<{ currency: string; amount: number }>;
	}> = [];

	const currentDate = new Date(today.getFullYear(), today.getMonth());
	const endDate = new Date(oldestDate.getFullYear(), oldestDate.getMonth());

	while (currentDate >= endDate) {
		const year = currentDate.getFullYear();
		const month = currentDate.getMonth() + 1;
		const key = `${year}-${month}`;

		const amounts: Array<{ currency: string; amount: number }> = [];
		for (const currency of allCurrencies) {
			const amount = dataMap[key]?.[currency] || 0;
			amounts.push({ currency, amount: Math.abs(amount) });
		}

		monthlyBudgets.push({
			month: monthToName[month],
			year: year,
			amounts: amounts,
		});

		currentDate.setMonth(currentDate.getMonth() - 1);
	}

	return monthlyBudgets;
}

// Helper function to calculate rolling averages
function calculateRollingAverages(
	monthlyBudgets: Array<{
		month: string;
		year: number;
		amounts: Array<{ currency: string; amount: number }>;
	}>,
	allCurrencies: Set<string>,
): AverageSpendPeriod[] {
	const rollingAverages: AverageSpendPeriod[] = [];
	const maxMonthsBack = monthlyBudgets.length;
	const periodsToCalculate = Array.from(
		{ length: maxMonthsBack },
		(_, i) => i + 1,
	);

	for (const monthsBack of periodsToCalculate) {
		const periodBudgets = monthlyBudgets.slice(0, monthsBack);
		const currencyTotals: Record<string, number> = {};

		// Initialize all currencies to 0
		for (const currency of allCurrencies) {
			currencyTotals[currency] = 0;
		}

		// Sum up actual spending for each currency
		periodBudgets.forEach((monthData) => {
			monthData.amounts.forEach((amount) => {
				currencyTotals[amount.currency] += Math.abs(amount.amount);
			});
		});

		// Create average entries for each currency
		const currencyAverages: AverageSpendData[] = Array.from(allCurrencies).map(
			(currency) => ({
				currency,
				averageMonthlySpend:
					monthsBack > 0 ? currencyTotals[currency] / monthsBack : 0,
				totalSpend: currencyTotals[currency],
				monthsAnalyzed: monthsBack,
			}),
		);

		// Filter out currencies with 0 total spend
		const filteredAverages = currencyAverages.filter(
			(avg) => avg.totalSpend > 0,
		);

		// If no spending data for this period, add a default entry
		const finalAverages =
			filteredAverages.length > 0
				? filteredAverages
				: [
						{
							currency: Array.from(allCurrencies)[0] || "USD",
							averageMonthlySpend: 0,
							totalSpend: 0,
							monthsAnalyzed: monthsBack,
						},
					];

		rollingAverages.push({
			periodMonths: monthsBack,
			averages: finalAverages,
		});
	}

	return rollingAverages;
}

// Helper function to create budget entry
async function createBudgetEntry(
	budgetRequest: BudgetRequest,
	db: ReturnType<typeof getDb>,
	request: Request,
	env: Env,
) {
	try {
		// Generate unique budget ID using ULID for regular handler
		const budgetId = `budget_${ulid()}`;

		// Use the reusable utility function
		const result = await createBudgetEntryStatements(
			budgetRequest,
			db,
			budgetId,
		);

		// Execute all statements in a single batch
		if (result.statements.length > 0) {
			const queries = result.statements.map((stmt) => stmt.query);
			await db.batch([queries[0], ...queries.slice(1)]);
		}

		return createJsonResponse(
			{
				message: "Budget entry created successfully",
			},
			200,
			{},
			request,
			env,
		);
	} catch (error) {
		console.error("Budget creation error:", error);
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		return createErrorResponse(errorMessage, 400, request, env);
	}
}

// Helper function to create user name mapping
function createUserNameMapping(
	usersById: Record<string, typeof user.$inferSelect>,
): Map<string, string> {
	const userIdToName = new Map<string, string>();
	Object.values(usersById).forEach((user) => {
		userIdToName.set(user.id, user.firstName || "Unknown");
	});
	return userIdToName;
}

// Helper function to add balance to result
function addBalanceToResult(
	result: Record<string, Record<string, number>>,
	userName: string,
	currency: string,
	amount: number,
): void {
	if (!result[userName]) {
		result[userName] = {};
	}
	result[userName][currency] = (result[userName][currency] || 0) + amount;
}

// Helper function to process when current user owes someone
function processCurrentUserOwes(
	result: Record<string, Record<string, number>>,
	owedToUserId: string,
	currency: string,
	amount: number,
	currentUserId: string,
	userIdToName: Map<string, string>,
): void {
	const otherUserName = userIdToName.get(owedToUserId);
	if (otherUserName && owedToUserId !== currentUserId) {
		addBalanceToResult(result, otherUserName, currency, -amount);
	}
}

// Helper function to process when someone owes current user
function processSomeoneOwesCurrentUser(
	result: Record<string, Record<string, number>>,
	userId: string,
	currency: string,
	amount: number,
	userIdToName: Map<string, string>,
): void {
	const otherUserName = userIdToName.get(userId);
	if (otherUserName) {
		addBalanceToResult(result, otherUserName, currency, amount);
	}
}

// Type for the balance query result
type BalanceQueryResult = {
	userId: string;
	owedToUserId: string;
	currency: string;
	balance: number;
};

// Helper function to process balance data
function processBalances(
	balances: BalanceQueryResult[],
	currentUserId: string,
	userIdToName: Map<string, string>,
): Record<string, Record<string, number>> {
	const result: Record<string, Record<string, number>> = {};

	for (const balance of balances) {
		const { userId, owedToUserId, currency, balance: amount } = balance;

		if (userId === currentUserId) {
			// Current user owes someone else
			processCurrentUserOwes(
				result,
				owedToUserId,
				currency,
				amount,
				currentUserId,
				userIdToName,
			);
		} else if (owedToUserId === currentUserId) {
			// Someone else owes current user
			processSomeoneOwesCurrentUser(
				result,
				userId,
				currency,
				amount,
				userIdToName,
			);
		}
	}

	return result;
}

// Handle balances
export async function handleBalances(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	return withAuth(request, env, async (session, db) => {
		try {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			const balances = await db
				.select({
					userId: userBalances.userId,
					owedToUserId: userBalances.owedToUserId,
					currency: userBalances.currency,
					balance: userBalances.balance,
				})
				.from(userBalances)
				.where(
					and(
						eq(userBalances.groupId, String(session.group.groupid)),
						sql`${userBalances.balance} != 0`,
					),
				);

			// Create user ID to name mapping
			const userIdToName = createUserNameMapping(session.usersById);
			console.log("userIdToName", userIdToName);

			// Transform balances into UserBalancesByUser format
			const result = processBalances(
				balances,
				session.currentUser.id,
				userIdToName,
			);

			// Return empty object if no balances exist
			if (Object.keys(result).length === 0) {
				return createJsonResponse({}, 200, {}, request, env);
			}

			return createJsonResponse(result, 200, {}, request, env);
		} catch (error) {
			console.error("Balances error:", error);
			return createErrorResponse("Internal server error", 500, request, env);
		}
	});
}

// Handle budget creation
export async function handleBudget(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}
	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}
			const body = (await request.json()) as BudgetRequest;

			// Validate budget name
			if (!isAuthorizedForBudget(session, body.name)) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			// Set currency default
			const budgetRequest: BudgetRequest = {
				...body,
				currency: body.currency || "GBP",
				groupid: String(session.group.groupid),
			};

			return await createBudgetEntry(budgetRequest, db, request, env);
		});
	} catch (error) {
		console.error("Budget creation error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}

// Handle budget deletion
export async function handleBudgetDelete(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}
	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}
			const body = (await request.json()) as BudgetDeleteRequest;

			// Get budget entry to verify ownership and get details for total update
			const budgetEntry = await db
				.select()
				.from(budgetEntries)
				.where(
					and(
						eq(budgetEntries.id, body.id),
						eq(budgetEntries.groupid, String(session.group.groupid)),
						isNull(budgetEntries.deleted),
					),
				)
				.limit(1);

			if (budgetEntry.length === 0) {
				return createErrorResponse("Budget entry not found", 404, request, env);
			}

			const entry = budgetEntry[0];

			// Check authorization
			if (!isAuthorizedForBudget(session, entry.name)) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			const deletedTime = formatSQLiteTime();

			// Prepare Drizzle statements for batch operation
			const deleteBudget = db
				.update(budgetEntries)
				.set({ deleted: deletedTime })
				.where(eq(budgetEntries.id, body.id));

			const updateBudgetTotal = db
				.update(budgetTotals)
				.set({
					totalAmount: sql`${budgetTotals.totalAmount} - ${entry.amount}`,
					updatedAt: deletedTime,
				})
				.where(
					and(
						eq(budgetTotals.groupId, String(session.group.groupid)),
						eq(budgetTotals.name, entry.name),
						eq(budgetTotals.currency, entry.currency),
					),
				);

			// Execute both statements using Drizzle batch
			await db.batch([deleteBudget, updateBudgetTotal]);

			return createJsonResponse(
				{
					message: "Successfully deleted budget entry",
				},
				200,
				{},
				request,
				env,
			);
		});
	} catch (error) {
		console.error("Budget deletion error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}

// Handle budget list
export async function handleBudgetList(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				console.log("Session group not found", session);
				return createErrorResponse("Unauthorized", 401, request, env);
			}
			const body = (await request.json()) as BudgetListRequest;

			// Validate budget name
			if (!isAuthorizedForBudget(session, body.name)) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			const name = body.name || "house";
			const currentTime = formatSQLiteTime();
			// Get budget entries using Drizzle
			const budgetEntriesResult = await db
				.select()
				.from(budgetEntries)
				.where(
					and(
						lt(budgetEntries.addedTime, currentTime),
						eq(budgetEntries.name, name),
						eq(budgetEntries.groupid, String(session.group.groupid)),
						isNull(budgetEntries.deleted),
					),
				)
				.orderBy(desc(budgetEntries.addedTime))
				.limit(5)
				.offset(body.offset);

			// Ensure price field is properly formatted as string
			const formattedEntries = budgetEntriesResult.map((entry) => ({
				...entry,
				price:
					entry.price ||
					(entry.amount >= 0
						? `+${entry.amount.toFixed(2)}`
						: `${entry.amount.toFixed(2)}`),
			}));

			return createJsonResponse(formattedEntries, 200, {}, request, env);
		});
	} catch (error) {
		console.error("Budget list error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}

// Handle budget monthly aggregations
export async function handleBudgetMonthly(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}
			const body = (await request.json()) as BudgetMonthlyRequest;

			// Validate budget name
			if (!isAuthorizedForBudget(session, body.name)) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			const name = body.name || "house";
			const oldestData = new Date();
			oldestData.setFullYear(oldestData.getFullYear() - 2);

			// Get monthly budget data
			const monthlyData = await getMonthlyBudgetData(
				db,
				name,
				String(session.group.groupid),
				oldestData,
			);

			// Process the data
			const { allCurrencies, oldestDate, today } =
				processMonthlyDataAndFindRange(monthlyData);

			const dataMap = createDataMap(monthlyData);
			const monthlyBudgets = generateMonthlyBudgets(
				allCurrencies,
				dataMap,
				oldestDate,
				today,
			);

			const averages = calculateRollingAverages(monthlyBudgets, allCurrencies);

			// Return combined response
			const result: BudgetMonthlyResponse = {
				monthlyBudgets,
				averageMonthlySpend: averages,
				periodAnalyzed: {
					startDate: formatSQLiteTime(oldestDate),
					endDate: formatSQLiteTime(today),
				},
			};

			return createJsonResponse(result, 200, {}, request, env);
		});
	} catch (error) {
		console.error("Budget monthly error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}

// Handle budget total
export async function handleBudgetTotal(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}

	try {
		return withAuth(request, env, async (session, _db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}
			const body = (await request.json()) as BudgetTotalRequest;

			// Validate budget name
			if (!isAuthorizedForBudget(session, body.name)) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			// Use existing utility function for now (could be migrated to Drizzle later)
			const totals = await getBudgetTotals(
				env,
				String(session.group.groupid),
				body.name,
			);

			return createJsonResponse(totals, 200, {}, request, env);
		});
	} catch (error) {
		console.error("Budget total error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}
