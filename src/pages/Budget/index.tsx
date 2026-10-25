import TransferForm from "./TransferForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
	BudgetEntry,
	BudgetListRequest,
	ReduxState,
	GroupBudgetData,
} from "split-expense-shared-types";
import { AmountGrid } from "@/components/AmountGrid";
import {
	BulkCategoryToolbar,
	useBulkCategoryRows,
} from "@/components/BulkCategories";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FinanceListFilters } from "@/components/FinanceListFilters";
import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { UiPageDescription, UiPageTitle } from "@/components/ui";
import {
	useBudgetTotal,
	useDeleteBudgetEntry,
	useInfiniteBudgetHistory,
	useLoadMoreBudgetHistory,
} from "@/hooks/useBudget";
import { useFinanceListFilters } from "@/hooks/useFinanceListFilters";
import { SelectBudget } from "@/SelectBudget";
import BudgetTable from "./BudgetTable";
import "./index.css";

function useBudgetPage() {
	const [budgetHistory, setBudgetHistory] = useState<BudgetEntry[]>([]);
	const [searchParams, setSearchParams] = useSearchParams();
	const filterState = useFinanceListFilters(["all", "credit", "debit"]);
	const q = filterState.filters.q ?? "";

	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	const selectedBudget = searchParams.get("budget");
	const budget = budgets.some((b) => b.id === selectedBudget)
		? selectedBudget!
		: (budgets[0]?.id ?? "");
	const sessionContext = `${data?.user?.id ?? ""}:${data?.extra?.group?.groupid ?? ""}`;
	const filters = filterState.filters as Omit<BudgetListRequest, "offset" | "budgetId">;
	const listKey = `${budget}:${sessionContext}:${filterState.key}`;
	const currentKey = useRef(listKey);
	const listGeneration = useRef(0);
	if (currentKey.current !== listKey) listGeneration.current++;
	currentKey.current = listKey;
	const [loadMoreError, setLoadMoreError] = useState("");
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);

	const budgetTotalQuery = useBudgetTotal(budget);
	const budgetHistoryQuery = useInfiniteBudgetHistory(
		budget,
		q,
		25,
		filters,
		sessionContext,
		!filterState.error,
	);
	const deleteBudgetMutation = useDeleteBudgetEntry();
	const loadMoreHistory = useLoadMoreBudgetHistory();

	const navigate = useNavigate();

	// Keep the first page distinct from the locally accumulated history.
	const lastSyncedKeyRef = useRef<string | null>(null);

	const handleChangeBudget = (val: string) => {
		setSearchParams((previous) => {
			const params = new URLSearchParams(previous);
			params.set("budget", val);
			return params;
		});
	};

	// Reset before syncing the new first page when filters or budget change.
	useEffect(() => {
		setBudgetHistory([]);
		lastSyncedKeyRef.current = null;
		setHasMore(true);
		setLoadingMore(false);
		setLoadMoreError("");
	}, [listKey]);

	useEffect(() => {
		const key = listKey;
		if (budgetHistoryQuery.data && lastSyncedKeyRef.current !== key) {
			setBudgetHistory(budgetHistoryQuery.data);
			lastSyncedKeyRef.current = key;
			setHasMore(budgetHistoryQuery.data.length === 5);
		}
	}, [budgetHistoryQuery.data, listKey]);

	const handleDeleteBudgetEntry = (id: string) => {
		const requestKey = listKey;
		const requestGeneration = listGeneration.current;
		deleteBudgetMutation.mutate(id, {
			onSuccess: () => {
				if (
					currentKey.current !== requestKey ||
					listGeneration.current !== requestGeneration
				)
					return;
				setBudgetHistory((entries) =>
					entries.filter((entry) => entry.id !== id),
				);
				lastSyncedKeyRef.current = null;
				void budgetHistoryQuery.refetch();
			},
		});
	};

	const handleLoadMoreHistory = async () => {
		const requestKey = listKey;
		const requestGeneration = listGeneration.current;
		try {
			setLoadingMore(true);
			setLoadMoreError("");
			const newEntries = await loadMoreHistory(
				budget,
				budgetHistory,
				q,
				filters,
				sessionContext,
			);
			if (
				currentKey.current !== requestKey ||
				listGeneration.current !== requestGeneration
			)
				return;
			setHasMore(newEntries.length === 5);
			if (newEntries && newEntries.length > 0) {
				setBudgetHistory((prev) => [...prev, ...newEntries]);
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
					: "Could not load more budget entries. Try again.",
			);
		} finally {
			if (
				currentKey.current === requestKey &&
				listGeneration.current === requestGeneration
			)
				setLoadingMore(false);
		}
	};

	const bulk = useBulkCategoryRows("budget", budgetHistory.filter((e) => e.deleted == null), (row) => row.id, listKey, setBudgetHistory, filters.categoryId);
	return {
		bulk,
		budget,
		budgetHistory,
		filterState,
		data,
		budgetTotalQuery,
		budgetHistoryQuery,
		deleteBudgetMutation,
		handleChangeBudget,
		handleDeleteBudgetEntry,
		handleLoadMoreHistory,
		hasMore,
		loadingMore,
		loadMoreError,
		setLoadMoreError,
		refreshAfterTransfer: async () => {
			const key = listKey;
			if (currentKey.current !== key) return;
			const result = await budgetHistoryQuery.refetch();
			if (currentKey.current === key && result.data) {
				setBudgetHistory(result.data);
				setHasMore(result.data.length === 5);
				lastSyncedKeyRef.current = key;
			}
		},
		navigate,
	};
}

