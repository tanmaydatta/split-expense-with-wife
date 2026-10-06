import { and, eq, isNull, lt, or } from "drizzle-orm";
import { ulid } from "ulid";
import type { getDb } from "../db";
import {
	bankAccounts,
	bankConnections,
	bankTransactions,
} from "../db/schema/schema";
import { bankProvider } from "./bank-registry";
import { BankProviderError } from "./bank-provider";
import type { BankConnection, ImportedAccount } from "./bank-provider";
type Db = ReturnType<typeof getDb>;
export async function acquireBankLease(
	db: Db,
	id: string,
): Promise<BankConnection & { syncLock: string }> {
	const started = Date.now();
	const lock = ulid();
	const rows = await db
		.update(bankConnections)
		.set({ syncLock: lock, syncLockExpiresAt: started + 300000 })
		.where(
			and(
				eq(bankConnections.id, id),
				or(
					isNull(bankConnections.syncLock),
					lt(bankConnections.syncLockExpiresAt, started),
				),
			),
		)
		.returning();
	if (!rows[0]) throw new BankProviderError("busy");
	return { ...rows[0], syncLock: lock };
}
export async function releaseBankLease(
	db: Db,
	connection: BankConnection & { syncLock: string },
): Promise<void> {
	await db
		.update(bankConnections)
		.set({ syncLock: null, syncLockExpiresAt: null })
		.where(
			and(
				eq(bankConnections.id, connection.id),
				eq(bankConnections.syncLock, connection.syncLock),
			),
		);
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lease-conditional metadata refresh and availability are one ordered operation.
export async function refreshBankAccounts(
	env: Env,
	db: Db,
	input: { id: string },
): Promise<void> {
	const connection = await acquireBankLease(db, input.id);
	try {
		const adapter = bankProvider(connection.provider);
		if (connection.status === "disconnected" || !adapter.enabled(env))
			throw new BankProviderError("unavailable");
		const accounts = await adapter.accounts(env, connection);
		const current = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, connection.id),
						eq(bankConnections.syncLock, connection.syncLock),
					),
				)
		)[0];
		if (!current) throw new BankProviderError("busy");
		const writes: D1PreparedStatement[] = [];
		for (const account of accounts) {
			writes.push(
				env.DB.prepare(`INSERT INTO bank_accounts
    (id, connection_id, provider_account_id, name, mask, type, subtype, status, currency, institution_name, selected)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0 WHERE EXISTS (SELECT 1 FROM bank_connections WHERE id = ? AND sync_lock = ?)
    ON CONFLICT(id) DO UPDATE SET provider_account_id = excluded.provider_account_id,
    name = excluded.name, mask = excluded.mask, type = excluded.type, subtype = excluded.subtype,
    status = excluded.status, currency = excluded.currency, institution_name = excluded.institution_name
    WHERE EXISTS (SELECT 1 FROM bank_connections WHERE id = ? AND sync_lock = ?)`).bind(
					`${connection.id}:${account.id}`,
					connection.id,
					account.id,
					account.name,
					account.mask,
					account.type,
					account.subtype,
					account.status,
					account.currency,
					account.institutionName,
					connection.id,
					connection.syncLock,
					connection.id,
					connection.syncLock,
				),
			);
		}
		const available = new Set(accounts.map((account) => account.id));
		const stored = await db
			.select()
			.from(bankAccounts)
			.where(eq(bankAccounts.connectionId, connection.id));
		for (const account of stored)
			if (
				!available.has(
					account.providerAccountId ||
						account.id.slice(connection.id.length + 1),
				)
			) {
				writes.push(
					env.DB.prepare(`UPDATE bank_accounts SET status = 'UNAVAILABLE' WHERE id = ? AND EXISTS
    (SELECT 1 FROM bank_connections WHERE id = ? AND sync_lock = ?)`).bind(
						account.id,
						connection.id,
						connection.syncLock,
					),
				);
			}
		for (let index = 0; index < writes.length; index += 100)
			await env.DB.batch(writes.slice(index, index + 100));
	} catch (error) {
		await db
			.update(bankConnections)
			.set({
				status:
					error instanceof BankProviderError && error.code === "reauthorize"
						? "needs_attention"
						: connection.status,
				lastError:
					error instanceof BankProviderError ? error.code : "unavailable",
				updatedAt: new Date().toISOString(),
			})
			.where(
				and(
					eq(bankConnections.id, connection.id),
					eq(bankConnections.syncLock, connection.syncLock),
				),
			);
		throw error;
	} finally {
		await releaseBankLease(db, connection);
	}
}
function providerAccounts(
	rows: Array<typeof bankAccounts.$inferSelect>,
	connection: BankConnection,
): ImportedAccount[] {
	return rows.map((row) => ({
		...row,
		id: row.providerAccountId || row.id.slice(connection.id.length + 1),
	}));
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the lease, snapshot and cursor form one ordered sync operation.
export async function syncBankConnection(
	env: Env,
	db: Db,
	input: { id: string },
): Promise<{ added: number; modified: number; removed: number }> {
	const started = Date.now();
	const connection = await acquireBankLease(db, input.id);
	const lock = connection.syncLock;
	try {
		const adapter = bankProvider(connection.provider);
		if (connection.status === "disconnected" || !adapter.enabled(env))
			throw new BankProviderError("unavailable");
		const selected = await db
			.select()
			.from(bankAccounts)
			.where(
				and(
					eq(bankAccounts.connectionId, connection.id),
					eq(bankAccounts.selected, true),
				),
			);
		if (!selected.length) return { added: 0, modified: 0, removed: 0 };
		const changes = await adapter.changes(
			env,
			connection,
			providerAccounts(selected, connection),
		);
		if (Date.now() - started > 240000)
			throw new BankProviderError("unavailable");
		const current = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, connection.id),
						eq(bankConnections.syncLock, lock),
					),
				)
		)[0];
		if (!current) throw new BankProviderError("busy");
		const selectedIds = new Set(selected.map((row) => row.id));
		const now = new Date().toISOString();
		const rowId = (accountId: string, transactionId: string) =>
			connection.provider === "lunch_flow"
				? `${connection.id}:${encodeURIComponent(accountId)}:${encodeURIComponent(transactionId)}`
				: `${connection.id}:${transactionId}`;
		for (const snapshot of changes.snapshots ?? []) {
			const prior = await db
				.select()
				.from(bankTransactions)
				.where(
					and(
						eq(bankTransactions.connectionId, connection.id),
						eq(
							bankTransactions.accountId,
							`${connection.id}:${snapshot.accountId}`,
						),
					),
				);
			const present = new Set(
				snapshot.transactionIds.map((id) => rowId(snapshot.accountId, id)),
			);
			for (const row of prior)
				if (
					row.date >= snapshot.from &&
					row.date <= snapshot.to &&
					!present.has(row.id) &&
					!row.removedAt
				)
					changes.removed.push(row.id.slice(connection.id.length + 1));
		}
		const priorRows = await db
			.select()
			.from(bankTransactions)
			.where(eq(bankTransactions.connectionId, connection.id));
		const existingById = new Map(priorRows.map((row) => [row.id, row]));
		let addedCount = 0;
		let modifiedCount = 0;
		let removedCount = 0;
		const statements: D1PreparedStatement[] = [];
		if (
			changes.added.length + changes.modified.length + changes.removed.length >
			10000
		)
			throw new BankProviderError("invalid_data");
		for (const row of [...changes.added, ...changes.modified]) {
			const accountId = `${connection.id}:${row.accountId}`;
			if (!selectedIds.has(accountId)) continue;
			const existing = existingById.get(rowId(row.accountId, row.id));
			const changed =
				!!existing &&
				(existing.amountMinor !== row.amountMinor ||
					existing.currency !== row.currency ||
					existing.date !== row.date ||
					existing.name !== row.name ||
					existing.merchantName !== row.merchantName ||
					existing.pending !== row.pending ||
					!!existing.removedAt);
			if (!existing) addedCount++;
			else if (changed) modifiedCount++;
			existingById.set(rowId(row.accountId, row.id), {
				...existing,
				...row,
				amountMinor: row.amountMinor,
				removedAt: null,
			} as typeof bankTransactions.$inferSelect);

			statements.push(
				env.DB.prepare(`INSERT INTO bank_transactions
    (id, connection_id, user_id, account_id, provider_transaction_id, date, name, merchant_name, amount_minor, raw_amount_minor, currency, pending, pending_transaction_id, removed_at, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?
    WHERE EXISTS (SELECT 1 FROM bank_connections WHERE id = ? AND sync_lock = ?)
    ON CONFLICT(id) DO UPDATE SET
     source_changed = CASE WHEN (bank_transactions.review_status <> 'unreviewed' OR bank_transactions.linked_transaction_id IS NOT NULL) AND
      (bank_transactions.amount_minor <> excluded.amount_minor OR bank_transactions.currency <> excluded.currency OR
       bank_transactions.date <> excluded.date OR bank_transactions.name <> excluded.name OR
       bank_transactions.pending <> excluded.pending OR bank_transactions.removed_at IS NOT NULL)
      THEN 1 ELSE bank_transactions.source_changed END,
     account_id = excluded.account_id, provider_transaction_id = excluded.provider_transaction_id,
     date = excluded.date, name = excluded.name, merchant_name = excluded.merchant_name,
     amount_minor = excluded.amount_minor, raw_amount_minor = excluded.raw_amount_minor, currency = excluded.currency, pending = excluded.pending,
     pending_transaction_id = excluded.pending_transaction_id, removed_at = NULL, updated_at = excluded.updated_at
    WHERE EXISTS (SELECT 1 FROM bank_connections WHERE id = ? AND sync_lock = ?)`).bind(
					rowId(row.accountId, row.id),
					connection.id,
					connection.userId,
					accountId,
					row.id,
					row.date,
					row.name,
					row.merchantName,
					row.amountMinor,
					row.rawAmountMinor ?? null,
					row.currency,
					Number(row.pending),
					row.pendingTransactionId,
					now,
					now,
					connection.id,
					lock,
					connection.id,
					lock,
				),
			);
			if (row.pendingTransactionId)
				changes.removed.push(row.pendingTransactionId);
		}
		for (const id of new Set(changes.removed)) {
			const prior = existingById.get(`${connection.id}:${id}`);
			if (prior && !prior.removedAt) removedCount++;
			statements.push(
				env.DB.prepare(`UPDATE bank_transactions SET removed_at = ?, updated_at = ?,
    source_changed = CASE WHEN review_status <> 'unreviewed' THEN 1 ELSE source_changed END
    WHERE id = ? AND connection_id = ? AND EXISTS (SELECT 1 FROM bank_connections WHERE id = ? AND sync_lock = ?)`).bind(
					now,
					now,
					`${connection.id}:${id}`,
					connection.id,
					connection.id,
					lock,
				),
			);
		}
		// Each batch is atomic and every statement checks the lease. A late retry cannot overwrite a newer owner.
		for (let index = 0; index < statements.length; index += 100)
			await env.DB.batch(statements.slice(index, index + 100));
		const updated = await db
			.update(bankConnections)
			.set({
				cursor: changes.cursor,
				status: selected.some((account) => account.status !== "ACTIVE")
					? "needs_attention"
					: "connected",
				lastSyncedAt: now,
				lastError: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(bankConnections.id, connection.id),
					eq(bankConnections.syncLock, lock),
				),
			)
			.returning({ id: bankConnections.id });
		if (!updated.length) throw new BankProviderError("busy");
		return {
			added: addedCount,
			modified: modifiedCount,
			removed: removedCount,
		};
	} catch (error) {
		const attention =
			(error instanceof BankProviderError && error.code === "reauthorize") ||
			(error instanceof Error && error.message.includes("ITEM_LOGIN_REQUIRED"));
		await db
			.update(bankConnections)
			.set({
				status: attention ? "needs_attention" : connection.status,
				lastError: attention
					? "reauthorize"
					: error instanceof BankProviderError
						? error.code
						: "unavailable",
				updatedAt: new Date().toISOString(),
			})
			.where(
				and(
					eq(bankConnections.id, connection.id),
					eq(bankConnections.syncLock, lock),
				),
			);
		throw error;
	} finally {
		await releaseBankLease(db, connection);
	}
}
