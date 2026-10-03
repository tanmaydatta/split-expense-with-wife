import { AmountGrid } from "@/components/AmountGrid";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Loader } from "@/components/Loader";
import { UiPageDescription, UiPageTitle } from "@/components/ui";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { FinanceListFilters } from "@/components/FinanceListFilters";
import { useFinanceListFilters } from "@/hooks/useFinanceListFilters";
import { SelectBudget } from "@/SelectBudget";
import {
	useBudgetTotal,
	useDeleteBudgetEntry,
	useInfiniteBudgetHistory,
	useLoadMoreBudgetHistory,
} from "@/hooks/useBudget";
import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import {
	BudgetEntry,
	BudgetListRequest,
	ReduxState,
} from "split-expense-shared-types";
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
	const filters = filterState.filters as Omit<
		BudgetListRequest,
		"offset" | "budgetId"
	>;
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

	return {
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
		navigate,
	};
}

export const Budget: React.FC = () => {
	const {
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
		navigate,
	} = useBudgetPage();

	const isLoading =
		budgetTotalQuery.isLoading ||
		budgetHistoryQuery.isLoading ||
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
		!filterState.error &&
		filterState.activeCount > 0 &&
		budgetHistory.length === 0;

	return (
		<div className="budget-container" data-test-id="budget-container">
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
						budgetId={budget}
						handleChangeBudget={handleChangeBudget}
					/>
					<Button onClick={() => navigate(`/monthly-budget/${budget}`)}>
						View Monthly Budget Breakdown
					</Button>
					<FinanceListFilters
						state={filterState}
						currencies={data?.extra?.currencies ?? ["GBP", "USD", "EUR"]}
						kind="budget"
					/>
					{!showEmptyState && !isLoading && !filterState.error && (
						<>
							<BudgetTable
								entries={budgetHistory}
								onDelete={handleDeleteBudgetEntry}
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
