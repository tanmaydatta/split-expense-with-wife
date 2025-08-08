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
import { ApiError, typedApi } from "@/utils/api";
import { scrollToTop } from "@/utils/scroll";
import { useCallback, useEffect, useState } from "react";
import type {
	ApiOperationResponses,
	BudgetRequest,
	DashboardUser,
	ReduxState,
	SplitNewRequest,
} from "split-expense-shared-types";
import { CreditDebit } from "./CreditDebit";
import "./index.css";

import { useSelector } from "react-redux";

function Dashboard(): JSX.Element {
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string>("");
	const [success, setSuccess] = useState<string>("");

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
				setBudget(data.extra.group.budgets[0]);
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

	const onSubmitExpense = async () => {
		if (!data?.user.id) {
			throw new Error("User not authenticated");
		}

		// Only check percentage total since HTML5 can't validate this complex rule
		const totalPercentage = users.reduce(
			(sum, user) => sum + (user.percentage || 0),
			0,
		);
		if (Math.abs(totalPercentage - 100) > 0.01) {
			throw new Error("Total percentage must equal 100%");
		}

		const splits = users.map((user) => ({
			ShareUserId: user.Id,
			SharePercentage: user.percentage || 0,
		}));

		const payload: SplitNewRequest = {
			amount: amount!,
			description: description!,
			paidByShares: { [paidBy!]: amount! },
			splitPctShares: Object.fromEntries(
				splits.map((s) => [s.ShareUserId.toString(), s.SharePercentage]),
			),
			currency: currency,
		};

		const response = await typedApi.post("/split_new", payload);
		return response; // Returns { message: string; transactionId: string }
	};

	const onSubmitBudget = async () => {
		if (!data?.user.id) {
			throw new Error("User not authenticated");
		}

		const budgetPayload: BudgetRequest = {
			amount: creditDebit === "Debit" ? -amount! : amount!,
			description: description!,
			name: budget,
			groupid: data?.extra?.group?.groupid || 0,
			currency: currency,
		};

		const response = await typedApi.post("/budget", budgetPayload);
		return response; // Returns { message: string }
	};

	const onSubmit = async () => {
		setLoading(true);

		// Clear any previous messages
		setError("");
		setSuccess("");

		// HTML5 validation will handle: amount, description, paidBy, currency

		if (!addExpense && !updateBudget) {
			setError("Please select at least one action to perform");
			return;
		}

		try {
			const responses: ApiOperationResponses = {};

			if (addExpense) {
				responses.expense = await onSubmitExpense();
			}

			if (updateBudget) {
				responses.budget = await onSubmitBudget();
			}

			// Reset form (but preserve user's percentage splits)
			setAmount(undefined);
			setDescription("");

			// Create success message from API responses
			const messages = [];
			if (responses.expense) {
				messages.push(responses.expense.message);
				// Store transaction ID if needed for future operations
			}
			if (responses.budget) {
				messages.push(responses.budget.message);
			}

			// Show success message with actual API messages
			setSuccess(`Success! ${messages.join(" and ")}`);
		} catch (error: unknown) {
			console.error("Error:", error);

			// Clear any success message when there's an error
			setSuccess("");

			// Handle our typed ApiError
			if (error instanceof ApiError) {
				setError(error.errorMessage);
			} else if (error instanceof Error) {
				// Handle standard Error objects
				setError(error.message);
			} else {
				// Fallback for any unexpected error types
				setError("An unexpected error occurred. Please try again.");
			}

			// AppWrapper will handle auth state if 401 error
		} finally {
			setLoading(false);
			scrollToTop();
		}
	};

	const updateUserPercentage = (userId: string, percentage: number) => {
		setUsers((prevUsers) =>
			prevUsers.map((user) =>
				user.Id === userId ? { ...user, percentage } : user,
			),
		);
	};

	// Show loading while session data is being fetched
	if (!data?.extra?.usersById) {
		return <Loader />;
	}

	return (
		<div className="dashboard-container" data-test-id="dashboard-container">
			<FormContainer data-test-id="expense-form">
				{/* Error Container */}
				{error && (
					<ErrorContainer message={error} onClose={() => setError("")} />
				)}

				{/* Success Container */}
				{success && (
					<SuccessContainer
						message={success}
						onClose={() => setSuccess("")}
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
							budget={budget}
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
								onSubmit();
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
