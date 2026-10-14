import type { RecordKind } from "../../../shared-types";

/** Financial invariants for reviewed IDs only. CROSS JOIN keeps JSON IDs outermost. */
export async function readBackfillAudit(
	env: Env,
	groupId: string,
	records: Array<{ kind: RecordKind; id: string }>,
) {
	if (records.length > 100)
		throw Error("Audit batches must contain at most 100 records");
	const wanted =
		"WITH wanted AS (SELECT json_extract(value,'$.kind') AS kind,json_extract(value,'$.id') AS id FROM json_each(?)) ";
	const ids = JSON.stringify(records);
	const financial =
		await env.DB.prepare(`${wanted}SELECT 'expense' AS kind,t.transaction_id AS id,t.amount,t.currency,t.deleted,NULL AS budgetId,NULL AS price
 FROM wanted w CROSS JOIN transactions t ON t.transaction_id=w.id WHERE w.kind='expense' AND t.group_id=?
 UNION ALL SELECT 'budget',b.budget_entry_id,b.amount,b.currency,b.deleted,b.budget_id,b.price
 FROM wanted w CROSS JOIN budget_entries b ON b.budget_entry_id=w.id CROSS JOIN group_budgets g ON g.id=b.budget_id WHERE w.kind='budget' AND g.group_id=?`)
			.bind(ids, groupId, groupId)
			.all();
	const shares =
		await env.DB.prepare(`${wanted}SELECT s.transaction_id,s.user_id,s.owed_to_user_id,s.amount,s.currency,s.deleted
 FROM wanted w CROSS JOIN transaction_users s ON s.transaction_id=w.id AND s.group_id=? WHERE w.kind='expense'`)
			.bind(ids, groupId)
			.all();
	const links =
		await env.DB.prepare(`${wanted}SELECT l.id,l.transaction_id,l.budget_entry_id,l.group_id,l.created_at
 FROM wanted w CROSS JOIN expense_budget_links l INDEXED BY expense_budget_links_transaction_idx ON l.transaction_id=w.id AND l.group_id=? WHERE w.kind='expense'
 UNION SELECT l.id,l.transaction_id,l.budget_entry_id,l.group_id,l.created_at
 FROM wanted w CROSS JOIN expense_budget_links l INDEXED BY expense_budget_links_budget_entry_idx ON l.budget_entry_id=w.id AND l.group_id=? WHERE w.kind='budget'`)
			.bind(ids, groupId, groupId)
			.all();
	const categories =
		await env.DB.prepare(`${wanted}SELECT r.record_kind AS kind,r.record_id AS id,r.category_id AS categoryId,r.source,r.version
 FROM wanted w CROSS JOIN record_categories r ON r.record_kind=w.kind AND r.record_id=w.id AND r.group_id=?`)
			.bind(ids, groupId)
			.all();
	return {
		financial: financial.results,
		shares: shares.results,
		links: links.results,
		categories: categories.results,
	};
}
