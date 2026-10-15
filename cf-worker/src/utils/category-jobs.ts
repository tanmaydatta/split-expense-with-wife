/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: bounded job stages keep reservation, scope and outcome guards visible together. */
import type { RecordKind } from "../../../shared-types";
import { listCategories } from "./categories";
import {
	applyBackfillComponent,
	type BackfillPlan,
	type BackfillRecord,
	type BackfillRule,
	backfillEligible,
	planBackfillComponent,
	readBackfillComponent,
} from "./category-backfill";
export type CategoryJobParams = { jobId: string };
export async function readCategoryJob(
	env: Env,
	userId: string,
	groupId: string,
	id: string | null,
) {
	const row =
		await env.DB.prepare(`SELECT id,status,error,created_at AS createdAt FROM category_jobs
 WHERE user_id=? AND group_id=? ${id ? "AND id=?" : ""} ORDER BY created_at DESC LIMIT 1`)
			.bind(userId, groupId, ...(id ? [id] : []))
			.first<{
				id: string;
				status: string;
				error: string | null;
				createdAt: number;
			}>();
	if (!row) return null;
	const counts = await env.DB.prepare(`SELECT count(*) AS total,
 COALESCE(sum(status='categorised'),0) AS categorised,COALESCE(sum(status='skipped'),0) AS skipped,
 COALESCE(sum(status='failed'),0) AS failed,COALESCE(sum(changed_count),0) AS changedRecords
 FROM category_job_items WHERE job_id=?`)
		.bind(row.id)
		.first();
	const changes: Array<{
		kind: RecordKind;
		id: string;
		categoryId: string;
		categoryName?: string;
		categorySource: string;
		categoryVersion: number;
	}> = [];
	if (row.status === "completed") {
		const items = await env.DB.prepare(
			"SELECT plan FROM category_job_items WHERE job_id=? AND status='categorised'",
		)
			.bind(row.id)
			.all<{ plan: string }>();
		for (const item of items.results) {
			const plan = JSON.parse(item.plan) as BackfillPlan;
			if (!plan.decision) continue;
			for (const r of plan.records.filter(backfillEligible))
				changes.push({
					kind: r.kind,
					id: r.id,
					categoryId: plan.decision.categoryId,
					categoryName: plan.categoryName,
					categorySource: plan.decision.source,
					categoryVersion: r.version + 1,
				});
		}
	}
	return { ...row, ...counts, changes };
}
export async function dispatchCategoryJob(env: Env, id: string) {
	try {
		await env.CATEGORY_JOBS_WORKFLOW.create({ id, params: { jobId: id } });
	} catch {
		// A timed-out create may already have dispatched. Confirm the deterministic ID before reporting failure.
		try {
			await env.CATEGORY_JOBS_WORKFLOW.get(id);
			return;
		} catch {
			/* Dispatch never reached Workflows. */
		}
		await env.DB.prepare(
			"UPDATE category_jobs SET status='failed',error='Could not start. Retry this job.',updated_at=? WHERE id=? AND status='queued'",
		)
			.bind(Date.now(), id)
			.run();
	}
}

