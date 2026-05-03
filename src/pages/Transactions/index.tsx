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
import { SearchInput } from "@/components/SearchInput";
import { Table, TableWrapper } from "@/components/Table";
import { TransactionCard } from "@/components/TransactionCard";
import { TransactionDetails } from "@/components/TransactionDetails";
import {
	useInfiniteTransactionsList,
	useDeleteTransaction,
	useTransactionsList,
} from "@/hooks/useTransactions";
import { dateToFullStr } from "@/utils/date";
import getSymbolFromCurrency from "currency-symbol-map";
import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
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
											{(transaction.linkedBudgetEntryIds?.length ?? 0) > 0 && (
												<span
													className="linked-icon"
													data-test-id="transaction-linked-icon"
													title="Linked to a budget entry"
													aria-label="Linked to a budget entry"
												>
													🔗
												</span>
											)}
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
													<TransactionDetails
														{...selectedTransaction}
														showLinkedBudget
													/>
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


const Transactions: React.FC = () => {
	const [transactions, setTransactions] = useState<FrontendTransaction[]>([]);
	const [searchParams, setSearchParams] = useSearchParams();
	const q = searchParams.get("q") ?? "";

	const data = useSelector((state: ReduxState) => state.value);

	const infiniteTransactions = useInfiniteTransactionsList(data?.user?.id, q);
	const initialTransactionsQuery = useTransactionsList(0, data?.user?.id, q);
	const deleteTransactionMutation = useDeleteTransaction();

	// Track the last q value we've synced into local state. This lets us
	// re-populate on every successful fetch for the current q (including
	// delete-triggered refetches) while still resetting when q changes.
	const lastSyncedQRef = useRef<string | null>(null);

	// Reset accumulated list when q changes (provides clean visual during refetch)
	useEffect(() => {
		setTransactions([]);
	}, [q]);

	useEffect(() => {
		if (
			initialTransactionsQuery.isSuccess &&
			initialTransactionsQuery.data &&
			lastSyncedQRef.current !== q
		) {
			setTransactions(initialTransactionsQuery.data);
			lastSyncedQRef.current = q;
		}
	}, [initialTransactionsQuery.data, initialTransactionsQuery.isSuccess, q]);

	const handleSetQ = (next: string) => {
		const params = new URLSearchParams(searchParams);
		if (next) params.set("q", next);
		else params.delete("q");
		setSearchParams(params, { replace: true });
	};

	const handleLoadMoreTransactions = async () => {
		try {
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

	const handleDeleteTransaction = (id: string) => {
		deleteTransactionMutation.mutate(id, {
			onSuccess: () => {
				initialTransactionsQuery.refetch();
			},
		});
	};

	const isLoading =
		deleteTransactionMutation.isPending || initialTransactionsQuery.isLoading;
	const error = deleteTransactionMutation.error?.message || "";
	const success = deleteTransactionMutation.isSuccess
		? deleteTransactionMutation.data?.message ||
			"Transaction deleted successfully"
		: "";

	const showEmptyState =
		!isLoading && q.length > 0 && transactions.length === 0;

	return (
		<div className="transactions-container" data-test-id="expenses-container">
			{error && (
				<ErrorContainer
					message={error}
					onClose={() => deleteTransactionMutation.reset()}
				/>
			)}
			{success && (
				<SuccessContainer
					message={success}
					onClose={() => deleteTransactionMutation.reset()}
					data-test-id="success-container"
				/>
			)}

			<SearchInput
				value={q}
				onDebouncedChange={handleSetQ}
				placeholder="Search expenses by description"
			/>

			{isLoading && <Loader />}
			{!isLoading && !showEmptyState && (
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
			{showEmptyState && (
				<div data-test-id="search-empty-state" style={{ padding: "24px 0" }}>
					No matches for "{q}".{" "}
					<button
						type="button"
						onClick={() => handleSetQ("")}
						style={{
							background: "none",
							border: "none",
							color: "#0066cc",
							cursor: "pointer",
							padding: 0,
						}}
					>
						Clear search
					</button>
				</div>
			)}
		</div>
	);
};

export default Transactions;
