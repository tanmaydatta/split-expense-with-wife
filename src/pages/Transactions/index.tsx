import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useQueryClient } from "@tanstack/react-query";
import type { ReduxState, UnifiedLedgerRow } from "split-expense-shared-types";
import { BulkCategoryToolbar, useBulkCategories } from "@/components/BulkCategories";
import { Button } from "@/components/Button";
import { FinanceListFilters } from "@/components/FinanceListFilters";
import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { UiPageDescription, UiPageTitle } from "@/components/ui";
import { useCategories } from "@/hooks/useCategories";
import { useFinanceListFilters } from "@/hooks/useFinanceListFilters";
import { useInfiniteLedger } from "@/hooks/useLedger";
import { useDeleteBudgetEntry } from "@/hooks/useBudget";
import { useDeleteTransaction } from "@/hooks/useTransactions";
import api from "@/utils/api";
import { UnifiedLedgerList } from "./UnifiedLedgerList";
import "./index.css";

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

function useIsMobile(breakpoint = 768) {
	const [isMobile, setIsMobile] = useState(() =>
		typeof window !== "undefined" ? window.innerWidth <= breakpoint : false,
	);
	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth <= breakpoint);
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, [breakpoint]);
	return isMobile;
}

function buildCategoryMap(categories: Array<{ id: string; name: string }> | undefined) {
	const map: Record<string, string> = {};
	if (!categories) return map;
	for (const c of categories) {
		map[c.id] = c.name;
	}
	return map;
}

function filterRowsByAmount(rows: UnifiedLedgerRow[], min?: number, max?: number) {
	if (min === undefined && max === undefined) return rows;
	return rows.filter((row) => {
		const abs = Math.abs(row.amount);
		if (min !== undefined && abs < min) return false;
		if (max !== undefined && abs > max) return false;
		return true;
	});
}

function sortRows(rows: UnifiedLedgerRow[], sortOrder?: string) {
	if (!sortOrder || sortOrder === "newest") return rows;
	const copy = [...rows];
	if (sortOrder === "oldest") {
		copy.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	} else if (sortOrder === "amount-asc") {
		copy.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
	} else if (sortOrder === "amount-desc") {
		copy.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
	}
	return copy;
}

function useTransactionsPage() {
	const filterState = useFinanceListFilters(["all", "owed", "owe", "zero"]);
	const bankLinkedIds = useBankLinkedIds();
	const data = useSelector((state: ReduxState) => state.value);
	const categories = useCategories();
	const queryClient = useQueryClient();

	const categoryMap = useMemo(
		() => buildCategoryMap(categories.data?.categories),
		[categories.data?.categories],
	);

	const ledgerFilters = useMemo(
		() => ({
			q: filterState.filters.q,
			dateFrom: filterState.filters.dateFrom,
			dateTo: filterState.filters.dateTo,
			currency: filterState.filters.currency,
			categoryId: filterState.filters.categoryId,
			limit: 25,
		}),
		[
			filterState.filters.q,
			filterState.filters.dateFrom,
			filterState.filters.dateTo,
			filterState.filters.currency,
			filterState.filters.categoryId,
		],
	);

	const infiniteLedger = useInfiniteLedger(ledgerFilters, !filterState.error);
	const deleteTransactionMutation = useDeleteTransaction();
	const deleteBudgetEntryMutation = useDeleteBudgetEntry();

	const allRows = useMemo(
		() =>
			infiniteLedger.data?.pages
				.flatMap((page) => page?.rows ?? [])
				.filter(Boolean) ?? [],
		[infiniteLedger.data],
	);

	const filteredRows = useMemo(
		() => filterRowsByAmount(allRows, filterState.filters.minAmount, filterState.filters.maxAmount),
		[allRows, filterState.filters.minAmount, filterState.filters.maxAmount],
	);

	const sortedRows = useMemo(
		() => sortRows(filteredRows, filterState.filters.sort),
		[filteredRows, filterState.filters.sort],
	);

	const [deleteError, setDeleteError] = useState("");
	const [deleteSuccess, setDeleteSuccess] = useState("");

	const handleDeleteRow = (row: UnifiedLedgerRow) => {
		setDeleteError("");
		setDeleteSuccess("");
		if (row.kind === "purchase" && row.transactionId) {
			deleteTransactionMutation.mutate(row.transactionId, {
				onSuccess: (data) => {
					setDeleteSuccess(data?.message || "Transaction deleted successfully");
					queryClient.invalidateQueries({ queryKey: ["ledger"] });
				},
				onError: (err) => {
					setDeleteError(err.message || "Could not delete transaction");
				},
			});
		} else if (row.budgetEntryIds?.[0]) {
			deleteBudgetEntryMutation.mutate(row.budgetEntryIds[0], {
				onSuccess: (data) => {
					setDeleteSuccess(data?.message || "Budget entry deleted successfully");
					queryClient.invalidateQueries({ queryKey: ["ledger"] });
				},
				onError: (err) => {
					setDeleteError(err.message || "Could not delete budget entry");
				},
			});
		}
	};

	const sessionContext = `${data?.user?.id ?? ""}:${data?.extra?.group?.groupid ?? ""}`;
	const listKey = `${sessionContext}:${filterState.key}`;

	const purchaseRowIds = useMemo(
		() =>
			sortedRows
				.filter((r) => r.kind === "purchase" && r.transactionId)
				.map((r) => r.transactionId as string),
		[sortedRows],
	);

	const bulk = useBulkCategories(
		"expense",
		purchaseRowIds,
		listKey,
		(changes) => {
			const changesByTxId = new Map(
				changes
					.filter((c) => c.kind === "expense")
					.map((c) => [c.id, c]),
			);
			queryClient.setQueriesData(
				{ queryKey: ["ledger"] },
				(oldData: any) => {
					if (!oldData?.pages) return oldData;
					return {
						...oldData,
						pages: oldData.pages.map((page: any) => ({
							...page,
							rows: (page.rows ?? [])
								.map((row: UnifiedLedgerRow) => {
									if (!row.transactionId) return row;
									const change = changesByTxId.get(row.transactionId);
									if (!change) return row;
									return {
										...row,
										categoryId: change.categoryId ?? null,
										categoryName: change.categoryName ?? null,
										categorySource: change.categorySource ?? null,
										categoryVersion: change.categoryVersion ?? (row as any).categoryVersion,
									};
								})
								.filter((row: UnifiedLedgerRow) => {
									const activeCategory = filterState.filters.categoryId;
									if (!activeCategory) return true;
									if (activeCategory === "uncategorised") return row.categoryId == null;
									return row.categoryId === activeCategory;
								}),
						})),
					};
				},
			);
		},
	);

	return {
		bulk,
		rows: sortedRows,
		bankLinkedIds,
		filterState,
		data,
		categoryMap,
		infiniteLedger,
		handleDeleteRow,
		deleteError,
		deleteSuccess,
		setDeleteError,
		setDeleteSuccess,
	};
}

