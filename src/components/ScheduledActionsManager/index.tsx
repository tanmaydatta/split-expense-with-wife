import { Card } from "@/components/Card";
import { useCreateScheduledAction } from "@/hooks/useScheduledActions";
import { useForm, useStore } from "@tanstack/react-form";
import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import type {
	AuthenticatedUser,
	CreateScheduledActionRequest,
	ReduxState,
} from "split-expense-shared-types";
import { CreateScheduledActionSchema } from "split-expense-shared-types";
import { ScheduledActionForm } from "./ScheduledActionForm";
import {
	computeUsersFromSession,
	computeBudgetsFromSession,
	computeCurrenciesFromSession,
	computeDefaultCurrency,
	computeGroupDefaultShare,
	computeDefaultPayer,
	computeTodayAsLocalISODate,
	computeInitialActionData,
} from "./helpers";
import { createSubmitHandler } from "./formHandlers";
import { useFormEffects } from "./useFormEffects";

type ScheduledActionsManagerProps = {
	mode?: "create" | "edit";
	initialValues?: {
		id?: string;
		actionType: "add_expense" | "add_budget";
		frequency: "daily" | "weekly" | "monthly";
		startDate: string;
		actionData: any;
	};
	onSubmit?: (values: CreateScheduledActionRequest) => Promise<void>;
	submitLabel?: string;
};

export const ScheduledActionsManager: React.FC<
	ScheduledActionsManagerProps
> = ({ mode = "create", initialValues, onSubmit, submitLabel }) => {
	const createAction = useCreateScheduledAction();

	const session = useSelector((state: ReduxState) => state.value);
	const users: AuthenticatedUser[] = useMemo(
		() => computeUsersFromSession(session),
		[session],
	);
	const budgets: string[] = useMemo(
		() => computeBudgetsFromSession(session),
		[session],
	);
	const currencies: string[] = useMemo(
		() => computeCurrenciesFromSession(session),
		[session],
	);
	const defaultCurrency: string = useMemo(
		() => computeDefaultCurrency(session, currencies),
		[session, currencies],
	);

	// Derive group default splits and default payer for initial values
	const groupDefaultShare = useMemo(
		() => computeGroupDefaultShare(session),
		[session],
	);
	const defaultPayer = useMemo(
		() => computeDefaultPayer(groupDefaultShare, session),
		[groupDefaultShare, session],
	);

	// Compute today's date in local timezone as YYYY-MM-DD for the date input
	const todayAsLocalISODate = useMemo(() => computeTodayAsLocalISODate(), []);

	const [error, setError] = React.useState<string>("");
	const [success, setSuccess] = React.useState<string>("");

	const form = useForm({
		defaultValues: initialValues ?? {
			actionType: "add_expense",
			frequency: "daily",
			startDate: todayAsLocalISODate,
			actionData: computeInitialActionData(
				defaultCurrency,
				defaultPayer,
				groupDefaultShare,
			),
		},
		validators: {
			onMount: CreateScheduledActionSchema,
			onChange: CreateScheduledActionSchema,
		},
		onSubmit: createSubmitHandler(
			createAction,
			mode,
			setSuccess,
			setError,
			onSubmit,
		),
	});

	// Use custom hook for form effects and reactive values
	const { actionType } = useFormEffects({
		form,
		session,
		defaultCurrency,
		defaultPayer,
		groupDefaultShare,
		budgets,
		initialValues,
	});

	// Additional reactive values
	const splitTotal = useStore(form.store, (s) => {
		const shares = (s.values as any)?.actionData?.splitPctShares || {};
		return Object.values(shares)
			.map((v: any) => Number(v) || 0)
			.reduce((a: number, b: number) => a + b, 0);
	});
	const canSubmit = useStore(form.store, (s) => s.canSubmit);
	const isSubmitting = useStore(form.store, (s) => s.isSubmitting);
	const paidByUserId = useStore(
		form.store,
		(s) => (s.values as any)?.actionData?.paidByUserId || "",
	);

	// Form effects logic is handled in useFormEffects hook

	return (
		<div data-test-id="scheduled-actions-manager">
			<Card className="settings-card">
				<h3>Scheduled Actions</h3>
				<ScheduledActionForm
					form={form}
					mode={mode}
					error={error}
					success={success}
					setError={setError}
					setSuccess={setSuccess}
					actionType={actionType}
					todayAsLocalISODate={todayAsLocalISODate}
					users={users}
					currencies={currencies}
					splitTotal={splitTotal}
					canSubmit={canSubmit}
					isSubmitting={isSubmitting}
					submitLabel={submitLabel}
					createAction={createAction}
					paidByUserId={paidByUserId}
				/>
			</Card>
		</div>
	);
};

export default ScheduledActionsManager;
