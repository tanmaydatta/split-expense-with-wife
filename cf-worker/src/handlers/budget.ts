import { 
  CFRequest, 
  Env, 
  BudgetRequest,
  BudgetListRequest,
  BudgetTotalRequest,
  BudgetDeleteRequest,
  BudgetMonthlyRequest
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
    
    return createJsonResponse({ message: 'Budget entry created successfully' }, 200, {}, request, env);
    
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
    
    return createJsonResponse({ message: 'Budget entry deleted successfully' }, 200, {}, request, env);
    
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
    const result = Object.values(monthlyMap).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return monthToName.indexOf(b.month) - monthToName.indexOf(a.month);
    });
    
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