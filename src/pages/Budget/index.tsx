import { AmountGrid } from "@/components/AmountGrid";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { SearchInput } from "@/components/SearchInput";
import { SelectBudget } from "@/SelectBudget";
import {
	useBudgetTotal,
	useDeleteBudgetEntry,
	useInfiniteBudgetHistory,
	useLoadMoreBudgetHistory,
} from "@/hooks/useBudget";
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { BudgetEntry, ReduxState } from "split-expense-shared-types";
import BudgetTable from "./BudgetTable";
import "./index.css";

export const Budget: React.FC = () => {
	const [budget, setBudget] = useState("");
	const [budgetHistory, setBudgetHistory] = useState<BudgetEntry[]>([]);
	const [searchParams, setSearchParams] = useSearchParams();
	const q = searchParams.get("q") ?? "";

	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	const budgetTotalQuery = useBudgetTotal(budget);
	const budgetHistoryQuery = useInfiniteBudgetHistory(budget, q);
	const deleteBudgetMutation = useDeleteBudgetEntry();
	const loadMoreHistory = useLoadMoreBudgetHistory();

	const navigate = useNavigate();

	const handleChangeBudget = (val: string) => {
		setBudget(val);
		// Clear q whenever the selected budget changes
		const params = new URLSearchParams(searchParams);
		params.delete("q");
		setSearchParams(params, { replace: true });
	};

	const handleSetQ = (next: string) => {
		const params = new URLSearchParams(searchParams);
		if (next) params.set("q", next);
		else params.delete("q");
		setSearchParams(params, { replace: true });
	};

	useEffect(() => {
		if (budgets.length > 0 && !budget) {
			setBudget(budgets[0].id);
		}
	}, [budgets, budget]);

	useEffect(() => {
		if (budgetHistoryQuery.data) {
			setBudgetHistory(budgetHistoryQuery.data);
		}
	}, [budgetHistoryQuery.data]);

	// Reset accumulated history when q or budget changes
	useEffect(() => {
		setBudgetHistory([]);
	}, [q, budget]);

	const handleDeleteBudgetEntry = (id: string) => {
		deleteBudgetMutation.mutate(id);
	};

	const handleLoadMoreHistory = async () => {
		try {
			const newEntries = await loadMoreHistory(budget, budgetHistory, q);
			if (newEntries && newEntries.length > 0) {
				setBudgetHistory((prev) => [...prev, ...newEntries]);
			}
		} catch (error) {
			console.error("Error loading more history:", error);
		}
	};

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
		!isLoading && q.length > 0 && budgetHistory.length === 0;

	return (
		<div className="budget-container" data-test-id="budget-container">
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

			{isLoading && <Loader />}
			{!isLoading && (
				<>
					<Card className="budget-card">
						<h3>Budget left</h3>
						<AmountGrid amounts={budgetsLeft} />
					</Card>
					<SelectBudget
						budgetId={budget}
						handleChangeBudget={handleChangeBudget}
					/>
					<Button onClick={() => navigate(`/monthly-budget/${budget}`)}>
						View Monthly Budget Breakdown
					</Button>
					<SearchInput
						value={q}
						onDebouncedChange={handleSetQ}
						placeholder="Search this budget by description"
					/>
					{!showEmptyState && (
						<>
							<BudgetTable
								entries={budgetHistory}
								onDelete={handleDeleteBudgetEntry}
							/>
							<Button onClick={handleLoadMoreHistory}>Show more</Button>
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
				</>
			)}
		</div>
	);
};
