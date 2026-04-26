import { useTransaction } from "@/hooks/useTransaction";
import { getCurrencySymbol } from "@/utils/currency";
import { Link } from "react-router-dom";
import type { FrontendTransaction } from "split-expense-shared-types";

interface TransactionDetailsProps extends FrontendTransaction {
	/** When true, renders the linked-budget-entry section (desktop list expansion only).
	 *  Mobile/detail paths omit this because TransactionCard renders it via its own linked-sibling section. */
	showLinkedBudget?: boolean;
}

export function TransactionDetails(props: TransactionDetailsProps) {
	const { showLinkedBudget = false, ...selectedTransaction } = props;

	// Fetch linked budget entry only when showLinkedBudget is requested
	const hasLinkedBudget =
		showLinkedBudget &&
		(selectedTransaction.linkedBudgetEntryIds?.length ?? 0) > 0;

	const { data: txDetail } = useTransaction(
		hasLinkedBudget ? selectedTransaction.transactionId : undefined,
	);

	const linkedBudgetEntry = hasLinkedBudget ? txDetail?.linkedBudgetEntry : undefined;

	return (
		<>
			<div
				className="transaction-details-container"
				data-test-id={`transaction-details-${selectedTransaction.transactionId}`}
			>
				<div
					className="transaction-full-description"
					data-test-id="full-description"
				>
					<strong>Full Description:</strong> {selectedTransaction.description}
				</div>
				<div data-test-id="amount-owed-section">
					Amount owed:{" "}
					{Object.entries(selectedTransaction.amountOwed).map(
						([user, amount]: [string, number]) => {
							return (
								<div
									key={user}
									data-test-id={`amount-owed-${user.toLowerCase()}`}
								>
									{user}: {getCurrencySymbol(selectedTransaction.currency)}
									{amount.toFixed(2)}
								</div>
							);
						},
					)}
				</div>
				<div data-test-id="paid-by-section">
					Paid by:{" "}
					{Object.entries(selectedTransaction.paidBy).map(
						([user, amount]: [string, number]) => {
							return (
								<div key={user} data-test-id={`paid-by-${user.toLowerCase()}`}>
									{user}: {getCurrencySymbol(selectedTransaction.currency)}
									{amount.toFixed(2)}
								</div>
							);
						},
					)}
				</div>
				<div
					className={
						selectedTransaction.totalOwed > 0
							? "positive"
							: selectedTransaction.totalOwed < 0
								? "negative"
								: "zero"
					}
					data-test-id="total-owed-section"
				>
					{selectedTransaction.totalOwed > 0
						? "You are owed "
						: selectedTransaction.totalOwed < 0
							? "You owe "
							: "No amount owed "}
					<div data-test-id="total-owed-amount">
						{selectedTransaction.totalOwed !== 0 &&
							(selectedTransaction.totalOwed > 0 ? "+" : "-")}
						{getCurrencySymbol(selectedTransaction.currency)}
						{Math.abs(selectedTransaction.totalOwed).toFixed(2)}
					</div>
				</div>
			</div>

			{/* Linked budget entry section — rendered only on desktop list expansion */}
			{showLinkedBudget && linkedBudgetEntry && (
				<section
					className="linked-sibling"
					data-test-id="transaction-card-linked-budget"
				>
					<h4>Linked budget entry</h4>
					<p>
						<strong>{linkedBudgetEntry.name}</strong>:{" "}
						{linkedBudgetEntry.description}
					</p>
					<p>
						Amount: {getCurrencySymbol(linkedBudgetEntry.currency)}
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
		</>
	);
}
