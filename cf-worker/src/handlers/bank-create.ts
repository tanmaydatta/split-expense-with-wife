import { user } from "../db/schema/auth-schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { ulid } from "ulid";
import { z } from "zod";
import {
	bankConnections,
	bankTransactions,
	expenseBudgetLinks,
	groupBudgets,
} from "../db/schema/schema";
import { createErrorResponse, createJsonResponse, withAuth } from "../utils";
import { bankingEnabled, bankProvider } from "../utils/bank-registry";
import { currencyScale } from "../utils/bank-provider";
import { acquireBankLease, releaseBankLease } from "../utils/bank-sync";
import {
	createBudgetEntryStatements,
	createSplitTransactionFromRequest,
} from "../utils/scheduled-action-execution";
const Input = z
	.object({
		bankSource: z.object({
			bankTransactionId: z.string().min(1).max(500),
			sourceVersion: z.number().int().nonnegative(),
		}),
		expense: z
			.object({
				description: z.string().trim().min(1).max(255),
				amount: z.number().positive(),
				currency: z.string(),
				paidByShares: z.record(z.string(), z.number().nonnegative()),
				splitPctShares: z.record(z.string(), z.number().min(0).max(100)),
			})
			.optional(),
		budget: z
			.object({
				description: z.string().trim().min(1).max(100),
				amount: z.number().finite(),
				currency: z.string(),
				budgetId: z.string().min(1),
			})
			.optional(),
	})
	.refine((v) => v.expense || v.budget);
