import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type {
	SplitDeleteRequest,
	SplitRequest,
	Transaction,
	TransactionMetadata,
	TransactionsListRequest,
	TransactionUser,
} from "../../../shared-types";
import type { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import { transactions, transactionUsers } from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	formatSQLiteTime,
	generateDrizzleBalanceUpdates,
	withAuth,
} from "../utils";
import { createSplitTransactionFromRequest } from "../utils/scheduled-action-execution";

// Helper function to create split transaction
async function createSplitTransactionHandler(
	body: SplitRequest,
	groupId: string,
	db: ReturnType<typeof getDb>,
	env: Env,
): Promise<{ message: string; transactionId: string }> {
	const transactionId = `tx_${ulid()}`;

	const result = await createSplitTransactionFromRequest(
		body,
		groupId,
		db,
		env,
		transactionId,
	);

	// Execute all statements in a single batch
	if (result.statements.length > 0) {
		const queries = result.statements.map((stmt) => stmt.query);
		await db.batch([queries[0], ...queries.slice(1)]);
	}

	return {
		message: "Transaction created successfully",
		transactionId: result.transactionId,
	};
}

// Helper function to get transactions list
async function getTransactionsList(
	body: TransactionsListRequest,
	groupId: string,
	db: ReturnType<typeof getDb>,
): Promise<{
	transactions: Transaction[];
	transactionDetails: Record<string, TransactionUser[]>;
}> {
	// Get transactions list using Drizzle
	const rawTransactionsList = await db
		.select()
		.from(transactions)
		.where(and(eq(transactions.groupId, groupId), isNull(transactions.deleted)))
		.orderBy(desc(transactions.createdAt))
		.limit(10)
		.offset(body.offset);

	// Transform to match production format
	const transactionsList = transformTransactionsList(rawTransactionsList);

	// Get transaction details
	const transactionDetails = await getTransactionDetails(
		rawTransactionsList,
		groupId,
		db,
	);

	return { transactions: transactionsList, transactionDetails };
}

// Type for raw database transaction result (camelCase)
type TransactionDbResult = {
	description: string;
	amount: number;
	createdAt: string;
	metadata: TransactionMetadata | null;
	currency: string;
	transactionId: string;
	groupId: string;
	deleted: string | null;
};

// Helper function to transform transactions list
function transformTransactionsList(
	rawTransactionsList: TransactionDbResult[],
): Transaction[] {
	return rawTransactionsList.map((t) => {
		const defaultMetadata = {
			owedAmounts: {},
			paidByShares: {},
			owedToAmounts: {},
		};
		const metadata = t.metadata || defaultMetadata;

		return {
			description: t.description,
			amount: t.amount,
			created_at: t.createdAt,
			metadata: JSON.stringify(metadata),
			currency: t.currency,
			transaction_id: t.transactionId,
			group_id: t.groupId,
			deleted: t.deleted || undefined,
		};
	});
}

// Helper function to fetch transaction details from database
async function fetchTransactionDetailsFromDb(
	transactionIds: string[],
	groupId: string,
	db: ReturnType<typeof getDb>,
) {
	return await db
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
				inArray(transactionUsers.transactionId, transactionIds),
				eq(transactionUsers.groupId, groupId),
				isNull(transactionUsers.deleted),
			),
		);
}

// Type for raw database transaction user result (camelCase)
type TransactionUserDbResult = {
	transactionId: string;
	userId: string;
	amount: number;
	owedToUserId: string;
	groupId: string;
	currency: string;
	deleted: string | null;
	firstName: string;
};

