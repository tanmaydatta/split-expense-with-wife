import { Card } from "@/components/Card";
import { Calendar, CardText, Trash } from "@/components/Icons";
import { TransactionDetails } from "@/components/TransactionDetails";
import { getCurrencySymbol } from "@/utils/currency";
import { dateToFullStr } from "@/utils/date";
import { buildFrontendTransaction } from "@/utils/transaction";
import React from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import type {
	BudgetEntry,
	ReduxState,
	Transaction,
	TransactionUser,
} from "split-expense-shared-types";
import "./BudgetEntryCard.css";

interface BudgetEntryCardProps {
	budgetEntry: BudgetEntry;
	onDelete?: (id: string) => void;
	linkedTransaction?: Transaction;
	linkedTransactionUsers?: TransactionUser[];
}

export const BudgetEntryCard: React.FC<BudgetEntryCardProps> = ({
	budgetEntry,
	onDelete,
	linkedTransaction,
	linkedTransactionUsers,
}) => {
	const currentUserId = useSelector(
		(state: ReduxState) => state.value?.user?.id,
	);

	const linkedFrontendTx =
		linkedTransaction && linkedTransactionUsers
			? buildFrontendTransaction(
					linkedTransaction,
					linkedTransactionUsers,
					currentUserId,
				)
			: undefined;

	return (
		<Card className="budget-entry-detail-card" data-test-id="budget-entry-card">
			<div className="budget-entry-card-header">
				<div className="budget-entry-date">
					<Calendar />
					<span>{dateToFullStr(new Date(budgetEntry.addedTime))}</span>
				</div>
				{onDelete && budgetEntry.deleted == null && (
					<button
						className="delete-button"
						data-test-id="delete-button"
						onClick={() => onDelete(budgetEntry.id)}
						aria-label="Delete budget entry"
					>
						<Trash />
					</button>
				)}
			</div>

			<div className="budget-entry-card-content">
				<div className="budget-entry-name">
					<strong>{budgetEntry.name}</strong>
				</div>
				<div className="budget-entry-description">
					<CardText />
					<span>{budgetEntry.description}</span>
				</div>
				<div
					className={`budget-entry-amount ${
						budgetEntry.price.startsWith("+") ? "positive" : "negative"
					}`}
				>
					{budgetEntry.price[0]}
					{getCurrencySymbol(budgetEntry.currency)}
					{budgetEntry.price.substring(1)}
				</div>

				{budgetEntry.deleted != null && (
					<div className="budget-entry-deleted">
						<span className="deleted-label">Deleted:</span>
						<span className="deleted-date">
							{dateToFullStr(new Date(budgetEntry.deleted))}
						</span>
					</div>
				)}
			</div>

			{/* Linked expense section */}
			{linkedTransaction && (
				<section
					className="linked-sibling"
					data-test-id="budget-entry-card-linked-transaction"
				>
					<h4>Linked expense</h4>
					<p className="linked-sibling-date">
						<Calendar />
						<span>{dateToFullStr(new Date(linkedTransaction.created_at))}</span>
					</p>
					<p>
						<strong>{linkedTransaction.description}</strong>
					</p>
					<p>
						Amount: {getCurrencySymbol(linkedTransaction.currency)}
						{Math.abs(linkedTransaction.amount).toFixed(2)}
					</p>
					{linkedFrontendTx && (
						<TransactionDetails {...linkedFrontendTx} />
					)}
					<Link
						to={`/transaction/${linkedTransaction.transaction_id}`}
						data-test-id="view-linked-transaction"
					>
						View expense →
					</Link>
				</section>
			)}
		</Card>
	);
};
