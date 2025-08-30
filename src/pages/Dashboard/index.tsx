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
import type { DashboardFormData } from "@/hooks/useDashboard";
import { scrollToTop } from "@/utils/scroll";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import type { DashboardUser, ReduxState } from "split-expense-shared-types";
import {
	DashboardFormSchema,
	DashboardFormInput,
} from "split-expense-shared-types";
import { CreditDebit } from "./CreditDebit";
import "./index.css";

import { useSelector } from "react-redux";

function Dashboard(): JSX.Element {
	// React Query hook for form submission
	const dashboardSubmit = useDashboardSubmit();

	// Keep some state for session-dependent logic
	const [usersState, setUsersState] = useState<DashboardUser[]>([]);
	const [defaultsInitialized, setDefaultsInitialized] =
		useState<boolean>(false);

	// Get auth data from the data store (where login puts it)
	const data = useSelector((state: ReduxState) => state.value);
	const budgets = useMemo(
		() => data?.extra?.group?.budgets || [],
		[data?.extra?.group?.budgets],
	);

	// Calculate default form values from session data
	const getDefaultValues = useCallback((): DashboardFormInput => {
		const sessionCurrency = data?.extra?.group?.metadata?.defaultCurrency;
		const defaultCurrency: "USD" | "EUR" | "GBP" | "CAD" =
			sessionCurrency && ["USD", "EUR", "GBP", "CAD"].includes(sessionCurrency)
				? (sessionCurrency as "USD" | "EUR" | "GBP" | "CAD")
				: "USD";
		const defaultBudget = budgets.length > 0 ? budgets[0].id : "";
		const defaultPaidBy = data?.extra?.currentUser?.id || "";

		// Calculate default user splits
		const usersFromAuth: DashboardUser[] = data?.extra?.usersById
			? Object.values(data.extra.usersById).map((v) => ({
					FirstName: v.firstName,
					Id: v.id,
					percentage: 0, // Will be calculated below
				}))
			: [];

		// Apply default share percentages from metadata
		const usersWithPercentages = usersFromAuth.map((u) => {
			const userIdStr = u.Id.toString();
			const defaultPercentage =
				data?.extra?.group?.metadata?.defaultShare?.[userIdStr];
			return {
				...u,
				percentage:
					defaultPercentage !== undefined
						? defaultPercentage
						: 100 / usersFromAuth.length,
			};
		});

		return {
			// Action selection - both enabled by default
			addExpense: true,
			updateBudget: true,

			// Core fields
			amount: undefined as any, // Undefined shows as empty in UI, matches original behavior
			description: "",
			currency: defaultCurrency,

			// Expense fields
			paidBy: defaultPaidBy,
			users: usersWithPercentages,

			// Budget fields
			budgetId: defaultBudget,
			creditDebit: "Debit" as const,
		};
	}, [data, budgets]);

	// TanStack Form setup
	const form = useForm({
		defaultValues: getDefaultValues(),
		validators: {
			onChange: DashboardFormSchema,
		},
		onSubmit: async ({ value }) => {
			// Prepare form data for React Query submission
			const formData: DashboardFormData = {
				addExpense: value.addExpense,
				updateBudget: value.updateBudget,
			};

			if (value.addExpense && value.users) {
				formData.expense = {
					amount: value.amount,
					description: value.description,
					currency: value.currency,
					paidBy: value.paidBy!,
					users: value.users,
				};
			}

			if (value.updateBudget) {
				formData.budget = {
					amount: value.amount,
					description: value.description,
					budgetId: value.budgetId!,
					currency: value.currency,
					creditDebit: value.creditDebit!,
					groupId: data?.extra?.group?.groupid ?? "",
				};
			}

			// Submit using existing React Query hook
			dashboardSubmit.mutate(formData, {
				onSuccess: (_responses) => {
					// Reset only amount and description, preserve user splits and other settings
					// Use undefined for amount to match original behavior (shows as empty in UI)
					form.setFieldValue("amount", undefined as any);
					form.setFieldValue("description", "");
					scrollToTop();
				},
				onError: (error) => {
					console.error("Error:", error);
					scrollToTop();
				},
			});
		},
	});

	// Use reactive form state for conditional rendering
	const addExpense = useStore(form.store, (state) => state.values.addExpense);
	const updateBudget = useStore(
		form.store,
		(state) => state.values.updateBudget,
	);
	const users = useStore(form.store, (state) => state.values.users || []);

	// Initialize form with session data when available
	useEffect(() => {
		// AppWrapper ensures we're authenticated, but data might still be loading
		if (!data?.extra?.usersById) {
			return; // Wait for session data to load
		}

		// Get users from session data
		const usersFromAuth: DashboardUser[] = Object.values(
			data.extra.usersById,
		).map((v) => ({
			FirstName: v.firstName,
			Id: v.id,
		}));
		setUsersState(usersFromAuth);

		// Only set defaults if they haven't been initialized yet (to avoid overriding user changes)
		if (!defaultsInitialized) {
			// Initialize form with session-based defaults
			const defaults = getDefaultValues();
			form.reset(defaults);
			setDefaultsInitialized(true);
		}
	}, [data, defaultsInitialized, getDefaultValues, form]);

	// Helper function to update user percentage in form state
	const updateUserPercentage = (userId: string, percentage: number) => {
		const currentUsers = form.getFieldValue("users") || [];
		const updatedUsers = currentUsers.map((user) =>
			user.Id === userId ? { ...user, percentage } : user,
		);
		form.setFieldValue("users", updatedUsers);
	};

	// React Query state variables
	const loading = dashboardSubmit.isPending;
	const error = dashboardSubmit.error?.message || "";
	const success = dashboardSubmit.isSuccess
		? dashboardSubmit.data?.expense?.message &&
			dashboardSubmit.data?.budget?.message
			? `${dashboardSubmit.data.expense.message} and ${dashboardSubmit.data.budget.message}`
			: dashboardSubmit.data?.expense?.message ||
				dashboardSubmit.data?.budget?.message ||
				"Success!"
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
					<ErrorContainer
						message={error}
						onClose={() => dashboardSubmit.reset()}
					/>
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
				<form.Field name="description">
					{(field) => (
						<Input
							type="text"
							placeholder="Enter description"
							name="description"
							data-test-id="description-input"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={loading}
							required
							minLength={2}
							maxLength={100}
							title="Please enter a description between 2-100 characters"
						/>
					)}
				</form.Field>

				<label>Amount</label>
				<form.Field name="amount">
					{(field) => (
						<Input
							type="number"
							placeholder="Enter amount"
							name="amount"
							data-test-id="amount-input"
							step="0.01"
							min="0.01"
							max="999999"
							value={field.state.value ? field.state.value.toString() : ""}
							onChange={(e) => {
								const value = e.target.value;
								field.handleChange(
									value ? parseFloat(value) : (undefined as any),
								);
							}}
							disabled={loading}
							required
							title="Please enter a valid amount greater than 0"
						/>
					)}
				</form.Field>

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
				<form.Field name="currency">
					{(field) => (
						<Select
							value={field.state.value}
							onChange={(e) =>
								field.handleChange(
									e.target.value as "USD" | "EUR" | "GBP" | "CAD",
								)
							}
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
					)}
				</form.Field>

				{/* Paid By - only show if Add Expense is selected */}
				{addExpense && (
					<>
						<label>Paid By</label>
						<form.Field name="paidBy">
							{(field) => (
								<Select
									value={field.state.value || ""}
									onChange={(e) => field.handleChange(e.target.value)}
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
							)}
						</form.Field>
					</>
				)}

				{/* Credit/Debit and Budget selector - only show if Update Budget is selected */}
				{updateBudget && (
					<>
						<form.Field name="creditDebit">
							{(field) => (
								<CreditDebit
									budget={field.state.value || "Debit"}
									handleChangeBudget={(value: string) =>
										field.handleChange(value as "Credit" | "Debit")
									}
									disabled={loading}
								/>
							)}
						</form.Field>
						<form.Field name="budgetId">
							{(field) => (
								<SelectBudget
									budgetId={field.state.value || ""}
									handleChangeBudget={(value: string) =>
										field.handleChange(value)
									}
									disabled={loading}
								/>
							)}
						</form.Field>
					</>
				)}

				{/* Action Selection */}
				<div className="action-selection">
					<label>Actions to perform:</label>
					<div className="checkbox-group">
						<label className="checkbox-label">
							<form.Field name="addExpense">
								{(field) => (
									<input
										type="checkbox"
										data-test-id="add-expense-checkbox"
										checked={field.state.value}
										onChange={(e) => field.handleChange(e.target.checked)}
										disabled={loading}
									/>
								)}
							</form.Field>
							Add Expense
						</label>
						<label className="checkbox-label">
							<form.Field name="updateBudget">
								{(field) => (
									<input
										type="checkbox"
										data-test-id="update-budget-checkbox"
										checked={field.state.value}
										onChange={(e) => field.handleChange(e.target.checked)}
										disabled={loading}
									/>
								)}
							</form.Field>
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
							form.handleSubmit();
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
