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
				"INSERT INTO group_categories(id,group_id,name) VALUES('groceries','home','Groceries')",
			)
			.run();
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) SELECT 'target-'||x,'home','Synthetic',1,'GBP','2026-01-01' FROM n",
			)
			.run();
		await db
			.prepare(
				"INSERT INTO record_categories(group_id,record_kind,record_id,category_id,source) SELECT 'home','expense',transaction_id,'groceries','manual' FROM transactions WHERE group_id='home'",
			)
			.run();
		const bind = ["home", "2026-01-01", "2026-02-01", "home"];
		async function measure(label) {
			const result = await db
				.prepare(utility.CATEGORY_INSIGHTS_SQL)
				.bind(...bind)
				.all();
			const plan = (
				await db
					.prepare("EXPLAIN QUERY PLAN " + utility.CATEGORY_INSIGHTS_SQL)
					.bind(...bind)
					.all()
			).results.map((r) => r.detail);
			console.log(JSON.stringify({ label, reads: result.meta.rows_read, plan }));
			assert.equal(result.results.length, 5000);
			assert(result.meta.rows_read < utility.INSIGHTS_READ_LIMIT);
			assert(plan.some((p) => p.includes("transactions_group_id_deleted_created_at_idx")));
			assert(!plan.some((p) => /SCAN (transactions|record_categories|group_categories)/.test(p)));
			return result.meta.rows_read;
		}
		const before = await measure("5000 categorised expenses");
		for (const [group, date, prefix] of [
			["foreign", "2026-01-01", "foreign"],
			["home", "2020-01-01", "old"],
		])
			await db
				.prepare(
					"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50000) INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) SELECT ?||x,?,'Synthetic unrelated',1,'GBP',? FROM n",
				)
				.bind(prefix, group, date)
				.run();
		assert.equal(await measure("plus 100000 unrelated expenses"), before);
		const result = await utility.readCategoryInsights({ DB: db }, "home", {
			dateFrom: "2026-01-01",
			dateTo: "2026-01-31",
			currency: "GBP",
		});
		assert.equal(result.spending, 5000);
		assert.equal(result.count, 5000);
		await db
			.prepare("UPDATE group_categories SET exclude_from_insights=1 WHERE id='groceries'")
			.run();
		const excluded = await utility.readCategoryInsights({ DB: db }, "home", {
			dateFrom: "2026-01-01",
			dateTo: "2026-01-31",
			currency: "GBP",
		});
		assert.equal(excluded.count, 0);
		assert.equal(excluded.spending, 0);
		assert.equal(excluded.excluded.count, 5000);
		assert.equal(excluded.excluded.spending, 5000);
		assert.equal(await measure("all 5000 explicitly excluded"), before);
	} finally {
		await mf.dispose();
		await rm(temp, { recursive: true, force: true });
	}
});
