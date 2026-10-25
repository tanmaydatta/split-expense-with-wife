import { useSelector } from "react-redux";
import type { ReduxState } from "split-expense-shared-types";
import type { BudgetEntry } from "split-expense-shared-types";
export function BudgetTransferLabel({ entry }: { entry: BudgetEntry }) {
	const budgets = useSelector(
		(state: ReduxState) => state.value?.extra?.group?.budgets,
	);
	const otherName =
		budgets?.find((b) => b.id === entry.transfer?.otherBudgetId)?.budgetName ??
		entry.transfer?.otherBudgetName;
	if (!entry.transfer) return null;
	return (
		<div className="budget-transfer-label">
			Internal transfer {entry.transfer.role === "source" ? "to" : "from"}{" "}
			{otherName}
			{entry.transfer.otherBudgetArchived ? " (archived budget)" : ""} ·
			Excluded from spending insights
		</div>
	);
}
