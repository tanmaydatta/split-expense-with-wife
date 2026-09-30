import { and, eq, isNull } from "drizzle-orm";
import type { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions } from "../db/schema/schema";
import { decryptPlaidToken, plaidRequest } from "./plaid";

type Db = ReturnType<typeof getDb>;
type Connection = typeof bankConnections.$inferSelect;

type PlaidAccount = { account_id: string; name: string; mask: string | null; type: string; subtype: string | null };
type PlaidTransaction = {
	transaction_id: string;
	account_id: string;
	date: string;
	name: string;
	merchant_name: string | null;
	amount: number;
	iso_currency_code: string | null;
	unofficial_currency_code: string | null;
	pending: boolean;
	pending_transaction_id: string | null;
};
type SyncPage = {
	added: PlaidTransaction[];
	modified: PlaidTransaction[];
	removed: Array<{ transaction_id: string }>;
	has_more: boolean;
	next_cursor: string;
};

function minorUnits(amount: number, currency: string): number {
	if (!Number.isFinite(amount)) throw new Error("Invalid Plaid amount");
	return Math.round(amount * (currency === "JPY" ? 1 : 100));
}

export async function refreshBankAccounts(env: Env, db: Db, connection: Connection): Promise<void> {
	const access_token = await decryptPlaidToken(env, connection.accessTokenEncrypted);
	const result = await plaidRequest<{ accounts: PlaidAccount[] }>(env, "/accounts/get", { access_token });
	for (const account of result.accounts) {
		await db.insert(bankAccounts).values({
			id: account.account_id, connectionId: connection.id, name: account.name,
			mask: account.mask, type: account.type, subtype: account.subtype, selected: true,
		}).onConflictDoUpdate({ target: bankAccounts.id, set: {
			name: account.name, mask: account.mask, type: account.type, subtype: account.subtype,
		}});
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cursor, retry, and persistence must be reviewed as one ordered flow
export async function syncBankConnection(env: Env, db: Db, connection: Connection): Promise<{ added: number; modified: number; removed: number }> {
	if (connection.status === "disconnected") throw new Error("Bank connection is disconnected");
	const access_token = await decryptPlaidToken(env, connection.accessTokenEncrypted);
	const initialCursor = connection.cursor;
	let cursor = initialCursor;
	let added: PlaidTransaction[] = [];
	let modified: PlaidTransaction[] = [];
	let removed: Array<{ transaction_id: string }> = [];
	let pages = 0;
	let restarts = 0;
	while (true) {
		let page: SyncPage;
		try {
			page = await plaidRequest<SyncPage>(env, "/transactions/sync", { access_token, cursor, count: 500 });
		} catch (error) {
			if (error instanceof Error && error.message.includes("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") && restarts < 2) {
				cursor = initialCursor;
				added = []; modified = []; removed = []; pages = 0; restarts++;
				continue;
			}
			if (error instanceof Error && error.message.includes("ITEM_LOGIN_REQUIRED")) {
				await db.update(bankConnections).set({ status: "needs_attention", updatedAt: new Date().toISOString() })
					.where(eq(bankConnections.id, connection.id));
			}
			throw error;
		}
		added.push(...page.added);
		modified.push(...page.modified);
		removed.push(...page.removed);
		cursor = page.next_cursor;
		pages++;
		if (!page.has_more) break;
		if (pages >= 100) throw new Error("Plaid sync exceeded page limit; cursor was not advanced");
	}

	// Row writes are idempotent. The cursor advances only after all updates succeed.
	const now = new Date().toISOString();
	for (const transaction of [...added, ...modified]) {
		const currency = transaction.iso_currency_code ?? transaction.unofficial_currency_code;
		if (!currency) continue;
		const fields = {
			accountId: transaction.account_id, date: transaction.date,
			name: transaction.name, merchantName: transaction.merchant_name,
			amountMinor: minorUnits(transaction.amount, currency), currency,
			pending: transaction.pending, pendingTransactionId: transaction.pending_transaction_id,
			removedAt: null, updatedAt: now,
		};
		await db.insert(bankTransactions).values({ id: transaction.transaction_id,
			connectionId: connection.id, userId: connection.userId, ...fields, createdAt: now })
			.onConflictDoUpdate({ target: bankTransactions.id, set: fields });
		if (transaction.pending_transaction_id) {
			await db.update(bankTransactions).set({ removedAt: now, updatedAt: now })
				.where(and(eq(bankTransactions.id, transaction.pending_transaction_id), eq(bankTransactions.connectionId, connection.id)));
		}
	}
	for (const transaction of removed) {
		await db.update(bankTransactions).set({ removedAt: now, updatedAt: now })
			.where(and(eq(bankTransactions.id, transaction.transaction_id), eq(bankTransactions.connectionId, connection.id)));
	}
	await db.update(bankConnections).set({ cursor, status: "connected", updatedAt: now })
		.where(and(eq(bankConnections.id, connection.id), initialCursor === null ? isNull(bankConnections.cursor) : eq(bankConnections.cursor, initialCursor)));
	return { added: added.length, modified: modified.length, removed: removed.length };
}