const Transactions: React.FC = () => {
	const isMobile = useIsMobile();
	const {
		bulk,
		rows,
		bankLinkedIds,
		filterState,
		data,
		categoryMap,
		infiniteLedger,
		handleDeleteRow,
		deleteError,
		deleteSuccess,
		setDeleteError,
		setDeleteSuccess,
	} = useTransactionsPage();

	const isLoading = infiniteLedger.isLoading;
	const error =
		deleteError || (infiniteLedger.error ? infiniteLedger.error.message : "");
	const success = deleteSuccess;

	const showEmptyState =
		!isLoading &&
		!infiniteLedger.hasNextPage &&
		!filterState.error &&
		filterState.activeCount > 0 &&
		rows.length === 0;

	return (
		<div className="transactions-container" data-test-id="expenses-container">
			<header>
				<UiPageTitle>Transactions</UiPageTitle>
				<UiPageDescription>
					Search and review the group's transactions and budget ledger.
				</UiPageDescription>
			</header>
			{error && (
				<ErrorContainer
					message={error}
					onClose={() => setDeleteError("")}
				/>
			)}
			{success && (
				<SuccessContainer
					message={success}
					onClose={() => setDeleteSuccess("")}
					data-test-id="success-container"
				/>
			)}

			<FinanceListFilters
				state={filterState}
				currencies={data?.extra?.currencies ?? ["GBP", "USD", "EUR"]}
				kind="expenses"
			/>

			<BulkCategoryToolbar bulk={bulk} />

			{isLoading && <Loader />}
			{!isLoading && !showEmptyState && !filterState.error && (
				<>
					<UnifiedLedgerList
						rows={rows}
						onDelete={handleDeleteRow}
						bankLinkedIds={bankLinkedIds}
						bulk={bulk}
						categoryMap={categoryMap}
						isMobile={isMobile}
					/>
					{infiniteLedger.hasNextPage && (
						<Button
							disabled={infiniteLedger.isFetchingNextPage}
							data-test-id="show-more-button"
							onClick={() => void infiniteLedger.fetchNextPage()}
						>
							{infiniteLedger.isFetchingNextPage ? "Loading…" : "Show more"}
						</Button>
					)}
				</>
			)}
			{showEmptyState && (
				<div data-test-id="search-empty-state" style={{ padding: "24px 0" }}>
					No transactions match these filters.{" "}
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
