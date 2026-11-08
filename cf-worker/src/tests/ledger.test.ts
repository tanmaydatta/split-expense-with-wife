import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
import {
	setupAndCleanDatabase,
	completeCleanupDatabase,
	createTestUserData,
	signInAndGetCookies,
} from "./test-utils";
import type { LedgerListResponse } from "split-expense-shared-types";

const env = {
	...testEnv,
	CATEGORIES_ENABLED: "true",
	CATEGORY_AI_ENABLED: "false",
	BUDGET_TRANSFERS_ENABLED: "true",
} as Env;

describe("Unified Ledger API", () => {
	beforeAll(() => setupAndCleanDatabase(env));
	beforeEach(() => completeCleanupDatabase(env));

	async function fixture() {
		const users = await createTestUserData(env);
		const cookie = await signInAndGetCookies(
			env,
			users.user1.email,
			users.user1.password,
		);
		return { ...users, cookie };
	}

	function callLedgerList(body: unknown, cookie = "") {
		return worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/ledger_list", {
				method: "POST",
				headers: {
					Cookie: cookie,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			}),
			env,
			createExecutionContext(),
		);
	}

	it("requires authentication", async () => {
		const response = await callLedgerList({});
		expect(response.status).toBe(401);
	});

	it("returns a linked purchase as exactly one row", async () => {
		const f = await fixture();

		// 1. Create a linked purchase via dashboard_submit
		const submitRes = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/dashboard_submit", {
				method: "POST",
				headers: { Cookie: f.cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					expense: {
						amount: 47.83,
						description: "Tesco Groceries",
						currency: "GBP",
						paidByShares: { [f.user1.id]: 47.83 },
						splitPctShares: { [f.user1.id]: 50, [f.user2.id]: 50 },
					},
					budget: {
						amount: 47.83,
						description: "Tesco Groceries",
						currency: "GBP",
						budgetId: f.budgetIds.house,
					},
				}),
			}),
			env,
			createExecutionContext(),
		);
		expect(submitRes.status).toBe(200);
		const submitData = (await submitRes.json()) as { transactionId: string; budgetEntryId: string };

		// 2. Query ledger_list
		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		expect(data.rows).toHaveLength(1);
		const row = data.rows[0];
		expect(row.id).toBe(`tx:${submitData.transactionId}`);
		expect(row.kind).toBe("purchase");
		expect(row.description).toBe("Tesco Groceries");
		expect(row.currency).toBe("GBP");
		expect(row.amount).toBe(-47.83); // debit in budget direction
		expect(row.transactionId).toBe(submitData.transactionId);
		expect(row.budgetEntryIds).toEqual([submitData.budgetEntryId]);
		expect(row.budgetIds).toEqual([f.budgetIds.house]);
	});

	it("returns standalone expense as one purchase row", async () => {
		const f = await fixture();

		// Create split-only transaction
		const splitRes = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/split_new", {
				method: "POST",
				headers: { Cookie: f.cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					amount: 25.0,
					description: "Split only dinner",
					currency: "GBP",
					paidByShares: { [f.user1.id]: 25.0 },
					splitPctShares: { [f.user1.id]: 50, [f.user2.id]: 50 },
				}),
			}),
			env,
			createExecutionContext(),
		);
		expect(splitRes.status).toBe(200);
		const splitData = (await splitRes.json()) as { transactionId: string };

		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		expect(data.rows).toHaveLength(1);
		const row = data.rows[0];
		expect(row.id).toBe(`tx:${splitData.transactionId}`);
		expect(row.kind).toBe("purchase");
		expect(row.description).toBe("Split only dinner");
		expect(row.amount).toBe(-25.0);
		expect(row.budgetEntryIds).toEqual([]);
		expect(row.budgetIds).toEqual([]);
	});

	it("returns standalone budget credit and debit adjustments", async () => {
		const f = await fixture();

		// Add credit (funding)
		const creditRes = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/budget", {
				method: "POST",
				headers: { Cookie: f.cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					amount: 500.0,
					description: "Monthly House Funding",
					currency: "GBP",
					budgetId: f.budgetIds.house,
					groupid: f.testGroupId,
				}),
			}),
			env,
			createExecutionContext(),
		);
		expect(creditRes.status).toBe(200);

		// Add debit (standalone budget deduction)
		const debitRes = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/budget", {
				method: "POST",
				headers: { Cookie: f.cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					amount: -30.0,
					description: "Cash payment from house fund",
					currency: "GBP",
					budgetId: f.budgetIds.house,
					groupid: f.testGroupId,
				}),
			}),
			env,
			createExecutionContext(),
		);
		expect(debitRes.status).toBe(200);

		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		expect(data.rows).toHaveLength(2);
		const creditRow = data.rows.find((r) => r.amount === 500.0);
		const debitRow = data.rows.find((r) => r.amount === -30.0);

		expect(creditRow).toBeDefined();
		expect(creditRow?.kind).toBe("budget_adjustment");
		expect(creditRow?.id.startsWith("be:")).toBe(true);

		expect(debitRow).toBeDefined();
		expect(debitRow?.kind).toBe("budget_adjustment");
		expect(debitRow?.id.startsWith("be:")).toBe(true);
	});

	it("returns a paired transfer as exactly one row without duplicating entries", async () => {
		const f = await fixture();

		const transferRes = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/budget-transfer", {
				method: "POST",
				headers: { Cookie: f.cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					requestId: "transfer-test-ledger-1",
					sourceBudgetId: f.budgetIds.house,
					destinationBudgetId: f.budgetIds.food,
					amount: 100.0,
					currency: "GBP",
					date: "2026-02-01",
					note: "House to Food transfer",
				}),
			}),
			env,
			createExecutionContext(),
		);
		expect(transferRes.status).toBe(200);
		const transferData = (await transferRes.json()) as { transferId: string };

		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		// Should produce only ONE transfer row and NO standalone budget_adjustment rows
		expect(data.rows).toHaveLength(1);
		const row = data.rows[0];
		expect(row.id).toBe(`transfer:${transferData.transferId}`);
		expect(row.kind).toBe("transfer");
		expect(row.transferId).toBe(transferData.transferId);
		expect(row.amount).toBe(100.0);
		expect(row.budgetIds).toEqual(
			expect.arrayContaining([f.budgetIds.house, f.budgetIds.food]),
		);
	});

	it("preserves visibility of a transfer even if one budget is archived", async () => {
		const f = await fixture();

		const transferRes = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/budget-transfer", {
				method: "POST",
				headers: { Cookie: f.cookie, "Content-Type": "application/json" },
				body: JSON.stringify({
					requestId: "transfer-test-archived-1",
					sourceBudgetId: f.budgetIds.house,
					destinationBudgetId: f.budgetIds.food,
					amount: 80.0,
					currency: "GBP",
					date: "2026-02-01",
				}),
			}),
			env,
			createExecutionContext(),
		);
		expect(transferRes.status).toBe(200);
		const transferData = (await transferRes.json()) as { transferId: string };

		// Archive the destination budget
		await env.DB.prepare(
			"UPDATE group_budgets SET deleted = '2026-02-02T00:00:00Z' WHERE id = ?",
		).bind(f.budgetIds.food).run();

		// Transfer should still be visible when listing ledger
		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		expect(data.rows).toHaveLength(1);
		expect(data.rows[0].id).toBe(`transfer:${transferData.transferId}`);
	});

	it("deduplicates M:N links into one row anchored on the transaction", async () => {
		const f = await fixture();

		// Insert 1 transaction
		const txId = "tx-mn-1";
		await env.DB.prepare(
			"INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(txId, "Multi-budget shopping", 100.0, "GBP", f.testGroupId, "2026-02-01T12:00:00Z").run();

		// Insert 2 budget entries
		const be1 = "be-mn-1";
		const be2 = "be-mn-2";
		await env.DB.prepare(
			"INSERT INTO budget_entries (budget_entry_id, description, amount, currency, budget_id, added_time) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(be1, "Multi-budget part 1", -60.0, "GBP", f.budgetIds.house, "2026-02-01T12:00:00Z").run();
		await env.DB.prepare(
			"INSERT INTO budget_entries (budget_entry_id, description, amount, currency, budget_id, added_time) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(be2, "Multi-budget part 2", -40.0, "GBP", f.budgetIds.food, "2026-02-01T12:00:00Z").run();

		// Link tx to both budget entries
		await env.DB.prepare(
			"INSERT INTO expense_budget_links (id, transaction_id, budget_entry_id, group_id, created_at) VALUES (?, ?, ?, ?, ?)",
		).bind("link-1", txId, be1, f.testGroupId, "2026-02-01T12:00:00Z").run();
		await env.DB.prepare(
			"INSERT INTO expense_budget_links (id, transaction_id, budget_entry_id, group_id, created_at) VALUES (?, ?, ?, ?, ?)",
		).bind("link-2", txId, be2, f.testGroupId, "2026-02-01T12:00:00Z").run();

		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		// MUST be exactly 1 row, not 2
		expect(data.rows).toHaveLength(1);
		const row = data.rows[0];
		expect(row.id).toBe(`tx:${txId}`);
		expect(row.kind).toBe("purchase");
		expect(row.budgetEntryIds).toHaveLength(2);
		expect(row.budgetEntryIds).toEqual(expect.arrayContaining([be1, be2]));
		expect(row.budgetIds).toHaveLength(2);
		expect(row.budgetIds).toEqual(expect.arrayContaining([f.budgetIds.house, f.budgetIds.food]));
	});

	it("excludes soft-deleted transactions, budget entries, and transfers", async () => {
		const f = await fixture();

		// Add deleted transaction
		await env.DB.prepare(
			"INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).bind("tx-del-1", "Deleted expense", 50.0, "GBP", f.testGroupId, "2026-02-01T12:00:00Z", "2026-02-02T00:00:00Z").run();

		// Add deleted budget entry
		await env.DB.prepare(
			"INSERT INTO budget_entries (budget_entry_id, description, amount, currency, budget_id, added_time, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)",
		).bind("be-del-1", "Deleted budget entry", -20.0, "GBP", f.budgetIds.house, "2026-02-01T12:00:00Z", "2026-02-02T00:00:00Z").run();

		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		expect(data.rows).toHaveLength(0);
	});

	it("strictly isolates by authenticated household and hides other households", async () => {
		const f = await fixture();

		// Add transaction for foreign group
		await env.DB.prepare(
			"INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind("tx-foreign-1", "Foreign expense", 123.0, "GBP", "foreign-group-999", "2026-02-01T12:00:00Z").run();

		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		expect(data.rows).toHaveLength(0);
	});

	it("does not expose unreviewed private bank transactions in the ledger", async () => {
		const f = await fixture();

		// Insert private bank transaction
		await env.DB.prepare(
			"INSERT INTO bank_transactions (id, connection_id, user_id, account_id, date, name, amount_minor, currency, pending, review_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).bind("bank-tx-1", "conn-1", f.user1.id, "acc-1", "2026-02-01", "Private Bank Transaction", 1500, "GBP", 0, "unreviewed", "2026-02-01T12:00:00Z", "2026-02-01T12:00:00Z").run();

		const res = await callLedgerList({}, f.cookie);
		expect(res.status).toBe(200);
		const data = (await res.json()) as LedgerListResponse;

		expect(data.rows).toHaveLength(0);
	});
});