// Helper function to group details by transaction ID
function groupDetailsByTransactionId(
	allDetails: TransactionUserDbResult[],
): Record<string, TransactionUser[]> {
	const transactionDetails: Record<string, TransactionUser[]> = {};

	for (const detail of allDetails) {
		if (!transactionDetails[detail.transactionId]) {
			transactionDetails[detail.transactionId] = [];
		}
		transactionDetails[detail.transactionId].push({
			transaction_id: detail.transactionId,
			user_id: detail.userId,
			amount: detail.amount,
			owed_to_user_id: detail.owedToUserId,
			group_id: detail.groupId,
			currency: detail.currency,
			deleted: detail.deleted || undefined,
			first_name: detail.firstName,
		});
	}

	return transactionDetails;
}

// Helper function to get transaction details
async function getTransactionDetails(
	rawTransactionsList: TransactionDbResult[],
	groupId: string,
	db: ReturnType<typeof getDb>,
): Promise<Record<string, TransactionUser[]>> {
	const transactionIds = rawTransactionsList.map((t) => t.transactionId);

	if (transactionIds.length === 0) {
		return {};
	}

	const allDetails = await fetchTransactionDetailsFromDb(
		transactionIds,
		groupId,
		db,
	);
	return groupDetailsByTransactionId(allDetails);
}

// Handle new split (direct database creation without Splitwise)
export async function handleSplitNew(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}
	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			const body = (await request.json()) as SplitRequest;

			try {
				const response = await createSplitTransactionHandler(
					body,
					session.group.groupid,
					db,
					env,
				);
				return createJsonResponse(response, 200, {}, request, env);
			} catch (error) {
				console.error("Split transaction error:", error);
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				return createErrorResponse(errorMessage, 400, request, env);
			}
		});
	} catch (error) {
		console.error("Split new error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}

// Handle split deletion
export async function handleSplitDelete(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}
	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}
			const body = (await request.json()) as SplitDeleteRequest;

			// Get transaction details for balance updates using Drizzle
			const transactionDetails = await db
				.select()
				.from(transactionUsers)
				.where(
					and(
						eq(transactionUsers.transactionId, body.id),
						eq(transactionUsers.groupId, session.group.groupid),
						isNull(transactionUsers.deleted),
					),
				);

			if (transactionDetails.length === 0) {
				return createErrorResponse("Transaction not found", 404, request, env);
			}

			const deletedTime = formatSQLiteTime();

			// Prepare all statements for single batch operation
			const deleteTransaction = db
				.update(transactions)
				.set({ deleted: deletedTime })
				.where(
					and(
						eq(transactions.transactionId, body.id),
						eq(transactions.groupId, session.group.groupid),
					),
				);

			const deleteTransactionUsers = db
				.update(transactionUsers)
				.set({ deleted: deletedTime })
				.where(
					and(
						eq(transactionUsers.transactionId, body.id),
						eq(transactionUsers.groupId, session.group.groupid),
					),
				);

			// Generate balance updates using Drizzle (remove the amounts)
			const splitAmounts = transactionDetails.map((detail) => ({
				user_id: detail.userId,
				amount: detail.amount,
				owed_to_user_id: detail.owedToUserId,
				currency: detail.currency,
			}));

			const balanceUpdates = generateDrizzleBalanceUpdates(
				env,
				splitAmounts,
				session.group.groupid,
				"remove",
			);

			// Execute all statements in a single batch
			await db.batch([
				deleteTransaction,
				deleteTransactionUsers,
				...balanceUpdates,
			]);

			return createJsonResponse(
				{
					message: "Transaction deleted successfully",
				},
				200,
				{},
				request,
				env,
			);
		});
	} catch (error) {
		console.error("Split delete error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}

// Handle transactions list
export async function handleTransactionsList(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Method not allowed", 405, request, env);
	}
	try {
		return withAuth(request, env, async (session, db) => {
			if (!session.group) {
				return createErrorResponse("Unauthorized", 401, request, env);
			}

			const body = (await request.json()) as TransactionsListRequest;
			const response = await getTransactionsList(
				body,
				session.group.groupid,
				db,
			);

			return createJsonResponse(response, 200, {}, request, env);
		});
	} catch (error) {
		console.error("Transactions list error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}
