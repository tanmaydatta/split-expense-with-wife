import type { BudgetTransferInfo } from "../../../shared-types";
export async function readTransferInfo(
	env: Pick<Env, "DB">,
	group: string,
	ids: string[],
): Promise<Map<string, BudgetTransferInfo>> {
	if (!ids.length) return new Map();
	const rows =
		await env.DB.prepare(`SELECT e.entry_id AS entryId,t.id,e.role,other.id AS otherBudgetId,other.budget_name AS otherBudgetName,other.deleted AS otherDeleted,pair.entry_id AS otherEntryId
 FROM json_each(?) selected JOIN budget_transfer_entries e ON e.entry_id=selected.value JOIN budget_transfers t ON t.id=e.transfer_id AND t.group_id=?
 JOIN budget_transfer_entries pair ON pair.transfer_id=t.id AND pair.role=CASE e.role WHEN 'source' THEN 'destination' ELSE 'source' END
 JOIN group_budgets other ON other.id=CASE e.role WHEN 'source' THEN t.destination_budget_id ELSE t.source_budget_id END AND other.group_id=t.group_id`)
			.bind(JSON.stringify(ids), group)
			.all<
				BudgetTransferInfo & { entryId: string; otherDeleted: string | null }
			>();
	return new Map(
		rows.results.map((row) => [
			row.entryId,
			{
				id: row.id,
				role: row.role,
				otherBudgetId: row.otherBudgetId,
				otherBudgetName: row.otherBudgetName,
				otherBudgetArchived: !!row.otherDeleted,
				otherEntryId: row.otherEntryId,
			},
		]),
	);
}
