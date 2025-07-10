import {
  CFRequest,
  Env,
  SplitRequest,
  SplitNewRequest,
  SplitDeleteRequest,
  TransactionsListRequest
} from '../types';
import {
  authenticate,
  createJsonResponse,
  createErrorResponse,
  formatSQLiteTime,
  executeBatch,
  isValidPin,
  isValidCurrency,
  validateSplitPercentages,
  validatePaidAmounts,
  calculateSplitAmounts
} from '../utils';

// Handle split with Splitwise API
export async function handleSplit(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json() as SplitRequest;

    // Validate request
    if (!isValidCurrency(body.currency)) {
      return createErrorResponse('Invalid currency', 400);
    }

    if (!isValidPin(body.pin, env)) {
      return createErrorResponse('Invalid pin', 400);
    }

    if (!validateSplitPercentages(body.splitPctShares)) {
      return createErrorResponse('Split percentages must total 100%', 400);
    }

    if (!validatePaidAmounts(body.paidByShares, body.amount)) {
      return createErrorResponse('Paid amounts must equal total amount', 400);
    }

    // Call Splitwise API
    const groupId = env.SPLITWISE_GROUP_ID;
    const apiKey = env.SPLITWISE_API_KEY;

    const splitwiseResponse = await fetch(`https://secure.splitwise.com/api/v3.0/create_expense`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cost: body.amount,
        currency_code: body.currency,
        description: body.description,
        group_id: groupId,
        split_by_shares: body.splitPctShares,
        paid_by_shares: body.paidByShares
      })
    });

    if (!splitwiseResponse.ok) {
      const errorText = await splitwiseResponse.text();
      console.error('Splitwise API error:', errorText);
      return createErrorResponse('Error creating expense in Splitwise', 500);
    }

    const splitwiseData = await splitwiseResponse.json() as { id: number };

    // Store in database
    const transactionId = splitwiseData.id;
    const createdAt = formatSQLiteTime();

    // Create transaction record
    const transactionStmt = env.DB.prepare(`
      INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    await transactionStmt.bind(
      transactionId,
      body.description,
      body.amount,
      body.currency,
      session.group.groupid,
      createdAt
    ).run();

    // Calculate split amounts
    const splitAmounts = calculateSplitAmounts(
      body.amount,
      body.paidByShares,
      body.splitPctShares,
      body.currency
    );

    // Store split amounts in database
    const userBatchStatements = splitAmounts.map(split => ({
      sql: `INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        transactionId,
        split.user_id,
        split.amount,
        split.owed_to_user_id,
        split.currency,
        session.group.groupid,
        createdAt
      ]
    }));

    await executeBatch(env, userBatchStatements);

    return createJsonResponse({
      message: 'Split created successfully',
      transactionId: transactionId
    });

  } catch (error) {
    console.error('Split error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

// Handle split new (database-only)
export async function handleSplitNew(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json() as SplitNewRequest;

    // Validate request
    if (!isValidCurrency(body.currency)) {
      return createErrorResponse('Invalid currency', 400);
    }

    if (!isValidPin(body.pin, env)) {
      return createErrorResponse('Invalid pin', 400);
    }

    if (!validateSplitPercentages(body.splitPctShares)) {
      return createErrorResponse('Split percentages must total 100%', 400);
    }

    if (!validatePaidAmounts(body.paidByShares, body.amount)) {
      return createErrorResponse('Paid amounts must equal total amount', 400);
    }

    // Generate transaction ID
    const transactionId = Math.floor(Math.random() * 1000000).toString();
    const createdAt = formatSQLiteTime();


    // Calculate split amounts
    const splitAmounts = calculateSplitAmounts(
      body.amount,
      body.paidByShares,
      body.splitPctShares,
      body.currency
    );

    // Store split amounts in database
    const userBatchStatements = splitAmounts.map(split => ({
      sql: `INSERT INTO transaction_users (transaction_id, user_id, amount, owed_to_user_id, currency, group_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        transactionId,
        split.user_id,
        split.amount,
        split.owed_to_user_id,
        split.currency,
        session.group.groupid,
      ]
    }));
    await executeBatch(env, [{
      sql: `INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        transactionId,
        body.description,
        body.amount,
        body.currency,
        session.group.groupid,
        createdAt
      ]
    }, ...userBatchStatements]);

    return createJsonResponse({
      message: 'Transaction created successfully',
      transactionId: transactionId
    });

  } catch (error) {
    console.error('Split new error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

// Handle split delete
export async function handleSplitDelete(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json() as SplitDeleteRequest;

    // Validate PIN
    if (!isValidPin(body.pin, env)) {
      return createErrorResponse('Invalid pin', 400);
    }

    // Soft delete transaction
    const deletedTime = formatSQLiteTime();

    const batchStatements = [
      {
        sql: `UPDATE transactions SET deleted = ? WHERE id = ? AND groupid = ?`,
        params: [deletedTime, body.transactionId, session.group.groupid]
      },
      {
        sql: `UPDATE transaction_users SET deleted = ? WHERE transaction_id = ? AND group_id = ?`,
        params: [deletedTime, body.transactionId, session.group.groupid]
      }
    ];

    await executeBatch(env, batchStatements);

    return createJsonResponse({ message: 'Transaction deleted successfully' });

  } catch (error) {
    console.error('Split delete error:', error);
    return createErrorResponse('Internal server error', 500);
  }
}

// Handle transactions list
export async function handleTransactionsList(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json() as TransactionsListRequest;

    // Get transactions list
    const transactionsStmt = env.DB.prepare(`
      SELECT t.transaction_id, t.description, t.amount, t.currency, t.created_at, t.group_id as group_id, t.deleted
      FROM transactions t
      WHERE t.group_id = ? AND t.deleted IS NULL
      ORDER BY t.created_at DESC
      LIMIT 5 OFFSET ?
    `);

    const transactionsResult = await transactionsStmt.bind(
      session.group.groupid,
      body.offset
    ).all();

    // Get transaction details for all transactions
    const transactionIds = transactionsResult.results.map((t: any) => t.transaction_id);

    let transactionDetails: any = {};
    console.log(transactionIds);
    if (transactionIds.length > 0) {
      const placeholders = transactionIds.map(() => '?').join(',');
      const detailsStmt = env.DB.prepare(`
        SELECT tu.transaction_id, tu.user_id, tu.amount, tu.owed_to_user_id, tu.group_id, tu.currency, tu.deleted
        FROM transaction_users tu
        WHERE tu.transaction_id IN (${placeholders}) AND tu.deleted IS NULL
      `);

      const detailsResult = await detailsStmt.bind(...transactionIds).all();

      // Group details by transaction_id
      for (const detail of detailsResult.results) {
        const detailRecord = detail as any;
        const transactionId = detailRecord.transaction_id;
        if (!transactionDetails[transactionId]) {
          transactionDetails[transactionId] = [];
        }
        transactionDetails[transactionId].push(detailRecord);
      }
    }

    // Format transactions with metadata
    const formattedTransactions = transactionsResult.results.map((transaction: any) => {
      // Generate metadata from transaction details
      const details = transactionDetails[transaction.transaction_id] || [];
      const metadata = {
        paidByShares: {} as any,
        owedAmounts: {} as any,
        owedToAmounts: {} as any
      };

      // Calculate metadata from transaction details
      for (const detail of details) {
        const detailRecord = detail as any;
        // For now, we'll generate basic metadata structure
        // This would need to be enhanced based on your actual user data structure
        if (detailRecord.user_id === detailRecord.owed_to_user_id) {
          // This user paid
          metadata.paidByShares[`User${detailRecord.user_id}`] = detailRecord.amount;
        } else {
          // This user owes
          metadata.owedAmounts[`User${detailRecord.user_id}`] = detailRecord.amount;
          metadata.owedToAmounts[`User${detailRecord.owed_to_user_id}`] = detailRecord.amount;
        }
      }

      return {
        id: transaction.transaction_id,
        description: transaction.description,
        amount: transaction.amount,
        created_at: transaction.created_at,
        metadata: JSON.stringify(metadata),
        currency: transaction.currency,
        transaction_id: transaction.transaction_id,
        group_id: transaction.group_id,
        deleted: transaction.deleted
      };
    });

    return createJsonResponse({
      transactions: formattedTransactions,
      transactionDetails: transactionDetails
    });

  } catch (error) {
    console.error('Transactions list error:', error);
    return createErrorResponse('Internal server error', 500);
  }
} 