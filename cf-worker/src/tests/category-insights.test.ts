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
const range = { dateFrom: "2026-01-01", dateTo: "2026-02-28" };
describe("Shared expense category insights", () => {
	beforeAll(async () => {
		await setupAndCleanDatabase(env);
		await env.DB.prepare(
			"CREATE INDEX IF NOT EXISTS transactions_group_id_deleted_created_at_idx ON transactions(group_id,deleted,created_at)",
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
	it("rejects unauthenticated requests", async () =>
		expect((await request(range)).status).toBe(401));
	it("validates real UTC dates, bounded range and currency", () => {
		for (const value of [
			{ ...range, dateFrom: "2026-02-30" },
			{ ...range, dateTo: "2025-01-01" },
			{ ...range, dateTo: "2028-01-01" },
			{ ...range, currency: "bad" },
		])
			expect(validateInsightsRequest(value)).toBeNull();
		expect(validateInsightsRequest(range)).toEqual(range);
	});
	async function fixture() {
		const users = await createTestUserData(env);
		const cookie = await signInAndGetCookies(env, users.user1.email, users.user1.password);
		await env.DB.prepare(
			"INSERT INTO group_categories(id,group_id,name,slug,archived_at) VALUES('insight-grocery',?,'Groceries','groceries',NULL),('insight-old',?,'Archived hobbies',NULL,'2026-01-01')",
		)
			.bind(users.testGroupId, users.testGroupId)
			.run();
		const rows = [
			["one", 100, "GBP", "2026-01-10"],
			["two", 50, "GBP", "2026-02-10"],
			["refund", -100, "GBP", "2026-02-11"],
			["euro", 900, "EUR", "2026-01-10"],
			["outside", 800, "GBP", "2025-01-10"],
		] as const;
		for (const [id, amount, currency, date] of rows)
			await env.DB.prepare(
				"INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) VALUES(?,?,'Synthetic',?,?,?)",
			)
				.bind(id, users.testGroupId, amount, currency, date)
				.run();
		await env.DB.prepare(
			"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) VALUES(?,'expense','one','insight-grocery','manual'),(?,'expense','refund','insight-grocery','manual')",
		)
			.bind(users.testGroupId, users.testGroupId)
			.run();
		// A linked budget copy must never enter expense totals.
		await env.DB.prepare(
			"INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency) VALUES('insight-copy',?,'Synthetic copy',-100,'GBP')",
		)
			.bind(users.budgetIds.food)
			.run();
		await env.DB.prepare(
			"INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) VALUES('insight-link','one','insight-copy',?,'2026-01-10')",
		)
			.bind(users.testGroupId)
			.run();
		return { users, cookie };
	}
	it("counts canonical expenses once and separates spending, negative adjustments, currency and month", async () => {
		const { users } = await fixture();
		const result = await readCategoryInsights(env, users.testGroupId, {
			...range,
			currency: "GBP",
		});
		expect(result.spending).toBe(150);
		expect(result.negativeAdjustments).toBe(-100);
		expect(result.net).toBe(50);
		expect(result.count).toBe(3);
		expect(result.currencies).toEqual(["EUR", "GBP"]);
		expect(result.categories.find((c) => c.id === "insight-grocery")).toMatchObject({
			spending: 100,
			negativeAdjustments: -100,
			percentage: (100 / 150) * 100,
		});
		expect(result.categories.find((c) => c.id === null)).toMatchObject({
			name: "Uncategorised",
			spending: 50,
		});
		expect(result.months.map((m) => [m.month, m.spending])).toEqual([
			["2026-01", 100],
			["2026-02", 50],
		]);
	});
	it("uses the current user's group and cannot be redirected by a request group", async () => {
		const f = await fixture();
		expect((await request({ ...range, groupId: "foreign" }, f.cookie)).status).toBe(400);
		await env.DB.prepare("UPDATE user SET groupid=NULL WHERE id=?").bind(f.users.user1.id).run();
		expect((await request(range, f.cookie)).status).toBe(403);
	});
	it("authenticates another household without exposing the original group's categories or totals", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"INSERT INTO groups(groupid,group_name) VALUES('insight-foreign','Synthetic foreign')",
		).run();
		await env.DB.prepare("UPDATE user SET groupid='insight-foreign' WHERE id=?")
			.bind(f.users.user2.id)
			.run();
		await env.DB.prepare(
			"INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) VALUES('foreign-insight','insight-foreign','Synthetic foreign',7,'GBP','2026-01-01')",
		).run();
		const cookie = await signInAndGetCookies(env, f.users.user2.email, f.users.user2.password);
		const response = await request({ ...range, currency: "GBP" }, cookie);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { spending: number; categories: { name: string }[] };
		expect(body.spending).toBe(7);
		expect(body.categories.map((c) => c.name)).toEqual(["Uncategorised"]);
	});
	it("returns no other household's records and handles negative-only/zero totals", async () => {
		const f = await fixture();
		await env.DB.prepare("UPDATE transactions SET amount=-5 WHERE group_id=?")
			.bind(f.users.testGroupId)
			.run();
		const result = await readCategoryInsights(env, f.users.testGroupId, {
			...range,
			currency: "GBP",
		});
		expect(result.spending).toBe(0);
		expect(result.categories.every((c) => c.percentage === 0)).toBe(true);
		const empty = await readCategoryInsights(env, "missing", range);
		expect(empty.count).toBe(0);
		expect(empty.categories).toEqual([]);
	});
	it("keeps archived categories and excludes deleted entries", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) VALUES(?,'expense','two','insight-old','manual')",
		)
			.bind(f.users.testGroupId)
			.run();
		await env.DB.prepare(
			"UPDATE transactions SET deleted='2026-02-12' WHERE transaction_id='one'",
		).run();
		const result = await readCategoryInsights(env, f.users.testGroupId, {
			...range,
			currency: "GBP",
		});
		expect(result.spending).toBe(50);
		expect(result.categories.find((c) => c.id === "insight-old")?.name).toBe("Archived hobbies");
	});
	it("explicitly excludes selected categories consistently and reports excluded amounts", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"UPDATE group_categories SET exclude_from_insights=1 WHERE id='insight-grocery'",
		).run();
		const result = await readCategoryInsights(env, f.users.testGroupId, {
			...range,
			currency: "GBP",
		});
		expect(result).toMatchObject({
			count: 1,
			spending: 50,
			negativeAdjustments: 0,
			net: 50,
			excluded: {
				count: 2,
				spending: 100,
				negativeAdjustments: -100,
				net: 0,
				categories: ["Groceries"],
			},
		});
		expect(result.categories.map((c) => c.name)).toEqual(["Uncategorised"]);
		expect(result.months.map((m) => m.spending)).toEqual([0, 50]);
		const euros = await readCategoryInsights(env, f.users.testGroupId, {
			...range,
			currency: "EUR",
		});
		expect(euros.spending).toBe(900);
		expect(euros.excluded.count).toBe(0);
	});
	it("changes only the current household category's explicit exclusion preference", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"UPDATE group_categories SET archived_at='2026-01-01' WHERE id='insight-grocery'",
		).run();
		const write = (id: string, excluded: unknown) =>
			worker.fetch(
				new Request("https://localhost:8787/.netlify/functions/categories", {
					method: "POST",
					headers: { Cookie: f.cookie, "Content-Type": "application/json" },
					body: JSON.stringify({ action: "insight-exclusion", id, excluded }),
				}),
				env,
				createExecutionContext(),
			);
		expect((await write("insight-grocery", true)).status).toBe(200);
		expect(
			await env.DB.prepare(
				"SELECT name,archived_at,exclude_from_insights FROM group_categories WHERE id='insight-grocery'",
			).first(),
		).toEqual({ name: "Groceries", archived_at: "2026-01-01", exclude_from_insights: 1 });
		expect((await write("insight-grocery", "true")).status).toBe(400);
		await env.DB.prepare(
			"INSERT INTO groups(groupid,group_name) VALUES('exclusion-foreign','Synthetic foreign')",
		).run();
		await env.DB.prepare(
			"INSERT INTO group_categories(id,group_id,name) VALUES('foreign-category','exclusion-foreign','Transfers')",
		).run();
		expect((await write("foreign-category", true)).status).toBe(409);
		expect(
			await env.DB.prepare(
				"SELECT exclude_from_insights FROM group_categories WHERE id='foreign-category'",
			).first("exclude_from_insights"),
		).toBe(0);
		expect((await write("insight-grocery", false)).status).toBe(200);
		expect(
			await env.DB.prepare(
				"SELECT exclude_from_insights FROM group_categories WHERE id='insight-grocery'",
			).first("exclude_from_insights"),
		).toBe(0);
	});
	it("does not infer exclusion from names such as Transfers", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"UPDATE group_categories SET name='Transfers' WHERE id='insight-grocery'",
		).run();
		const result = await readCategoryInsights(env, f.users.testGroupId, {
			...range,
			currency: "GBP",
		});
		expect(result.spending).toBe(150);
		expect(result.excluded.count).toBe(0);
	});

	it("refuses incomplete results above the record cap", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5001) INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) SELECT 'cap-'||x,?,'Synthetic',1,'GBP','2026-01-01' FROM n",
		)
			.bind(f.users.testGroupId)
			.run();
		await expect(readCategoryInsights(env, f.users.testGroupId, range)).rejects.toThrow("5,000");
	});
	it("refuses aggregates when measured D1 reads exceed the budget", async () => {
		const expensive = {
			...env,
			DB: {
				prepare: () => ({
					bind: () => ({ all: async () => ({ results: [], meta: { rows_read: 40001 } }) }),
				}),
			},
		} as unknown as Env;
		await expect(readCategoryInsights(expensive, "group", range)).rejects.toThrow("read budget");
	});
	it("fails closed without trustworthy D1 read accounting", async () => {
		const broken = {
			...env,
			DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) },
		} as unknown as Env;
		await expect(readCategoryInsights(broken, "group", range)).rejects.toThrow("read budget");
	});
});
