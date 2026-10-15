import { ulid } from "ulid";
import { z } from "zod";
import {
	createErrorResponse,
	createJsonResponse,
	withAuthLite,
} from "../utils";
import { categoriesEnabled } from "../utils/categories";
import {
	dispatchCategoryJob,
	expireCategoryJobs,
	readCategoryJob,
} from "../utils/category-jobs";

const Start = z.object({
	requestId: z
		.string()
		.min(8)
		.max(100)
		.regex(/^[a-zA-Z0-9_-]+$/),
	records: z
		.array(
			z.object({
				kind: z.enum(["expense", "budget"]),
				id: z.string().min(1).max(500),
			}),
		)
		.min(1)
		.max(100),
});
export async function handleCategoryJobs(
	request: Request,
	env: Env,
): Promise<Response> {
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: authenticate, validate and atomically establish one bounded job.
	return withAuthLite(request, env, async (session) => {
		const group = session.currentUser.groupid,
			user = session.user.id;
		if (!group)
			return createErrorResponse("Join a group first", 400, request, env);
		if (!categoriesEnabled(env))
			return createErrorResponse(
				"Categories are not enabled",
				503,
				request,
				env,
			);
		await expireCategoryJobs(env,user,group);
		if (request.method === "GET") {
			const id = new URL(request.url).searchParams.get("id");
			const job = await readCategoryJob(env, user, group, id);
			return id && !job
				? createErrorResponse("Job not found", 404, request, env)
				: createJsonResponse({ job }, 200, {}, request, env);
		}
		const parsed = Start.safeParse(await request.json().catch(() => null));
		if (!parsed.success)
			return createErrorResponse(
				"Select between 1 and 100 records",
				400,
				request,
				env,
			);
		const records = [
			...new Map(
				parsed.data.records.map((r) => [`${r.kind}:${r.id}`, r]),
			).values(),
		];
		const selection = JSON.stringify(records),
			now = Date.now();
		let row = await env.DB.prepare(
			"SELECT id,selection,status FROM category_jobs WHERE user_id=? AND group_id=? AND request_id=?",
		)
			.bind(user, group, parsed.data.requestId)
			.first<{ id: string; selection: string; status: string }>();
		if (row && row.selection !== selection)
			return createErrorResponse(
				"Request ID already used for another selection",
				409,
				request,
				env,
			);
		if (!row) {
			const id = `cj_${ulid()}`;
			const insert =
				env.DB.prepare(`INSERT OR IGNORE INTO category_jobs(id,group_id,user_id,request_id,selection,status,created_at,updated_at)
 SELECT ?,?,?,?,?,'queued',?,? WHERE EXISTS(SELECT 1 FROM user WHERE id=? AND groupid=?)
 AND NOT EXISTS(SELECT 1 FROM category_jobs WHERE group_id=? AND created_at>?)`).bind(
					id,
					group,
					user,
					parsed.data.requestId,
					selection,
					now,
					now,
					user,
					group,
					group,
					now - 30000,
				);
			const [inserted] = await env.DB.batch([
				insert,
				env.DB.prepare(
					"INSERT INTO category_job_items(job_id,position) SELECT j.id,CAST(x.key AS INTEGER) FROM category_jobs j CROSS JOIN json_each(j.selection) x WHERE j.id=?",
				).bind(id),
			]);
 if(!inserted.meta.changes){
 row=await env.DB.prepare("SELECT id,selection,status FROM category_jobs WHERE user_id=? AND group_id=? AND request_id=?").bind(user,group,parsed.data.requestId).first<{id:string;selection:string;status:string}>();
 if(!row)return createErrorResponse("A job is active or was started recently. Try again shortly.",429,request,env);
 if(row.selection!==selection)return createErrorResponse("Request ID already used for another selection",409,request,env);
 }else row={id,selection,status:"queued"};
		}
		if (row.status === "failed") {
			const retry = await env.DB.prepare(
				"UPDATE OR IGNORE category_jobs SET status='queued',error=NULL,updated_at=? WHERE id=? AND error='Could not start. Retry this job.'",
			)
				.bind(now, row.id)
				.run();
			if (!retry.meta.changes)
				return createErrorResponse(
					"This job ended. Start a new selection.",
					409,
					request,
					env,
				);
			row.status = "queued";
		}
		if (row.status === "queued") await dispatchCategoryJob(env, row.id);
		return createJsonResponse(
			{ job: await readCategoryJob(env, user, group, row.id) },
			202,
			{},
			request,
			env,
		);
	});
}
