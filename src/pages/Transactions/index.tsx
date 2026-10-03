import { Button } from "@/components/Button";
import { UiPageDescription, UiPageTitle } from "@/components/ui";
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
import { FinanceListFilters } from "@/components/FinanceListFilters";
import { useFinanceListFilters } from "@/hooks/useFinanceListFilters";
import { Table, TableWrapper } from "@/components/Table";
import { TransactionCard } from "@/components/TransactionCard";
import { TransactionDetails } from "@/components/TransactionDetails";
import {
	useInfiniteTransactionsList,
	useDeleteTransaction,
	useTransactionsList,
} from "@/hooks/useTransactions";
import { dateToFullStr } from "@/utils/date";
import api from "@/utils/api";
import getSymbolFromCurrency from "currency-symbol-map";
import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import type {
	FrontendTransaction,
	ReduxState,
	TransactionsListRequest,
} from "split-expense-shared-types";
import "./index.css";

const TransactionList: React.FC<{
	transactions: FrontendTransaction[];
	deleteTransaction(id: string): void;
	bankLinkedIds: Set<string>;
}> = ({ transactions, deleteTransaction, bankLinkedIds }) => {
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
											{bankLinkedIds.has(transaction.transactionId) && (
												<span
													title="Matched to your bank activity"
													aria-label="Matched to your bank activity"
												>
													{" "}
													· Bank linked
												</span>
											)}
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
						{bankLinkedIds.has(transaction.transactionId) && (
							<small>Bank linked</small>
						)}
						<TransactionDetails {...transaction} />
					</TransactionCard>
				))}
			</div>
		</>
	);
};

function useBankLinkedIds() {
	const [bankLinkedIds, setBankLinkedIds] = useState<Set<string>>(new Set());
	useEffect(() => {
		if (
			![
				"localhost",
				"budget-dev.wastd.dev",
				"splitexpense-dev.tanmaydatta.workers.dev",
			].includes(window.location.hostname)
		)
			return;
		void api
			.get<{ transactionIds: Array<string | null> }>("/bank-import/linked-ids")
			.then((response) =>
				setBankLinkedIds(
					new Set(
						response.data.transactionIds.filter((id): id is string => !!id),
					),
				),
			)
			.catch(() => undefined);
	}, []);
	return bankLinkedIds;
}

function useTransactionsPage() {
	const [transactions, setTransactions] = useState<FrontendTransaction[]>([]);
	const bankLinkedIds = useBankLinkedIds();
	const filterState = useFinanceListFilters(["all", "owed", "owe", "zero"]);
	const q = filterState.filters.q;

	const data = useSelector((state: ReduxState) => state.value);

	const sessionContext = `${data?.user?.id ?? ""}:${data?.extra?.group?.groupid ?? ""}`;
	const filters = filterState.filters as Omit<
		TransactionsListRequest,
		"offset"
	>;
	const listKey = `${sessionContext}:${filterState.key}`;
	const currentKey = useRef(listKey);
	const listGeneration = useRef(0);
	if (currentKey.current !== listKey) listGeneration.current++;
	currentKey.current = listKey;
	const [loadMoreError, setLoadMoreError] = useState("");
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const infiniteTransactions = useInfiniteTransactionsList(
		data?.user?.id,
		q,
		filters,
		sessionContext,
	);
	const initialTransactionsQuery = useTransactionsList(
		0,
		data?.user?.id,
		q,
		filters,
		sessionContext,
		!filterState.error,
	);
	const deleteTransactionMutation = useDeleteTransaction();

	// Sync the first page once per filter set while retaining loaded pages.
	const lastSyncedQRef = useRef<string | null>(null);

	// Reset before syncing results for a new filter set or session.
	useEffect(() => {
		setTransactions([]);
		lastSyncedQRef.current = null;
		setHasMore(true);
		setLoadingMore(false);
		setLoadMoreError("");
	}, [listKey]);

	useEffect(() => {
		if (
			initialTransactionsQuery.isSuccess &&
			initialTransactionsQuery.data &&
			lastSyncedQRef.current !== listKey
		) {
			setTransactions(initialTransactionsQuery.data);
			lastSyncedQRef.current = listKey;
			setHasMore(initialTransactionsQuery.data.length === 10);
		}
	}, [
		initialTransactionsQuery.data,
		initialTransactionsQuery.isSuccess,
		listKey,
	]);

	const handleLoadMoreTransactions = async () => {
		const requestKey = listKey;
		const requestGeneration = listGeneration.current;
		try {
			setLoadingMore(true);
			setLoadMoreError("");
			const currentTransactions =
				transactions.length > 0
					? transactions
					: initialTransactionsQuery.data || [];
			const newTransactions =
				await infiniteTransactions.loadMore(currentTransactions);
			if (
				currentKey.current !== requestKey ||
				listGeneration.current !== requestGeneration
			)
				return;
			setHasMore(newTransactions.length === 10);
			if (newTransactions && newTransactions.length > 0) {
				setTransactions((prev) => [...prev, ...newTransactions]);
			}
		} catch (error) {
			if (
				currentKey.current !== requestKey ||
				listGeneration.current !== requestGeneration
			)
				return;
			setLoadMoreError(
				error instanceof Error
					? error.message
					: "Could not load more expenses. Try again.",
			);
		} finally {
			if (
				currentKey.current === requestKey &&
				listGeneration.current === requestGeneration
			)
				setLoadingMore(false);
		}
	};

	const handleDeleteTransaction = (id: string) => {
		const requestKey = listKey;
		const requestGeneration = listGeneration.current;
		deleteTransactionMutation.mutate(id, {
			onSuccess: () => {
				if (
					currentKey.current !== requestKey ||
					listGeneration.current !== requestGeneration
				)
					return;
				setTransactions((previous) =>
					previous.filter((transaction) => transaction.transactionId !== id),
				);
				lastSyncedQRef.current = null;
				initialTransactionsQuery.refetch();
			},
		});
	};

	return {
		transactions,
		bankLinkedIds,
		filterState,
		data,
		initialTransactionsQuery,
		deleteTransactionMutation,
		handleLoadMoreTransactions,
		handleDeleteTransaction,
		hasMore,
		loadingMore,
		loadMoreError,
		setLoadMoreError,
	};
}

