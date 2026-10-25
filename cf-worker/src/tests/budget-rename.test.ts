import { createExecutionContext, env } from "cloudflare:test";
import worker from "../index";
import {
	setupAndCleanDatabase,
	completeCleanupDatabase,
	createTestUserData,
	signInAndGetCookies,
} from "./test-utils";
describe("Budget rename", () => {
	beforeAll(() => setupAndCleanDatabase(env));
	beforeEach(() => completeCleanupDatabase(env));
	async function fixture() {
		const f = await createTestUserData(env);
		return {
			...f,
			cookie: await signInAndGetCookies(env, f.user1.email, f.user1.password),
		};
	}
	function call(body: unknown, cookie = "", method = "POST") {
		return worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/budget/rename", {
				method,
				headers: { Cookie: cookie, "Content-Type": "application/json" },
				...(method === "POST" ? { body: JSON.stringify(body) } : {}),
			}),
			env,
			createExecutionContext(),
		);
	}
	it("requires authentication and POST", async () => {
		expect(
			(await call({ budgetId: "food", budgetName: "Groceries" })).status,
		).toBe(401);
		expect((await call({}, "", "GET")).status).toBe(405);
	});
	it("trims and renames only the active household budget, preserving description", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"UPDATE group_budgets SET description='Weekly food' WHERE id=?",
		)
			.bind(f.budgetIds.food)
			.run();
		await env.DB.prepare(
			"INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) VALUES('shop',?,'Weekly supermarket shop',-42.5,'GBP','2026-01-15')",
		)
			.bind(f.budgetIds.food)
			.run();
		await env.DB.prepare(
			"INSERT INTO budget_totals(budget_id,currency,total_amount,updated_at) VALUES(?,'GBP',157.5,'2026-01-15')",
		)
			.bind(f.budgetIds.food)
			.run();
		const response = await call(
			{ budgetId: f.budgetIds.food, budgetName: "  Groceries  " },
			f.cookie,
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			id: f.budgetIds.food,
			budgetName: "Groceries",
			description: "Weekly food",
		});
		expect(
			await env.DB.prepare(
				"SELECT budget_name,description,deleted FROM group_budgets WHERE id=?",
			)
				.bind(f.budgetIds.food)
				.first(),
		).toEqual({
			budget_name: "Groceries",
			description: "Weekly food",
			deleted: null,
		});
		expect(
			await env.DB.prepare("SELECT deleted FROM group_budgets WHERE id=?")
				.bind(f.budgetIds.house)
				.first(),
		).toEqual({ deleted: null });
		expect(
			await env.DB.prepare(
				"SELECT amount,description FROM budget_entries WHERE budget_entry_id='shop'",
			).first(),
		).toEqual({ amount: -42.5, description: "Weekly supermarket shop" });
		expect(
			await env.DB.prepare(
				"SELECT total_amount FROM budget_totals WHERE budget_id=?",
			)
				.bind(f.budgetIds.food)
				.first(),
		).toEqual({ total_amount: 157.5 });
	});
	it("rejects invalid and duplicate names", async () => {
		const f = await fixture();
		const house = await env.DB.prepare(
			"SELECT budget_name name FROM group_budgets WHERE id=?",
		)
			.bind(f.budgetIds.house)
			.first<{ name: string }>();
		for (const budgetName of [
			"",
			"   ",
			"x".repeat(61),
			"Food!",
			42,
			null,
			house!.name.toLowerCase(),
		])
			expect(
				(await call({ budgetId: f.budgetIds.food, budgetName }, f.cookie))
					.status,
			).toBe(400);
		expect((await call(null, f.cookie)).status).toBe(400);
	});
	it("denies foreign, missing, archived budgets and users without a household", async () => {
		const f = await fixture();
		await env.DB.prepare(
			"INSERT INTO groups(groupid,group_name) VALUES('foreign','Other')",
		).run();
		await env.DB.prepare(
			"INSERT INTO group_budgets(id,group_id,budget_name) VALUES('foreign-budget','foreign','Private')",
		).run();
		await env.DB.prepare(
			"UPDATE group_budgets SET deleted='2026-01-01' WHERE id=?",
		)
			.bind(f.budgetIds.house)
			.run();
		for (const budgetId of ["foreign-budget", "missing", f.budgetIds.house])
			expect(
				(await call({ budgetId, budgetName: "Changed" }, f.cookie)).status,
			).toBe(403);
		expect(
			await env.DB.prepare(
				"SELECT budget_name FROM group_budgets WHERE id='foreign-budget'",
			).first(),
		).toEqual({ budget_name: "Private" });
		await env.DB.prepare("UPDATE user SET groupid=NULL WHERE id=?")
			.bind(f.user1.id)
			.run();
		expect(
			(
				await call(
					{ budgetId: f.budgetIds.food, budgetName: "Changed" },
					f.cookie,
				)
			).status,
		).toBe(403);
	});
});
