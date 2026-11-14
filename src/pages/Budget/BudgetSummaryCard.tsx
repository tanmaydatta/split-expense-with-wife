import React from "react";
import type { BudgetTotal } from "split-expense-shared-types";
import { AmountGrid } from "@/components/AmountGrid";
import { UiButton } from "@/components/ui";

export interface BudgetSummaryCardProps {
	budgetId: string;
	name: string;
	totals: BudgetTotal[];
	onOpen: (budgetId: string) => void;
	description?: string | null;
	className?: string;
}

export const BudgetSummaryCard: React.FC<BudgetSummaryCardProps> = ({
	budgetId,
	name,
	totals,
	onOpen,
	description,
	className = "",
}) => {
	// If totals array is empty, default to zero GBP so Available always renders a signed balance
	const displayTotals: BudgetTotal[] =
		totals.length > 0 ? totals : [{ currency: "GBP", amount: 0 }];

	const handleCardClick = (e: React.MouseEvent) => {
		// Only trigger if not clicking directly on an inner button (which handles its own click)
		if ((e.target as HTMLElement).closest("button")) return;
		onOpen(budgetId);
	};

	return (
		<div
			className={`budget-summary-card ${className}`.trim()}
			data-test-id={`budget-summary-card-${budgetId}`}
			data-testid={`budget-summary-card-${budgetId}`}
			onClick={handleCardClick}
		>
			<div className="budget-summary-header">
				<h3>{name}</h3>
				{description && (
					<p className="budget-summary-description">{description}</p>
				)}
			</div>

			<div className="budget-summary-available-section">
				<span className="budget-summary-label">Available</span>
				<AmountGrid amounts={displayTotals} />
			</div>

			<div className="budget-summary-actions">
				<UiButton
					type="button"
					$tone="neutral"
					onClick={(e) => {
						e.stopPropagation();
						onOpen(budgetId);
					}}
					data-test-id={`view-budget-${budgetId}`}
					aria-label={`View details for ${name}`}
				>
					View details
				</UiButton>
			</div>
		</div>
	);
};
