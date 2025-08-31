import { Button } from "@/components/Button";
import { ButtonRow, FormContainer } from "@/components/Form/Layout";
import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import { useDashboardSubmit } from "@/hooks/useDashboard";
import { useCallback, useEffect, useState, useMemo } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import type { DashboardUser, ReduxState } from "split-expense-shared-types";
import { DashboardFormSchema } from "split-expense-shared-types";
import {
	DescriptionField,
	AmountField,
	SplitPercentageFields,
	CurrencyField,
	PaidByField,
	BudgetFields,
	ActionSelection,
} from "./FormFields";
import { buildDefaultFormValues } from "./helpers";
import {
	createFormSubmitHandler,
	createUserPercentageUpdater,
	getSuccessMessage,
} from "./formHandlers";
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
	const getDefaultValues = useCallback(() => {
		return buildDefaultFormValues(data, budgets);
	}, [data, budgets]);

	// Create submit handler
	const handleSubmit = createFormSubmitHandler(dashboardSubmit, data);

	// TanStack Form setup
	const form = useForm({
		defaultValues: getDefaultValues(),
		validators: {
			onChange: DashboardFormSchema,
		},
		onSubmit: (options) => handleSubmit(options, form),
	});

	// Use reactive form state for conditional rendering
	const addExpense = useStore(
		form.store,
		(state: any) => state.values.addExpense,
	);
	const updateBudget = useStore(
		form.store,
		(state: any) => state.values.updateBudget,
	);
	const users = useStore(form.store, (state: any) => state.values.users || []);

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
	const updateUserPercentage = createUserPercentageUpdater(form);

	// React Query state variables
	const loading = dashboardSubmit.isPending;
	const error = dashboardSubmit.error?.message || "";
	const success = getSuccessMessage(dashboardSubmit);

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

				<DescriptionField form={form} loading={loading} />
				<AmountField form={form} loading={loading} />

				<SplitPercentageFields
					users={users}
					updateUserPercentage={updateUserPercentage}
					loading={loading}
					addExpense={addExpense}
				/>

				<CurrencyField form={form} loading={loading} />

				<PaidByField
					form={form}
					loading={loading}
					addExpense={addExpense}
					usersState={usersState}
				/>

				<BudgetFields
					form={form}
					loading={loading}
					updateBudget={updateBudget}
				/>

				<ActionSelection form={form} loading={loading} />

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
