import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { readFile, readdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
test("insights production migrations bound reads independently of unrelated history", async () => {
	const root = new URL("../../cf-worker/", import.meta.url).pathname;
	const mf = new Miniflare({
		modules: true,
		script: 'export default {fetch(){return new Response("synthetic")}}',
		compatibilityDate: "2025-08-01",
		d1Databases: { DB: "insights-cost" },
	});
	const temp = await mkdtemp(join(tmpdir(), "insights-cost-"));
	const db = await mf.getD1Database("DB");
	try {
		for (const file of (await readdir(root + "src/db/migrations"))
			.filter((f) => f.endsWith(".sql"))
			.sort())
			for (const sql of (await readFile(root + "src/db/migrations/" + file, "utf8"))
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean))
				await db.prepare(sql).run();
		const source = await readFile(root + "src/utils/category-insights.ts", "utf8");
		await writeFile(
			join(temp, "insights.mjs"),
			ts.transpileModule(source, {
				compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
			}).outputText,
		);
		const utility = await import(pathToFileURL(join(temp, "insights.mjs")));
		await db
			.prepare(
				"INSERT INTO groups(groupid,group_name) VALUES('home','Synthetic'),('foreign','Synthetic foreign')",
			)
			.run();

		await db
			.prepare(
				"INSERT INTO group_budgets(id,group_id,budget_name) VALUES('food','home','Food'),('house','home','Household'),('foreign-budget','foreign','Other')",
			)
			.run();
		await db
			.prepare(
				"INSERT INTO group_categories(id,group_id,name) VALUES('groceries','home','Groceries')",
			)
			.run();
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) SELECT 'target-'||x,CASE WHEN x%2=0 THEN 'food' ELSE 'house' END,'Synthetic',-1,'GBP','2026-01-01' FROM n",
			)
			.run();
		await db
			.prepare(
				"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) SELECT 'home','budget',budget_entry_id,'groceries','manual' FROM budget_entries WHERE budget_id IN ('food','house')",
			)
			.run();
		let reads = 0,
			plans = [];
		const wrapped = {
			prepare(sql) {
				const statement = (values) => ({
					bind(...next) {
						return statement(next);
					},
					async all() {
						const result = await db
							.prepare(sql)
							.bind(...values)
							.all();
						reads += result.meta.rows_read;
						plans.push(
							...(
								await db
									.prepare("EXPLAIN QUERY PLAN " + sql)
									.bind(...values)
									.all()
							).results.map((row) => row.detail),
						);
						return result;
					},
				});
				return statement([]);
			},
		};
		async function measure(label, expectedCount = 5000) {
			reads = 0;
			plans = [];
			let result, error;
			try {
				result = await utility.readCategoryInsights({ DB: wrapped }, "home", {
					source:"budget",dateFrom: "2026-01-01",
					dateTo: "2026-01-31",
					currency: "GBP",
				});
			} catch (e) {
				error = e;
			}
			console.log(JSON.stringify({ label, reads, plans }));
			assert(reads < 25000);
			assert(plans.some((p) => p.includes("budget_entries_monthly_aggregation_idx")));
			assert(
				!plans.some((p) =>
					/SCAN (budget_entries|group_budgets|record_categories|group_categories)/.test(p),
				),
			);
			assert(!plans.some((p) => p.includes("ORDER BY")));
			if (expectedCount === null) {
				assert.match(error?.message ?? "", /5,000/);
			} else {
				assert.ifError(error);
				assert.equal(result.count, expectedCount);
			}
			return { reads, result };
		}
		const before = await measure("5000 categorised budget entries across two budgets");
		assert.equal(before.result.spending, 5000);
		for (const [budget, date, prefix] of [
			["foreign-budget", "2026-01-01", "foreign-"],
			["food", "2020-01-01", "old-"],
		])
			await db
				.prepare(
					"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50000) INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) SELECT ?||x,?,'Synthetic unrelated',-1,'GBP',? FROM n",
				)
				.bind(prefix, budget, date)
				.run();
		assert.equal((await measure("plus100000 unrelated budget entries")).reads, before.reads);
		await db
			.prepare("UPDATE group_categories SET exclude_from_insights=1 WHERE id='groceries'")
			.run();
		const excluded = await measure("all5000 budget entries excluded", 0);
		assert.equal(excluded.result.excluded.count, 5000);
		assert.equal(excluded.result.excluded.spending, 5000);
		assert.equal(excluded.reads, before.reads);
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50000) INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) SELECT 'in-range-'||x,CASE WHEN x%2=0 THEN 'food' ELSE 'house' END,'Synthetic in range',-1,'GBP','2026-01-02' FROM n",
			)
			.run();
		await measure("55000 in-range across multiple budgets fails at bounded5001", null);
	} finally {
		await mf.dispose();
		await rm(temp, { recursive: true, force: true });
	}
});
