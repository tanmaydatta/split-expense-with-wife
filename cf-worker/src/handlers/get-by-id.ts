import { and, eq, isNull } from "drizzle-orm";
import type {
	BudgetEntry as BudgetEntryDto,
	BudgetEntryGetRequest,
	BudgetEntryGetResponse,
	Transaction as TransactionDto,
	TransactionGetRequest,
	TransactionGetResponse,
	TransactionMetadata,
	TransactionUser as TransactionUserDto,
} from "../../../shared-types";
import type { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import {
	budgetEntries,
	expenseBudgetLinks,
	groupBudgets,
	transactionUsers,
	transactions,
} from "../db/schema/schema";
import { createErrorResponse, createJsonResponse, withAuth } from "../utils";

type DbInstance = ReturnType<typeof getDb>;

type TransactionRow = typeof transactions.$inferSelect;
type BudgetEntryRow = typeof budgetEntries.$inferSelect;

// Transform a Drizzle transactions row to the wire-format Transaction.
function toTransactionDto(row: TransactionRow): TransactionDto {
	const defaultMetadata: TransactionMetadata = {
		owedAmounts: {},
		paidByShares: {},
		owedToAmounts: {},
	};
	const metadata = row.metadata || defaultMetadata;
	return {
		description: row.description,
		amount: row.amount,
		created_at: row.createdAt,
		metadata: JSON.stringify(metadata),
		currency: row.currency,
		transaction_id: row.transactionId,
		group_id: row.groupId,
		deleted: row.deleted || undefined,
	};
}

// Transform a Drizzle budget_entries row to the BudgetEntry wire format.
function toBudgetEntryDto(
	row: BudgetEntryRow,
	groupId: string,
	budgetName: string,
): BudgetEntryDto {
	const price =
		row.price ||
		(row.amount >= 0
			? `+${row.amount.toFixed(2)}`
			: `${row.amount.toFixed(2)}`);
	return {
		id: row.budgetEntryId,
		description: row.description,
		addedTime: row.addedTime,
		price,
		amount: row.amount,
		name: budgetName,
		deleted: row.deleted || undefined,
		groupid: groupId,
		currency: row.currency,
	};
}

// Fetch transaction_users for a transaction with first_name joined.
async function fetchTransactionUsers(
	db: DbInstance,
	transactionId: string,
	groupId: string,
): Promise<TransactionUserDto[]> {
	const rows = await db
		.select({
			transactionId: transactionUsers.transactionId,
			userId: transactionUsers.userId,
			amount: transactionUsers.amount,
			owedToUserId: transactionUsers.owedToUserId,
			groupId: transactionUsers.groupId,
			currency: transactionUsers.currency,
			deleted: transactionUsers.deleted,
			firstName: user.firstName,
		})
		.from(transactionUsers)
		.innerJoin(user, eq(user.id, transactionUsers.userId))
		.where(
			and(
				eq(transactionUsers.transactionId, transactionId),
				eq(transactionUsers.groupId, groupId),
				isNull(transactionUsers.deleted),
			),
		);

	return rows.map((r) => ({
		transaction_id: r.transactionId,
		user_id: r.userId,
		amount: r.amount,
		owed_to_user_id: r.owedToUserId,
		group_id: r.groupId,
		currency: r.currency,
		deleted: r.deleted || undefined,
		first_name: r.firstName,
	}));
}

// Fetch the linked, non-deleted budget entry sibling (if any).
async function fetchLinkedBudgetEntry(
	db: DbInstance,
	transactionId: string,
): Promise<BudgetEntryDto | undefined> {
	const rows = await db
		.select({
			row: budgetEntries,
			groupId: groupBudgets.groupId,
			budgetName: groupBudgets.budgetName,
		})
		.from(expenseBudgetLinks)
		.innerJoin(
			budgetEntries,
			eq(budgetEntries.budgetEntryId, expenseBudgetLinks.budgetEntryId),
		)
		.innerJoin(groupBudgets, eq(groupBudgets.id, budgetEntries.budgetId))
		.where(
			and(
				eq(expenseBudgetLinks.transactionId, transactionId),
				isNull(budgetEntries.deleted),
			),
		)
		.limit(1);

	if (rows.length === 0) return undefined;
	const { row, groupId, budgetName } = rows[0];
	return toBudgetEntryDto(row, groupId, budgetName);
}

// Fetch the linked, non-deleted transaction sibling (if any) plus its
// transaction_users.
async function fetchLinkedTransaction(
	db: DbInstance,
	budgetEntryId: string,
): Promise<
	| { transaction: TransactionDto; transactionUsers: TransactionUserDto[] }
	| undefined
> {
	const rows = await db
		.select()
		.from(expenseBudgetLinks)
		.innerJoin(
			transactions,
			eq(transactions.transactionId, expenseBudgetLinks.transactionId),
		)
		.where(
			and(
				eq(expenseBudgetLinks.budgetEntryId, budgetEntryId),
				isNull(transactions.deleted),
			),
		)
		.limit(1);

	if (rows.length === 0) return undefined;
	const txRow = rows[0].transactions;
	const tx = toTransactionDto(txRow);
	const tu = await fetchTransactionUsers(db, txRow.transactionId, txRow.groupId);
	return { transaction: tx, transactionUsers: tu };
}

// GET-by-id for transactions: returns the transaction (group-scoped),
// its transaction_users, and a linked budget entry when one exists.
export async function handleTransactionGet(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}
	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Not Found", 404, request, env);
			}
			const body = (await request.json()) as TransactionGetRequest;
			if (!body || typeof body.id !== "string" || body.id.length === 0) {
				return createErrorResponse("Invalid id", 400, request, env);
			}
			const groupId = String(session.group.groupid);

			const txRows = await db
				.select()
				.from(transactions)
				.where(
					and(
						eq(transactions.transactionId, body.id),
						eq(transactions.groupId, groupId),
						isNull(transactions.deleted),
					),
				)
				.limit(1);

			if (txRows.length === 0) {
				// 404 (not 401) for cross-group / non-existent so we don't leak.
				return createErrorResponse("Not Found", 404, request, env);
			}

			const transaction = toTransactionDto(txRows[0]);
			const tu = await fetchTransactionUsers(db, body.id, groupId);
			const linkedBudgetEntry = await fetchLinkedBudgetEntry(db, body.id);

			const responseBody: TransactionGetResponse = {
				transaction,
				transactionUsers: tu,
				linkedBudgetEntry,
			};
			return createJsonResponse(responseBody, 200, {}, request, env);
		});
	} catch (error) {
		console.error("transaction_get error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}

// GET-by-id for budget entries: returns the budget entry (group-scoped via
// group_budgets.groupId), and a linked transaction (with its transaction_users)
// when one exists.
export async function handleBudgetEntryGet(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}
	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Not Found", 404, request, env);
			}
			const body = (await request.json()) as BudgetEntryGetRequest;
			if (!body || typeof body.id !== "string" || body.id.length === 0) {
				return createErrorResponse("Invalid id", 400, request, env);
			}
			const groupId = String(session.group.groupid);

			const beRows = await db
				.select({
					row: budgetEntries,
					groupId: groupBudgets.groupId,
					budgetName: groupBudgets.budgetName,
				})
				.from(budgetEntries)
				.innerJoin(groupBudgets, eq(groupBudgets.id, budgetEntries.budgetId))
				.where(
					and(
						eq(budgetEntries.budgetEntryId, body.id),
						eq(groupBudgets.groupId, groupId),
						isNull(budgetEntries.deleted),
					),
				)
				.limit(1);

			if (beRows.length === 0) {
				return createErrorResponse("Not Found", 404, request, env);
			}

			const { row, groupId: beGroupId, budgetName } = beRows[0];
			const budgetEntry = toBudgetEntryDto(row, beGroupId, budgetName);

			const linked = await fetchLinkedTransaction(db, body.id);

			const responseBody: BudgetEntryGetResponse = {
				budgetEntry,
				linkedTransaction: linked?.transaction,
				linkedTransactionUsers: linked?.transactionUsers,
			};
			return createJsonResponse(responseBody, 200, {}, request, env);
		});
	} catch (error) {
		console.error("budget_entry_get error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}
