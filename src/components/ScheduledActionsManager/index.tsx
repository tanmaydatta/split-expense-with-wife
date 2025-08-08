import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Form/Input";
import {
	ButtonRow,
	FormContainer,
	SplitPercentageContainer,
	SplitPercentageInputContainer,
} from "@/components/Form/Layout";
import { Select } from "@/components/Form/Select";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import {
	ToggleButton,
	ToggleButtonGroup,
} from "@/components/ToggleButtonGroup";
import { useCreateScheduledAction } from "@/hooks/useScheduledActions";
import { CreditDebit } from "@/pages/Dashboard/CreditDebit";
import { SelectBudget } from "@/SelectBudget";
import { useForm, useStore } from "@tanstack/react-form";
import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import type {
	AddExpenseActionData,
	AuthenticatedUser,
	CreateScheduledActionRequest,
	ReduxState,
} from "split-expense-shared-types";
import { CreateScheduledActionSchema } from "split-expense-shared-types";

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
	const users: AuthenticatedUser[] = useMemo(() => {
		const usersById = session?.extra?.usersById || {};
		return Object.values(usersById || {});
	}, [session]);
	const budgets: string[] = session?.extra?.group?.budgets || [];
	const currencies: string[] = useMemo(
		() => session?.extra?.currencies || ["USD"],
		[session],
	);
	const defaultCurrency: string = useMemo(() => {
		const groupDefault = session?.extra?.group?.metadata?.defaultCurrency;
		return groupDefault || currencies[0] || "USD";
	}, [session, currencies]);

	// Compute today's date in local timezone as YYYY-MM-DD for the date input
	const todayAsLocalISODate = useMemo(() => {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}, []);

	const form = useForm({
		defaultValues: initialValues ?? {
			actionType: "add_expense",
			frequency: "daily",
			startDate: todayAsLocalISODate,
			actionData: {
				amount: 0,
				description: "",
				currency: defaultCurrency,
				paidByUserId: "",
				splitPctShares: {},
			} as AddExpenseActionData,
		},
		validators: {
			onMount: CreateScheduledActionSchema,
			onChange: CreateScheduledActionSchema,
		},
		onSubmit: async ({ value }) => {
			try {
				if (onSubmit) {
					await onSubmit(value as CreateScheduledActionRequest);
				} else {
					await createAction.mutateAsync(value as CreateScheduledActionRequest);
				}
				setSuccess(
					mode === "edit"
						? "Scheduled action updated successfully"
						: "Scheduled action created successfully",
				);
				setError("");
			} catch (e: any) {
				setError(
					e?.errorMessage ||
						e?.message ||
						`Failed to ${mode === "edit" ? "update" : "create"} scheduled action`,
				);
				setSuccess("");
			}
		},
	});
	const [error, setError] = React.useState<string>("");
	const [success, setSuccess] = React.useState<string>("");

	// Reactivity per TanStack Form docs: useStore(form.store, selector)
	const actionType = useStore(form.store, (s) => s.values.actionType);
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

	// Keep currency synced with group's default currency when it changes
	React.useEffect(() => {
		if (!initialValues) {
			form.setFieldValue("actionData.currency", defaultCurrency);
		}
		// Initialize default split percentages from group metadata if available
		const defaultShare = session?.extra?.group?.metadata?.defaultShare as
			| Record<string, number>
			| undefined;
		if (defaultShare && Object.keys(defaultShare).length > 0) {
			Object.entries(defaultShare).forEach(([userId, pct]) => {
				form.setFieldValue(
					`actionData.splitPctShares.${userId}` as any,
					pct as any,
				);
			});
		}
	}, [defaultCurrency, session, form, initialValues]);

	return (
		<div data-test-id="scheduled-actions-manager">
			<Card className="settings-card">
				<h3>Scheduled Actions</h3>

				<FormContainer
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
					data-test-id="scheduled-action-form"
				>
					{error && (
						<ErrorContainer message={error} onClose={() => setError("")} />
					)}
					{success && (
						<SuccessContainer
							message={success}
							onClose={() => setSuccess("")}
						/>
					)}
					<label>Action</label>
					<form.Field name="actionType">
						{(field) => (
							<ToggleButtonGroup
								name="scheduled-action-type"
								value={String(field.state.value ?? "add_expense")}
								onChange={(val) => field.handleChange(val as any)}
								data-test-id="sa-action-type-toggle"
								style={{ width: "100%", marginBottom: 8 }}
							>
								<ToggleButton
									value="add_expense"
									data-test-id="sa-action-expense"
								>
									Add Expense
								</ToggleButton>
								<ToggleButton
									value="add_budget"
									data-test-id="sa-action-budget"
								>
									Add to Budget
								</ToggleButton>
							</ToggleButtonGroup>
						)}
					</form.Field>

					<label>Frequency</label>
					<form.Field name="frequency">
						{(field) => (
							<ToggleButtonGroup
								name="scheduled-action-frequency"
								value={String(field.state.value ?? "daily")}
								onChange={(val) => field.handleChange(val as any)}
								data-test-id="sa-frequency-toggle"
								style={{ width: "100%", marginBottom: 8 }}
							>
								<ToggleButton value="daily" data-test-id="sa-frequency-daily">
									Daily
								</ToggleButton>
								<ToggleButton value="weekly" data-test-id="sa-frequency-weekly">
									Weekly
								</ToggleButton>
								<ToggleButton
									value="monthly"
									data-test-id="sa-frequency-monthly"
								>
									Monthly
								</ToggleButton>
							</ToggleButtonGroup>
						)}
					</form.Field>

					<label>Start Date</label>
					<form.Field name="startDate">
						{(field) => (
							<Input
								type="date"
								value={String(field.state.value ?? "")}
								min={todayAsLocalISODate}
								required
								onChange={(e) => {
									const val = e.target.value;
									const clamped =
										val && val < todayAsLocalISODate
											? todayAsLocalISODate
											: val;
									field.handleChange(clamped);
								}}
								data-test-id="sa-start-date"
							/>
						)}
					</form.Field>

					{actionType === "add_expense" && (
						<>
							<label>Description</label>
							<form.Field name="actionData.description">
								{(field) => (
									<Input
										type="text"
										value={String(field.state.value ?? "")}
										required
										minLength={2}
										maxLength={100}
										onChange={(e) => field.handleChange(e.target.value)}
										data-test-id="sa-exp-description"
									/>
								)}
							</form.Field>

							<label>Amount</label>
							<form.Field name="actionData.amount">
								{(field) => (
									<Input
										type="number"
										value={String(field.state.value ?? "")}
										required
										step="0.01"
										min="0.01"
										onChange={(e) =>
											field.handleChange(parseFloat(e.target.value) || 0)
										}
										data-test-id="sa-exp-amount"
									/>
								)}
							</form.Field>

							<label>Currency</label>
							<form.Field name="actionData.currency">
								{(field) => (
									<Select
										className="currency-select"
										value={String(field.state.value ?? currencies[0])}
										required
										onChange={(e) => field.handleChange(e.target.value)}
										data-test-id="sa-exp-currency"
									>
										{currencies.map((c) => (
											<option key={c} value={c}>
												{c}
											</option>
										))}
									</Select>
								)}
							</form.Field>

							<label>Paid By</label>
							<form.Field name="actionData.paidByUserId">
								{(field) => (
									<Select
										className="paid-by-select"
										value={String(field.state.value ?? "")}
										onChange={(e) => field.handleChange(e.target.value)}
										required
										data-test-id="sa-exp-paid-by"
									>
										<option value="" disabled>
											Select who paid
										</option>
										{users.map((u) => (
											<option key={u.id} value={u.id}>
												{u.firstName} {u.lastName}
											</option>
										))}
									</Select>
								)}
							</form.Field>

							<label>Split Percentages</label>
							<SplitPercentageContainer>
								{users.map((u) => {
									return (
										<SplitPercentageInputContainer key={u.id}>
											<label>{u.firstName}</label>
											<form.Field name={`actionData.splitPctShares.${u.id}`}>
												{(field) => (
													<Input
														type="number"
														min="0"
														max="100"
														step="0.01"
														value={String(field.state.value ?? 0)}
														required
														onChange={(e) =>
															field.handleChange(
																parseFloat(e.target.value) || 0,
															)
														}
														data-test-id={`sa-exp-split-${u.id}`}
													/>
												)}
											</form.Field>
										</SplitPercentageInputContainer>
									);
								})}
								<div style={{ fontWeight: 600 }}>
									Total: {splitTotal.toFixed(2)}%
								</div>
							</SplitPercentageContainer>
						</>
					)}

					{actionType === "add_budget" && (
						<>
							<label>Description</label>
							<form.Field name="actionData.description">
								{(field) => (
									<Input
										type="text"
										value={String(field.state.value ?? "")}
										required
										minLength={2}
										maxLength={100}
										onChange={(e) => field.handleChange(e.target.value)}
										data-test-id="sa-bud-description"
									/>
								)}
							</form.Field>

							<label>Amount</label>
							<form.Field name="actionData.amount">
								{(field) => (
									<Input
										type="number"
										value={String(field.state.value ?? "")}
										required
										step="0.01"
										min="0.01"
										onChange={(e) =>
											field.handleChange(parseFloat(e.target.value) || 0)
										}
										data-test-id="sa-bud-amount"
									/>
								)}
							</form.Field>

							<label>Budget Category</label>
							<form.Field name="actionData.budgetName">
								{(field) => (
									<SelectBudget
										budget={String(field.state.value ?? (budgets[0] || ""))}
										handleChangeBudget={(val: string) =>
											field.handleChange(val)
										}
										disabled={false}
									/>
								)}
							</form.Field>

							<label>Currency</label>
							<form.Field name="actionData.currency">
								{(field) => (
									<Select
										className="currency-select"
										value={String(field.state.value ?? currencies[0])}
										required
										onChange={(e) => field.handleChange(e.target.value)}
										data-test-id="sa-bud-currency"
									>
										{currencies.map((c) => (
											<option key={c} value={c}>
												{c}
											</option>
										))}
									</Select>
								)}
							</form.Field>

							<label>Type</label>
							<form.Field name="actionData.type">
								{(field) => (
									<CreditDebit
										budget={String(field.state.value ?? "Credit")}
										handleChangeBudget={(val: string) =>
											field.handleChange(val as any)
										}
										disabled={false}
									/>
								)}
							</form.Field>
						</>
					)}

					<ButtonRow>
						<Button
							type="submit"
							data-test-id="sa-submit"
							disabled={
								!canSubmit ||
								isSubmitting ||
								createAction.isPending ||
								(actionType === "add_expense" && !paidByUserId)
							}
						>
							{createAction.isPending || isSubmitting
								? mode === "edit"
									? "Saving..."
									: "Creating..."
								: (submitLabel ?? (mode === "edit" ? "Save" : "Create"))}
						</Button>
					</ButtonRow>
				</FormContainer>
			</Card>
		</div>
	);
};

export default ScheduledActionsManager;
