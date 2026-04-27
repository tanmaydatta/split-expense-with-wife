import {
	createExecutionContext,
	env as testEnv,
	waitOnExecutionContext,
} from "cloudflare:test";
import type {
	BudgetEntryGetResponse,
	TransactionGetResponse,
} from "../../../shared-types";
import { getDb } from "../db";
import { budgetEntries, transactions } from "../db/schema/schema";
import worker from "../index";
import { completeCleanupDatabase, setupDatabase } from "./test-utils";
import { eq } from "drizzle-orm";

const env = testEnv as unknown as Env;

const TEST_SECRET = "test-secret";
const SEED_URL = "https://localhost:8787/test/seed";
const ORIGINAL_SECRET = env.E2E_SEED_SECRET;

type SeedCookie = { name: string; value: string };
type SeedResponse = {
	ids: {
		users: Record<string, { id: string }>;
		groups: Record<string, { id: string }>;
		transactions: Record<string, { id: string }>;
		budgetEntries: Record<string, { id: string }>;
		expenseBudgetLinks: Record<string, { id: string }>;
	};
	sessions: Record<string, { cookies: SeedCookie[] }>;
};

async function postSeed(body: unknown): Promise<SeedResponse> {
	const req = new Request(SEED_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-E2E-Seed-Secret": TEST_SECRET,
		},
		body: JSON.stringify(body),
	});
	const ctx = createExecutionContext();
	const res = await worker.fetch(req, env, ctx);
	await waitOnExecutionContext(ctx);
	if (res.status !== 200) {
		throw new Error(`Seed failed with status ${res.status}: ${await res.text()}`);
	}
	return (await res.json()) as SeedResponse;
}

function cookieHeaderFor(seed: SeedResponse, alias: string): string {
	return seed.sessions[alias].cookies
		.map((c) => `${c.name}=${c.value}`)
		.join("; ");
}

