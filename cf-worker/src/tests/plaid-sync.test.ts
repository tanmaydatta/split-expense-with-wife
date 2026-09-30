import { env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions, transactions } from "../db/schema/schema";
import { encryptPlaidToken } from "../utils/plaid";
import { syncBankConnection } from "../utils/plaid-sync";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase } from "./test-utils";

const env = { ...(testEnv as unknown as Env), PLAID_CLIENT_ID: "test-client", PLAID_SANDBOX_SECRET: "test-secret",
	PLAID_TOKEN_ENCRYPTION_KEY: "test-only-encryption-key-over-32-characters", PLAID_SANDBOX_ENABLED: "true" } as Env;

describe("Plaid cursor synchronization", () => {
	beforeAll(async () => { await setupAndCleanDatabase(env); });
	beforeEach(async () => { await completeCleanupDatabase(env); });
	afterEach(() => { vi.restoreAllMocks(); });

	it("applies paginated changes idempotently without changing the expense ledger", async () => {
		const users = await createTestUserData(env);
		const db = getDb(env);
		const now = new Date().toISOString();
		const connection = { id: "bank_test", userId: users.user1.id, groupId: users.testGroupId,
			plaidItemId: "item_test", institutionName: "Sandbox bank", status: "connected" as const,
			accessTokenEncrypted: await encryptPlaidToken(env, "access-sandbox-test"), cursor: null,
			createdAt: now, updatedAt: now };
		await db.insert(bankConnections).values(connection);
		await db.insert(bankAccounts).values({ id: "bank_test:account_1", connectionId: connection.id,
			name: "Current account", type: "depository", selected: true });
		const transaction = { transaction_id: "plaid_tx_1", account_id: "account_1", date: "2026-09-01",
			name: "Groceries", merchant_name: "Market", amount: 12.34, iso_currency_code: "GBP",
			unofficial_currency_code: null, pending: false, pending_transaction_id: null };
		const pages = [
			{ added: [transaction], modified: [], removed: [], has_more: true, next_cursor: "cursor_1" },
			{ added: [], modified: [{ ...transaction, name: "Groceries updated" }], removed: [], has_more: false, next_cursor: "cursor_2" },
			{ added: [], modified: [], removed: [], has_more: false, next_cursor: "cursor_2" },
			{ added: [], modified: [], removed: [{ transaction_id: "plaid_tx_1" }], has_more: false, next_cursor: "cursor_3" },
		];
		const plaidFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(pages.shift()), { status: 200 }));
		const first = await syncBankConnection(env, db, connection);
		expect(first).toEqual({ added: 1, modified: 1, removed: 0 });
		const imported = await db.select().from(bankTransactions);
		expect(imported).toHaveLength(1);
		expect(imported[0]).toMatchObject({ id: "bank_test:plaid_tx_1", accountId: "bank_test:account_1", name: "Groceries updated", amountMinor: 1234, pending: false, linkedTransactionId: null });
		expect((await db.select().from(transactions))).toHaveLength(0);
		const latest = (await db.select().from(bankConnections).where(eq(bankConnections.id, connection.id)))[0];
		expect(latest.cursor).toBe("cursor_2");
		await syncBankConnection(env, db, latest);
		expect((await db.select().from(bankTransactions))).toHaveLength(1);
		const afterReplay = (await db.select().from(bankConnections).where(eq(bankConnections.id, connection.id)))[0];
		await syncBankConnection(env, db, afterReplay);
		expect((await db.select().from(bankTransactions))[0].removedAt).not.toBeNull();
		expect((await db.select().from(transactions))).toHaveLength(0);
		expect(plaidFetch).toHaveBeenCalledTimes(4);
	});

	it("keeps identical Plaid IDs separate across connections and skips unselected accounts", async () => {
		const users = await createTestUserData(env);
		const db = getDb(env);
		const now = new Date().toISOString();
		for (const id of ["bank_a", "bank_b"]) {
			await db.insert(bankConnections).values({ id, userId: users.user1.id, groupId: users.testGroupId,
				plaidItemId: `item_${id}`, institutionName: id, status: "connected",
				accessTokenEncrypted: await encryptPlaidToken(env, `token_${id}`), cursor: null, createdAt: now, updatedAt: now });
			await db.insert(bankAccounts).values([
				{ id: `${id}:shared_account`, connectionId: id, name: "Selected", type: "depository", selected: true },
				{ id: `${id}:other_account`, connectionId: id, name: "Unselected", type: "depository", selected: false },
			]);
		}
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
			added: ["shared_account", "other_account"].map(accountId => ({ transaction_id: "same_transaction", account_id: accountId,
				date: "2026-09-01", name: accountId, merchant_name: null, amount: 12.34,
				iso_currency_code: "GBP", unofficial_currency_code: null, pending: false, pending_transaction_id: null })),
			modified: [], removed: [], has_more: false, next_cursor: "cursor_1",
		}), { status: 200 }));
		for (const id of ["bank_a", "bank_b"]) {
			const connection = (await db.select().from(bankConnections).where(eq(bankConnections.id, id)))[0];
			await syncBankConnection(env, db, connection);
		}
		const rows = await db.select().from(bankTransactions);
		expect(rows.map(row => row.id).sort()).toEqual(["bank_a:same_transaction", "bank_b:same_transaction"]);
		expect(rows.every(row => row.accountId.endsWith(":shared_account"))).toBe(true);
	});
});