const Transactions: React.FC = () => {
	const {
		transactions,
		bankLinkedIds,
		filterState,
		data,
		initialTransactionsQuery,
		deleteTransactionMutation,
		handleLoadMoreTransactions,
		handleDeleteTransaction,
		hasMore,
		loadingMore,
		loadMoreError,
		setLoadMoreError,
	} = useTransactionsPage();

	const isLoading =
		deleteTransactionMutation.isPending || initialTransactionsQuery.isLoading;
	const error =
		deleteTransactionMutation.error?.message ||
		initialTransactionsQuery.error?.message ||
		"";
	const success = deleteTransactionMutation.isSuccess
		? deleteTransactionMutation.data?.message ||
			"Transaction deleted successfully"
		: "";

	const showEmptyState =
		!isLoading &&
		!filterState.error &&
		filterState.activeCount > 0 &&
		transactions.length === 0;

	return (
		<div className="transactions-container" data-test-id="expenses-container">
			<header>
				<UiPageTitle>Expenses</UiPageTitle>
				<UiPageDescription>
					Search and review the group's shared expenses.
				</UiPageDescription>
			</header>
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

			<FinanceListFilters
				state={filterState}
				currencies={data?.extra?.currencies ?? ["GBP", "USD", "EUR"]}
				kind="expenses"
			/>

			{loadMoreError && (
				<ErrorContainer
					message={loadMoreError}
					onClose={() => setLoadMoreError("")}
				/>
			)}
			{isLoading && <Loader />}
			{!isLoading && !showEmptyState && !filterState.error && (
				<>
					<TransactionList
						transactions={transactions}
						deleteTransaction={handleDeleteTransaction}
						bankLinkedIds={bankLinkedIds}
					/>
					{hasMore && (
						<Button
							disabled={loadingMore}
							data-test-id="show-more-button"
							onClick={handleLoadMoreTransactions}
						>
							{loadingMore ? "Loading…" : "Show more"}
						</Button>
					)}
				</>
			)}
			{showEmptyState && (
				<div data-test-id="search-empty-state" style={{ padding: "24px 0" }}>
					No expenses match these filters.{" "}
					<button
						type="button"
						onClick={filterState.clear}
						style={{
							background: "none",
							border: "none",
							color: "#0066cc",
							cursor: "pointer",
							padding: 0,
						}}
					>
						Clear all filters
					</button>
				</div>
			)}
		</div>
	);
};

export default Transactions;
