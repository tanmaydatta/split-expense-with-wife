import { Card } from "@/components/Card";
import { ArrowDownUp, Calendar, CardText, Coin, XLg } from "@/components/Icons";
import { useTransaction } from "@/hooks/useTransaction";
import { getCurrencySymbol } from "@/utils/currency";
import { dateToFullStr } from "@/utils/date";
import React from "react";
import { Link } from "react-router-dom";
import type {
	BudgetEntry,
	FrontendTransaction,
} from "split-expense-shared-types";
import "./TransactionCard.css";

interface TransactionCardProps {
	transaction: FrontendTransaction;
	isSelected?: boolean;
	onSelect?: (transaction: FrontendTransaction) => void;
	onDelete?: (id: string) => void;
	children?: React.ReactNode; // For expanded details
	/** When true the card renders in "always expanded" mode (used by TransactionDetail page) */
	expanded?: boolean;
	/** Pre-fetched linked budget entry (used by TransactionDetail page to avoid double fetch) */
	linkedBudgetEntry?: BudgetEntry;
}

export const TransactionCard: React.FC<TransactionCardProps> = ({
	transaction,
	isSelected = false,
	onSelect,
	onDelete,
	children,
	expanded = false,
	linkedBudgetEntry: linkedBudgetEntryProp,
}) => {
	const isExpanded = expanded || isSelected;

	// Fetch full transaction detail when expanded so we can show the linked budget entry.
	// Skip if a linkedBudgetEntry was already supplied via prop (TransactionDetail page pre-fetches it).
	const { data: txDetail } = useTransaction(
		isExpanded && !linkedBudgetEntryProp
			? transaction.transactionId
			: undefined,
	);

	const linkedBudgetEntry =
		linkedBudgetEntryProp ?? txDetail?.linkedBudgetEntry;

	const handleClick = () => {
		if (onSelect) {
			onSelect(transaction);
		}
	};

	return (
		<Card
			className="transaction-card"
			data-test-id="transaction-card"
			data-transaction-id={transaction.transactionId}
			onClick={handleClick}
		>
			<div className="transaction-card-header">
				<div className="transaction-date">
					<Calendar />
					<span>{dateToFullStr(new Date(transaction.date))}</span>
				</div>
				{onDelete && (
					<button
						className="delete-button"
						data-test-id="delete-button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(transaction.transactionId);
						}}
						aria-label="Delete transaction"
					>
						<XLg />
					</button>
				)}
			</div>

			<div className="transaction-card-content">
				<div className="transaction-description">
					<CardText />
					<span>{transaction.description}</span>
				</div>

				<div className="transaction-amounts">
					<div className="transaction-total">
						<Coin />
						<span className="total-value">
							{getCurrencySymbol(transaction.currency)}
							{Math.abs(transaction.totalAmount).toFixed(2)}
						</span>
					</div>

					<div
						className={`transaction-share-container ${
							transaction.totalOwed > 0
								? "positive"
								: transaction.totalOwed < 0
									? "negative"
									: "zero"
						}`}
					>
						<div className="share-icon">
							<ArrowDownUp />
						</div>
						<span className="share-value">
							{transaction.totalOwed !== 0 &&
								(transaction.totalOwed > 0 ? "+" : "-")}
							{getCurrencySymbol(transaction.currency)}
							{Math.abs(transaction.totalOwed).toFixed(2)}
						</span>
					</div>
				</div>
			</div>

			{/* Expandable Details */}
			{isExpanded && children && (
				<div className="transaction-card-details">{children}</div>
			)}

			{/* Linked budget entry section */}
			{isExpanded && linkedBudgetEntry && (
				<section
					className="linked-sibling"
					data-test-id="transaction-card-linked-budget"
				>
					<h4>Linked budget entry</h4>
					<p className="linked-sibling-date">
						<Calendar />
						<span>{dateToFullStr(new Date(linkedBudgetEntry.addedTime))}</span>
					</p>
					<p>
						<strong>{linkedBudgetEntry.name}</strong>:{" "}
						{linkedBudgetEntry.description}
					</p>
					<p
						className={`linked-budget-amount ${
							linkedBudgetEntry.amount >= 0 ? "positive" : "negative"
						}`}
					>
						Amount:{" "}
						{linkedBudgetEntry.amount >= 0 ? "+" : "-"}
						{getCurrencySymbol(linkedBudgetEntry.currency)}
						{Math.abs(linkedBudgetEntry.amount).toFixed(2)}
					</p>
					<Link
						to={`/budget-entry/${linkedBudgetEntry.id}`}
						data-test-id="view-linked-budget-entry"
					>
						View budget entry →
					</Link>
				</section>
			)}
		</Card>
	);
};
