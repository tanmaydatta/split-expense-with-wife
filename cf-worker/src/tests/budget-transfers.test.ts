import {
	createTransfer,
	deleteTransferForEntry,
} from "../utils/budget-transfers";
import { searchCandidates } from "../handlers/bank-review";
import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
import {
	setupAndCleanDatabase,
	completeCleanupDatabase,
	createTestUserData,
	signInAndGetCookies,
} from "./test-utils";
const env = {
	...testEnv,
	CATEGORIES_ENABLED: "true",
	CATEGORY_AI_ENABLED: "false",
	BUDGET_TRANSFERS_ENABLED: "true",
} as Env;
describe("Budget transfers", () => {
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
	function call(path: string, body: unknown, cookie = "") {
		return worker.fetch(
			new Request(`https://localhost:8787/.netlify/functions/${path}`, {
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
			env,
			createExecutionContext(),
		);
	}
	it("creates an atomic debit/credit pair and totals, and retries without duplication", async () => {
		const f = await fixture();
		const body = {
			requestId: "transfer-test-0001",
			sourceBudgetId: f.budgetIds.food,
			destinationBudgetId: f.budgetIds.house,
			amount: 125.5,
			currency: "GBP",
			date: "2026-01-15",
			note: "Monthly allocation",
		};
		const response = await call("budget-transfer", body, f.cookie);
		expect(response.status).toBe(200);
		const result = (await response.json()) as { transferId: string };
		const entries = await env.DB.prepare(
			"SELECT amount,budget_id FROM budget_entries ORDER BY amount",
		).all();
		expect(entries.results).toEqual([
			{ amount: -125.5, budget_id: f.budgetIds.food },
			{ amount: 125.5, budget_id: f.budgetIds.house },
		]);
		expect((await call("budget-transfer", body, f.cookie)).status).toBe(200);
		expect(
			(
				await env.DB.prepare("SELECT count(*) n FROM budget_entries").first<{
					n: number;
				}>()
			)?.n,
		).toBe(2);
		expect(
			(
				await env.DB.prepare(
					"SELECT sum(total_amount) total FROM budget_totals",
				).first<{ total: number }>()
			)?.total,
		).toBe(0);
		expect(result.transferId).toBeTruthy();
	});

	function input(
		f: Awaited<ReturnType<typeof fixture>>,
		requestId = "transfer-case-0001",
	) {
		return {
			requestId,
			sourceBudgetId: f.budgetIds.food,
			destinationBudgetId: f.budgetIds.house,
			amount: 500,
			currency: "GBP",
			date: "2026-01-15",
		};
	}
	it("requires authentication and validates money, currency, budgets and UTC date", async () => {
		const f = await fixture(),
			body = input(f);
		expect((await call("budget-transfer", body)).status).toBe(401);
		for (const patch of [
			{ amount: 0 },
			{ amount: -1 },
			{ amount: 1.001 },
			{ amount: 1e-9 },
			{ amount: 1e10 },
			{ currency: "BAD" },
			{ date: "2099-01-01" },
			{ date: "2026-02-30" },
			{ sourceBudgetId: f.budgetIds.house },
			{ note: "x".repeat(201) },
		])
			expect(
				(await call("budget-transfer", { ...body, ...patch }, f.cookie)).status,
			).toBe(400);
		expect(
			(
				await call(
					"budget-transfer",
					{ ...body, destinationBudgetId: "foreign" },
					f.cookie,
				)
			).status,
		).toBe(403);
		expect(
			(
				await env.DB.prepare("SELECT count(*) n FROM budget_entries").first<{
					n: number;
				}>()
			)?.n,
		).toBe(0);
	});
	it("deduplicates concurrent starts and rejects changed retry payloads", async () => {
		const f = await fixture(),
			body = input(f);
		const responses = await Promise.all([
			call("budget-transfer", body, f.cookie),
			call("budget-transfer", body, f.cookie),
		]);
		expect(responses.map((r) => r.status)).toEqual([200, 200]);
		expect(
			(await call("budget-transfer", { ...body, amount: 10 }, f.cookie)).status,
		).toBe(409);
		expect(
			(
				await env.DB.prepare("SELECT count(*) n FROM budget_entries").first<{
					n: number;
				}>()
			)?.n,
		).toBe(2);
	});
	it("rolls back both entries, metadata and totals on an injected second-side failure", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"CREATE TRIGGER fail_transfer_test BEFORE INSERT ON budget_entries WHEN NEW.amount>0 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
		).run();
		try {
			expect((await call("budget-transfer", input(f), f.cookie)).status).toBe(
				500,
			);
			for (const table of [
				"budget_entries",
				"budget_transfers",
				"budget_transfer_entries",
				"budget_totals",
			])
				expect(
					(
						await env.DB.prepare(`SELECT count(*) n FROM ${table}`).first<{
							n: number;
						}>()
					)?.n,
				).toBe(0);
		} finally {
			await env.DB.prepare("DROP TRIGGER fail_transfer_test").run();
		}
		expect((await call("budget-transfer", input(f), f.cookie)).status).toBe(
			200,
		);
	});
	it("deletes both sides once under opposite-side concurrent deletes and never recreates a deleted retry", async () => {
		const f = await fixture(),
			body = input(f);
		const created = (await (
			await call("budget-transfer", body, f.cookie)
		).json()) as { sourceEntryId: string; destinationEntryId: string };
		await env.DB.prepare(
			"UPDATE group_budgets SET deleted='2026-01-20' WHERE id=?",
		)
			.bind(f.budgetIds.house)
			.run();
		const deleted = await Promise.all([
			call(
				"budget_delete",
				{ confirmTransferDeletion: true, id: created.sourceEntryId },
				f.cookie,
			),
			call(
				"budget_delete",
				{ confirmTransferDeletion: true, id: created.destinationEntryId },
				f.cookie,
			),
		]);
		expect(deleted.map((r) => r.status)).toEqual([200, 200]);
		expect(
			(
				await call(
					"budget_delete",
					{ confirmTransferDeletion: true, id: created.sourceEntryId },
					f.cookie,
				)
			).status,
		).toBe(200);
		expect(
			(
				await env.DB.prepare(
					"SELECT count(*) n FROM budget_entries WHERE deleted IS NULL",
				).first<{ n: number }>()
			)?.n,
		).toBe(0);
		expect(
			(
				await env.DB.prepare(
					"SELECT sum(abs(total_amount)) total FROM budget_totals",
				).first<{ total: number }>()
			)?.total,
		).toBe(0);
		const retry = (await (
			await call("budget-transfer", body, f.cookie)
		).json()) as { deleted: boolean };
		expect(retry.deleted).toBe(true);
	});
	it("always excludes transfers from insights after category edits and when creation is disabled", async () => {
		const f = await fixture(),
			body = input(f);
		const created = (await (
			await call("budget-transfer", body, f.cookie)
		).json()) as { sourceEntryId: string };
		await env.DB.prepare(
			"CREATE INDEX IF NOT EXISTS group_budgets_group_id_deleted_idx ON group_budgets(group_id,deleted)",
		).run();
		await env.DB.prepare(
			"CREATE INDEX IF NOT EXISTS budget_entries_monthly_aggregation_idx ON budget_entries(budget_id,deleted,added_time,amount,currency)",
		).run();
		await env.DB.prepare(
			"INSERT INTO group_categories(id,group_id,name) VALUES('purchase',?,'Groceries')",
		)
			.bind(f.testGroupId)
			.run();
		await env.DB.prepare(
			"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) VALUES(?,'budget',?,'purchase','manual')",
		)
			.bind(f.testGroupId, created.sourceEntryId)
			.run();
		const disabled = { ...env, BUDGET_TRANSFERS_ENABLED: "false" };
		const report = await worker.fetch(
			new Request(
				"https://localhost:8787/.netlify/functions/category-insights",
				{
					method: "POST",
					headers: { Cookie: f.cookie, "Content-Type": "application/json" },
					body: JSON.stringify({
						source: "budget",
						dateFrom: "2026-01-01",
						dateTo: "2026-01-31",
						currency: "GBP",
					}),
				},
			),
			disabled,
			createExecutionContext(),
		);
		expect(report.status).toBe(200);
		const data = (await report.json()) as {
			spending: number;
			credits: number;
			excluded: {
				transfers: { count: number; spending: number; credits: number };
			};
		};
		expect(data.spending).toBe(0);
		expect(data.credits).toBe(0);
		expect(data.excluded.transfers).toMatchObject({
			count: 2,
			spending: 500,
			credits: 500,
		});
		const req = (path: string, body: unknown) =>
			worker.fetch(
				new Request(`https://localhost:8787/.netlify/functions/${path}`, {
					method: "POST",
					headers: { Cookie: f.cookie, "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
				disabled,
				createExecutionContext(),
			);
		expect(
			(await req("budget-transfer", { ...body, requestId: "disabled-new-001" }))
				.status,
		).toBe(503);
		expect(
			(
				await req("budget_delete", {
					confirmTransferDeletion: true,
					id: created.sourceEntryId,
				})
			).status,
		).toBe(200);
	});
	it("never permits expense links to transfer entries and returns scoped counterpart metadata", async () => {
		const f = await fixture();
		const created = (await (
			await call("budget-transfer", input(f), f.cookie)
		).json()) as { sourceEntryId: string };
		await expect(
			env.DB.prepare(
				"INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) VALUES('unsafe','unrelated',?,?,'2026-01-01')",
			)
				.bind(created.sourceEntryId, f.testGroupId)
				.run(),
		).rejects.toThrow("Transfers cannot link");
		const listed = (await (
			await call(
				"budget_list",
				{ budgetId: f.budgetIds.food, offset: 0 },
				f.cookie,
			)
		).json()) as { transfer: { otherBudgetId: string; role: string } }[];
		expect(listed[0].transfer).toMatchObject({
			otherBudgetId: f.budgetIds.house,
			role: "source",
		});
	});

	it("denies real foreign-group budgets and foreign transfer deletion without revealing or altering a pair", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"INSERT INTO groups(groupid,group_name) VALUES('foreign','Other')",
		).run();
		await env.DB.prepare(
			"INSERT INTO group_budgets(id,group_id,budget_name) VALUES('foreign-budget','foreign','Other')",
		).run();
		expect(
			(
				await call(
					"budget-transfer",
					{ ...input(f), destinationBudgetId: "foreign-budget" },
					f.cookie,
				)
			).status,
		).toBe(403);
		const created = (await (
			await call("budget-transfer", input(f), f.cookie)
		).json()) as { sourceEntryId: string };
		await env.DB.prepare("UPDATE user SET groupid='foreign' WHERE id=?")
			.bind(f.user2.id)
			.run();
		const otherCookie = await signInAndGetCookies(
			env,
			f.user2.email,
			f.user2.password,
		);
		expect(
			(
				await call(
					"budget_delete",
					{ confirmTransferDeletion: true, id: created.sourceEntryId },
					otherCookie,
				)
			).status,
		).toBe(401);
		expect(
			(
				await env.DB.prepare(
					"SELECT count(*) n FROM budget_entries WHERE deleted IS NULL",
				).first<{ n: number }>()
			)?.n,
		).toBe(2);
	});
	it("fails closed when the creation switch is missing", async () => {
		const f = await fixture();
		const response = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/budget-transfer", {
				method: "POST",
				headers: { Cookie: f.cookie, "Content-Type": "application/json" },
				body: JSON.stringify(input(f)),
			}),
			{ ...env, BUDGET_TRANSFERS_ENABLED: undefined } as unknown as Env,
			createExecutionContext(),
		);
		expect(response.status).toBe(503);
	});

	it("skips financial writes if membership changes immediately before the atomic batch", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"INSERT INTO groups(groupid,group_name) VALUES('moved','Moved')",
		).run();
		const guarded = {
			DB: {
				prepare: env.DB.prepare.bind(env.DB),
				batch: async (statements: D1PreparedStatement[]) => {
					await env.DB.prepare("UPDATE user SET groupid='moved' WHERE id=?")
						.bind(f.user1.id)
						.run();
					return env.DB.batch(statements);
				},
			},
		} as unknown as Pick<Env, "DB">;
		await expect(
			createTransfer(guarded, f.testGroupId, f.user1.id, input(f)),
		).rejects.toMatchObject({ status: 403 });
		expect(
			(
				await env.DB.prepare("SELECT count(*) n FROM budget_entries").first<{
					n: number;
				}>()
			)?.n,
		).toBe(0);
		await env.DB.prepare("UPDATE user SET groupid=? WHERE id=?")
			.bind(f.testGroupId, f.user1.id)
			.run();
		const saved = await createTransfer(
			env,
			f.testGroupId,
			f.user1.id,
			input(f),
		);
		await expect(
			deleteTransferForEntry(
				guarded,
				f.testGroupId,
				f.user1.id,
				saved.sourceEntryId,
				true,
			),
		).rejects.toMatchObject({ status: 403 });
		expect(
			(
				await env.DB.prepare(
					"SELECT count(*) n FROM budget_entries WHERE deleted IS NULL",
				).first<{ n: number }>()
			)?.n,
		).toBe(2);
	});
	it("rolls back a failed pair deletion, preserves unrelated expenses and omits transfer bank candidates", async () => {
		const f = await fixture();
		const created = await createTransfer(
			env,
			f.testGroupId,
			f.user1.id,
			input(f),
		);
		await env.DB.prepare(
			"INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) VALUES('unrelated',?,'Unrelated expense',500,'GBP','2026-01-15')",
		)
			.bind(f.testGroupId)
			.run();
		const candidates = await searchCandidates(
			new Request("https://localhost/bank-import/candidates?kind=budget"),
			env,
			f.testGroupId,
			50000,
			"GBP",
		);
		expect(await candidates.json()).toMatchObject({ candidates: [] });
		await env.DB.prepare(
			"CREATE TRIGGER fail_delete_transfer_test BEFORE UPDATE OF deleted ON budget_entries WHEN NEW.amount>0 AND NEW.deleted IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic deletion failure'); END",
		).run();
		try {
			expect(
				(
					await call(
						"budget_delete",
						{ confirmTransferDeletion: true, id: created.sourceEntryId },
						f.cookie,
					)
				).status,
			).toBe(500);
			expect(
				(
					await env.DB.prepare(
						"SELECT count(*) n FROM budget_entries WHERE deleted IS NULL",
					).first<{ n: number }>()
				)?.n,
			).toBe(2);
			expect(
				(
					await env.DB.prepare(
						"SELECT sum(abs(total_amount)) total FROM budget_totals",
					).first<{ total: number }>()
				)?.total,
			).toBe(1000);
		} finally {
			await env.DB.prepare("DROP TRIGGER fail_delete_transfer_test").run();
		}
		expect(
			(
				await call(
					"budget_delete",
					{ confirmTransferDeletion: true, id: created.sourceEntryId },
					f.cookie,
				)
			).status,
		).toBe(200);
		expect(
			(
				await env.DB.prepare(
					"SELECT deleted FROM transactions WHERE transaction_id='unrelated'",
				).first<{ deleted: string | null }>()
			)?.deleted,
		).toBeNull();
	});

	it("requires explicit pair-deletion confirmation from legacy clients before any write", async () => {
		const f = await fixture();
		const saved = await createTransfer(
			env,
			f.testGroupId,
			f.user1.id,
			input(f),
		);
		const response = await call(
			"budget_delete",
			{ id: saved.sourceEntryId },
			f.cookie,
		);
		expect(response.status).toBe(409);
		expect(await response.text()).toContain("confirm deleting both");
		expect(
			(
				await env.DB.prepare(
					"SELECT count(*) n FROM budget_entries WHERE deleted IS NULL",
				).first<{ n: number }>()
			)?.n,
		).toBe(2);
		expect(
			(
				await env.DB.prepare(
					"SELECT sum(abs(total_amount)) total FROM budget_totals",
				).first<{ total: number }>()
			)?.total,
		).toBe(1000);
		expect(
			(
				await call(
					"budget_delete",
					{ id: saved.sourceEntryId, confirmTransferDeletion: true },
					f.cookie,
				)
			).status,
		).toBe(200);
	});
	it("excludes transfer debits from the existing monthly spending and averages endpoint", async () => {
		const f = await fixture();
		const date = new Date().toISOString().slice(0, 10);
		await createTransfer(env, f.testGroupId, f.user1.id, { ...input(f), date });
		await env.DB.prepare(
			"INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) VALUES('purchase',?,'Ordinary purchase',-20,'GBP',?)",
		)
			.bind(f.budgetIds.food, date + " 00:00:00")
			.run();
		const response = await call(
			"budget_monthly",
			{ budgetId: f.budgetIds.food },
			f.cookie,
		);
		expect(response.status).toBe(200);
		const report = (await response.json()) as {
			monthlyBudgets: { amounts: { amount: number }[] }[];
			averageMonthlySpend: { averages: { totalSpend: number }[] }[];
		};
		expect(
			report.monthlyBudgets
				.flatMap((m) => m.amounts)
				.reduce((sum, a) => sum + a.amount, 0),
		).toBe(20);
		expect(report.averageMonthlySpend[report.averageMonthlySpend.length-1]?.averages[0].totalSpend).toBe(20);
	});
});