export const Budget: React.FC = () => {
	const {
		bulk,
		budget,
		budgetHistory,
		filterState,
		data,
		budgetTotalQuery,
		budgetHistoryQuery,
		deleteBudgetMutation,
		handleChangeBudget,
		handleDeleteBudgetEntry,
		handleLoadMoreHistory,
		hasMore,
		loadingMore,
		loadMoreError,
		setLoadMoreError,
		refreshAfterTransfer,
		navigate,
	} = useBudgetPage();

	const [transferDelete, setTransferDelete] = useState<BudgetEntry | null>(null);
	const requestDelete = (id: string) => {
		const entry = budgetHistory.find((e) => e.id === id);
		if (entry?.transfer) setTransferDelete(entry);
		else handleDeleteBudgetEntry(id);
	};
	const isLoading = budgetTotalQuery.isLoading || budgetHistoryQuery.isLoading ||
		deleteBudgetMutation.isPending;

	const error =
		budgetTotalQuery.error?.message ||
		budgetHistoryQuery.error?.message ||
		deleteBudgetMutation.error?.message ||
		"";

	const success = deleteBudgetMutation.isSuccess
		? deleteBudgetMutation.data?.message || "Budget entry deleted successfully"
		: "";

	const budgetsLeft = budgetTotalQuery.data || [];
	const showEmptyState =
		!isLoading &&
		!hasMore &&
		!filterState.error &&
		filterState.activeCount > 0 &&
		budgetHistory.length === 0;

	return (
		<div className="budget-container" data-test-id="budget-container">
			<TransferDeleteDialog
				entry={transferDelete}
				budgets={data?.extra?.group?.budgets ?? []}
				onCancel={() => setTransferDelete(null)}
				onConfirm={() => {
					if (transferDelete) handleDeleteBudgetEntry(transferDelete.id);
					setTransferDelete(null);
				}}
			/>
			<header>
				<UiPageTitle>Budget</UiPageTitle>
				<UiPageDescription>
					See what remains and review entries by category.
				</UiPageDescription>
			</header>
			{error && (
				<ErrorContainer
					message={error}
					onClose={() => deleteBudgetMutation.reset()}
				/>
			)}
			{success && (
				<SuccessContainer
					message={success}
					onClose={() => deleteBudgetMutation.reset()}
					data-test-id="success-container"
				/>
			)}

			{loadMoreError && (
				<ErrorContainer
					message={loadMoreError}
					onClose={() => setLoadMoreError("")}
				/>
			)}
			{isLoading && <Loader />}
			{
				<>
					<Card className="budget-card">
						<h3>Budget left</h3>
						<p className="finance-filter-help">
							Lifetime total · unaffected by list filters
						</p>
						<AmountGrid amounts={budgetsLeft} />
					</Card>
					<SelectBudget
						renameEnabled
						budgetId={budget}
						handleChangeBudget={handleChangeBudget}
					/>
					<Button onClick={() => navigate(`/monthly-budget/${budget}`)}>
						View Monthly Budget Breakdown
					</Button>
					<TransferForm
						budgets={data?.extra?.group?.budgets ?? []}
						sourceBudgetId={budget}
						currencies={data?.extra?.currencies ?? ["GBP", "USD", "EUR"]}
						onCreated={() => void refreshAfterTransfer()}
					/>
					<FinanceListFilters
						state={filterState}
						currencies={data?.extra?.currencies ?? ["GBP", "USD", "EUR"]}
						kind="budget"
					/>
					<BulkCategoryToolbar bulk={bulk} />
					{!showEmptyState && !isLoading && !filterState.error && (
						<>
							<BudgetTable
								entries={budgetHistory}
								bulk={bulk}
								onDelete={requestDelete}
							/>
							{hasMore && (
								<Button disabled={loadingMore} onClick={handleLoadMoreHistory}>
									{loadingMore ? "Loading…" : "Show more"}
								</Button>
							)}
						</>
					)}
					{showEmptyState && (
						<div
							data-test-id="search-empty-state"
							style={{ padding: "24px 0" }}
						>
							No budget entries match these filters.{" "}
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
				</>
			}
		</div>
	);
};

function TransferDeleteDialog({
	entry,
	budgets,
	onCancel,
	onConfirm,
}: {
	entry: BudgetEntry | null;
	budgets: GroupBudgetData[];
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const name =
		budgets.find((b) => b.id === entry?.transfer?.otherBudgetId)?.budgetName ??
		entry?.transfer?.otherBudgetName ??
		"the other budget";
	return (
		<ConfirmDialog
			open={!!entry}
			title="Delete transfer?"
			message={`This removes both transfer entries, including the entry in ${name}, and reverses both budget totals.`}
			confirmText="Delete both entries"
			onCancel={onCancel}
			onConfirm={onConfirm}
		/>
	);
}
