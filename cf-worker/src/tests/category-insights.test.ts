import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
import { readCategoryInsights, validateInsightsRequest } from "../utils/category-insights";
import {
	setupAndCleanDatabase,
	completeCleanupDatabase,
	createTestUserData,
	signInAndGetCookies,
} from "./test-utils";
const env = { ...testEnv, CATEGORIES_ENABLED: "true" } as Env;
const range = {source:"budget" as const, dateFrom: "2026-01-01", dateTo: "2026-02-28" };
describe("Budget-only category insights", () => {
	beforeAll(async () => {
		await setupAndCleanDatabase(env);
		await env.DB.prepare(
			"CREATE INDEX IF NOT EXISTS group_budgets_group_id_deleted_idx ON group_budgets(group_id,deleted)",
		).run();
		await env.DB.prepare(
			"CREATE INDEX IF NOT EXISTS budget_entries_monthly_aggregation_idx ON budget_entries(budget_id,deleted,added_time,amount,currency)",
		).run();
	});
	beforeEach(() => completeCleanupDatabase(env));
	const request = (body: unknown, cookie = "") =>
		worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/category-insights", {
				method: "POST",
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}),
			env,
			createExecutionContext(),
		);
	async function fixture() {
		const users = await createTestUserData(env),
			cookie = await signInAndGetCookies(env, users.user1.email, users.user1.password);
		await env.DB.prepare(
			"INSERT INTO group_categories(id,group_id,name,slug) VALUES('grocery',?,'Groceries','groceries'),('transfer',?,'Transfers',NULL)",
		)
			.bind(users.testGroupId, users.testGroupId)
			.run();
		const rows = [
			["debit", -500, "GBP", "2026-01-10", users.budgetIds.food],
			["credit", 500, "GBP", "2026-02-10", users.budgetIds.food],
			["other", -50, "GBP", "2026-02-11", users.budgetIds.house],
			["euro", -90, "EUR", "2026-01-10", users.budgetIds.food],
			["outside", -800, "GBP", "2025-01-10", users.budgetIds.food],
			["deleted", -100, "GBP", "2026-01-10", users.budgetIds.food],
		] as const;
		for (const [id, amount, currency, date, budget] of rows)
			await env.DB.prepare(
				"INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) VALUES(?,?,'Synthetic',?,?,?)",
			)
				.bind(id, budget, amount, currency, date)
				.run();
		await env.DB.prepare(
			"UPDATE budget_entries SET deleted='2026-01-11' WHERE budget_entry_id='deleted'",
		).run();
		await env.DB.prepare(
			"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) VALUES(?,'budget','debit','grocery','manual')",
		)
			.bind(users.testGroupId)
			.run();
		await env.DB.prepare(
			"INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) VALUES('expense',?,'Ignored shared expense',999,'GBP','2026-01-10')",
		)
			.bind(users.testGroupId)
			.run();
		await env.DB.prepare(
			"INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) VALUES('linked','expense','debit',?,'2026-01-10')",
		)
			.bind(users.testGroupId)
			.run();
		await env.DB.prepare(
			"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) VALUES(?,'expense','expense','transfer','manual')",
		)
			.bind(users.testGroupId)
			.run();
		return { users, cookie };
	}
	it("rejects unauthenticated report requests", async () =>
		expect((await request(range)).status).toBe(401));
 it("rejects an already-open legacy expense-insights client with an explicit refresh error",async()=>{const f=await fixture();const response=await request({dateFrom:range.dateFrom,dateTo:range.dateTo,currency:"GBP"},f.cookie);expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:"Insights changed. Refresh the page."})});

	it("validates dates, currencies, selected budget and bounded temporary category IDs", () => {
		for (const value of [
			{ ...range, dateFrom: "2026-02-30" },
			{ ...range, dateTo: "2028-01-01" },
			{ ...range, currency: "bad" },
			{ ...range, budgetId: 7 },
			{ ...range, excludedCategoryIds: "grocery" },
			{ ...range, excludedCategoryIds: Array(101).fill("grocery") },
			{ ...range, groupId: "foreign" },
		])
			expect(validateInsightsRequest(value)).toBeNull();
		expect(
			validateInsightsRequest({
				...range,
				excludedCategoryIds: ["grocery", "grocery", "uncategorised"],
			}),
		).toEqual({ ...range, excludedCategoryIds: ["grocery", "uncategorised"] });
	});
	it("counts all active household budget entries once; debits are spending, credits separate, net credits minus spending", async () => {
		const f = await fixture(),
			result = await readCategoryInsights(env, f.users.testGroupId, { ...range, currency: "GBP" });
		expect(result).toMatchObject({ spending: 550, credits: 500, net: -50, count: 3 });
		expect(result.currencies).toEqual(["EUR", "GBP"]);
		expect(result.categories.find((c) => c.id === "grocery")).toMatchObject({
			spending: 500,
			credits: 0,
			percentage: (500 / 550) * 100,
		});
		expect(result.months.map((m) => [m.month, m.spending])).toEqual([
			["2026-01", 500],
			["2026-02", 50],
		]);
		expect(result.categories.find((c) => c.id === null)?.budgets).toHaveLength(2);
	});
	it("supports one explicit budget with truthful scope and per-budget category details", async () => {
		const f = await fixture(),
			result = await readCategoryInsights(env, f.users.testGroupId, {
				...range,
				currency: "GBP",
				budgetId: f.users.budgetIds.food,
			});
		expect(result).toMatchObject({
			budgetId: f.users.budgetIds.food,
			spending: 500,
			credits: 500,
			net: 0,
			count: 2,
		});
		expect(result.categories[0].budgets[0].id).toBe(f.users.budgetIds.food);
		const response = await request(
			{ ...range, currency: "GBP", budgetId: f.users.budgetIds.food },
			f.cookie,
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ spending: 500, credits: 500, net: 0, count: 2 });
	});
	it("excludes deleted budgets and entries", async () => {
		const f = await fixture();
		await env.DB.prepare("UPDATE group_budgets SET deleted='2026-01-01' WHERE id=?")
			.bind(f.users.budgetIds.house)
			.run();
		expect(
			(await readCategoryInsights(env, f.users.testGroupId, { ...range, currency: "GBP" }))
				.spending,
		).toBe(500);
	});
	it("keeps currencies separate and never interprets credits as income", async () => {
		const f = await fixture();
		expect(
			await readCategoryInsights(env, f.users.testGroupId, { ...range, currency: "EUR" }),
		).toMatchObject({ spending: 90, credits: 0, net: -90, count: 1 });
	});
	it("applies temporary exclusions additively to saved flags without changing preferences", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"UPDATE group_categories SET exclude_from_insights=1 WHERE id='grocery'",
		).run();
		const saved = await readCategoryInsights(env, f.users.testGroupId, {
			...range,
			currency: "GBP",
		});
		expect(saved).toMatchObject({
			spending: 50,
			credits: 500,
			net: 450,
			count: 2,
			excluded: { count: 1, spending: 500, credits: 0, net: -500, categories: ["Groceries"] },
		});
		const both = await readCategoryInsights(env, f.users.testGroupId, {
			...range,
			currency: "GBP",
			excludedCategoryIds: ["uncategorised"],
		});
		expect(both).toMatchObject({
			count: 0,
			spending: 0,
			credits: 0,
			net: 0,
			excluded: { count: 3, spending: 550, credits: 500, net: -50 },
		});
		expect(
			await env.DB.prepare(
				"SELECT exclude_from_insights FROM group_categories WHERE id='grocery'",
			).first("exclude_from_insights"),
		).toBe(1);
		expect(
			await env.DB.prepare(
				"SELECT exclude_from_insights FROM group_categories WHERE id='transfer'",
			).first("exclude_from_insights"),
		).toBe(0);
	});
	it("does not infer exclusions by category name and retains archived names", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"UPDATE group_categories SET name='Transfers',archived_at='2026-01-01' WHERE id='grocery'",
		).run();
		const r = await readCategoryInsights(env, f.users.testGroupId, { ...range, currency: "GBP" });
		expect(r.spending).toBe(550);
		expect(r.categories[0].name).toBe("Transfers");
	});
	it("rejects another household's budget and exclusion category", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"INSERT INTO groups(groupid,group_name) VALUES('foreign','Synthetic')",
		).run();
		await env.DB.prepare(
			"INSERT INTO group_budgets(id,group_id,budget_name) VALUES('foreign-budget','foreign','Other')",
		).run();
		await env.DB.prepare(
			"INSERT INTO group_categories(id,group_id,name) VALUES('foreign-category','foreign','Other')",
		).run();
		expect((await request({ ...range, budgetId: "foreign-budget" }, f.cookie)).status).toBe(404);
		expect(
			(await request({ ...range, excludedCategoryIds: ["foreign-category"] }, f.cookie)).status,
		).toBe(400);
		await env.DB.prepare("UPDATE user SET groupid=NULL WHERE id=?").bind(f.users.user1.id).run();
		expect((await request(range, f.cookie)).status).toBe(403);
	});
	it("refuses partial results beyond5000 entries across currencies and exclusions", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5001) INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) SELECT 'cap-'||x,?,'Synthetic',-1,'GBP','2026-01-01' FROM n",
		)
			.bind(f.users.budgetIds.food)
			.run();
		await expect(readCategoryInsights(env, f.users.testGroupId, range)).rejects.toThrow("5,000");
	});
	it("bounds All budget metadata discovery before reading entries", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<101) INSERT INTO group_budgets(id,group_id,budget_name) SELECT 'extra-'||x,?,'Synthetic '||x FROM n",
		)
			.bind(f.users.testGroupId)
			.run();
		await expect(readCategoryInsights(env, f.users.testGroupId, range)).rejects.toThrow(
			"100 active budgets",
		);
	});
	it("excludes future entries consistently with the Budget list", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) VALUES('future',?,'Future',-700,'GBP','2099-01-01')",
		)
			.bind(f.users.budgetIds.food)
			.run();
		const response = await request(
			{ source:"budget",dateFrom: "2099-01-01", dateTo: "2099-01-02", currency: "GBP" },
			f.cookie,
		);
		expect(await response.json()).toMatchObject({ count: 0, spending: 0, credits: 0, net: 0 });
	});
	it("returns an honest empty report when no active household budgets remain", async () => {
		const f = await fixture();
		await env.DB.prepare("UPDATE group_budgets SET deleted='2026-01-01' WHERE group_id=?")
			.bind(f.users.testGroupId)
			.run();
		const response = await request(range, f.cookie);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			budgetId: null,
			currency: null,
			currencies: [],
			count: 0,
			spending: 0,
			credits: 0,
			net: 0,
			categories: [],
			excluded: { count: 0 },
		});
	});
	it("fails closed when any analytics query exceeds the cumulative read budget", async () => {
		const expensive = {
			DB: {
				prepare: () => ({
					bind: () => ({ all: async () => ({ results: [], meta: { rows_read: 40001 } }) }),
				}),
			},
		} as unknown as Env;
		await expect(readCategoryInsights(expensive, "home", range)).rejects.toThrow("read budget");
	});
	it("fails closed without D1 read accounting", async () => {
		const broken = {
			DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) },
		} as unknown as Env;
		await expect(readCategoryInsights(broken, "home", range)).rejects.toThrow("read budget");
	});
});
