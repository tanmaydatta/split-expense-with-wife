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

	it("paginates across page boundaries using opaque cursor without duplicate rows", async () => {
		const f = await fixture();

		// Insert 30 transactions
		for (let i = 1; i <= 30; i++) {
			const pad = String(i).padStart(2, "0");
			await env.DB.prepare(
				"INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			).bind(`tx-${pad}`, `Item ${pad}`, 10.0 + i, "GBP", f.testGroupId, `2026-02-${pad}T12:00:00Z`).run();
		}

		// Page 1: limit 25 (default)
		const page1Res = await callLedgerList({}, f.cookie);
		expect(page1Res.status).toBe(200);
		const page1 = (await page1Res.json()) as LedgerListResponse;
		expect(page1.rows).toHaveLength(25);
		expect(page1.nextCursor).toBeTruthy();

		// Page 2: with cursor
		const page2Res = await callLedgerList({ cursor: page1.nextCursor }, f.cookie);
		expect(page2Res.status).toBe(200);
		const page2 = (await page2Res.json()) as LedgerListResponse;
		expect(page2.rows).toHaveLength(5);
		expect(page2.nextCursor).toBeNull();

		// Verify no overlap between page 1 and page 2
		const page1Ids = new Set(page1.rows.map((r) => r.id));
		for (const r of page2.rows) {
			expect(page1Ids.has(r.id)).toBe(false);
		}
		expect(page1Ids.size + page2.rows.length).toBe(30);
	});

	it("preserves deterministic ordering across duplicate timestamps and sources", async () => {
		const f = await fixture();
		const sameTime = "2026-03-01T12:00:00Z";

		// 1 purchase
		await env.DB.prepare(
			"INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind("tx-same-1", "Purchase same time", 20.0, "GBP", f.testGroupId, sameTime).run();

		// 1 budget adjustment
		await env.DB.prepare(
			"INSERT INTO budget_entries (budget_entry_id, description, amount, currency, budget_id, added_time) VALUES (?, ?, ?, ?, ?, ?)",
		).bind("be-same-1", "Adjustment same time", 50.0, "GBP", f.budgetIds.house, sameTime).run();

		// 1 transfer
		await env.DB.prepare(
			"INSERT INTO budget_transfers (id, group_id, actor_id, request_id, source_budget_id, destination_budget_id, amount, currency, added_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).bind("tr-same-1", f.testGroupId, f.user1.id, "req-same-1", f.budgetIds.house, f.budgetIds.food, 30.0, "GBP", sameTime, sameTime).run();

		// Query with limit 2
		const page1Res = await callLedgerList({ limit: 2 }, f.cookie);
		expect(page1Res.status).toBe(200);
		const page1 = (await page1Res.json()) as LedgerListResponse;
		expect(page1.rows).toHaveLength(2);
		expect(page1.nextCursor).toBeTruthy();

		// Page 2
		const page2Res = await callLedgerList({ limit: 2, cursor: page1.nextCursor }, f.cookie);
		expect(page2Res.status).toBe(200);
		const page2 = (await page2Res.json()) as LedgerListResponse;
		expect(page2.rows).toHaveLength(1);

		const allIds = [...page1.rows, ...page2.rows].map((r) => r.id);
		expect(new Set(allIds).size).toBe(3);
	});

	it("filters by currency, budgetId, categoryId, and kinds", async () => {
		const f = await fixture();

		// Insert GBP and USD transactions
		await env.DB.prepare(
			"INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind("tx-gbp-1", "GBP item", 10.0, "GBP", f.testGroupId, "2026-03-01T12:00:00Z").run();
		await env.DB.prepare(
			"INSERT INTO transactions (transaction_id, description, amount, currency, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).bind("tx-usd-1", "USD item", 15.0, "USD", f.testGroupId, "2026-03-02T12:00:00Z").run();

		// Link GBP item to house budget and a category
		await env.DB.prepare(
			"INSERT INTO budget_entries (budget_entry_id, description, amount, currency, budget_id, added_time) VALUES (?, ?, ?, ?, ?, ?)",
		).bind("be-gbp-1", "GBP budget entry", -10.0, "GBP", f.budgetIds.house, "2026-03-01T12:00:00Z").run();
		await env.DB.prepare(
			"INSERT INTO expense_budget_links (id, transaction_id, budget_entry_id, group_id, created_at) VALUES (?, ?, ?, ?, ?)",
		).bind("link-gbp-1", "tx-gbp-1", "be-gbp-1", f.testGroupId, "2026-03-01T12:00:00Z").run();

		// Create a category and assign to tx-gbp-1
		const catId = "cat-groceries";
		await env.DB.prepare(
			"INSERT INTO group_categories (id, group_id, name, slug) VALUES (?, ?, ?, ?)",
		).bind(catId, f.testGroupId, "Groceries", "groceries").run();
		await env.DB.prepare(
			"INSERT INTO record_categories (group_id, record_kind, record_id, category_id, source, version) VALUES (?, ?, ?, ?, ?, ?)",
		).bind(f.testGroupId, "expense", "tx-gbp-1", catId, "manual", 1).run();

		// Add a transfer
		await env.DB.prepare(
			"INSERT INTO budget_transfers (id, group_id, actor_id, request_id, source_budget_id, destination_budget_id, amount, currency, added_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).bind("tr-1", f.testGroupId, f.user1.id, "req-tr-1", f.budgetIds.house, f.budgetIds.food, 25.0, "GBP", "2026-03-03T12:00:00Z", "2026-03-03T12:00:00Z").run();

		// Filter by currency: USD
		const usdRes = await callLedgerList({ currency: "USD" }, f.cookie);
		const usdData = (await usdRes.json()) as LedgerListResponse;
		expect(usdData.rows).toHaveLength(1);
		expect(usdData.rows[0].id).toBe("tx:tx-usd-1");

		// Filter by budgetId: food (should find the transfer)
		const foodRes = await callLedgerList({ budgetId: f.budgetIds.food }, f.cookie);
		const foodData = (await foodRes.json()) as LedgerListResponse;
		expect(foodData.rows).toHaveLength(1);
		expect(foodData.rows[0].id).toBe("transfer:tr-1");

		// Filter by categoryId: groceries
		const catRes = await callLedgerList({ categoryId: catId }, f.cookie);
		const catData = (await catRes.json()) as LedgerListResponse;
		expect(catData.rows).toHaveLength(1);
		expect(catData.rows[0].id).toBe("tx:tx-gbp-1");

		// Filter by kinds: ["transfer"]
		const kindRes = await callLedgerList({ kinds: ["transfer"] }, f.cookie);
		const kindData = (await kindRes.json()) as LedgerListResponse;
		expect(kindData.rows).toHaveLength(1);
		expect(kindData.rows[0].id).toBe("transfer:tr-1");
	});

	it("rejects malformed or foreign cursor with 400", async () => {
		const f = await fixture();

		// Not valid base64 / json
		const badRes1 = await callLedgerList({ cursor: "not-a-valid-cursor!!!" }, f.cookie);
		expect(badRes1.status).toBe(400);

		// Valid base64 but for foreign group
		const foreignCursor = Buffer.from(JSON.stringify({
			groupId: "foreign-group-999",
			timestamp: "2026-01-01T00:00:00Z",
			id: "tx:tx-1",
		})).toString("base64");
		const badRes2 = await callLedgerList({ cursor: foreignCursor }, f.cookie);
		expect(badRes2.status).toBe(400);
	});
});
