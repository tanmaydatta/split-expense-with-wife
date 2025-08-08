import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import type {
	SplitDeleteRequest,
	SplitRequest,
	TransactionsListRequest,
	TransactionUser,
} from "../../../shared-types";
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

			// Generate unique transaction ID using ULID for regular handler
			const transactionId = ulid();

			try {
				// Use the reusable utility function
				const result = await createSplitTransactionFromRequest(
					body,
					session.group.groupid,
					db,
					env,
					transactionId,
				);

				// Execute all statements in a single batch
				if (result.statements.length > 0) {
					const queries = result.statements.map((stmt) => stmt.query);
					await db.batch([queries[0], ...queries.slice(1)]);
				}

				const response = {
					message: "Transaction created successfully",
					transactionId: result.transactionId,
				};

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

			// Get transactions list using Drizzle
			const rawTransactionsList = await db
				.select()
				.from(transactions)
				.where(
					and(
						eq(transactions.groupId, session.group.groupid),
						isNull(transactions.deleted),
					),
				)
				.orderBy(desc(transactions.createdAt))
				.limit(10)
				.offset(body.offset);

			// Transform to match production format (snake_case field names, no id field)
			const transactionsList = rawTransactionsList.map((t) => {
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
					metadata: JSON.stringify(metadata), // Convert to JSON string as expected by frontend
					currency: t.currency,
					transaction_id: t.transactionId,
					group_id: t.groupId,
					deleted: t.deleted,
				};
			});

			// Get transaction details for all transactions
			const transactionIds = rawTransactionsList
				.map((t) => t.transactionId)
				.filter((id): id is string => id !== null);
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
						firstName: user.firstName,
					})
					.from(transactionUsers)
					.innerJoin(user, eq(user.id, transactionUsers.userId))
					.where(
						and(
							inArray(transactionUsers.transactionId, transactionIds),
							eq(transactionUsers.groupId, session.group.groupid),
							isNull(transactionUsers.deleted),
						),
					);

				// Group details by transaction ID
				for (const detail of allDetails) {
					if (!transactionDetails[detail.transactionId]) {
						transactionDetails[detail.transactionId] = [];
					}
					transactionDetails[detail.transactionId].push({
						transaction_id: detail.transactionId || "",
						user_id: detail.userId,
						amount: detail.amount,
						owed_to_user_id: detail.owedToUserId,
						group_id: detail.groupId,
						currency: detail.currency,
						deleted: detail.deleted || undefined,
						first_name: detail.firstName || undefined,
					});
				}
			}

			const response = {
				transactions: transactionsList,
				transactionDetails,
			};

			return createJsonResponse(response, 200, {}, request, env);
		});
	} catch (error) {
		console.error("Transactions list error:", error);
		return createErrorResponse("Internal server error", 500, request, env);
	}
}