export async function handleBankDashboardCreate(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env))
		return createErrorResponse(
			"Bank imports are not configured",
			503,
			request,
			env,
		);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: source and ledger guards protect one all-or-nothing financial batch.
	return withAuth(request, env, async (session, db) => {
		const parsed = Input.safeParse(await request.json());
		if (!parsed.success || !session.group)
			return createErrorResponse("Invalid bank form", 400, request, env);
		const body = parsed.data;
		const groupId = session.group.groupid;
		const bank = (
			await db
				.select()
				.from(bankTransactions)
				.where(
					and(
						eq(bankTransactions.id, body.bankSource.bankTransactionId),
						eq(bankTransactions.userId, session.user.id),
					),
				)
				.limit(1)
		)[0];
		const connection = bank
			? (
					await db
						.select()
						.from(bankConnections)
						.where(
							and(
								eq(bankConnections.id, bank.connectionId),
								eq(bankConnections.groupId, groupId),
							),
						)
						.limit(1)
				)[0]
			: null;
		if (!bank || !connection || !bankProvider(connection.provider).enabled(env))
			return createErrorResponse(
				"Bank activity unavailable",
				404,
				request,
				env,
			);
		if (
			bank.pending ||
			bank.removedAt ||
			bank.reviewStatus === "ignored" ||
			bank.rowVersion !== body.bankSource.sourceVersion
		)
			return createErrorResponse(
				"Activity changed. Return to review before saving.",
				409,
				request,
				env,
			);
		if (
			(body.expense && bank.linkedTransactionId) ||
			(body.budget && bank.linkedBudgetEntryId)
		)
			return createErrorResponse(
				"This side is already associated. No duplicate was created.",
				409,
				request,
				env,
			);
		const amount = bank.amountMinor / currencyScale(bank.currency);
		if (
			(body.expense &&
				(amount <= 0 ||
					body.expense.amount !== amount ||
					body.expense.currency !== bank.currency)) ||
			(body.budget &&
				(body.budget.amount !== -amount ||
					body.budget.currency !== bank.currency))
		)
			return createErrorResponse(
				"Amount, currency and direction must match the bank source",
				400,
				request,
				env,
			);
		if (body.budget) {
			const budget = (
				await db
					.select()
					.from(groupBudgets)
					.where(
						and(
							eq(groupBudgets.id, body.budget.budgetId),
							eq(groupBudgets.groupId, groupId),
							isNull(groupBudgets.deleted),
						),
					)
					.limit(1)
			)[0];
			if (!budget)
				return createErrorResponse("Budget unavailable", 400, request, env);
		}
		if (body.expense) {
			const members = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.groupid, groupId));
			const ids = new Set(members.map((u) => u.id));
			if (
				[
					...Object.keys(body.expense.paidByShares),
					...Object.keys(body.expense.splitPctShares),
				].some((id) => !ids.has(id))
			)
				return createErrorResponse(
					"Choose current group members",
					400,
					request,
					env,
				);
		}
		const lease = await acquireBankLease(db, connection.id).catch(() => null);
		if (!lease)
			return createErrorResponse("Bank sync is in progress", 409, request, env);
		try {
			const transactionId = body.expense
				? `tx_${ulid()}`
				: bank.linkedTransactionId;
			const budgetEntryId = body.budget
				? `bge_${ulid()}`
				: bank.linkedBudgetEntryId;
			// Creating a missing side cannot rewrite existing historical pairings.
			if (transactionId && budgetEntryId) {
				const conflicts = await env.DB.prepare(
					"SELECT id FROM expense_budget_links WHERE transaction_id=? OR budget_entry_id=? LIMIT 1",
				)
					.bind(transactionId, budgetEntryId)
					.first();
				if (conflicts)
					return createErrorResponse(
						"Existing record has another association. Choose existing compatible records instead.",
						409,
						request,
						env,
					);
			}
			const financial: BatchItem<"sqlite">[] = [];
			const timestamp = `${bank.date} 00:00:00`;
			if (body.expense) {
				const result = await createSplitTransactionFromRequest(
					{ ...body.expense, amount, currency: bank.currency },
					groupId,
					db,
					env,
					transactionId as string,
					timestamp,
				);
				financial.push(...result.statements.map((s) => s.query));
			}
			if (body.budget) {
				const result = await createBudgetEntryStatements(
					{
						...body.budget,
						amount: -amount,
						currency: bank.currency,
						groupid: groupId,
					},
					db,
					budgetEntryId as string,
					timestamp,
				);
				financial.push(...result.statements.map((s) => s.query));
			}
			const ledgerGuards = [
				sql`EXISTS(SELECT 1 FROM bank_connections WHERE id=${connection.id} AND user_id=${session.user.id} AND group_id=${groupId} AND sync_lock=${lease.syncLock})`,
				sql`${bankTransactions.reviewStatus} <> 'ignored'`,
			];
			if (bank.linkedTransactionId)
				ledgerGuards.push(
					sql`EXISTS(SELECT 1 FROM transactions WHERE transaction_id=${bank.linkedTransactionId} AND group_id=${groupId} AND deleted IS NULL AND currency=${bank.currency} AND round(amount * ${currencyScale(bank.currency)})=${bank.amountMinor})`,
				);
			if (bank.linkedBudgetEntryId)
				ledgerGuards.push(
					sql`EXISTS(SELECT 1 FROM budget_entries b JOIN group_budgets g ON g.id=b.budget_id WHERE b.budget_entry_id=${bank.linkedBudgetEntryId} AND g.group_id=${groupId} AND b.deleted IS NULL AND g.deleted IS NULL AND b.currency=${bank.currency} AND round(b.amount * ${currencyScale(bank.currency)})=${-bank.amountMinor})`,
				);
			if (body.budget)
				ledgerGuards.push(
					sql`EXISTS(SELECT 1 FROM group_budgets WHERE id=${body.budget.budgetId} AND group_id=${groupId} AND deleted IS NULL)`,
				);
			if (transactionId && budgetEntryId)
				ledgerGuards.push(
					sql`NOT EXISTS(SELECT 1 FROM expense_budget_links WHERE transaction_id=${transactionId} OR budget_entry_id=${budgetEntryId})`,
				);
			const claim = db
				.update(bankTransactions)
				.set({
					linkedTransactionId: transactionId,
					linkedBudgetEntryId: budgetEntryId,
					reviewStatus: "created",
					rowVersion: sql`${bankTransactions.rowVersion}+1`,
					updatedAt: new Date().toISOString(),
				})
				.where(
					and(
						eq(bankTransactions.id, bank.id),
						eq(bankTransactions.userId, session.user.id),
						eq(bankTransactions.rowVersion, bank.rowVersion),
						...ledgerGuards,
						eq(bankTransactions.pending, false),
						isNull(bankTransactions.removedAt),
						sql`${bankTransactions.linkedTransactionId} IS ${bank.linkedTransactionId}`,
						sql`${bankTransactions.linkedBudgetEntryId} IS ${bank.linkedBudgetEntryId}`,
						sql`EXISTS(SELECT 1 FROM bank_connections WHERE id=${connection.id} AND sync_lock=${lease.syncLock})`,
					),
				);
			const batch: BatchItem<"sqlite">[] = [
				claim,
				db.run(
					sql.raw(
						"SELECT CASE WHEN changes()=1 THEN 1 ELSE json('bank-create-claim-failed') END",
					),
				),
				...financial,
			];
			if (transactionId && budgetEntryId)
				batch.push(
					db.insert(expenseBudgetLinks).values({
						id: ulid(),
						transactionId,
						budgetEntryId,
						groupId,
						createdAt: new Date().toISOString(),
					}),
				);
			await db.batch(batch as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
			return createJsonResponse(
				{
					message: "Saved and associated with bank activity",
					transactionId,
					budgetEntryId,
				},
				200,
				{},
				request,
				env,
			);
		} catch {
			return createErrorResponse(
				"Could not save. Refresh review; no partial record was created.",
				409,
				request,
				env,
			);
		} finally {
			await releaseBankLease(db, lease);
		}
	});
}
