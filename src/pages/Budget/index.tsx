import { AmountGrid } from "@/components/AmountGrid";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { SelectBudget } from "@/SelectBudget";
import {
	useBudgetTotal,
	useDeleteBudgetEntry,
	useInfiniteBudgetHistory,
	useLoadMoreBudgetHistory,
} from "@/hooks/useBudget";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { BudgetEntry, ReduxState } from "split-expense-shared-types";
import BudgetTable from "./BudgetTable";
import "./index.css";

export const Budget: React.FC = () => {
	const [budget, setBudget] = useState("");
	const [budgetHistory, setBudgetHistory] = useState<BudgetEntry[]>([]);

	// Get session data from Redux store
	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	// React Query hooks
	const budgetTotalQuery = useBudgetTotal(budget);
	const budgetHistoryQuery = useInfiniteBudgetHistory(budget);
	const deleteBudgetMutation = useDeleteBudgetEntry();
	const loadMoreHistory = useLoadMoreBudgetHistory();

	const handleChangeBudget = (val: string) => setBudget(val);
	const navigate = useNavigate();

	// Initialize budget with first available budget from session
	useEffect(() => {
		if (budgets.length > 0 && !budget) {
			setBudget(budgets[0].id);
		}
	}, [budgets, budget]);

	// Initialize budget history from React Query data
	useEffect(() => {
		if (budgetHistoryQuery.data) {
			setBudgetHistory(budgetHistoryQuery.data);
		}
	}, [budgetHistoryQuery.data]);

	// Handle delete budget entry
	const handleDeleteBudgetEntry = (id: string) => {
		deleteBudgetMutation.mutate(id);
	};

	// Handle load more budget history
	const handleLoadMoreHistory = async () => {
		try {
			const newEntries = await loadMoreHistory(budget, budgetHistory);
			if (newEntries && newEntries.length > 0) {
				setBudgetHistory((prev) => [...prev, ...newEntries]);
			}
		} catch (error) {
			console.error("Error loading more history:", error);
		}
	};

	// Determine loading state
	const isLoading =
		budgetTotalQuery.isLoading ||
		budgetHistoryQuery.isLoading ||
		deleteBudgetMutation.isPending;

	// Determine error state
	const error =
		budgetTotalQuery.error?.message ||
		budgetHistoryQuery.error?.message ||
		deleteBudgetMutation.error?.message ||
		"";

	// Determine success state
	const success = deleteBudgetMutation.isSuccess
		? deleteBudgetMutation.data?.message || "Budget entry deleted successfully"
		: "";

	// Get budget totals
	const budgetsLeft = budgetTotalQuery.data || [];
	return (
		<div className="budget-container" data-test-id="budget-container">
			{/* Error Container */}
			{error && (
				<ErrorContainer
					message={error}
					onClose={() => deleteBudgetMutation.reset()}
				/>
			)}

			{/* Success Container */}
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
					<BudgetTable
						entries={budgetHistory}
						onDelete={handleDeleteBudgetEntry}
					/>
					<Button onClick={handleLoadMoreHistory}>Show more</Button>
				</>
			)}
		</div>
	);
};
