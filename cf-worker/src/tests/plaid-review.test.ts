import { createExecutionContext, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import worker from "../index";
import { getDb } from "../db";
import { bankAccounts, bankConnections, bankTransactions, transactions, userBalances } from "../db/schema/schema";
import { encryptPlaidToken } from "../utils/plaid";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase, signInAndGetCookies } from "./test-utils";

const env = { ...(testEnv as unknown as Env), PLAID_CLIENT_ID: "test-client", PLAID_SANDBOX_SECRET: "test-secret",
	PLAID_TOKEN_ENCRYPTION_KEY: "test-only-encryption-key-over-32-characters", PLAID_SANDBOX_ENABLED: "true" } as Env;

function request(route: string, method: string, cookie?: string, body?: unknown): Request {
	return new Request(`https://localhost:8787/.netlify/functions/bank-import/${route}`, {
		method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
}

describe("bank review confirmation", () => {
	beforeAll(async () => { await setupAndCleanDatabase(env); });
	beforeEach(async () => { await completeCleanupDatabase(env); });

	async function fixture() {
		const users = await createTestUserData(env);
		const cookie = await signInAndGetCookies(env, users.user1.email, users.user1.password);
		const otherCookie = await signInAndGetCookies(env, users.user2.email, users.user2.password);
		const db = getDb(env);
		const now = new Date().toISOString();
		await db.insert(bankConnections).values({ id: "bank_test", userId: users.user1.id, groupId: users.testGroupId,
			plaidItemId: "item_test", institutionName: "Sandbox bank", accessTokenEncrypted: await encryptPlaidToken(env, "access-sandbox-test"),
			status: "connected", createdAt: now, updatedAt: now });
		await db.insert(bankAccounts).values({ id: "account_1", connectionId: "bank_test", name: "Current account", type: "depository", selected: true });
		await db.insert(bankTransactions).values({ id: "plaid_1", connectionId: "bank_test", userId: users.user1.id,
			accountId: "account_1", date: "2026-09-01", name: "Coffee", amountMinor: 1234, currency: "GBP", pending: false,
			createdAt: now, updatedAt: now });
		return { users, cookie, otherCookie, db };
	}

	it("keeps private bank activity scoped to its owner and matches without touching balances", async () => {
		const { users, cookie, otherCookie, db } = await fixture();
		await db.insert(transactions).values({ transactionId: "tx_manual", groupId: users.testGroupId,
			description: "Coffee", amount: 12.34, currency: "GBP", createdAt: "2026-09-01 12:00:00" });
		const fetchRoute = (route: string, method: string, auth?: string, body?: unknown) => worker.fetch(request(route, method, auth, body), env, createExecutionContext());
		expect((await fetchRoute("inbox", "GET", otherCookie)).status).toBe(200);
		const otherInbox = await (await fetchRoute("inbox", "GET", otherCookie)).json() as { transactions: unknown[] };
		expect(otherInbox.transactions).toHaveLength(0);
		expect((await fetchRoute("match", "POST", otherCookie, { bankTransactionId: "plaid_1", transactionId: "tx_manual" })).status).toBe(409);
		expect((await fetchRoute("match", "POST", undefined, { bankTransactionId: "plaid_1", transactionId: "tx_manual" })).status).toBe(401);
		const matched = await fetchRoute("match", "POST", cookie, { bankTransactionId: "plaid_1", transactionId: "tx_manual" });
		expect(matched.status).toBe(200);
		expect((await db.select().from(bankTransactions).where(eq(bankTransactions.id, "plaid_1")))[0]).toMatchObject({ reviewStatus: "matched", linkedTransactionId: "tx_manual" });
		expect(await db.select().from(userBalances)).toHaveLength(0);
		expect(await db.select().from(transactions)).toHaveLength(1);
		const ownerLinks = await (await fetchRoute("linked-ids", "GET", cookie)).json() as { transactionIds: string[] };
		const partnerLinks = await (await fetchRoute("linked-ids", "GET", otherCookie)).json() as { transactionIds: string[] };
		expect(ownerLinks.transactionIds).toEqual(["tx_manual"]);
		expect(partnerLinks.transactionIds).toEqual([]);
		expect((await fetchRoute("match", "POST", cookie, { bankTransactionId: "plaid_1", transactionId: "tx_manual" })).status).toBe(409);
	});

	it("warns about weak scheduled matches but allows a confirmed unrelated purchase", async () => {
		const { users, cookie, db } = await fixture();
		await db.insert(transactions).values({ transactionId: "tx_action_2026-09-01", groupId: users.testGroupId,
			description: "Parking subscription", amount: 12.34, currency: "GBP", createdAt: "2026-09-01 12:00:00" });
		const input = { bankTransactionId: "plaid_1", description: "Coffee", splitPctShares: { [users.user1.id]: 50, [users.user2.id]: 50 } };
		const fetchCreate = (body: unknown) => worker.fetch(request("create-expense", "POST", cookie, body), env, createExecutionContext());
		expect((await fetchCreate(input)).status).toBe(409);
		const created = await fetchCreate({ ...input, allowPossibleDuplicate: true });
		expect(created.status).toBe(201);
		const linked = (await db.select().from(bankTransactions).where(eq(bankTransactions.id, "plaid_1")))[0];
		expect(linked.reviewStatus).toBe("created");
		expect(linked.linkedTransactionId).toBe("tx_bank_plaid_1");
		expect(await db.select().from(transactions)).toHaveLength(2);
		expect((await fetchCreate({ ...input, allowPossibleDuplicate: true })).status).toBe(409);
	});

	it("allows ignored activity to return to the review inbox", async () => {
		const { cookie, db } = await fixture();
		const fetchRoute = (route: string, body: unknown) => worker.fetch(request(route, "POST", cookie, body), env, createExecutionContext());
		expect((await fetchRoute("ignore", { bankTransactionId: "plaid_1" })).status).toBe(200);
		expect((await db.select().from(bankTransactions))[0].reviewStatus).toBe("ignored");
		expect((await fetchRoute("restore", { bankTransactionId: "plaid_1" })).status).toBe(200);
		expect((await db.select().from(bankTransactions))[0].reviewStatus).toBe("unreviewed");
	});
});
