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
			for (const sql of (
				await readFile(root + "src/db/migrations/" + file, "utf8")
			)
				.split("--> statement-breakpoint")
				.map((s) => s.trim())
				.filter(Boolean))
				await db.prepare(sql).run();
		const source = await readFile(
			root + "src/utils/category-insights.ts",
			"utf8",
		);
		await writeFile(
			join(temp, "insights.mjs"),
			ts.transpileModule(source, {
				compilerOptions: {
					target: ts.ScriptTarget.ES2022,
					module: ts.ModuleKind.ES2022,
				},
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
					source: "budget",
					dateFrom: "2026-01-01",
					dateTo: "2026-01-31",
					currency: "GBP",
				});
			} catch (e) {
				error = e;
			}
			console.log(JSON.stringify({ label, reads, plans }));
			assert(reads < 35000);
			assert(
				plans.some((p) => p.includes("budget_entries_monthly_aggregation_idx")),
			);
			assert(
				!plans.some((p) =>
					/SCAN (budget_entries|group_budgets|record_categories|group_categories|budget_transfers|budget_transfer_entries)/.test(
						p,
					),
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
		const before = await measure(
			"5000 categorised budget entries across two budgets",
		);
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
		assert.equal(
			(await measure("plus100000 unrelated budget entries")).reads,
			before.reads,
		);
		await db
			.prepare(
				"UPDATE group_categories SET exclude_from_insights=1 WHERE id='groceries'",
			)
			.run();
		const excluded = await measure("all5000 budget entries excluded", 0);
		assert.equal(excluded.result.excluded.count, 5000);
		assert.equal(excluded.result.excluded.spending, 5000);
		assert.equal(excluded.reads, before.reads);

		await db
			.prepare(
				"UPDATE group_categories SET exclude_from_insights=0 WHERE id='groceries'",
			)
			.run();
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO budget_transfers(id,group_id,actor_id,request_id,source_budget_id,destination_budget_id,amount,currency,added_time,created_at) SELECT 'target-transfer-'||x,'home','synthetic','target-request-'||x,'food','house',1,'GBP','2026-01-01','2026-01-01' FROM n",
			)
			.run();
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO budget_transfer_entries(entry_id,transfer_id,role) SELECT 'target-'||x,'target-transfer-'||x,'source' FROM n",
			)
			.run();
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO budget_transfer_entries(entry_id,transfer_id,role) SELECT 'old-'||x,'target-transfer-'||x,'destination' FROM n",
			)
			.run();
		const transfers = await measure(
			"5000 explicit transfer entries excluded independently of categories",
			0,
		);
		assert.equal(transfers.result.excluded.transfers.count, 5000);
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO budget_transfers(id,group_id,actor_id,request_id,source_budget_id,destination_budget_id,amount,currency,added_time,created_at) SELECT 'history-transfer-'||x,'home','synthetic','history-request-'||x,'food','house',1,'GBP','2019-01-01','2019-01-01' FROM n",
			)
			.run();
		for (const role of ["source", "destination"]) {
			await db
				.prepare(
					"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) SELECT ?||x,?,'Unrelated transfer',?,'GBP','2019-01-01' FROM n",
				)
				.bind(
					"history-" + role + "-",
					role === "source" ? "food" : "house",
					role === "source" ? -1 : 1,
				)
				.run();
			await db
				.prepare(
					"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100000) INSERT INTO budget_transfer_entries(entry_id,transfer_id,role) SELECT ?||x,'history-transfer-'||x,? FROM n",
				)
				.bind("history-" + role + "-", role)
				.run();
		}
		assert.equal(
			(
				await measure(
					"plus100000 same-household transfer headers and200000 mapping rows",
					0,
				)
			).reads,
			transfers.reads,
		);
		const infoSource = await readFile(
			root + "src/utils/budget-transfer-info.ts",
			"utf8",
		);
		await writeFile(
			join(temp, "info.mjs"),
			ts.transpileModule(infoSource, {
				compilerOptions: {
					target: ts.ScriptTarget.ES2022,
					module: ts.ModuleKind.ES2022,
				},
			}).outputText,
		);
		const { readTransferInfo } = await import(
			pathToFileURL(join(temp, "info.mjs"))
		);
		reads = 0;
		plans = [];
		const page = await readTransferInfo(
			{ DB: wrapped },
			"home",
			Array.from({ length: 25 }, (_, i) => "target-" + (i + 1)),
		);
		console.log(
			JSON.stringify({
				label: "25entry transfer metadata with100000 unrelated transfers",
				reads,
				plans,
			}),
		);
		assert.equal(page.size, 25);
		assert(reads < 250);
		assert(!plans.some((p) => /SCAN (e|t|pair|other)\b/.test(p)));
		await db
			.prepare(
				"INSERT INTO transactions(transaction_id,group_id,description,amount,currency,created_at) VALUES('ordinary-expense','home','Synthetic',1,'GBP','2026-01-01')",
			)
			.run();
		await db
			.prepare(
				"INSERT INTO user(id,name,email,email_verified,created_at,updated_at,first_name,last_name,groupid) VALUES('synthetic','Synthetic','synthetic@example.test',1,0,0,'Synthetic','Example','home')",
			)
			.run();
		await db
			.prepare(
				"INSERT INTO bank_connections(id,user_id,group_id,plaid_item_id,institution_name,access_token_encrypted,status,created_at,updated_at) VALUES('connection','synthetic','home','synthetic-item','Synthetic','synthetic-not-secret','connected','2026-01-01','2026-01-01')",
			)
			.run();
		await db
			.prepare(
				"INSERT INTO bank_transactions(id,connection_id,user_id,account_id,date,name,amount_minor,currency,pending,created_at,updated_at) VALUES('ordinary-bank','connection','synthetic','account','2026-01-01','Synthetic',100,'GBP',0,'2026-01-01','2026-01-01')",
			)
			.run();
		await db
			.prepare(
				"UPDATE bank_transactions SET linked_budget_entry_id='old-10000' WHERE id='ordinary-bank'",
			)
			.run();
		await assert.rejects(
			db
				.prepare(
					"UPDATE bank_transactions SET linked_budget_entry_id='target-1' WHERE id='ordinary-bank'",
				)
				.run(),
			/Transfers cannot link/,
		);
		const monthlySql =
			"SELECT substr(e.added_time,1,7) month,sum(e.amount) amount FROM budget_entries e WHERE e.budget_id=? AND e.deleted IS NULL AND e.added_time>=? AND e.amount<0 AND NOT EXISTS(SELECT 1 FROM budget_transfer_entries te WHERE te.entry_id=e.budget_entry_id) GROUP BY substr(e.added_time,1,7),e.currency";
		const monthly = await db
			.prepare(monthlySql)
			.bind("food", "2026-01-01")
			.all();
		const monthlyPlans = (
			await db
				.prepare("EXPLAIN QUERY PLAN " + monthlySql)
				.bind("food", "2026-01-01")
				.all()
		).results.map((r) => r.detail);
		console.log(
			JSON.stringify({
				label: "existing monthly spending excludes transfer debits",
				reads: monthly.meta.rows_read,
				plans: monthlyPlans,
			}),
		);
		assert.deepEqual(monthly.results, []);
		assert(monthly.meta.rows_read < 15000);
		assert(monthlyPlans.some((p) => /SEARCH te .*entry_id/.test(p)));
		assert(
			!monthlyPlans.some((p) => /SCAN (te|budget_transfer_entries)/.test(p)),
		);
		// Existing bank/expense inserts remain valid; trigger membership lookups are entry-PK probes.
		await db
			.prepare(
				"INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) VALUES('ordinary-link','ordinary-expense','old-10000','home','2026-01-01')",
			)
			.run();
		await assert.rejects(
			db
				.prepare(
					"INSERT INTO expense_budget_links(id,transaction_id,budget_entry_id,group_id,created_at) VALUES('transfer-link','ordinary-expense','target-1','home','2026-01-01')",
				)
				.run(),
			/Transfers cannot link/,
		);
		await db
			.prepare(
				"WITH RECURSIVE n(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<50000) INSERT INTO budget_entries(budget_entry_id,budget_id,description,amount,currency,added_time) SELECT 'in-range-'||x,CASE WHEN x%2=0 THEN 'food' ELSE 'house' END,'Synthetic in range',-1,'GBP','2026-01-02' FROM n",
			)
			.run();
		await measure(
			"55000 in-range across multiple budgets fails at bounded5001",
			null,
		);
	} finally {
		await mf.dispose();
		await rm(temp, { recursive: true, force: true });
	}
});
