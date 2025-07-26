import {
  CFRequest,
  CurrentSession,
  Env,
  SplitAmount,
  UserBalance,
  BudgetTotal
} from './types';
import { sessions, users, groups, userBalances, budgetTotals, transactionUsers } from './db/schema';
import { getDb } from './db';
import { eq, inArray, sql, and, isNull } from 'drizzle-orm';

// Generate random ID
export function generateRandomId(length: number = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Format date for SQLite
export function formatSQLiteTime(date: Date = new Date()): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

// Validate session with Drizzle (primary session validation function)
export async function validateSession(sessionId: string, env: Env): Promise<CurrentSession | null> {
  try {
    const db = getDb(env);

    // Get session from database using Drizzle
    const sessionResult = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionid, sessionId))
      .limit(1);

    if (sessionResult.length === 0) {
      return null;
    }

    const session = sessionResult[0];

    // Check if session is expired
    const now = new Date();
    const expiryTime = new Date(session.expiryTime);
    if (now > expiryTime) {
      return null;
    }

    // Get user from database using Drizzle
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.username, session.username))
      .limit(1);

    if (userResult.length === 0) {
      return null;
    }

    const userRow = userResult[0];
    const user = {
      Id: userRow.id,
      username: userRow.username,
      FirstName: userRow.firstName || '',
      groupid: userRow.groupid
    };

    // Get group from database using Drizzle
    const groupResult = await db
      .select()
      .from(groups)
      .where(eq(groups.groupid, user.groupid))
      .limit(1);

    if (groupResult.length === 0) {
      return null;
    }

    const groupRow = groupResult[0];
    const group = {
      groupid: groupRow.groupid,
      budgets: groupRow.budgets || '[]',
      userids: groupRow.userids || '[]',
      metadata: groupRow.metadata || '{}'
    };

    // Get users in group using Drizzle
    const userIds = JSON.parse(group.userids) as number[];
    const usersInGroup = await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds));

    const usersById: Record<number, typeof user> = {};
    usersInGroup.forEach((u: typeof userRow) => {
      usersById[u.id] = {
        Id: u.id,
        username: u.username,
        FirstName: u.firstName || '',
        groupid: u.groupid
      };
    });

    return {
      session: {
        username: session.username,
        sessionid: session.sessionid,
        expiry_time: session.expiryTime
      },
      user,
      group,
      usersById
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

// Check if user is authenticated and return session
export async function authenticate(request: CFRequest, env: Env): Promise<CurrentSession | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const sessionId = authHeader.substring(7);
  return await validateSession(sessionId, env);
}

// CORS headers
export function getCORSHeaders(request: CFRequest, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [];

  let allowOrigin = '*';
  if (origin && allowedOrigins.includes(origin)) {
    allowOrigin = origin;
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

// Create OPTIONS response
export function createOptionsResponse(request: CFRequest, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(request, env)
  });
}

// Create JSON response with CORS headers
export function createJsonResponse(data: unknown, status: number = 200, headers: Record<string, string> = {}, request?: CFRequest, env?: Env): Response {
  const responseHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  if (request && env) {
    Object.assign(responseHeaders, getCORSHeaders(request, env));
  }

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders
  });
}

// Create error response
export function createErrorResponse(error: string, status: number = 500, request?: CFRequest, env?: Env): Response {
  return createJsonResponse({ error }, status, {}, request, env);
}

// Helper function to check if user is authorized for a budget
export function isAuthorizedForBudget(session: CurrentSession, budgetName: string): boolean {
  try {
    const budgets = JSON.parse(session.group.budgets) as string[];
    return budgets.includes(budgetName);
  } catch (error) {
    console.error('Error parsing budgets:', error);
    return false;
  }
}

// Supported currencies list
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SGD'];

// Helper function to validate currency
export function isValidCurrency(currency: string): boolean {
  return SUPPORTED_CURRENCIES.includes(currency);
}

// Helper function to validate split percentages
export function validateSplitPercentages(splitPctShares: Record<string, number>): boolean {
  const totalPct = Object.values(splitPctShares).reduce((sum, pct) => sum + pct, 0);
  return Math.abs(totalPct - 100) < 0.01; // Allow small floating point errors
}

// Helper function to validate paid amounts
export function validatePaidAmounts(paidByShares: Record<string, number>, totalAmount: number): boolean {
  const totalPaid = Object.values(paidByShares).reduce((sum, amount) => sum + amount, 0);
  return Math.abs(totalPaid - totalAmount) < 0.01; // Allow small floating point errors
}

