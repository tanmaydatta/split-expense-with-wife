import { CFRequest, Env } from '../types';
import {
  createJsonResponse,
  createErrorResponse,
  authenticate,
  formatSQLiteTime,
  calculateSplitAmounts,
  validateSplitPercentages,
  validatePaidAmounts,
  isValidCurrency,
  generateDrizzleBalanceUpdates,
  generateRandomId
} from '../utils';
import {
  SplitRequest,
  SplitDeleteRequest,
  TransactionsListRequest,
  TransactionUser
} from '../../../shared-types';
import { getDb } from '../db';
import { transactions, transactionUsers } from '../db/schema';
import { eq, and, desc, isNull, inArray } from 'drizzle-orm';
import { users } from '../db/schema';

// Handle expense split creation
export async function handleSplit(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as SplitRequest;

    // Validate currency
    if (!isValidCurrency(body.currency)) {
      return createErrorResponse('Invalid currency', 400, request, env);
    }

    // Validate split percentages
    if (!validateSplitPercentages(body.splitPctShares)) {
      return createErrorResponse('Split percentages must add up to 100%', 400, request, env);
    }

    // Validate paid amounts
    if (!validatePaidAmounts(body.paidByShares, body.amount)) {
      return createErrorResponse('Paid amounts must add up to total amount', 400, request, env);
    }

    // Create expense in Splitwise
    const apiKey = env.SPLITWISE_API_KEY;
    const groupId = env.SPLITWISE_GROUP_ID;

    const splitwiseResponse = await fetch('https://secure.splitwise.com/api/v3.0/create_expense', {
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
      return createErrorResponse('Error creating expense in Splitwise', 500, request, env);
    }

    const splitwiseData = await splitwiseResponse.json() as { id: number };
    const transactionId = splitwiseData.id;
    const createdAt = formatSQLiteTime();

    // Calculate split amounts
    const splitAmounts = calculateSplitAmounts(
      body.amount,
      body.paidByShares,
      body.splitPctShares,
      body.currency
    );

    // Create metadata object matching production format
    const owedAmounts: Record<string, number> = {};
    const owedToAmounts: Record<string, number> = {};
    const paidByShares: Record<string, number> = {};

    // Transform paidByShares to use first names instead of user IDs
    for (const [userId, amount] of Object.entries(body.paidByShares)) {
      const userName = session.usersById[parseInt(userId)]?.FirstName || `User${userId}`;
      paidByShares[userName] = amount;
    }

    // Calculate owedAmounts based on split percentages (each person's total share)
    for (const [userId, splitPct] of Object.entries(body.splitPctShares)) {
      const userName = session.usersById[parseInt(userId)]?.FirstName || `User${userId}`;
      owedAmounts[userName] = Math.round((body.amount * splitPct / 100) * 100) / 100;
    }

    // Calculate owedToAmounts (net amounts owed to each person)
    for (const [userId, paidAmount] of Object.entries(body.paidByShares)) {
      const userName = session.usersById[parseInt(userId)]?.FirstName || `User${userId}`;
      const owedAmount = owedAmounts[userName] || 0;
      const netOwed = paidAmount - owedAmount;

      if (netOwed > 0.01) { // Only include if person is owed money (with small tolerance for rounding)
        owedToAmounts[userName] = Math.round(netOwed * 100) / 100;
      }
    }

    const metadata = {
      paidByShares,
      owedAmounts,
      owedToAmounts
    };

    const db = getDb(env);

    // Prepare all statements for single batch operation
    const transactionInsert = db
      .insert(transactions)
      .values({
        transactionId: transactionId.toString(),
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        groupId: session.group.groupid,
        createdAt: createdAt,
        metadata: metadata
      });

    const userInserts = splitAmounts.map(split =>
      db.insert(transactionUsers).values({
        transactionId: transactionId.toString(),
        userId: split.user_id,
        amount: split.amount,
        owedToUserId: split.owed_to_user_id,
        currency: split.currency,
        groupId: session.group.groupid
      })
    );

    // Generate balance updates using Drizzle
    const balanceUpdates = generateDrizzleBalanceUpdates(env, splitAmounts, session.group.groupid, 'add');

    // Execute all statements in a single batch
    await db.batch([transactionInsert, ...userInserts, ...balanceUpdates]);

    const response = {
      message: 'Transaction created successfully',
      transactionId: transactionId.toString()
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Split error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle new split (direct database creation without Splitwise)
export async function handleSplitNew(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as SplitRequest;

    // Validate currency
    if (!isValidCurrency(body.currency)) {
      return createErrorResponse('Invalid currency', 400, request, env);
    }

    // Validate split percentages
    if (!validateSplitPercentages(body.splitPctShares)) {
      return createErrorResponse('Split percentages must add up to 100%', 400, request, env);
    }

    // Validate paid amounts
    if (!validatePaidAmounts(body.paidByShares, body.amount)) {
      return createErrorResponse('Paid amounts must add up to total amount', 400, request, env);
    }

    // Generate unique transaction ID
    const transactionId = generateRandomId(16);
    const createdAt = formatSQLiteTime();

    // Calculate split amounts
    const splitAmounts = calculateSplitAmounts(
      body.amount,
      body.paidByShares,
      body.splitPctShares,
      body.currency
    );

    // Create metadata object matching production format
    const owedAmounts: Record<string, number> = {};
    const owedToAmounts: Record<string, number> = {};
    const paidByShares: Record<string, number> = {};

    // Transform paidByShares to use first names instead of user IDs
    for (const [userId, amount] of Object.entries(body.paidByShares)) {
      const userName = session.usersById[parseInt(userId)]?.FirstName || `User${userId}`;
      paidByShares[userName] = amount;
    }

    // Calculate owedAmounts based on split percentages (each person's total share)
    for (const [userId, splitPct] of Object.entries(body.splitPctShares)) {
      const userName = session.usersById[parseInt(userId)]?.FirstName || `User${userId}`;
      owedAmounts[userName] = Math.round((body.amount * splitPct / 100) * 100) / 100;
    }

    // Calculate owedToAmounts (net amounts owed to each person)
    for (const [userId, paidAmount] of Object.entries(body.paidByShares)) {
      const userName = session.usersById[parseInt(userId)]?.FirstName || `User${userId}`;
      const owedAmount = owedAmounts[userName] || 0;
      const netOwed = paidAmount - owedAmount;

      if (netOwed > 0.001) { // Only include if person is owed money (with small tolerance for rounding)
        owedToAmounts[userName] = Math.round(netOwed * 100) / 100;
      }
    }

    const metadata = {
      paidByShares,
      owedAmounts,
      owedToAmounts
    };

    const db = getDb(env);

    // Prepare all statements for single batch operation
    const transactionInsert = db
      .insert(transactions)
      .values({
        transactionId: transactionId,
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        groupId: session.group.groupid,
        createdAt: createdAt,
        metadata: metadata
      });

    const userInserts = splitAmounts.map(split =>
      db.insert(transactionUsers).values({
        transactionId: transactionId,
        userId: split.user_id,
        amount: split.amount,
        owedToUserId: split.owed_to_user_id,
        currency: split.currency,
        groupId: session.group.groupid
      })
    );

    // Generate balance updates using Drizzle
    const balanceUpdates = generateDrizzleBalanceUpdates(env, splitAmounts, session.group.groupid, 'add');

    // Execute all statements in a single batch
    await db.batch([transactionInsert, ...userInserts, ...balanceUpdates]);

    const response = {
      message: 'Transaction created successfully',
      transactionId: transactionId
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Split new error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle split deletion
export async function handleSplitDelete(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as SplitDeleteRequest;
    const db = getDb(env);

    // Get transaction details for balance updates using Drizzle
    const transactionDetails = await db
      .select()
      .from(transactionUsers)
      .where(
        and(
          eq(transactionUsers.transactionId, body.id),
          eq(transactionUsers.groupId, session.group.groupid),
          isNull(transactionUsers.deleted)
        )
      );

    if (transactionDetails.length === 0) {
      return createErrorResponse('Transaction not found', 404, request, env);
    }

    const deletedTime = formatSQLiteTime();

    // Prepare all statements for single batch operation
    const deleteTransaction = db
      .update(transactions)
      .set({ deleted: deletedTime })
      .where(
        and(
          eq(transactions.transactionId, body.id),
          eq(transactions.groupId, session.group.groupid)
        )
      );

    const deleteTransactionUsers = db
      .update(transactionUsers)
      .set({ deleted: deletedTime })
      .where(
        and(
          eq(transactionUsers.transactionId, body.id),
          eq(transactionUsers.groupId, session.group.groupid)
        )
      );

    // Generate balance updates using Drizzle (remove the amounts)
    const splitAmounts = transactionDetails.map(detail => ({
      user_id: detail.userId,
      amount: detail.amount,
      owed_to_user_id: detail.owedToUserId,
      currency: detail.currency
    }));

    const balanceUpdates = generateDrizzleBalanceUpdates(env, splitAmounts, session.group.groupid, 'remove');

    // Execute all statements in a single batch
    await db.batch([deleteTransaction, deleteTransactionUsers, ...balanceUpdates]);

    return createJsonResponse({
      message: 'Transaction deleted successfully'
    }, 200, {}, request, env);

  } catch (error) {
    console.error('Split delete error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}

// Handle transactions list
export async function handleTransactionsList(request: CFRequest, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405, request, env);
  }

  try {
    const session = await authenticate(request, env);
    if (!session) {
      return createErrorResponse('Unauthorized', 401, request, env);
    }

    const body = await request.json() as TransactionsListRequest;
    const db = getDb(env);

    // Get transactions list using Drizzle
    const rawTransactionsList = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.groupId, session.group.groupid),
          isNull(transactions.deleted)
        )
      )
      .orderBy(desc(transactions.createdAt))
      .limit(10)
      .offset(body.offset);

    // Transform to match production format (snake_case field names, no id field)
    const transactionsList = rawTransactionsList.map(t => {
      const defaultMetadata = { owedAmounts: {}, paidByShares: {}, owedToAmounts: {} };
      const metadata = t.metadata || defaultMetadata;

      return {
        description: t.description,
        amount: t.amount,
        created_at: t.createdAt,
        metadata: JSON.stringify(metadata), // Convert to JSON string as expected by frontend
        currency: t.currency,
        transaction_id: t.transactionId,
        group_id: t.groupId,
        deleted: t.deleted
      };
    });

    // Get transaction details for all transactions
    const transactionIds = rawTransactionsList.map(t => t.transactionId).filter((id): id is string => id !== null);
    const transactionDetails: Record<string, TransactionUser[]> = {};

    if (transactionIds.length > 0) {
      // Get all transaction details using Drizzle
      const allDetails = await db
        .select({
          transactionId: transactionUsers.transactionId,
          userId: transactionUsers.userId,
          amount: transactionUsers.amount,
          owedToUserId: transactionUsers.owedToUserId,
          groupId: transactionUsers.groupId,
          currency: transactionUsers.currency,
          deleted: transactionUsers.deleted,
          firstName: users.firstName
        })
        .from(transactionUsers)
        .innerJoin(users, eq(users.id, transactionUsers.userId))
        .where(
          and(
            inArray(transactionUsers.transactionId, transactionIds),
            eq(transactionUsers.groupId, session.group.groupid),
            isNull(transactionUsers.deleted)
          )
        );

      // Group details by transaction ID
      for (const detail of allDetails) {
        if (!transactionDetails[detail.transactionId]) {
          transactionDetails[detail.transactionId] = [];
        }
        transactionDetails[detail.transactionId].push({
          transaction_id: detail.transactionId || '',
          user_id: detail.userId,
          amount: detail.amount,
          owed_to_user_id: detail.owedToUserId,
          group_id: detail.groupId,
          currency: detail.currency,
          deleted: detail.deleted || undefined,
          first_name: detail.firstName || undefined
        });
      }
    }

    const response = {
      transactions: transactionsList,
      transactionDetails
    };

    return createJsonResponse(response, 200, {}, request, env);

  } catch (error) {
    console.error('Transactions list error:', error);
    return createErrorResponse('Internal server error', 500, request, env);
  }
}
