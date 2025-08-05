import { createJsonResponse, createErrorResponse, withAuth, formatSQLiteTime, isAuthorizedForBudget, getBudgetTotals, } from "../utils";
import { budget, userBalances, budgetTotals } from "../db/schema/schema";
import { eq, and, desc, lt, isNull, gte, sql } from "drizzle-orm";
// Handle balances
export async function handleBalances(request, env) {
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
                .where(and(eq(userBalances.groupId, session.group.groupid), sql `${userBalances.balance} != 0`));
            // Create user ID to name mapping
            const userIdToName = new Map();
            Object.values(session.usersById).forEach((user) => {
                userIdToName.set(user.id, user.firstName || "Unknown");
            });
            console.log("userIdToName", userIdToName);
            // Transform balances into UserBalancesByUser format
            const result = {};
            for (const balance of balances) {
                const { userId, owedToUserId, currency, balance: amount } = balance;
                // From current user's perspective
                if (userId === session.currentUser.id) {
                    // Current user owes someone else (negative for that person)
                    const otherUserName = userIdToName.get(owedToUserId);
                    if (otherUserName && owedToUserId !== session.user.id) {
                        if (!result[otherUserName]) {
                            result[otherUserName] = {};
                        }
                        result[otherUserName][currency] =
                            (result[otherUserName][currency] || 0) - amount;
                    }
                }
                else if (owedToUserId === session.currentUser.id) {
                    // Someone else owes current user (positive for that person)
                    const otherUserName = userIdToName.get(userId);
                    if (otherUserName) {
                        if (!result[otherUserName]) {
                            result[otherUserName] = {};
                        }
                        result[otherUserName][currency] =
                            (result[otherUserName][currency] || 0) + amount;
                    }
                }
            }
            // Return empty object if no balances exist
            if (Object.keys(result).length === 0) {
                return createJsonResponse({}, 200, {}, request, env);
            }
            return createJsonResponse(result, 200, {}, request, env);
        }
        catch (error) {
            console.error("Balances error:", error);
            return createErrorResponse("Internal server error", 500, request, env);
        }
    });
}
// Handle budget creation
export async function handleBudget(request, env) {
    if (request.method !== "POST") {
        return createErrorResponse("Method not allowed", 405, request, env);
    }
    try {
        return withAuth(request, env, async (session, db) => {
            if (!session.group) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const body = (await request.json());
            // Validate budget name
            if (!isAuthorizedForBudget(session, body.name)) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const currentTime = formatSQLiteTime();
            const currency = body.currency || "GBP";
            // Prepare Drizzle statements for batch operation
            const budgetInsert = db.insert(budget).values({
                description: body.description,
                amount: body.amount,
                name: body.name,
                currency: currency,
                groupid: session.group.groupid,
                addedTime: currentTime,
            });
            const budgetTotalUpsert = db
                .insert(budgetTotals)
                .values({
                groupId: session.group.groupid,
                name: body.name,
                currency: currency,
                totalAmount: body.amount,
                updatedAt: currentTime,
            })
                .onConflictDoUpdate({
                target: [
                    budgetTotals.groupId,
                    budgetTotals.name,
                    budgetTotals.currency,
                ],
                set: {
                    totalAmount: sql `${budgetTotals.totalAmount} + ${body.amount}`,
                    updatedAt: currentTime,
                },
            });
            // Execute both statements using Drizzle batch
            await db.batch([budgetInsert, budgetTotalUpsert]);
            return createJsonResponse({
                message: "200",
            }, 200, {}, request, env);
        });
    }
    catch (error) {
        console.error("Budget creation error:", error);
        return createErrorResponse("Internal server error", 500, request, env);
    }
}
// Handle budget deletion
export async function handleBudgetDelete(request, env) {
    if (request.method !== "POST") {
        return createErrorResponse("Method not allowed", 405, request, env);
    }
    try {
        return withAuth(request, env, async (session, db) => {
            if (!session.group) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const body = (await request.json());
            // Get budget entry to verify ownership and get details for total update
            const budgetEntry = await db
                .select()
                .from(budget)
                .where(and(eq(budget.id, body.id), eq(budget.groupid, session.group.groupid), isNull(budget.deleted)))
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
                .update(budget)
                .set({ deleted: deletedTime })
                .where(eq(budget.id, body.id));
            const updateBudgetTotal = db
                .update(budgetTotals)
                .set({
                totalAmount: sql `${budgetTotals.totalAmount} - ${entry.amount}`,
                updatedAt: deletedTime,
            })
                .where(and(eq(budgetTotals.groupId, session.group.groupid), eq(budgetTotals.name, entry.name), eq(budgetTotals.currency, entry.currency)));
            // Execute both statements using Drizzle batch
            await db.batch([deleteBudget, updateBudgetTotal]);
            return createJsonResponse({
                message: "Successfully deleted budget entry",
            }, 200, {}, request, env);
        });
    }
    catch (error) {
        console.error("Budget deletion error:", error);
        return createErrorResponse("Internal server error", 500, request, env);
    }
}
// Handle budget list
export async function handleBudgetList(request, env) {
    if (request.method !== "POST") {
        return createErrorResponse("Method not allowed", 405, request, env);
    }
    try {
        return withAuth(request, env, async (session, db) => {
            if (!session.group) {
                console.log("Session group not found", session);
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const body = (await request.json());
            // Validate budget name
            if (!isAuthorizedForBudget(session, body.name)) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const name = body.name || "house";
            const currentTime = formatSQLiteTime();
            // Get budget entries using Drizzle
            const budgetEntries = await db
                .select()
                .from(budget)
                .where(and(lt(budget.addedTime, currentTime), eq(budget.name, name), eq(budget.groupid, session.group.groupid), isNull(budget.deleted)))
                .orderBy(desc(budget.addedTime))
                .limit(5)
                .offset(body.offset);
            // Ensure price field is properly formatted as string
            const formattedEntries = budgetEntries.map((entry) => ({
                ...entry,
                price: entry.price ||
                    (entry.amount >= 0
                        ? `+${entry.amount.toFixed(2)}`
                        : `${entry.amount.toFixed(2)}`),
            }));
            return createJsonResponse(formattedEntries, 200, {}, request, env);
        });
    }
    catch (error) {
        console.error("Budget list error:", error);
        return createErrorResponse("Internal server error", 500, request, env);
    }
}
// Handle budget monthly aggregations
export async function handleBudgetMonthly(request, env) {
    if (request.method !== "POST") {
        return createErrorResponse("Method not allowed", 405, request, env);
    }
    try {
        return withAuth(request, env, async (session, db) => {
            if (!session.group) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const body = (await request.json());
            // Validate budget name
            if (!isAuthorizedForBudget(session, body.name)) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const name = body.name || "house";
            const oldestData = new Date();
            oldestData.setFullYear(oldestData.getFullYear() - 2);
            // Get monthly budget data (only expenses - negative amounts)
            const monthlyData = await db
                .select({
                month: sql `CAST(strftime('%m', added_time) AS INTEGER)`.as("month"),
                year: sql `CAST(strftime('%Y', added_time) AS INTEGER)`.as("year"),
                currency: budget.currency,
                amount: sql `SUM(amount)`.as("amount"),
            })
                .from(budget)
                .where(and(eq(budget.name, name), eq(budget.groupid, session.group.groupid), isNull(budget.deleted), gte(budget.addedTime, formatSQLiteTime(oldestData)), lt(budget.amount, 0)))
                .groupBy(sql `strftime('%Y', added_time)`, sql `strftime('%m', added_time)`, budget.currency)
                .orderBy(sql `strftime('%Y', added_time) DESC`, sql `strftime('%m', added_time) DESC`);
            // Process data into monthly format
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
            // First, collect all unique currencies and find date range
            const allCurrencies = new Set();
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
            // Create map from actual data
            const dataMap = {};
            for (const data of monthlyData) {
                const key = `${data.year}-${data.month}`;
                if (!dataMap[key]) {
                    dataMap[key] = {};
                }
                dataMap[key][data.currency] = data.amount;
            }
            // Generate all months from today back to oldest date
            const monthlyBudgets = [];
            const currentDate = new Date(today.getFullYear(), today.getMonth()); // Start of current month
            const endDate = new Date(oldestDate.getFullYear(), oldestDate.getMonth()); // Start of oldest month
            while (currentDate >= endDate) {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth() + 1; // JS months are 0-indexed, but our data is 1-indexed
                const key = `${year}-${month}`;
                const amounts = [];
                // For each currency, add either real data or 0 (convert to absolute value for display)
                for (const currency of allCurrencies) {
                    const amount = dataMap[key]?.[currency] || 0;
                    amounts.push({ currency, amount: Math.abs(amount) });
                }
                monthlyBudgets.push({
                    month: monthToName[month],
                    year: year,
                    amounts: amounts,
                });
                // Move to previous month
                currentDate.setMonth(currentDate.getMonth() - 1);
            }
            // Calculate rolling averages for different time periods
            const rollingAverages = [];
            // Calculate max periods based on how many months we generated (from today to oldest)
            const maxMonthsBack = monthlyBudgets.length;
            // Calculate averages for 1, 2, 3, ... up to maxMonthsBack months
            const periodsToCalculate = Array.from({ length: maxMonthsBack }, (_, i) => i + 1);
            for (const monthsBack of periodsToCalculate) {
                // Take the first N months from our generated monthlyBudgets (which starts from today)
                const periodBudgets = monthlyBudgets.slice(0, monthsBack);
                // Calculate totals by currency for this period (including months with 0 spend)
                const currencyTotals = {};
                // Initialize all currencies to 0
                for (const currency of allCurrencies) {
                    currencyTotals[currency] = 0;
                }
                // Sum up actual spending for each currency across all months in the period
                periodBudgets.forEach((monthData) => {
                    monthData.amounts.forEach((amount) => {
                        currencyTotals[amount.currency] += Math.abs(amount.amount);
                    });
                });
                // Create average entries for each currency
                const currencyAverages = Array.from(allCurrencies).map((currency) => ({
                    currency,
                    averageMonthlySpend: monthsBack > 0 ? currencyTotals[currency] / monthsBack : 0,
                    totalSpend: currencyTotals[currency],
                    monthsAnalyzed: monthsBack,
                }));
                // Filter out currencies with 0 total spend unless there's no data at all
                const filteredAverages = currencyAverages.filter((avg) => avg.totalSpend > 0);
                // If no spending data for this period, add a default entry
                const finalAverages = filteredAverages.length > 0
                    ? filteredAverages
                    : [
                        {
                            currency: Array.from(allCurrencies)[0] || "USD",
                            averageMonthlySpend: 0,
                            totalSpend: 0,
                            monthsAnalyzed: monthsBack,
                        },
                    ];
                const averageSpendPeriod = {
                    periodMonths: monthsBack,
                    averages: finalAverages,
                };
                rollingAverages.push(averageSpendPeriod);
            }
            const averages = rollingAverages;
            // Return combined response
            const result = {
                monthlyBudgets,
                averageMonthlySpend: averages,
                periodAnalyzed: {
                    startDate: formatSQLiteTime(oldestDate),
                    endDate: formatSQLiteTime(today),
                },
            };
            return createJsonResponse(result, 200, {}, request, env);
        });
    }
    catch (error) {
        console.error("Budget monthly error:", error);
        return createErrorResponse("Internal server error", 500, request, env);
    }
}
// Handle budget total
export async function handleBudgetTotal(request, env) {
    if (request.method !== "POST") {
        return createErrorResponse("Method not allowed", 405, request, env);
    }
    try {
        return withAuth(request, env, async (session, _db) => {
            if (!session.group) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            const body = (await request.json());
            // Validate budget name
            if (!isAuthorizedForBudget(session, body.name)) {
                return createErrorResponse("Unauthorized", 401, request, env);
            }
            // Use existing utility function for now (could be migrated to Drizzle later)
            const totals = await getBudgetTotals(env, session.group.groupid.toString(), body.name);
            return createJsonResponse(totals, 200, {}, request, env);
        });
    }
    catch (error) {
        console.error("Budget total error:", error);
        return createErrorResponse("Internal server error", 500, request, env);
    }
}
//# sourceMappingURL=budget.js.map