// Calculate split amounts for transactions using net settlement logic
export function calculateSplitAmounts(
  amount: number,
  paidByShares: Record<number, number>,
  splitPctShares: Record<number, number>,
  currency: string
): Array<{ user_id: number; amount: number; owed_to_user_id: number; currency: string }> {
  const splitAmounts: Array<{ user_id: number; amount: number; owed_to_user_id: number; currency: string }> = [];

  // Calculate net position for each user (positive = owed money, negative = owes money)
  const netPositions: Record<number, number> = {};

  // Calculate what each user owes based on split percentages
  for (const [userIdStr, splitPct] of Object.entries(splitPctShares)) {
    const userId = parseInt(userIdStr, 10);
    const owedAmount = (amount * splitPct) / 100;
    netPositions[userId] = (netPositions[userId] || 0) - owedAmount;
  }

  // Add what each user paid
  for (const [userIdStr, paidAmount] of Object.entries(paidByShares)) {
    const userId = parseInt(userIdStr, 10);
    netPositions[userId] = (netPositions[userId] || 0) + paidAmount;
  }

  // Separate creditors (net positive) and debtors (net negative)
  const creditors: Array<{ userId: number; amount: number }> = [];
  const debtors: Array<{ userId: number; amount: number }> = [];

  for (const [userIdStr, netAmount] of Object.entries(netPositions)) {
    const userId = parseInt(userIdStr, 10);
    if (netAmount > 0.001) { // Creditor (owed money)
      creditors.push({ userId, amount: netAmount });
    } else if (netAmount < -0.01) { // Debtor (owes money)
      debtors.push({ userId, amount: -netAmount });
    }
  }

  // Create debt relationships: debtors owe proportionally to creditors
  const totalCreditorAmount = creditors.reduce((sum, c) => sum + c.amount, 0);

  for (const debtor of debtors) {
    for (const creditor of creditors) {
      // Calculate how much this debtor owes to this creditor proportionally
      const proportionToCreditor = creditor.amount / totalCreditorAmount;
      const amountOwedToCreditor = debtor.amount * proportionToCreditor;

      if (amountOwedToCreditor > 0.001) { // Only record significant amounts
        splitAmounts.push({
          user_id: debtor.userId,
          amount: Math.round(amountOwedToCreditor * 100) / 100,
          owed_to_user_id: creditor.userId,
          currency: currency
        });
      }
    }
  }

  return splitAmounts;
}

// Generate Drizzle balance update statements
export function generateDrizzleBalanceUpdates(
  env: Env,
  splitAmounts: SplitAmount[],
  groupId: number,
  operation: 'add' | 'remove'
) {
  const db = getDb(env);
  const multiplier = operation === 'add' ? 1 : -1;
  const currentTime = formatSQLiteTime();

  return splitAmounts.map(split =>
    db
      .insert(userBalances)
      .values({
        groupId: groupId,
        userId: split.user_id,
        owedToUserId: split.owed_to_user_id,
        currency: split.currency,
        balance: split.amount * multiplier,
        updatedAt: currentTime
      })
      .onConflictDoUpdate({
        target: [userBalances.groupId, userBalances.userId, userBalances.owedToUserId, userBalances.currency],
        set: {
          balance: sql`${userBalances.balance} + ${split.amount * multiplier}`,
          updatedAt: currentTime
        }
      })
  );
}

// Utility function to rebuild balances for a specific group (for data integrity)
export async function rebuildGroupBalances(env: Env, groupId: string): Promise<void> {
  const db = getDb(env);
  const currentTime = formatSQLiteTime();
  const parsedGroupId = parseInt(groupId);

  // Delete existing balances for the group using Drizzle
  await db
    .delete(userBalances)
    .where(eq(userBalances.groupId, parsedGroupId));

  // Get aggregated transaction data using Drizzle
  const aggregatedBalances = await db
    .select({
      groupId: transactionUsers.groupId,
      userId: transactionUsers.userId,
      owedToUserId: transactionUsers.owedToUserId,
      currency: transactionUsers.currency,
      balance: sql<number>`sum(${transactionUsers.amount})`.as('balance')
    })
    .from(transactionUsers)
    .where(
      and(
        eq(transactionUsers.groupId, parsedGroupId),
        isNull(transactionUsers.deleted)
      )
    )
    .groupBy(
      transactionUsers.groupId,
      transactionUsers.userId,
      transactionUsers.owedToUserId,
      transactionUsers.currency
    );

  // Insert the aggregated balances using Drizzle
  if (aggregatedBalances.length > 0) {
    const balanceValues = aggregatedBalances.map(balance => ({
      groupId: balance.groupId,
      userId: balance.userId,
      owedToUserId: balance.owedToUserId,
      currency: balance.currency,
      balance: balance.balance,
      updatedAt: currentTime
    }));

    await db.insert(userBalances).values(balanceValues);
  }
}

// Get balances from materialized table using Drizzle
export async function getUserBalances(env: Env, groupId: string): Promise<UserBalance[]> {
  const db = getDb(env);

  const balances = await db
    .select({
      user_id: userBalances.userId,
      owed_to_user_id: userBalances.owedToUserId,
      currency: userBalances.currency,
      amount: userBalances.balance
    })
    .from(userBalances)
    .where(
      sql`${userBalances.groupId} = ${groupId} AND ${userBalances.balance} != 0`
    );

  return balances;
}

// Get budget totals using Drizzle
export async function getBudgetTotals(env: Env, groupId: string, name: string): Promise<BudgetTotal[]> {
  const db = getDb(env);

  const totals = await db
    .select({
      currency: budgetTotals.currency,
      amount: budgetTotals.totalAmount
    })
    .from(budgetTotals)
    .where(
      sql`${budgetTotals.groupId} = ${groupId} AND ${budgetTotals.name} = ${name}`
    );

  return totals;
}
