import React from "react";
import { Card } from "@/components/Card";
import { Input } from "@/components/Form/Input";
import { Button } from "@/components/Button";
import type { GroupBudgetData } from "split-expense-shared-types";

interface BudgetsSectionProps {
	budgets: GroupBudgetData[];
	newBudgetName: string;
	newBudgetDescription: string;
	onNewBudgetNameChange: (value: string) => void;
	onNewBudgetDescriptionChange: (value: string) => void;
	onAddBudget: () => void;
	onRemoveBudget: (budgetId: string) => void;
}

export const BudgetsSection: React.FC<BudgetsSectionProps> = ({
	budgets,
	newBudgetName,
	newBudgetDescription,
	onNewBudgetNameChange,
	onNewBudgetDescriptionChange,
	onAddBudget,
	onRemoveBudget,
}) => {
	return (
		<Card className="settings-card" data-test-id="budgets-section">
			<h3>Budget Categories</h3>
			<div className="budget-manager">
				<div className="budget-list">
					{budgets.map((budget, index) => (
						<div key={budget.id} className="budget-item">
							<div className="budget-info">
								<span className="budget-name">{budget.budgetName}</span>
								{budget.description && (
									<span className="budget-description">
										{budget.description}
									</span>
								)}
							</div>
							<Button
								onClick={() => onRemoveBudget(budget.id)}
								className="remove-button"
								data-test-id={`remove-budget-${index}`}
							>
								Remove
							</Button>
						</div>
					))}
				</div>

				<div className="add-budget">
					<div className="form-group">
						<label htmlFor="newBudgetName">Budget Name</label>
						<Input
							id="newBudgetName"
							type="text"
							value={newBudgetName}
							onChange={(e) => onNewBudgetNameChange(e.target.value)}
							placeholder="Enter budget name"
							onKeyPress={(e) => e.key === "Enter" && onAddBudget()}
							data-test-id="new-budget-input"
						/>
					</div>
					<div className="form-group">
						<label htmlFor="newBudgetDescription">Description (optional)</label>
						<Input
							id="newBudgetDescription"
							type="text"
							value={newBudgetDescription}
							onChange={(e) => onNewBudgetDescriptionChange(e.target.value)}
							placeholder="Enter budget description"
							onKeyPress={(e) => e.key === "Enter" && onAddBudget()}
							data-test-id="new-budget-description-input"
						/>
					</div>
					<Button
						onClick={onAddBudget}
						disabled={!newBudgetName.trim()}
						data-test-id="add-budget-button"
					>
						Add Budget
					</Button>
				</div>
			</div>
		</Card>
	);
};
