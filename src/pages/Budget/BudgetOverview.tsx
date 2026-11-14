import React, { useMemo } from "react";
import type { BudgetTotal, GroupBudgetData } from "split-expense-shared-types";
import { useBudgetTotal } from "@/hooks/useBudget";
import { BudgetSummaryCard } from "./BudgetSummaryCard";

export interface BudgetOverviewProps {
	budgets: (GroupBudgetData & { deleted?: string | null })[];
	getTotals?: (budgetId: string) => BudgetTotal[];
	onOpenBudget: (budgetId: string) => void;
	className?: string;
}

const ConnectedBudgetSummaryCard: React.FC<{
	budget: GroupBudgetData;
	onOpen: (budgetId: string) => void;
}> = ({ budget, onOpen }) => {
	const { data: totals = [] } = useBudgetTotal(budget.id);

	return (
		<BudgetSummaryCard
			budgetId={budget.id}
			name={budget.budgetName}
			description={budget.description}
			totals={totals}
			onOpen={onOpen}
		/>
	);
};

export const BudgetOverview: React.FC<BudgetOverviewProps> = ({
	budgets,
	getTotals,
	onOpenBudget,
	className = "",
}) => {
	const activeBudgets = useMemo(() => {
		return (budgets || []).filter((b) => !b.deleted);
	}, [budgets]);

	if (activeBudgets.length === 0) {
		return (
			<div
				className="budget-overview-empty"
				data-test-id="budget-overview-empty"
			>
				<p>No active budgets found in this household.</p>
			</div>
		);
	}

	return (
		<div
			className={`budget-overview-grid ${className}`.trim()}
			data-test-id="budget-overview-grid"
		>
			{activeBudgets.map((budget) => {
				if (getTotals) {
					return (
						<BudgetSummaryCard
							key={budget.id}
							budgetId={budget.id}
							name={budget.budgetName}
							description={budget.description}
							totals={getTotals(budget.id)}
							onOpen={onOpenBudget}
						/>
					);
				}

				return (
					<ConnectedBudgetSummaryCard
						key={budget.id}
						budget={budget}
						onOpen={onOpenBudget}
					/>
				);
			})}
		</div>
	);
};
