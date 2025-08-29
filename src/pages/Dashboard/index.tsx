import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import {
	ButtonRow,
	FormContainer,
	SplitPercentageContainer,
	SplitPercentageInputContainer,
} from "@/components/Form/Layout";
import { Select } from "@/components/Form/Select";
import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { SelectBudget } from "@/SelectBudget";
import { useDashboardSubmit } from "@/hooks/useDashboard";
import type {
	DashboardFormData,
} from "@/hooks/useDashboard";
import { scrollToTop } from "@/utils/scroll";
import { useCallback, useEffect, useState, useMemo } from "react";
import type {
	DashboardUser,
	ReduxState,
} from "split-expense-shared-types";
import { CreditDebit } from "./CreditDebit";
import "./index.css";

import { useSelector } from "react-redux";

function Dashboard(): JSX.Element {
	// React Query hook for form submission
	const dashboardSubmit = useDashboardSubmit();

	const [creditDebit, setCreditDebit] = useState("Debit");
	const [amount, setAmount] = useState<number>();
	const [description, setDescription] = useState<string>();
	const [budget, setBudget] = useState<string>("");
	const [currency, setCurrency] = useState<string>("USD");
	const [paidBy, setPaidBy] = useState<string>();
	const [usersState, setUsersState] = useState<DashboardUser[]>([]);
	const [users, setUsers] = useState<DashboardUser[]>([]);

	// Action selection state - both checked by default
	const [addExpense, setAddExpense] = useState<boolean>(true);
	const [updateBudget, setUpdateBudget] = useState<boolean>(true);

	// Track if defaults have been set to avoid overriding user changes
	const [defaultsInitialized, setDefaultsInitialized] =
		useState<boolean>(false);

	// Get auth data from the data store (where login puts it)
	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	// Initialize budget with first available budget from session
	useEffect(() => {
		if (budgets.length > 0 && !budget) {
			setBudget(budgets[0].id);
		}
	}, [budgets, budget]);

	// Helper function to calculate default user percentages from metadata
	const calculateDefaultUserPercentages = useCallback(
		(usersFromAuth: DashboardUser[]): DashboardUser[] => {
			console.log("calculateDefaultUserPercentages", data);
			if (
				data?.extra?.group?.metadata?.defaultShare &&
				usersFromAuth.length > 0
			) {
				return usersFromAuth.map((u) => {
					// Convert user ID to string to match defaultShare keys
					const userIdStr = u.Id.toString();
					const defaultPercentage =
						data.extra.group!.metadata.defaultShare[userIdStr];
					return {
						...u,
						percentage:
							defaultPercentage !== undefined
								? defaultPercentage
								: 100 / usersFromAuth.length,
					};
				});
			} else {
				// Fallback to equal split if no default share available
				return usersFromAuth.map((u) => ({
					...u,
					percentage: 100 / usersFromAuth.length,
				}));
			}
		},
		[data],
	);

	useEffect(() => {
		// AppWrapper ensures we're authenticated, but data might still be loading
		if (!data?.extra?.usersById) {
			return; // Wait for session data to load
		}

		// Get users and budgets from the login data
		const usersFromAuth: DashboardUser[] = Object.values(
			data.extra.usersById,
		).map((v) => ({
			FirstName: v.firstName,
			Id: v.id,
		}));
		setUsersState(usersFromAuth);

		// Only set defaults if they haven't been initialized yet (to avoid overriding user changes)
		if (!defaultsInitialized) {
			// Set default currency from metadata
			if (data.extra.group?.metadata?.defaultCurrency) {
				setCurrency(data.extra.group.metadata.defaultCurrency);
			}

			// Set default split percentages from metadata
			const defaultUsers = calculateDefaultUserPercentages(usersFromAuth);
			setUsers(defaultUsers);

			// Set default budget from available budgets
			if (
				data.extra.group?.budgets &&
				data.extra.group.budgets.length > 0 &&
				!budget
			) {
				setBudget(data.extra.group.budgets[0].id);
			}

			// Set default paid by to current user
			if (data.extra.currentUser?.id && !paidBy) {
				setPaidBy(data.extra.currentUser.id);
			}

			// Mark defaults as initialized
			setDefaultsInitialized(true);
		} else {
			// If defaults are already initialized, only update users state if it's empty
			// This handles the case where users state might get reset
			if (users.length === 0 && usersFromAuth.length > 0) {
				const defaultUsers = calculateDefaultUserPercentages(usersFromAuth);
				setUsers(defaultUsers);
			}
		}
	}, [
		data,
		budget,
		paidBy,
		defaultsInitialized,
		users.length,
		calculateDefaultUserPercentages,
	]);

	const handleSubmit = () => {
		// Validation
		if (!addExpense && !updateBudget) {
			return; // Could show error, but form validation handles this
		}

		if (!data?.user?.id) {
			return; // User not authenticated
		}

		// Validate percentages for expense
		if (addExpense) {
			const totalPercentage = users.reduce(
				(sum, user) => sum + (user.percentage || 0),
				0,
			);
			if (Math.abs(totalPercentage - 100) > 0.01) {
				return; // Could show error message
			}
		}

		// Prepare form data
		const formData: DashboardFormData = {
			addExpense,
			updateBudget,
		};

		if (addExpense) {
			formData.expense = {
				amount: amount!,
				description: description!,
				currency,
				paidBy: paidBy!,
				users,
			};
		}

		if (updateBudget) {
			formData.budget = {
				amount: amount!,
				description: description!,
				budgetId: budget,
				currency,
				creditDebit: creditDebit as "Credit" | "Debit",
				groupId: data?.extra?.group?.groupid ?? "",
			};
		}

		// Submit using React Query
		dashboardSubmit.mutate(formData, {
			onSuccess: (_responses) => {
				// Reset form (but preserve user's percentage splits)
				setAmount(undefined);
				setDescription("");
				scrollToTop();
			},
			onError: (error) => {
				console.error("Error:", error);
				scrollToTop();
			},
		});
	};

	const updateUserPercentage = (userId: string, percentage: number) => {
		setUsers((prevUsers) =>
			prevUsers.map((user) =>
				user.Id === userId ? { ...user, percentage } : user,
			),
		);
	};

	// React Query state variables
	const loading = dashboardSubmit.isPending;
	const error = dashboardSubmit.error?.message || "";
	const success = dashboardSubmit.isSuccess
		? (dashboardSubmit.data?.expense?.message && dashboardSubmit.data?.budget?.message)
			? `${dashboardSubmit.data.expense.message} and ${dashboardSubmit.data.budget.message}`
			: (dashboardSubmit.data?.expense?.message || dashboardSubmit.data?.budget?.message || "Success!")
		: "";

	// Show loading while session data is being fetched
	if (!data?.extra?.usersById) {
		return <Loader />;
	}

	return (
		<div className="dashboard-container" data-test-id="dashboard-container">
			<FormContainer data-test-id="expense-form">
				{/* Error Container */}
				{error && (
					<ErrorContainer message={error} onClose={() => dashboardSubmit.reset()} />
				)}

				{/* Success Container */}
				{success && (
					<SuccessContainer
						message={success}
						onClose={() => dashboardSubmit.reset()}
						data-test-id="success-container"
					/>
				)}

				{/* Description and Amount first */}
				<label>Description</label>
				<Input
					type="text"
					placeholder="Enter description"
					name="description"
					data-test-id="description-input"
					value={description || ""}
					onChange={(e) => setDescription(e.target.value)}
					disabled={loading}
					required
					minLength={2}
					maxLength={100}
					title="Please enter a description between 2-100 characters"
				/>

				<label>Amount</label>
				<Input
					type="number"
					placeholder="Enter amount"
					name="amount"
					data-test-id="amount-input"
					step="0.01"
					min="0.01"
					max="999999"
					value={amount?.toString() || ""}
					onChange={(e) => setAmount(parseFloat(e.target.value))}
					disabled={loading}
					required
					title="Please enter a valid amount greater than 0"
				/>

				{/* Split percentage - only show if Add Expense is selected */}
				{addExpense && (
					<SplitPercentageContainer>
						{users.map((u: DashboardUser, _i: number) => (
							<SplitPercentageInputContainer key={u.Id}>
								<label>{u.FirstName}</label>
								<Input
									type="number"
									placeholder="Percentage"
									data-test-id={`percentage-input-${u.Id}`}
									step="0.01"
									min="0"
									max="100"
									value={u.percentage?.toString() || ""}
									onChange={(e) =>
										updateUserPercentage(u.Id, parseFloat(e.target.value) || 0)
									}
									disabled={loading}
									required={addExpense}
									title="Please enter a percentage between 0-100"
								/>
							</SplitPercentageInputContainer>
						))}
					</SplitPercentageContainer>
				)}

				{/* Currency */}
				<label>Currency</label>
				<Select
					value={currency}
					onChange={(e) => setCurrency(e.target.value)}
					className="currency-select"
					name="currency"
					data-test-id="currency-select"
					disabled={loading}
					required
					title="Please select a currency"
				>
					<option value="USD">USD</option>
					<option value="EUR">EUR</option>
					<option value="GBP">GBP</option>
					<option value="CAD">CAD</option>
				</Select>

				{/* Paid By - only show if Add Expense is selected */}
				{addExpense && (
					<>
						<label>Paid By</label>
						<Select
							value={paidBy || ""}
							onChange={(e) => setPaidBy(e.target.value)}
							className="paid-by-select"
							name="paidBy"
							data-test-id="paid-by-select"
							disabled={loading}
							required={addExpense}
							title="Please select who paid for this expense"
						>
							<option value="">Select who paid</option>
							{usersState.map((user) => (
								<option key={user.Id} value={user.Id}>
									{user.FirstName}
								</option>
							))}
						</Select>
					</>
				)}

				{/* Credit/Debit and Budget selector - only show if Update Budget is selected */}
				{updateBudget && (
					<>
						<CreditDebit
							budget={creditDebit}
							handleChangeBudget={setCreditDebit}
							disabled={loading}
						/>
						<SelectBudget
							budgetId={budget}
							handleChangeBudget={setBudget}
							disabled={loading}
						/>
					</>
				)}

				{/* Action Selection */}
				<div className="action-selection">
					<label>Actions to perform:</label>
					<div className="checkbox-group">
						<label className="checkbox-label">
							<input
								type="checkbox"
								data-test-id="add-expense-checkbox"
								checked={addExpense}
								onChange={(e) => setAddExpense(e.target.checked)}
								disabled={loading}
							/>
							Add Expense
						</label>
						<label className="checkbox-label">
							<input
								type="checkbox"
								data-test-id="update-budget-checkbox"
								checked={updateBudget}
								onChange={(e) => setUpdateBudget(e.target.checked)}
								disabled={loading}
							/>
							Update Budget
						</label>
					</div>
				</div>

				{/* Single submit button */}
				<ButtonRow>
					<Button
						type="submit"
						data-test-id="submit-button"
						onClick={(e) => {
							e.preventDefault();
							const form = e.currentTarget.form;
							if (form?.checkValidity()) {
								handleSubmit();
							} else {
								form?.reportValidity();
							}
						}}
						disabled={loading}
						className="submit-button"
					>
						{loading ? "Processing..." : "Submit"}
					</Button>
				</ButtonRow>
			</FormContainer>
		</div>
	);
}

export default Dashboard;
