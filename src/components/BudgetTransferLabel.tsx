import type { BudgetEntry } from "split-expense-shared-types";
export function BudgetTransferLabel({ entry }: { entry: BudgetEntry }) {
	if (!entry.transfer) return null;
	return (
		<div className="budget-transfer-label">
			Internal transfer {entry.transfer.role === "source" ? "to" : "from"}{" "}
			{entry.transfer.otherBudgetName}
			{entry.transfer.otherBudgetArchived ? " (archived budget)" : ""} ·
			Excluded from spending insights
		</div>
	);
}
