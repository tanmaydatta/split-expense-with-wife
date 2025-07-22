import {
  CFRequest,
  Env,
  BudgetRequest,
  BudgetListRequest,
  BudgetTotalRequest,
  BudgetDeleteRequest,
  BudgetMonthlyRequest,
  AverageSpendData,
  AverageSpendPeriod,
  BudgetMonthlyResponse
} from '../types';
import {
  authenticate,
  createJsonResponse,
  createErrorResponse,
  formatSQLiteTime,
  isValidPin,
  isValidCurrency,
  isAuthorizedForBudget,
  getUserBalances,
  generateBudgetTotalUpdateStatements,
  generateMonthlyBudgetUpdateStatements,
  getBudgetTotals,
  getMonthlyBudgets,
  executeBatch
} from '../utils';
import { BudgetEntry, UserBalancesByUser } from '../types';

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

    // Get balances from materialized table (much faster than aggregating transaction_users)
    const balances = await getUserBalances(env, session.group.groupid.toString());

    // Process balances for current user
    const balancesByUser: UserBalancesByUser = {};

    for (const balance of balances) {
      if (balance.user_id === balance.owed_to_user_id) {
        continue; // Skip self-owed amounts
      }

      if (balance.user_id === session.user.Id) {
        // This user owes money
        const otherUser = session.usersById[balance.owed_to_user_id];
        if (otherUser) {
          if (!balancesByUser[otherUser.FirstName]) {
            balancesByUser[otherUser.FirstName] = {};
          }
          balancesByUser[otherUser.FirstName][balance.currency] =
            (balancesByUser[otherUser.FirstName][balance.currency] || 0) - balance.amount;
        }
      } else if (balance.owed_to_user_id === session.user.Id) {
        // This user is owed money
        const otherUser = session.usersById[balance.user_id];
        if (otherUser) {
          if (!balancesByUser[otherUser.FirstName]) {
            balancesByUser[otherUser.FirstName] = {};
          }
          balancesByUser[otherUser.FirstName][balance.currency] =
            (balancesByUser[otherUser.FirstName][balance.currency] || 0) + balance.amount;
        }
      }
    }

    return createJsonResponse(balancesByUser, 200, {}, request, env);

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

    // Validate request
    if (session.group.groupid !== body.groupid) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    if (!isAuthorizedForBudget(session, body.name)) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    if (!isValidCurrency(body.currency)) {
      return createErrorResponse('Invalid currency', 400, request, env);
    }

    if (!isValidPin(body.pin, env)) {
      return createErrorResponse('Invalid pin', 400, request, env);
    }

    // Create budget entry
    const sign = body.amount < 0 ? '-' : '+';
    const name = body.name || 'house';

    const budgetStatement = {
      sql: `INSERT INTO budget (description, price, added_time, amount, name, groupid, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        body.description,
        `${sign}${Math.abs(body.amount).toFixed(2)}`,
        formatSQLiteTime(),
        body.amount,
        name,
        body.groupid,
        body.currency
      ]
    };

    const addedTime = formatSQLiteTime();

    // Update budget statement to use the same timestamp
    budgetStatement.params[2] = addedTime;

    // Generate budget total update statements
    const budgetTotalStatements = generateBudgetTotalUpdateStatements(
      body.groupid,
      name,
      body.currency,
      body.amount,
      'add'
    );

    // Generate monthly budget update statements
    const monthlyBudgetStatements = generateMonthlyBudgetUpdateStatements(
      body.groupid,
      name,
      body.currency,
      body.amount,
      addedTime,
      'add'
    );

    // Execute budget creation, total update, and monthly update in a single batch
    await executeBatch(env, [budgetStatement, ...budgetTotalStatements, ...monthlyBudgetStatements]);

    return createJsonResponse({ message: '200' }, 200, {}, request, env);

  } catch (error) {
    console.error('Budget error:', error);
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

    // Validate PIN
    if (!isValidPin(body.pin, env)) {
      return createErrorResponse('Invalid pin', 400, request, env);
    }

    // Get the budget entry details before deletion for updating totals
    const budgetEntryStmt = env.DB.prepare(`
      SELECT name, currency, amount, added_time
      FROM budget 
      WHERE groupid = ? AND id = ? AND deleted IS NULL
    `);

    const budgetEntryResult = await budgetEntryStmt.bind(session.group.groupid, body.id).first();

    if (!budgetEntryResult) {
      return createErrorResponse('Budget entry not found or already deleted', 404, request, env);
    }

    const budgetEntry = budgetEntryResult as BudgetEntry & { added_time: string };

    // Soft delete budget entry
    const deleteStatement = {
      sql: 'UPDATE budget SET deleted = ? WHERE groupid = ? AND id = ?',
      params: [formatSQLiteTime(), session.group.groupid, body.id]
    };

    // Generate budget total update statements to remove the deleted amount
    const budgetTotalStatements = generateBudgetTotalUpdateStatements(
      session.group.groupid,
      budgetEntry.name,
      budgetEntry.currency,
      budgetEntry.amount,
      'remove'
    );

    // Generate monthly budget update statements to remove the deleted amount
    const monthlyBudgetStatements = generateMonthlyBudgetUpdateStatements(
      session.group.groupid,
      budgetEntry.name,
      budgetEntry.currency,
      budgetEntry.amount,
      budgetEntry.added_time,
      'remove'
    );

    // Execute deletion, total update, and monthly update in a single batch
    await executeBatch(env, [deleteStatement, ...budgetTotalStatements, ...monthlyBudgetStatements]);

    return createJsonResponse({ message: '200' }, 200, {}, request, env);

  } catch (error) {
    console.error('Budget delete error:', error);
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

    // Get budget entries
    const budgetStmt = env.DB.prepare(`
      SELECT id, description, added_time, price, amount, name, deleted, groupid, currency
      FROM budget 
      WHERE added_time < ? AND name = ? AND groupid = ? AND deleted IS NULL
      ORDER BY added_time DESC
      LIMIT 5 OFFSET ?
    `);

    const budgetResult = await budgetStmt.bind(
      currentTime,
      name,
      session.group.groupid,
      body.offset
    ).all();

    return createJsonResponse(budgetResult.results, 200, {}, request, env);

  } catch (error) {
    console.error('Budget list error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle budget monthly
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
    const oldestData = new Date();
    oldestData.setFullYear(oldestData.getFullYear() - 2);

    // Get monthly budget data from materialized table (much faster than aggregating budget entries)
    const monthlyData = await getMonthlyBudgets(
      env,
      session.group.groupid.toString(),
      name,
      oldestData
    );

    // Process data into monthly format
    const monthToName = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // First, collect all unique currencies and find date range
    const allCurrencies = new Set<string>();
    let oldestDate = new Date();
    const today = new Date();

    monthlyData.forEach(data => {
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
      allCurrencies.add('USD'); // Default currency if no data
    }

    // Create map from actual data
    const dataMap: Record<string, Record<string, number>> = {};
    for (const data of monthlyData) {
      const key = `${data.year}-${data.month}`;
      if (!dataMap[key]) {
        dataMap[key] = {};
      }
      dataMap[key][data.currency] = data.amount;
    }

    // Generate all months from today back to oldest date
    const monthlyBudgets: Array<{
      month: string;
      year: number;
      amounts: Array<{ currency: string; amount: number }>;
    }> = [];

    const currentDate = new Date(today.getFullYear(), today.getMonth()); // Start of current month
    const endDate = new Date(oldestDate.getFullYear(), oldestDate.getMonth()); // Start of oldest month

    while (currentDate >= endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1; // JS months are 0-indexed, but our data is 1-indexed
      const key = `${year}-${month}`;

      const amounts: Array<{ currency: string; amount: number }> = [];

      // For each currency, add either real data or 0
      for (const currency of allCurrencies) {
        const amount = dataMap[key]?.[currency] || 0;
        amounts.push({ currency, amount });
      }

      monthlyBudgets.push({
        month: monthToName[month],
        year: year,
        amounts: amounts
      });

      // Move to previous month
      currentDate.setMonth(currentDate.getMonth() - 1);
    }

    // Calculate rolling averages for different time periods
    const rollingAverages: AverageSpendPeriod[] = [];

    // Calculate max periods based on how many months we generated (from today to oldest)
    const maxMonthsBack = monthlyBudgets.length;

    // Calculate averages for 1, 2, 3, ... up to maxMonthsBack months
    const periodsToCalculate = Array.from({length: maxMonthsBack}, (_, i) => i + 1);

    for (const monthsBack of periodsToCalculate) {
      // Take the first N months from our generated monthlyBudgets (which starts from today)
      const periodBudgets = monthlyBudgets.slice(0, monthsBack);

      // Calculate totals by currency for this period (including months with 0 spend)
      const currencyTotals: Record<string, number> = {};

      // Initialize all currencies to 0
      for (const currency of allCurrencies) {
        currencyTotals[currency] = 0;
      }

      // Sum up actual spending for each currency across all months in the period
      periodBudgets.forEach(monthData => {
        monthData.amounts.forEach(amount => {
          currencyTotals[amount.currency] += Math.abs(amount.amount);
        });
      });

      // Create average entries for each currency
      const currencyAverages: AverageSpendData[] = Array.from(allCurrencies).map(currency => ({
        currency,
        averageMonthlySpend: monthsBack > 0 ? currencyTotals[currency] / monthsBack : 0,
        totalSpend: currencyTotals[currency],
        monthsAnalyzed: monthsBack
      }));

      // Filter out currencies with 0 total spend unless there's no data at all
      const filteredAverages = currencyAverages.filter(avg => avg.totalSpend > 0);

      // If no spending data for this period, add a default entry
      const finalAverages = filteredAverages.length > 0 ? filteredAverages : [{
        currency: Array.from(allCurrencies)[0] || 'USD',
        averageMonthlySpend: 0,
        totalSpend: 0,
        monthsAnalyzed: monthsBack
      }];

      const averageSpendPeriod: AverageSpendPeriod = {
        periodMonths: monthsBack,
        averages: finalAverages
      };

      rollingAverages.push(averageSpendPeriod);
    }

    const averages = rollingAverages;

    // Return combined response
    const result: BudgetMonthlyResponse = {
      monthlyBudgets,
      averageMonthlySpend: averages,
      periodAnalyzed: {
        startDate: formatSQLiteTime(oldestDate),
        endDate: formatSQLiteTime(today)
      }
    };

    return createJsonResponse(result, 200, {}, request, env);

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

    const name = body.name || 'house';

    // Get budget totals from materialized table (much faster than aggregating budget entries)
    const totals = await getBudgetTotals(env, session.group.groupid.toString(), name);

    return createJsonResponse(totals, 200, {}, request, env);

  } catch (error) {
    console.error('Budget total error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}
