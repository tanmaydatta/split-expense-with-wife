import { Card } from "@/components/Card";
import { Calendar, CardText, Trash } from "@/components/Icons";
import { getCurrencySymbol } from "@/utils/currency";
import { dateToFullStr } from "@/utils/date";
import React from "react";
import type { BudgetEntry } from "split-expense-shared-types";
import "./BudgetCard.css";

interface BudgetCardProps {
	entry: BudgetEntry;
	onDelete: (id: string) => void;
}

export const BudgetCard: React.FC<BudgetCardProps> = ({ entry, onDelete }) => {
	return (
		<Card className="budget-entry-card" data-test-id="budget-entry-card">
			<div className="budget-card-header">
				<div className="budget-date">
					<Calendar />
					<span>{dateToFullStr(new Date(entry.addedTime))}</span>
				</div>
				{entry.deleted == null && (
					<button
						className="delete-button"
						data-test-id="delete-button"
						onClick={() => onDelete(entry.id)}
						aria-label="Delete budget entry"
					>
						<Trash />
					</button>
				)}
			</div>

			<div className="budget-card-content">
				<div className="budget-description">
					<div className="budget-description-text">
						<CardText />
						<span>{entry.description}</span>
					</div>
					<div
						className={`amount-value ${entry.price.startsWith("+") ? "positive" : "negative"}`}
					>
						{entry.price[0]}
						{getCurrencySymbol(entry.currency)}
						{entry.price.substring(1)}
					</div>
				</div>

				{entry.deleted != null && (
					<div className="budget-deleted">
						<span className="deleted-label">Deleted:</span>
						<span className="deleted-date">
							{dateToFullStr(new Date(entry.deleted))}
						</span>
					</div>
				)}
			</div>
		</Card>
	);
};
