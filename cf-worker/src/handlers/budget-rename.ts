import { RenameBudgetRequestSchema } from "../../../shared-types";
import {
	createErrorResponse,
	createJsonResponse,
	withAuthLite,
} from "../utils";

export async function handleBudgetRename(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST")
		return createErrorResponse("Method not allowed", 405, request, env);
	return withAuthLite(request, env, async (session) => {
		const parsed = RenameBudgetRequestSchema.safeParse(
			await request.json().catch(() => null),
		);
		if (!parsed.success)
			return createErrorResponse(
				parsed.error.issues[0].message,
				400,
				request,
				env,
			);
		const { budgetId, budgetName } = parsed.data;
		const groupId = session.currentUser.groupid;
		if (!groupId)
			return createErrorResponse("Budget unavailable", 403, request, env);
		try {
			// The UPDATE rechecks active membership and ownership atomically. No entries or totals are touched.
			const updated =
				await env.DB.prepare(`UPDATE group_budgets SET budget_name=?, updated_at=CURRENT_TIMESTAMP
   WHERE id=? AND group_id=? AND deleted IS NULL
   AND EXISTS (SELECT 1 FROM user WHERE id=? AND groupid=group_budgets.group_id)
   AND NOT EXISTS (SELECT 1 FROM group_budgets other WHERE other.group_id=? AND other.deleted IS NULL AND other.id<>? AND lower(other.budget_name)=lower(?))
   RETURNING id,budget_name AS budgetName,description`)
					.bind(
						budgetName,
						budgetId,
						String(groupId),
						session.user.id,
						String(groupId),
						budgetId,
						budgetName,
					)
					.first();
			if (updated) return createJsonResponse(updated, 200, {}, request, env);
			const owned =
				await env.DB.prepare(`SELECT id FROM group_budgets WHERE id=? AND group_id=? AND deleted IS NULL
   AND EXISTS (SELECT 1 FROM user WHERE id=? AND groupid=group_budgets.group_id)`)
					.bind(budgetId, String(groupId), session.user.id)
					.first();
			if (owned)
				return createErrorResponse(
					"A budget with this name already exists",
					400,
					request,
					env,
				);
			return createErrorResponse("Budget unavailable", 403, request, env);
		} catch {
			return createErrorResponse(
				"Could not save budget name",
				500,
				request,
				env,
			);
		}
	});
}
