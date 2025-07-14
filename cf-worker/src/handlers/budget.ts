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
  isAuthorizedForBudget
} from '../utils';

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
    
    // Get transaction balances
    const balancesStmt = env.DB.prepare(`
      SELECT user_id, owed_to_user_id, currency, sum(amount) as amount 
      FROM transaction_users 
      WHERE group_id = ? AND deleted IS NULL 
      GROUP BY user_id, owed_to_user_id, currency
    `);
    
    const balancesResult = await balancesStmt.bind(session.group.groupid).all();
    const balances = balancesResult.results as Array<{
      user_id: number;
      owed_to_user_id: number;
      currency: string;
      amount: number;
    }>;
    
    // Process balances for current user
    const balancesByUser: Record<string, Record<string, number>> = {};
    
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
    
    const budgetStmt = env.DB.prepare(`
      INSERT INTO budget (description, price, added_time, amount, name, groupid, currency)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    await budgetStmt.bind(
      body.description,
      `${sign}${Math.abs(body.amount).toFixed(2)}`,
      formatSQLiteTime(),
      body.amount,
      name,
      body.groupid,
      body.currency
    ).run();
    
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
    
    // Delete budget entry (soft delete)
    const deleteStmt = env.DB.prepare(`
      UPDATE budget 
      SET deleted = ? 
      WHERE groupid = ? AND id = ?
    `);
    
    const result = await deleteStmt.bind(
      formatSQLiteTime(),
      session.group.groupid,
      body.id
    ).run();
    
    if (result.meta.changes === 0) {
      return createErrorResponse('Budget entry not found or already deleted', 404, request, env);
    }
    
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
    
    // Get monthly budget data
    const monthlyStmt = env.DB.prepare(`
      SELECT
        CAST(strftime('%m', added_time) AS INTEGER) as month,
        CAST(strftime('%Y', added_time) AS INTEGER) as year,
        currency,
        SUM(amount) as amount
      FROM budget
      WHERE 
        name = ? AND 
        groupid = ? AND 
        deleted IS NULL AND
        added_time >= ? AND
        amount < 0
      GROUP BY 
        1, 2, 3
      ORDER BY 
        2 DESC, 
        1 DESC
    `);
    
    const monthlyResult = await monthlyStmt.bind(
      name,
      session.group.groupid,
      formatSQLiteTime(oldestData)
    ).all();
    
    const monthlyData = monthlyResult.results as Array<{
      month: number;
      year: number;
      currency: string;
      amount: number;
    }>;
    
    // Process data into monthly format
    const monthToName = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const monthlyMap: Record<string, {
      month: string;
      year: number;
      amounts: Array<{ currency: string; amount: number }>;
    }> = {};
    for (const data of monthlyData) {
      const key = `${data.year}-${data.month}`;
      if (!monthlyMap[key]) {
        monthlyMap[key] = {
          month: monthToName[data.month],
          year: data.year,
          amounts: []
        };
      }
      monthlyMap[key].amounts.push({
        currency: data.currency,
        amount: data.amount
      });
    }
    
    // Convert to array and sort
    const monthlyBudgets = Object.values(monthlyMap).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return monthToName.indexOf(b.month) - monthToName.indexOf(a.month);
    });
    
    // Calculate rolling averages for different time periods
    const rollingAverages: AverageSpendPeriod[] = [];
    
    // Determine the range of data we have
    let maxMonthsBack = 1;
    let latestDate = new Date();
    
    if (monthlyData.length > 0) {
      // Find the earliest and latest dates in our data
      const dates = monthlyData.map(data => new Date(data.year, data.month - 1));
      const earliestDate = new Date(Math.min(...dates.map(d => d.getTime())));
      latestDate = new Date(Math.max(...dates.map(d => d.getTime())));
      
      // Calculate the number of months between earliest and latest date
      const monthsDiff = (latestDate.getFullYear() - earliestDate.getFullYear()) * 12 + 
                        (latestDate.getMonth() - earliestDate.getMonth()) + 1;
      maxMonthsBack = Math.max(1, monthsDiff);
    }
    
    // Calculate averages for 1, 2, 3, ... up to maxMonthsBack months
    const periodsToCalculate = Array.from({length: maxMonthsBack}, (_, i) => i + 1);
    
    for (const monthsBack of periodsToCalculate) {
      const startDate = new Date(latestDate);
      startDate.setMonth(startDate.getMonth() - monthsBack + 1); // +1 to include current month
      
      // Filter data for this period
      const periodData = monthlyData.filter(data => {
        const dataDate = new Date(data.year, data.month - 1); // month-1 because JS months are 0-indexed
        return dataDate >= startDate && dataDate <= latestDate;
      });
      
      // Calculate totals by currency for this period
      const currencyTotals: Record<string, number> = {};
      const monthsWithData = new Set<string>();
      
      periodData.forEach(data => {
        const monthKey = `${data.year}-${data.month}`;
        monthsWithData.add(monthKey);
        
        if (!currencyTotals[data.currency]) {
          currencyTotals[data.currency] = 0;
        }
        currencyTotals[data.currency] += Math.abs(data.amount);
      });
      
      const totalMonthsWithData = monthsWithData.size;
    
      
      // Create average entries for each currency
      const currencyAverages: AverageSpendData[] = Object.entries(currencyTotals).map(([currency, total]) => ({
        currency,
        averageMonthlySpend: totalMonthsWithData > 0 ? total / totalMonthsWithData : 0,
        totalSpend: total,
        monthsAnalyzed: totalMonthsWithData
      }));
      
      // If no data for this period, still add a default entry
      if (currencyAverages.length === 0) {
        currencyAverages.push({
          currency: 'USD',
          averageMonthlySpend: 0,
          totalSpend: 0,
          monthsAnalyzed: 0
        });
      }
      
      const averageSpendPeriod: AverageSpendPeriod = {
        periodMonths: monthsBack,
        averages: currencyAverages
      };
      
      rollingAverages.push(averageSpendPeriod);
    }
    
    const averages = rollingAverages;
    
    // Return combined response
    const result: BudgetMonthlyResponse = {
      monthlyBudgets,
      averageMonthlySpend: averages,
      periodAnalyzed: {
        startDate: formatSQLiteTime(oldestData),
        endDate: formatSQLiteTime(latestDate)
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
    
    // Get budget totals
    const totalStmt = env.DB.prepare(`
      SELECT currency, sum(amount) as amount
      FROM budget 
      WHERE name = ? AND groupid = ? AND deleted IS NULL
      GROUP BY currency
    `);
    
    const totalResult = await totalStmt.bind(
      name,
      session.group.groupid
    ).all();
    
    return createJsonResponse(totalResult.results, 200, {}, request, env);
    
  } catch (error) {
    console.error('Budget total error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
} 