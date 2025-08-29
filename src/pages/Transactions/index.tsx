import { Button } from "@/components/Button";
import {
	ArrowDownUp,
	Calendar,
	CardText,
	Coin,
	Trash,
	XLg,
} from "@/components/Icons";
import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { Table, TableWrapper } from "@/components/Table";
import { TransactionCard } from "@/components/TransactionCard";
import {
	useInfiniteTransactionsList,
	useDeleteTransaction,
	useTransactionsList,
} from "@/hooks/useTransactions";
import { dateToFullStr } from "@/utils/date";
import getSymbolFromCurrency from "currency-symbol-map";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type {
	FrontendTransaction,
	ReduxState,
} from "split-expense-shared-types";
import "./index.css";

const TransactionList: React.FC<{
	transactions: FrontendTransaction[];
	deleteTransaction(id: string): void;
}> = ({ transactions, deleteTransaction }) => {
	const [selectedTransaction, setSelectedTransaction] =
		useState<FrontendTransaction | null>(null);

	const handleSelect = (transaction: FrontendTransaction) => {
		if (selectedTransaction?.transactionId === transaction.transactionId) {
			setSelectedTransaction(null);
		} else {
			setSelectedTransaction(transaction);
		}
	};

	return (
		<>
			{/* Desktop Table View */}
			<div className="desktop-table">
				<TableWrapper>
					<Table>
						<thead>
							<tr>
								<th>
									<Calendar /> Date
								</th>
								<th>
									<CardText /> Description
								</th>
								<th>
									<Coin /> Amount
								</th>
								<th>
									<ArrowDownUp /> Share
								</th>
								<th>
									<Trash />
								</th>
							</tr>
						</thead>
						<tbody>
							{transactions.map((transaction) => (
								<React.Fragment key={transaction.transactionId}>
									<tr
										className="transaction-row"
										data-test-id="transaction-item"
										data-transaction-id={transaction.transactionId}
										onClick={() => handleSelect(transaction)}
									>
										<td>{dateToFullStr(new Date(transaction.date))}</td>
										<td className="description-cell">
											{transaction.description}
										</td>
										<td>
											{getSymbolFromCurrency(transaction.currency)}
											{Math.abs(transaction.totalAmount).toFixed(2)}
										</td>
										<td
											className={
												transaction.totalOwed > 0
													? "positive"
													: transaction.totalOwed < 0
														? "negative"
														: "zero"
											}
										>
											{transaction.totalOwed !== 0 &&
												(transaction.totalOwed > 0 ? "+" : "-")}
											{getSymbolFromCurrency(transaction.currency)}
											{Math.abs(transaction.totalOwed).toFixed(2)}
										</td>
										<td>
											<button
												data-test-id="delete-button"
												onClick={(e) => {
													e.stopPropagation();
													deleteTransaction(transaction.transactionId);
												}}
												style={{
													background: "none",
													border: "none",
													cursor: "pointer",
													padding: "4px",
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													color: "red",
												}}
												aria-label="Delete transaction"
											>
												<XLg />
											</button>
										</td>
									</tr>
									{selectedTransaction &&
										transaction.transactionId ===
											selectedTransaction.transactionId && (
											<tr>
												<td colSpan={5}>
													<TransactionDetails {...selectedTransaction} />
												</td>
											</tr>
										)}
								</React.Fragment>
							))}
						</tbody>
					</Table>
				</TableWrapper>
			</div>

			{/* Mobile Card View */}
			<div className="mobile-cards">
				{transactions.map((transaction) => (
					<TransactionCard
						key={transaction.transactionId}
						transaction={transaction}
						isSelected={
							selectedTransaction?.transactionId === transaction.transactionId
						}
						onSelect={handleSelect}
						onDelete={deleteTransaction}
					>
						<TransactionDetails {...transaction} />
					</TransactionCard>
				))}
			</div>
		</>
	);
};

function TransactionDetails(selectedTransaction: FrontendTransaction) {
	return (
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
								{user}: {getSymbolFromCurrency(selectedTransaction.currency)}
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
								{user}: {getSymbolFromCurrency(selectedTransaction.currency)}
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
					{getSymbolFromCurrency(selectedTransaction.currency)}
					{Math.abs(selectedTransaction.totalOwed).toFixed(2)}
				</div>
			</div>
		</div>
	);
}

const Transactions: React.FC = () => {
	const [transactions, setTransactions] = useState<FrontendTransaction[]>([]);

	const data = useSelector((state: ReduxState) => state.value);

	// React Query hooks
	const infiniteTransactions = useInfiniteTransactionsList(data?.user?.id);
	const initialTransactionsQuery = useTransactionsList(0, data?.user?.id);
	const deleteTransactionMutation = useDeleteTransaction();

	// Initialize transactions from initial query, then switch to infinite scroll
	useEffect(() => {
		if (initialTransactionsQuery.data && transactions.length === 0) {
			setTransactions(initialTransactionsQuery.data);
		}
	}, [initialTransactionsQuery.data, transactions.length]);

	// Handle load more transactions
	const handleLoadMoreTransactions = async () => {
		try {
			// Switch to infinite scroll after initial load
			const currentTransactions =
				transactions.length > 0
					? transactions
					: initialTransactionsQuery.data || [];
			const newTransactions =
				await infiniteTransactions.loadMore(currentTransactions);
			if (newTransactions && newTransactions.length > 0) {
				setTransactions((prev) => [...prev, ...newTransactions]);
			}
		} catch (error) {
			console.error("Error loading more transactions:", error);
		}
	};

	// Handle delete transaction
	const handleDeleteTransaction = (id: string) => {
		deleteTransactionMutation.mutate(id, {
			onSuccess: () => {
				// Reload transactions after successful delete by refetching initial query
				initialTransactionsQuery.refetch().then(() => {
					// The useEffect will handle updating the transactions state
				});
			},
		});
	};

	// Determine loading and error states
	const isLoading =
		deleteTransactionMutation.isPending || initialTransactionsQuery.isLoading;
	const error = deleteTransactionMutation.error?.message || "";
	const success = deleteTransactionMutation.isSuccess
		? deleteTransactionMutation.data?.message ||
			"Transaction deleted successfully"
		: "";

	return (
		<div className="transactions-container" data-test-id="expenses-container">
			{/* Error Container */}
			{error && (
				<ErrorContainer
					message={error}
					onClose={() => deleteTransactionMutation.reset()}
				/>
			)}

			{/* Success Container */}
			{success && (
				<SuccessContainer
					message={success}
					onClose={() => deleteTransactionMutation.reset()}
					data-test-id="success-container"
				/>
			)}

			{isLoading && <Loader />}
			{!isLoading && (
				<>
					<TransactionList
						transactions={transactions}
						deleteTransaction={handleDeleteTransaction}
					/>
					<Button
						data-test-id="show-more-button"
						onClick={handleLoadMoreTransactions}
					>
						Show more
					</Button>
				</>
			)}
		</div>
	);
};

export default Transactions;
