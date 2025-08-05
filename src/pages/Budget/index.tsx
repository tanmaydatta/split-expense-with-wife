import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Loader } from "@/components/Loader";
import { AmountGrid } from "@/components/AmountGrid";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import BudgetTable from "./BudgetTable";
import { SelectBudget } from "@/SelectBudget";
import { ApiError, typedApi } from "@/utils/api";
import {
	BudgetListRequest,
	BudgetTotalRequest,
	BudgetDeleteRequest,
	BudgetEntry,
	BudgetTotal,
} from "@shared-types";
import "./index.css";

export const Budget: React.FC = () => {
	const [budgetHistory, setBudgetHistory] = useState<BudgetEntry[]>([]);
	const [budget, setBudget] = useState("house");
	const [budgetsLeft, setBudgetsLeft] = useState<
		{ currency: string; amount: number }[]
	>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

	const handleChangeBudget = (val: string) => setBudget(val);
	const navigate = useNavigate();
	const fetchTotal = useCallback(async () => {
		try {
			const request: BudgetTotalRequest = {
				name: budget,
			};

			const response: BudgetTotal[] = await typedApi.post(
				"/budget_total",
				request,
			);
			setBudgetsLeft(response);
		} catch (e: any) {
			console.log(e);
			if (e.response?.status === 401) {
				navigate("/login");
			}
		}
	}, [budget, navigate]);

	const fetchHistory = useCallback(
		async (offset: number, history: BudgetEntry[]) => {
			setLoading(true);
			try {
				const request: BudgetListRequest = {
					name: budget,
					offset: offset,
				};

				const response: BudgetEntry[] = await typedApi.post(
					"/budget_list",
					request,
				);
				console.log(response);
				setBudgetHistory([...history, ...response]);
			} catch (e: any) {
				console.log(e);
				if (e.response?.status === 401) {
					navigate("/login");
				}
			} finally {
				setLoading(false);
			}
		},
		[budget, navigate],
	);
	const deleteBudgetEntry = async (id: number) => {
		setLoading(true);

		// Clear any previous messages
		setError("");
		setSuccess("");

		try {
			const request: BudgetDeleteRequest = {
				id: id,
			};

			const response: { message: string } = await typedApi.post(
				"/budget_delete",
				request,
			);
			setSuccess(response.message);
			fetchTotal();
			fetchHistory(0, []);
		} catch (e: any) {
			let statusCode = 500;
			if (e instanceof ApiError) {
				setError(e.errorMessage);
				statusCode = e.statusCode;
			} else {
				setError(
					e.response?.data ||
						"An error occurred while deleting the budget entry",
				);
				statusCode = e.response?.status || 500;
			}
			if (statusCode === 401) {
				navigate("/login");
			}
		} finally {
			setLoading(false);
		}
	};
	useEffect(() => {
		fetchTotal();
		fetchHistory(0, []);
	}, [fetchTotal, fetchHistory]);
	return (
		<div className="budget-container" data-test-id="budget-container">
			{/* Error Container */}
			{error && <ErrorContainer message={error} onClose={() => setError("")} />}

			{/* Success Container */}
			{success && (
				<SuccessContainer
					message={success}
					onClose={() => setSuccess("")}
					data-test-id="success-container"
				/>
			)}

			{loading && <Loader />}
			{!loading && (
				<>
					<Card className="budget-card">
						<h3>Budget left</h3>
						<AmountGrid amounts={budgetsLeft} />
					</Card>
					<SelectBudget
						budget={budget}
						handleChangeBudget={handleChangeBudget}
					/>
					<Button onClick={() => navigate(`/monthly-budget/${budget}`)}>
						View Monthly Budget Breakdown
					</Button>
					<BudgetTable entries={budgetHistory} onDelete={deleteBudgetEntry} />
					<Button
						onClick={() => fetchHistory(budgetHistory.length, budgetHistory)}
					>
						Show more
					</Button>
				</>
			)}
		</div>
	);
};