type Root = { kind: RecordKind; id: string };
type Job = {
	id: string;
	group_id: string;
	user_id: string;
	selection: string;
	status: string;
	records_read: number;
	rows_read: number;
};
const rowKey = (r: Root) => `${r.kind}:${r.id}`;
async function jobRow(env: Env, id: string) {
	return env.DB.prepare("SELECT * FROM category_jobs WHERE id=?")
		.bind(id)
		.first<Job>();
}
async function actorPresent(env: Env, job: Job) {
	return Boolean(
		await env.DB.prepare("SELECT 1 AS ok FROM user WHERE id=? AND groupid=? AND signup_complete=1")
			.bind(job.user_id, job.group_id)
			.first(),
	);
}
/** Each processing step measures actual D1 rows read; the next query fails closed once exhausted. */
function meteredEnvironment(env: Env, initial: number, jobId: string) {
	let read = 0;
	async function measure<T extends { meta: { rows_read?: number } }>(
		operation: () => Promise<T>,
	) {
		if (initial + read >= 50000) throw Error("Job read budget reached");
		// Reserve all remaining allowance before crossing D1. An ambiguous crash consumes it.
		await env.DB.prepare("UPDATE category_jobs SET rows_read=50000 WHERE id=?")
			.bind(jobId)
			.run();
		const result = await operation();
		if (typeof result.meta.rows_read!=="number"||!Number.isFinite(result.meta.rows_read))
			throw Error("D1 read accounting unavailable");
		read += result.meta.rows_read;
		await env.DB.prepare("UPDATE category_jobs SET rows_read=? WHERE id=?")
			.bind(initial + read, jobId)
			.run();
		if (initial + read > 50000) throw Error("Job read budget reached");
		return result;
	}
	const db = new Proxy(env.DB, {
		get(target, property) {
			if (property === "prepare")
				return (sql: string) => {
					const wrap = (stmt: D1PreparedStatement): D1PreparedStatement =>
						new Proxy(stmt, {
							get(t, key) {
								if (key === "bind")
									return (...args: unknown[]) => wrap(t.bind(...args));
								if (key === "all" || key === "run")
									return async () => {
										if (initial + read >= 50000)
											throw Error("Job read budget reached");
										return measure(() => t[key]());
									};
								if (key === "first")
									return async (column?: string) => {
										if (initial + read >= 50000)
											throw Error("Job read budget reached");
										const r = await measure(() => t.all());
										const row = r.results[0];
										return row ? (column ? row[column] : row) : null;
									};
								return Reflect.get(t, key, t);
							},
						});
					return wrap(target.prepare(sql));
				};
			if (property === "batch")
				return async (statements: D1PreparedStatement[]) => {
					if (initial + read >= 50000) throw Error("Job read budget reached");
					const results = await measure(async () => {
						const rows = await target.batch(statements);
						return {
							meta: {
								rows_read: rows.every((r) => Number.isFinite(r.meta.rows_read))
									? rows.reduce((n, r) => n + r.meta.rows_read, 0)
									: undefined,
							},
							rows,
						};
					});
					return results.rows;
				};
			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return { env: { ...env, DB: db } as Env, used: () => read };
}
/** Deterministic recurring IDs map to indexed history/action lookups, never household history scans. */
async function attachRecurringChoices(
	env: Env,
	group: string,
	records: BackfillRecord[],
) {
	const ids = records.flatMap((r) => {
		const match = r.id.match(/^(?:tx|bge)_(.+)_(\d{4}-\d{2}-\d{2})$/);
		return match
			? [
					{
						key: rowKey(r),
						action: match[1],
						history: `hist_${match[1]}-${match[2]}`,
					},
				]
			: [];
	});
	if (!ids.length) return;
	const rows =
		await env.DB.prepare(`SELECT json_extract(x.value,'$.key') AS key,
 CASE WHEN json_type(CASE WHEN json_valid(h.action_data) THEN h.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL THEN json_extract(h.action_data,'$.categoryId') ELSE json_extract(CASE WHEN json_valid(a.action_data) THEN a.action_data ELSE '{}' END,'$.categoryId') END AS categoryId
 FROM json_each(?) x CROSS JOIN scheduled_action_history h ON h.id=json_extract(x.value,'$.history') AND h.execution_status='success'
 CROSS JOIN scheduled_actions a ON a.id=json_extract(x.value,'$.action') AND a.id=h.scheduled_action_id
 CROSS JOIN user u ON u.id=a.user_id AND u.groupid=?
 WHERE json_type(CASE WHEN json_valid(h.action_data) THEN h.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL OR json_type(CASE WHEN json_valid(a.action_data) THEN a.action_data ELSE '{}' END,'$.categoryId') IS NOT NULL`)
			.bind(JSON.stringify(ids), group)
			.all<{ key: string; categoryId: string | null }>();
	const choices = new Map(rows.results.map((r) => [r.key, r.categoryId]));
	for (const record of records)
		if (choices.has(rowKey(record)))
			record.scheduledChoices = [choices.get(rowKey(record)) ?? null];
}
export async function prepareCategoryJobItem(
	env: Env,
	id: string,
	position: number,
) {
	const job = await jobRow(env, id);
	if (!job || !["queued", "running"].includes(job.status)) return;
	const item = await env.DB.prepare(
		"SELECT status FROM category_job_items WHERE job_id=? AND position=?",
	)
		.bind(id, position)
		.first<{ status: string }>();
	if (!item || item.status !== "pending") {
		// An inference reservation surviving a crashed step is deliberately not inferred again.
		if (item?.status === "resolving")
			await env.DB.prepare(
				"UPDATE category_job_items SET status='failed' WHERE job_id=? AND position=? AND status='resolving'",
			)
				.bind(id, position)
				.run();
		return;
	}
	await env.DB.prepare(
		"UPDATE category_jobs SET status='running',updated_at=? WHERE id=? AND status='queued'",
	)
		.bind(Date.now(), id)
		.run();
	await env.DB.prepare(
		"UPDATE category_job_items SET status='resolving' WHERE job_id=? AND position=? AND status='pending'",
	)
		.bind(id, position)
		.run();
	const meter = meteredEnvironment(env, job.rows_read, id);
	try {
		if (!(await actorPresent(meter.env, job)))
			throw Error("Membership changed");
		const roots = JSON.parse(job.selection) as Root[],
			root = roots[position];
		const prior = await meter.env.DB.prepare(
			"SELECT plan FROM category_job_items WHERE job_id=? AND position<? AND plan IS NOT NULL",
		)
			.bind(id, position)
			.all<{ plan: string }>();
		if (
			prior.results.some((p) =>
				(JSON.parse(p.plan) as BackfillPlan).records.some(
					(r) => rowKey(r) === rowKey(root),
				),
			)
		) {
			await env.DB.prepare(
				"UPDATE category_job_items SET status='skipped' WHERE job_id=? AND position=?",
			)
				.bind(id, position)
				.run();
			return;
		}
		const remaining = 2000 - job.records_read;
		if (remaining <= 0) throw Error("Job record budget reached");
		const records = await readBackfillComponent(
			meter.env,
			job.group_id,
			root,
			Math.min(1000, remaining),
		);
		await env.DB.prepare(
			"UPDATE category_jobs SET records_read=records_read+? WHERE id=?",
		)
			.bind(records.length, id)
			.run();
		if (!records.length || records.length > Math.min(1000, remaining))
			throw Error("Linked component exceeds job limit");
		if (records.some((r) => r.description.length > 2000))
			throw Error("Description exceeds job limit");
		await attachRecurringChoices(meter.env, job.group_id, records);
		const taxonomy = await listCategories(meter.env, job.group_id);
		if (!taxonomy.enabled) throw Error("Categories unavailable");
		const rules = await meter.env.DB.prepare(
			"SELECT match_kind AS kind,pattern,category_id AS categoryId FROM category_rules WHERE group_id=? LIMIT 100",
		)
			.bind(job.group_id)
			.all<BackfillRule>();
		const plan = await planBackfillComponent(
			meter.env,
			taxonomy.categories,
			rules.results,
			records,
		);
		await env.DB.prepare(
			"UPDATE category_job_items SET status=?,plan=?,record_count=? WHERE job_id=? AND position=?",
		)
			.bind(
				plan.status === "proposed" ? "planned" : "skipped",
				JSON.stringify(plan),
				records.length,
				id,
				position,
			)
			.run();
	} catch {
		await env.DB.prepare(
			"UPDATE category_job_items SET status='failed' WHERE job_id=? AND position=? AND status='resolving'",
		)
			.bind(id, position)
			.run();
	} finally {
		await env.DB.prepare("UPDATE category_jobs SET updated_at=? WHERE id=?")
			.bind(Date.now(), id)
			.run();
	}
}
export async function applyCategoryJobItem(
	env: Env,
	id: string,
	position: number,
) {
	const job = await jobRow(env, id);
	if (!job || !["queued", "running"].includes(job.status)) return;
	const item = await env.DB.prepare(
		"SELECT status,plan FROM category_job_items WHERE job_id=? AND position=?",
	)
		.bind(id, position)
		.first<{ status: string; plan: string }>();
	if (item?.status !== "planned") return;
	const meter = meteredEnvironment(env, job.rows_read, id);
	try {
		const plan = JSON.parse(item.plan) as BackfillPlan;
		const outcome = (await actorPresent(meter.env, job))
			? await applyBackfillComponent(meter.env, job.group_id, plan, {
					userId: job.user_id,
					jobId: id,
				})
			: "stale";
		const success = outcome === "applied" || outcome === "already-applied";
		await env.DB.prepare(
			"UPDATE category_job_items SET status=?,changed_count=? WHERE job_id=? AND position=? AND status='planned'",
		)
			.bind(
				success ? "categorised" : "skipped",
				success ? plan.records.filter(backfillEligible).length : 0,
				id,
				position,
			)
			.run();
	} catch {
		await env.DB.prepare(
			"UPDATE category_job_items SET status='failed' WHERE job_id=? AND position=? AND status='planned'",
		)
			.bind(id, position)
			.run();
	} finally {
		await env.DB.prepare("UPDATE category_jobs SET updated_at=? WHERE id=?")
			.bind(Date.now(), id)
			.run();
	}
}
export async function finishCategoryJob(env: Env, id: string) {
	await env.DB.prepare(
		"UPDATE category_job_items SET status='failed' WHERE job_id=? AND status IN ('pending','resolving','planned')",
	)
		.bind(id)
		.run();
	await env.DB.prepare(
		"UPDATE category_jobs SET status='completed',updated_at=? WHERE id=? AND status IN ('queued','running')",
	)
		.bind(Date.now(), id)
		.run();
}

export async function failCategoryJob(
	env: Env,
	id: string,
	error = "Processing stopped. Start a new selection.",
) {
	await env.DB.batch([
		env.DB.prepare(
			"UPDATE category_job_items SET status='failed' WHERE job_id=? AND status IN ('pending','resolving','planned')",
		).bind(id),
		env.DB.prepare(
			"UPDATE category_jobs SET status='failed',error=?,updated_at=? WHERE id=? AND status IN ('queued','running')",
		).bind(error, Date.now(), id),
	]);
}
/** Indexed leases release capacity even when nobody stayed on the page to poll. */
export async function expireCategoryJobs(
	env: Env,
	userId: string,
	groupId: string,
) {
	const cutoff = Date.now() - 300000;
	const stale = await env.DB.prepare(
		"SELECT id FROM category_jobs WHERE group_id=? AND status IN ('queued','running') AND updated_at<? UNION SELECT id FROM category_jobs WHERE user_id=? AND status IN ('queued','running') AND updated_at<?",
	)
		.bind(groupId, cutoff, userId, cutoff)
		.all<{ id: string }>();
	for (const row of stale.results)
		await failCategoryJob(
			env,
			row.id,
			"Job stopped responding. Start a new selection.",
		);
}
