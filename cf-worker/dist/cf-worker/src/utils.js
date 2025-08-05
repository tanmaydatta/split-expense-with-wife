import { CURRENCIES } from "../../shared-types";
import { groups, userBalances, budgetTotals, transactionUsers, } from "./db/schema/schema";
import { getDb } from "./db";
import { eq, inArray, sql, and, isNull } from "drizzle-orm";
import { auth } from "./auth";
import { user } from "./db/schema/auth-schema";
// Generate random ID
export function generateRandomId(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
// Format date for SQLite
export function formatSQLiteTime(date = new Date()) {
    return date.toISOString().replace("T", " ").slice(0, 19);
}
export async function enrichSession(session, db) {
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
    const group = getGroup(userGroup);
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
    const usersById = {};
    usersInGroup.forEach((u) => (usersById[u.id] = u));
    return {
        group,
        usersById: usersById,
        currentUser: currentUser[0],
        currencies: [...CURRENCIES],
    };
}
function getGroup(userGroup) {
    if (!userGroup || userGroup.length === 0 || !userGroup[0]?.groupid) {
        return null;
    }
    try {
        const rawGroup = userGroup[0];
        if (!rawGroup.groupid) {
            throw new Error("Group ID is required");
        }
        const group = {
            groupid: rawGroup.groupid,
            budgets: JSON.parse(rawGroup.budgets || "[]"),
            userids: JSON.parse(rawGroup.userids || "[]"),
            metadata: JSON.parse(rawGroup.metadata || "{}"),
        };
        return group;
    }
    catch (error) {
        console.error("Error parsing group data:", error);
        // Return a safe default group
        return {
            groupid: userGroup[0].groupid || 0,
            budgets: [],
            userids: [],
            metadata: { defaultShare: {}, defaultCurrency: "USD" },
        };
    }
}
// This function acts as a guard for our protected routes
export async function withAuth(request, env, handler) {
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
        return await handler({
            ...sessionData,
            ...enrichedSession,
        }, db);
    }
    catch (error) {
        console.error("Auth middleware error:", error);
        return createErrorResponse("Authentication failed", 401, request, env);
    }
}
// CORS headers
export function getCORSHeaders(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = env.ALLOWED_ORIGINS
        ? env.ALLOWED_ORIGINS.split(",")
        : [];
    let allowOrigin = origin || "http://localhost:3000";
    if (allowedOrigins.length > 0 && origin && allowedOrigins.includes(origin)) {
        allowOrigin = origin;
    }
    else if (allowedOrigins.length === 0) {
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
export function createOptionsResponse(request, env) {
    return new Response(null, {
        status: 204,
        headers: getCORSHeaders(request, env),
    });
}
// Create JSON response with CORS headers
export function createJsonResponse(data, status = 200, headers = {}, request, env) {
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
export function createErrorResponse(error, status = 500, request, env) {
    return createJsonResponse({ error }, status, {}, request, env);
}
// Add CORS headers to any response
export function addCORSHeaders(response, request, env) {
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
export function isAuthorizedForBudget(session, budgetName) {
    if (!session.group) {
        return false;
    }
    return session.group.budgets.includes(budgetName);
}
// Currency validation now uses CURRENCIES from shared-types
// Helper function to validate currency
export function isValidCurrency(currency) {
    return CURRENCIES.includes(currency);
}
// Helper function to validate split percentages
export function validateSplitPercentages(splitPctShares) {
    const totalPct = Object.values(splitPctShares).reduce((sum, pct) => sum + pct, 0);
    return Math.abs(totalPct - 100) < 0.01; // Allow small floating point errors
}
// Helper function to validate paid amounts
export function validatePaidAmounts(paidByShares, totalAmount) {
    const totalPaid = Object.values(paidByShares).reduce((sum, amount) => sum + amount, 0);
    return Math.abs(totalPaid - totalAmount) < 0.01; // Allow small floating point errors
}
// Calculate split amounts for transactions using net settlement logic
export function calculateSplitAmounts(amount, paidByShares, splitPctShares, currency) {
    const splitAmounts = [];
    // Calculate net position for each user (positive = owed money, negative = owes money)
    const netPositions = {};
    // Calculate what each user owes based on split percentages
    for (const [userIdStr, splitPct] of Object.entries(splitPctShares)) {
        const owedAmount = (amount * splitPct) / 100;
        netPositions[userIdStr] = (netPositions[userIdStr] || 0) - owedAmount;
    }
    // Add what each user paid
    for (const [userIdStr, paidAmount] of Object.entries(paidByShares)) {
        netPositions[userIdStr] = (netPositions[userIdStr] || 0) + paidAmount;
    }
    // Separate creditors (net positive) and debtors (net negative)
    const creditors = [];
    const debtors = [];
    for (const [userIdStr, netAmount] of Object.entries(netPositions)) {
        if (netAmount > 0.001) {
            // Creditor (owed money)
            creditors.push({ userId: userIdStr, amount: netAmount });
        }
        else if (netAmount < -0.01) {
            // Debtor (owes money)
            debtors.push({ userId: userIdStr, amount: -netAmount });
        }
    }
    // Create debt relationships: debtors owe proportionally to creditors
    const totalCreditorAmount = creditors.reduce((sum, c) => sum + c.amount, 0);
    for (const debtor of debtors) {
        for (const creditor of creditors) {
            // Calculate how much this debtor owes to this creditor proportionally
            const proportionToCreditor = creditor.amount / totalCreditorAmount;
            const amountOwedToCreditor = debtor.amount * proportionToCreditor;
            if (amountOwedToCreditor > 0.001) {
                // Only record significant amounts
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
// Generate Drizzle balance update statements
export function generateDrizzleBalanceUpdates(env, splitAmounts, groupId, operation) {
    const db = getDb(env);
    const multiplier = operation === "add" ? 1 : -1;
    const currentTime = formatSQLiteTime();
    return splitAmounts.map((split) => db
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
            balance: sql `${userBalances.balance} + ${split.amount * multiplier}`,
            updatedAt: currentTime,
        },
    }));
}
// Utility function to rebuild balances for a specific group (for data integrity)
export async function rebuildGroupBalances(env, groupId) {
    const db = getDb(env);
    const currentTime = formatSQLiteTime();
    const parsedGroupId = parseInt(groupId);
    // Delete existing balances for the group using Drizzle
    await db.delete(userBalances).where(eq(userBalances.groupId, parsedGroupId));
    // Get aggregated transaction data using Drizzle
    const aggregatedBalances = await db
        .select({
        groupId: transactionUsers.groupId,
        userId: transactionUsers.userId,
        owedToUserId: transactionUsers.owedToUserId,
        currency: transactionUsers.currency,
        balance: sql `sum(${transactionUsers.amount})`.as("balance"),
    })
        .from(transactionUsers)
        .where(and(eq(transactionUsers.groupId, parsedGroupId), isNull(transactionUsers.deleted)))
        .groupBy(transactionUsers.groupId, transactionUsers.userId, transactionUsers.owedToUserId, transactionUsers.currency);
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
export async function getUserBalances(env, groupId) {
    const db = getDb(env);
    const balances = await db
        .select({
        user_id: userBalances.userId,
        owed_to_user_id: userBalances.owedToUserId,
        currency: userBalances.currency,
        amount: userBalances.balance,
    })
        .from(userBalances)
        .where(sql `${userBalances.groupId} = ${groupId} AND ${userBalances.balance} != 0`);
    return balances;
}
// Get budget totals using Drizzle
export async function getBudgetTotals(env, groupId, name) {
    const db = getDb(env);
    const totals = await db
        .select({
        currency: budgetTotals.currency,
        amount: budgetTotals.totalAmount,
    })
        .from(budgetTotals)
        .where(sql `${budgetTotals.groupId} = ${groupId} AND ${budgetTotals.name} = ${name}`);
    return totals;
}
//# sourceMappingURL=utils.js.map