async function postEndpoint(
	endpoint: string,
	body: unknown,
	cookieHeader: string,
): Promise<Response> {
	const req = new Request(
		`https://localhost:8787/.netlify/functions/${endpoint}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookieHeader,
			},
			body: JSON.stringify(body),
		},
	);
	const ctx = createExecutionContext();
	const res = await worker.fetch(req, env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

describe("POST /transaction_get", () => {
	beforeEach(async () => {
		env.E2E_SEED_SECRET = TEST_SECRET;
		await setupDatabase(env);
		await completeCleanupDatabase(env);
	});

	afterEach(() => {
		env.E2E_SEED_SECRET = ORIGINAL_SECRET;
	});

	it("returns 200 with transaction + linkedBudgetEntry when present", async () => {
		const seed = await postSeed({
			users: [{ alias: "u1" }, { alias: "u2" }],
			groups: [
				{
					alias: "g",
					members: ["u1", "u2"],
					budgets: [{ alias: "b", name: "Default" }],
				},
			],
			transactions: [
				{
					alias: "t",
					group: "g",
					amount: 100,
					paidByShares: { u1: 100 },
					splitPctShares: { u1: 50, u2: 50 },
					description: "Lunch",
				},
			],
			budgetEntries: [{ alias: "be", group: "g", budget: "b", amount: 100 }],
			expenseBudgetLinks: [{ transaction: "t", budgetEntry: "be" }],
			authenticate: ["u1"],
		});

		const txId = seed.ids.transactions.t.id;
		const beId = seed.ids.budgetEntries.be.id;
		const cookies = cookieHeaderFor(seed, "u1");

		const res = await postEndpoint("transaction_get", { id: txId }, cookies);
		expect(res.status).toBe(200);

		const body = (await res.json()) as TransactionGetResponse;
		expect(body.transaction.transaction_id).toBe(txId);
		expect(body.transaction.description).toBe("Lunch");
		expect(body.transactionUsers).toBeDefined();
		expect(body.transactionUsers.length).toBeGreaterThan(0);
		// transactionUsers carry first_name (joined from user table)
		expect(body.transactionUsers[0].first_name).toBeDefined();
		expect(body.linkedBudgetEntry).toBeDefined();
		expect(body.linkedBudgetEntry?.id).toBe(beId);
		// Budget entry carries name + groupid populated
		expect(body.linkedBudgetEntry?.name).toBe("Default");
		expect(body.linkedBudgetEntry?.groupid).toBe(seed.ids.groups.g.id);
	});

	it("omits linkedBudgetEntry when no link exists", async () => {
		const seed = await postSeed({
			users: [{ alias: "u" }],
			groups: [{ alias: "g", members: ["u"] }],
			transactions: [
				{
					alias: "t",
					group: "g",
					amount: 50,
					paidByShares: { u: 50 },
					splitPctShares: { u: 100 },
				},
			],
			authenticate: ["u"],
		});

		const txId = seed.ids.transactions.t.id;
		const cookies = cookieHeaderFor(seed, "u");

		const res = await postEndpoint("transaction_get", { id: txId }, cookies);
		expect(res.status).toBe(200);

		const body = (await res.json()) as TransactionGetResponse;
		expect(body.transaction.transaction_id).toBe(txId);
		expect(body.linkedBudgetEntry).toBeUndefined();
	});

	it("omits linkedBudgetEntry when the linked sibling is soft-deleted", async () => {
		const seed = await postSeed({
			users: [{ alias: "u" }],
			groups: [
				{
					alias: "g",
					members: ["u"],
					budgets: [{ alias: "b", name: "Default" }],
				},
			],
			transactions: [
				{
					alias: "t",
					group: "g",
					amount: 50,
					paidByShares: { u: 50 },
					splitPctShares: { u: 100 },
				},
			],
			budgetEntries: [{ alias: "be", group: "g", budget: "b", amount: 50 }],
			expenseBudgetLinks: [{ transaction: "t", budgetEntry: "be" }],
			authenticate: ["u"],
		});

		const txId = seed.ids.transactions.t.id;
		const beId = seed.ids.budgetEntries.be.id;
		const cookies = cookieHeaderFor(seed, "u");

		// Soft-delete the budget entry
		const db = getDb(env);
		await db
			.update(budgetEntries)
			.set({ deleted: new Date().toISOString() })
			.where(eq(budgetEntries.budgetEntryId, beId));

		const res = await postEndpoint("transaction_get", { id: txId }, cookies);
		expect(res.status).toBe(200);

		const body = (await res.json()) as TransactionGetResponse;
		expect(body.transaction.transaction_id).toBe(txId);
		expect(body.linkedBudgetEntry).toBeUndefined();
	});

	it("returns 404 for an id that doesn't exist", async () => {
		const seed = await postSeed({
			users: [{ alias: "u" }],
			groups: [{ alias: "g", members: ["u"] }],
			authenticate: ["u"],
		});
		const cookies = cookieHeaderFor(seed, "u");

		const res = await postEndpoint(
			"transaction_get",
			{ id: "tx_does_not_exist" },
			cookies,
		);
		expect(res.status).toBe(404);
	});

	it("returns 404 for a transaction in another group (cross-group)", async () => {
		const seed = await postSeed({
			users: [{ alias: "alice" }, { alias: "bob" }],
			groups: [
				{ alias: "g1", members: ["alice"] },
				{ alias: "g2", members: ["bob"] },
			],
			transactions: [
				{
					alias: "tBob",
					group: "g2",
					amount: 75,
					paidByShares: { bob: 75 },
					splitPctShares: { bob: 100 },
				},
			],
			authenticate: ["alice"],
		});

		const txId = seed.ids.transactions.tBob.id;
		const aliceCookies = cookieHeaderFor(seed, "alice");

		const res = await postEndpoint(
			"transaction_get",
			{ id: txId },
			aliceCookies,
		);
		expect(res.status).toBe(404);
	});
});

describe("POST /budget_entry_get", () => {
	beforeEach(async () => {
		env.E2E_SEED_SECRET = TEST_SECRET;
		await setupDatabase(env);
		await completeCleanupDatabase(env);
	});

	afterEach(() => {
		env.E2E_SEED_SECRET = ORIGINAL_SECRET;
	});

	it("returns 200 with budgetEntry + linkedTransaction when present", async () => {
		const seed = await postSeed({
			users: [{ alias: "u1" }, { alias: "u2" }],
			groups: [
				{
					alias: "g",
					members: ["u1", "u2"],
					budgets: [{ alias: "b", name: "Default" }],
				},
			],
			transactions: [
				{
					alias: "t",
					group: "g",
					amount: 100,
					paidByShares: { u1: 100 },
					splitPctShares: { u1: 50, u2: 50 },
					description: "Lunch",
				},
			],
			budgetEntries: [
				{
					alias: "be",
					group: "g",
					budget: "b",
					amount: 100,
					description: "weekly shop",
				},
			],
			expenseBudgetLinks: [{ transaction: "t", budgetEntry: "be" }],
			authenticate: ["u1"],
		});

		const beId = seed.ids.budgetEntries.be.id;
		const txId = seed.ids.transactions.t.id;
		const cookies = cookieHeaderFor(seed, "u1");

		const res = await postEndpoint("budget_entry_get", { id: beId }, cookies);
		expect(res.status).toBe(200);

		const body = (await res.json()) as BudgetEntryGetResponse;
		expect(body.budgetEntry.id).toBe(beId);
		expect(body.budgetEntry.description).toBe("weekly shop");
		expect(body.budgetEntry.name).toBe("Default");
		expect(body.budgetEntry.groupid).toBe(seed.ids.groups.g.id);
		expect(body.linkedTransaction).toBeDefined();
		expect(body.linkedTransaction?.transaction_id).toBe(txId);
		expect(body.linkedTransactionUsers).toBeDefined();
		expect((body.linkedTransactionUsers ?? []).length).toBeGreaterThan(0);
	});

	it("omits linkedTransaction when no link exists", async () => {
		const seed = await postSeed({
			users: [{ alias: "u" }],
			groups: [
				{
					alias: "g",
					members: ["u"],
					budgets: [{ alias: "b", name: "Default" }],
				},
			],
			budgetEntries: [{ alias: "be", group: "g", budget: "b", amount: 25 }],
			authenticate: ["u"],
		});

		const beId = seed.ids.budgetEntries.be.id;
		const cookies = cookieHeaderFor(seed, "u");

		const res = await postEndpoint("budget_entry_get", { id: beId }, cookies);
		expect(res.status).toBe(200);

		const body = (await res.json()) as BudgetEntryGetResponse;
		expect(body.budgetEntry.id).toBe(beId);
		expect(body.linkedTransaction).toBeUndefined();
		expect(body.linkedTransactionUsers).toBeUndefined();
	});

	it("omits linkedTransaction when the linked sibling is soft-deleted", async () => {
		const seed = await postSeed({
			users: [{ alias: "u" }],
			groups: [
				{
					alias: "g",
					members: ["u"],
					budgets: [{ alias: "b", name: "Default" }],
				},
			],
			transactions: [
				{
					alias: "t",
					group: "g",
					amount: 50,
					paidByShares: { u: 50 },
					splitPctShares: { u: 100 },
				},
			],
			budgetEntries: [{ alias: "be", group: "g", budget: "b", amount: 50 }],
			expenseBudgetLinks: [{ transaction: "t", budgetEntry: "be" }],
			authenticate: ["u"],
		});

		const beId = seed.ids.budgetEntries.be.id;
		const txId = seed.ids.transactions.t.id;
		const cookies = cookieHeaderFor(seed, "u");

		// Soft-delete the transaction
		const db = getDb(env);
		await db
			.update(transactions)
			.set({ deleted: new Date().toISOString() })
			.where(eq(transactions.transactionId, txId));

		const res = await postEndpoint("budget_entry_get", { id: beId }, cookies);
		expect(res.status).toBe(200);

		const body = (await res.json()) as BudgetEntryGetResponse;
		expect(body.budgetEntry.id).toBe(beId);
		expect(body.linkedTransaction).toBeUndefined();
		expect(body.linkedTransactionUsers).toBeUndefined();
	});

	it("returns 404 for an id that doesn't exist", async () => {
		const seed = await postSeed({
			users: [{ alias: "u" }],
			groups: [{ alias: "g", members: ["u"] }],
			authenticate: ["u"],
		});
		const cookies = cookieHeaderFor(seed, "u");

		const res = await postEndpoint(
			"budget_entry_get",
			{ id: "bge_does_not_exist" },
			cookies,
		);
		expect(res.status).toBe(404);
	});

	it("returns 404 for a budget entry in another group (cross-group)", async () => {
		const seed = await postSeed({
			users: [{ alias: "alice" }, { alias: "bob" }],
			groups: [
				{ alias: "g1", members: ["alice"] },
				{
					alias: "g2",
					members: ["bob"],
					budgets: [{ alias: "b2", name: "Default" }],
				},
			],
			budgetEntries: [
				{ alias: "beBob", group: "g2", budget: "b2", amount: 50 },
			],
			authenticate: ["alice"],
		});

		const beId = seed.ids.budgetEntries.beBob.id;
		const aliceCookies = cookieHeaderFor(seed, "alice");

		const res = await postEndpoint(
			"budget_entry_get",
			{ id: beId },
			aliceCookies,
		);
		expect(res.status).toBe(404);
	});
});
