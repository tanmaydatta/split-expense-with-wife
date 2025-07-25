import { CFRequest, Env } from '../types';
import {
  createJsonResponse,
  createErrorResponse,
  authenticate,
  formatSQLiteTime,
  isAuthorizedForBudget,
  getBudgetTotals
} from '../utils';
import {
  BudgetRequest,
  BudgetListRequest,
  BudgetDeleteRequest,
  BudgetMonthlyRequest,
  BudgetTotalRequest
} from '../../../shared-types';
import { getDb } from '../db';
import { budget, userBalances, budgetTotals, users } from '../db/schema';
import { eq, and, desc, lt, isNull, lte, gte, sql } from 'drizzle-orm';

// Handle balances
export async function handleBalances(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const db = getDb(env);

    // Get user balances and user information using Drizzle
    const balances = await db
      .select({
        userId: userBalances.userId,
        owedToUserId: userBalances.owedToUserId,
        currency: userBalances.currency,
        balance: userBalances.balance
      })
      .from(userBalances)
      .where(
        and(
          eq(userBalances.groupId, session.group.groupid),
          sql`${userBalances.balance} != 0`
        )
      );

    // Get all users in the group
    const groupUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName
      })
      .from(users)
      .where(eq(users.groupid, session.group.groupid));

    // Create user ID to name mapping
    const userIdToName = new Map<number, string>();
    groupUsers.forEach(user => {
      userIdToName.set(user.id, user.firstName || 'Unknown');
    });

    // Transform balances into UserBalancesByUser format
    const result: Record<string, Record<string, number>> = {};

    for (const balance of balances) {
      const { userId, owedToUserId, currency, balance: amount } = balance;

      // From current user's perspective
      if (userId === session.user.Id) {
        // Current user owes someone else (negative for that person)
        const otherUserName = userIdToName.get(owedToUserId);
        if (otherUserName && otherUserName !== session.user.FirstName) {
          if (!result[otherUserName]) {
            result[otherUserName] = {};
          }
          result[otherUserName][currency] = (result[otherUserName][currency] || 0) - amount;
        }
      } else if (owedToUserId === session.user.Id) {
        // Someone else owes current user (positive for that person)
        const otherUserName = userIdToName.get(userId);
        if (otherUserName && otherUserName !== session.user.FirstName) {
          if (!result[otherUserName]) {
            result[otherUserName] = {};
          }
          result[otherUserName][currency] = (result[otherUserName][currency] || 0) + amount;
        }
      }
    }

    // Return empty object if no balances exist
    if (Object.keys(result).length === 0) {
      return createJsonResponse({}, 200, {}, request, env);
    }

    return createJsonResponse(result, 200, {}, request, env);

  } catch (error) {
    console.error('Balances error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle budget creation
export async function handleBudget(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as BudgetRequest;

    // Validate budget name
    if (!isAuthorizedForBudget(session, body.name)) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const db = getDb(env);
    const currentTime = formatSQLiteTime();
    const currency = body.currency || 'GBP';

    // Prepare Drizzle statements for batch operation
    const budgetInsert = db
      .insert(budget)
      .values({
        description: body.description,
        amount: body.amount,
        name: body.name,
        currency: currency,
        groupid: session.group.groupid,
        addedTime: currentTime
      });

    const budgetTotalUpsert = db
      .insert(budgetTotals)
      .values({
        groupId: session.group.groupid,
        name: body.name,
        currency: currency,
        totalAmount: body.amount,
        updatedAt: currentTime
      })
      .onConflictDoUpdate({
        target: [budgetTotals.groupId, budgetTotals.name, budgetTotals.currency],
        set: {
          totalAmount: sql`${budgetTotals.totalAmount} + ${body.amount}`,
          updatedAt: currentTime
        }
      });

    // Execute both statements using Drizzle batch
    await db.batch([budgetInsert, budgetTotalUpsert]);

    return createJsonResponse({
      message: '200'
    }, 200, {}, request, env);

  } catch (error) {
    console.error('Budget creation error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle budget deletion
export async function handleBudgetDelete(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as BudgetDeleteRequest;
    const db = getDb(env);

    // Get budget entry to verify ownership and get details for total update
    const budgetEntry = await db
      .select()
      .from(budget)
      .where(
        and(
          eq(budget.id, body.id),
          eq(budget.groupid, session.group.groupid),
          isNull(budget.deleted)
        )
      )
      .limit(1);

    if (budgetEntry.length === 0) {
      return createErrorResponse('Budget entry not found', 404, request, env);
    }

    const entry = budgetEntry[0];

    // Check authorization
    if (!isAuthorizedForBudget(session, entry.name)) {
      return createErrorResponse('Unauthorized', 401, request, env);
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
        totalAmount: sql`${budgetTotals.totalAmount} - ${entry.amount}`,
        updatedAt: deletedTime
      })
      .where(
        and(
          eq(budgetTotals.groupId, session.group.groupid),
          eq(budgetTotals.name, entry.name),
          eq(budgetTotals.currency, entry.currency)
        )
      );

    // Execute both statements using Drizzle batch
    await db.batch([deleteBudget, updateBudgetTotal]);

    return createJsonResponse({
      message: 'Successfully deleted budget entry'
    }, 200, {}, request, env);

  } catch (error) {
    console.error('Budget deletion error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle budget list
export async function handleBudgetList(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as BudgetListRequest;

    // Validate budget name
    if (!isAuthorizedForBudget(session, body.name)) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const name = body.name || 'house';
    const currentTime = formatSQLiteTime();
    const db = getDb(env);

    // Get budget entries using Drizzle
    const budgetEntries = await db
      .select()
      .from(budget)
      .where(
        and(
          lt(budget.addedTime, currentTime),
          eq(budget.name, name),
          eq(budget.groupid, session.group.groupid),
          isNull(budget.deleted)
        )
      )
      .orderBy(desc(budget.addedTime))
      .limit(5)
      .offset(body.offset);

    return createJsonResponse(budgetEntries, 200, {}, request, env);

  } catch (error) {
    console.error('Budget list error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle budget monthly aggregations
export async function handleBudgetMonthly(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as BudgetMonthlyRequest;

    // Validate budget name
    if (!isAuthorizedForBudget(session, body.name)) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const name = body.name || 'house';
    const db = getDb(env);

    // First, find the earliest budget data to determine our range
    const earliestData = await db
      .select({
        earliestDate: sql<string>`MIN(added_time)`.as('earliestDate')
      })
      .from(budget)
      .where(
        and(
          eq(budget.name, name),
          eq(budget.groupid, session.group.groupid),
          isNull(budget.deleted)
        )
      );

    const currentDate = new Date();
    let startDate: Date;
    let endDate: Date;
    let currencies: string[];

    // If no data exists, use default 2-year range
    if (!earliestData[0]?.earliestDate) {
      // Create 2-year default range
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      startDate = new Date(twoYearsAgo.getFullYear(), twoYearsAgo.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); // Start of current month
      currencies = ['USD']; // Default currency for empty data
    } else {
      // Parse the earliest date and set our range
      const earliestDate = new Date(earliestData[0].earliestDate);

      // Calculate date range - from earliest data to current month
      startDate = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1); // Start of current month

      // Get all currencies used in this budget
      const allCurrencies = await db
        .select({
          currency: budget.currency
        })
        .from(budget)
        .where(
          and(
            eq(budget.name, name),
            eq(budget.groupid, session.group.groupid),
            isNull(budget.deleted)
          )
        )
        .groupBy(budget.currency);

      currencies = allCurrencies.map(c => c.currency);
    }

    const startDateStr = formatSQLiteTime(startDate);
    const endDateStr = formatSQLiteTime(endDate);

    // Get actual budget data grouped by month and currency (only if we have data)
    const dataMap = new Map<string, Map<string, number>>();

    if (earliestData[0]?.earliestDate) {
      const monthlyBudgets = await db
        .select({
          month: sql<string>`strftime('%m', added_time)`.as('month'),
          year: sql<number>`CAST(strftime('%Y', added_time) AS INTEGER)`.as('year'),
          currency: budget.currency,
          amount: sql<number>`SUM(amount)`.as('amount')
        })
        .from(budget)
        .where(
          and(
            eq(budget.name, name),
            eq(budget.groupid, session.group.groupid),
            isNull(budget.deleted),
            gte(budget.addedTime, startDateStr),
            lte(budget.addedTime, endDateStr)
          )
        )
        .groupBy(
          sql`strftime('%Y-%m', added_time)`,
          budget.currency
        )
        .orderBy(
          sql`strftime('%Y-%m', added_time) DESC`,
          budget.currency
        );

      // Create a map of actual data
      for (const row of monthlyBudgets) {
        const monthKey = `${row.year}-${row.month.padStart(2, '0')}`;
        if (!dataMap.has(monthKey)) {
          dataMap.set(monthKey, new Map());
        }
        const monthMap = dataMap.get(monthKey);
        if (monthMap) {
          monthMap.set(row.currency, row.amount);
        }
      }
    }

    // Generate all months in the range with all currencies
    const monthlyBudgetResults = [];
    const tempDate = new Date(endDate); // Start from current month

    while (tempDate >= startDate) {
      const year = tempDate.getFullYear();
      const month = (tempDate.getMonth() + 1).toString().padStart(2, '0');
      const monthName = tempDate.toLocaleString('default', { month: 'long' });
      const monthKey = `${year}-${month}`;

      const amounts = currencies.map(currency => ({
        currency,
        amount: dataMap.get(monthKey)?.get(currency) || 0
      }));

      monthlyBudgetResults.push({
        month: monthName,
        year: year,
        amounts: amounts
      });

      tempDate.setMonth(tempDate.getMonth() - 1);
    }

    // Calculate rolling averages for all periods
    const totalMonths = monthlyBudgetResults.length;
    const averageSpendResults = [];

    // For each period from 1 to total months
    for (let periodMonths = 1; periodMonths <= totalMonths; periodMonths++) {
      const periodData: Array<{
        currency: string;
        averageMonthlySpend: number;
        totalSpend: number;
        monthsAnalyzed: number;
      }> = [];

      // Calculate for each currency that has data anywhere in the time range
      for (const currency of currencies) {
        let totalSpend = 0;
        let monthsWithData = 0;

        // Sum up the last N months for this currency
        for (let i = 0; i < periodMonths && i < monthlyBudgetResults.length; i++) {
          const monthData = monthlyBudgetResults[i];
          const currencyAmount = monthData.amounts.find(a => a.currency === currency)?.amount || 0;
          if (currencyAmount !== 0) {
            totalSpend += Math.abs(currencyAmount); // Convert to positive for spend calculation
            monthsWithData++;
          }
        }

        // Always include the currency in the period analysis
        // This matches the production behavior where all periods are included
        periodData.push({
          currency,
          averageMonthlySpend: monthsWithData > 0 ? totalSpend / monthsWithData : 0,
          totalSpend,
          monthsAnalyzed: monthsWithData > 0 ? monthsWithData : periodMonths
        });
      }

      // Always add all periods (matching production behavior)
      if (periodData.length > 0) {
        averageSpendResults.push({
          periodMonths,
          averages: periodData
        });
      }
    }

    const response = {
      monthlyBudgets: monthlyBudgetResults,
      averageMonthlySpend: averageSpendResults,
      periodAnalyzed: {
        startDate: startDateStr,
        endDate: endDateStr
      }
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Budget monthly error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle budget total
export async function handleBudgetTotal(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as BudgetTotalRequest;

    // Validate budget name
    if (!isAuthorizedForBudget(session, body.name)) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    // Use existing utility function for now (could be migrated to Drizzle later)
    const totals = await getBudgetTotals(env, session.group.groupid.toString(), body.name);

    return createJsonResponse(totals, 200, {}, request, env);

  } catch (error) {
    console.error('Budget total error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}
