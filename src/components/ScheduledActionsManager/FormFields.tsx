import { Input } from "@/components/Form/Input";
import { Select } from "@/components/Form/Select";
import {
	SplitPercentageContainer,
	SplitPercentageInputContainer,
} from "@/components/Form/Layout";
import {
	ToggleButton,
	ToggleButtonGroup,
} from "@/components/ToggleButtonGroup";
import { CreditDebit } from "@/pages/Dashboard/CreditDebit";
import { SelectBudget } from "@/SelectBudget";
import type { AuthenticatedUser } from "split-expense-shared-types";

interface FormFieldsProps {
	form: any;
	mode: "create" | "edit";
	actionType: string;
	users: AuthenticatedUser[];
	currencies: string[];
	budgets: string[];
	splitTotal: number;
	todayAsLocalISODate: string;
}

export function ActionTypeField({
	form,
	mode,
}: Pick<FormFieldsProps, "form" | "mode">) {
	return (
		<>
			<label>Action</label>
			<form.Field name="actionType">
				{(field: any) => (
					<ToggleButtonGroup
						name="scheduled-action-type"
						value={String(field.state.value ?? "add_expense")}
						onChange={(val: string) => {
							if (mode === "edit") return;
							field.handleChange(val as any);
						}}
						data-test-id="sa-action-type-toggle"
						style={{ width: "100%", marginBottom: 8 }}
						disabled={mode === "edit"}
					>
						<ToggleButton value="add_expense" data-test-id="sa-action-expense">
							Add Expense
						</ToggleButton>
						<ToggleButton value="add_budget" data-test-id="sa-action-budget">
							Add to Budget
						</ToggleButton>
					</ToggleButtonGroup>
				)}
			</form.Field>
		</>
	);
}

export function FrequencyField({ form }: Pick<FormFieldsProps, "form">) {
	return (
		<>
			<label>Frequency</label>
			<form.Field name="frequency">
				{(field: any) => (
					<ToggleButtonGroup
						name="scheduled-action-frequency"
						value={String(field.state.value ?? "daily")}
						onChange={(val: string) => field.handleChange(val as any)}
						data-test-id="sa-frequency-toggle"
						style={{ width: "100%", marginBottom: 8 }}
					>
						<ToggleButton value="daily" data-test-id="sa-frequency-daily">
							Daily
						</ToggleButton>
						<ToggleButton value="weekly" data-test-id="sa-frequency-weekly">
							Weekly
						</ToggleButton>
						<ToggleButton value="monthly" data-test-id="sa-frequency-monthly">
							Monthly
						</ToggleButton>
					</ToggleButtonGroup>
				)}
			</form.Field>
		</>
	);
}

export function StartDateField({
	form,
	mode,
	todayAsLocalISODate,
}: Pick<FormFieldsProps, "form" | "mode" | "todayAsLocalISODate">) {
	return (
		<>
			<label>Start Date</label>
			<form.Field name="startDate">
				{(field: any) => (
					<Input
						type="date"
						value={String(field.state.value ?? "")}
						min={todayAsLocalISODate}
						required
						disabled={mode === "edit"}
						onChange={(e) => {
							if (mode === "edit") return;
							const val = e.target.value;
							const clamped =
								val && val < todayAsLocalISODate ? todayAsLocalISODate : val;
							field.handleChange(clamped);
						}}
						data-test-id="sa-start-date"
						style={
							mode === "edit" ? { opacity: 0.6, cursor: "not-allowed" } : {}
						}
					/>
				)}
			</form.Field>
		</>
	);
}

export function ExpenseFields({
	form,
	users,
	currencies,
	splitTotal,
}: Pick<FormFieldsProps, "form" | "users" | "currencies" | "splitTotal">) {
	return (
		<>
			<label>Description</label>
			<form.Field name="actionData.description">
				{(field: any) => (
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
				{(field: any) => (
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
				{(field: any) => (
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
				{(field: any) => (
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
				{users.map((u) => (
					<SplitPercentageInputContainer key={u.id}>
						<label>{u.firstName}</label>
						<form.Field name={`actionData.splitPctShares.${u.id}`}>
							{(field: any) => (
								<Input
									type="number"
									min="0"
									max="100"
									step="0.01"
									value={String(field.state.value ?? 0)}
									required
									onChange={(e) =>
										field.handleChange(parseFloat(e.target.value) || 0)
									}
									data-test-id={`sa-exp-split-${u.id}`}
								/>
							)}
						</form.Field>
					</SplitPercentageInputContainer>
				))}
				<div style={{ fontWeight: 600 }}>Total: {splitTotal.toFixed(2)}%</div>
			</SplitPercentageContainer>
		</>
	);
}

export function BudgetFields({
	form,
	currencies,
}: Pick<FormFieldsProps, "form" | "currencies">) {
	return (
		<>
			<label>Description</label>
			<form.Field name="actionData.description">
				{(field: any) => (
					<Input
						type="text"
						value={String(field.state.value ?? "")}
						required
						minLength={2}
						maxLength={100}
						onChange={(e) => field.handleChange(e.target.value)}
						data-test-id="sa-budget-description"
					/>
				)}
			</form.Field>

			<label>Amount</label>
			<form.Field name="actionData.amount">
				{(field: any) => (
					<Input
						type="number"
						value={String(field.state.value ?? "")}
						required
						step="0.01"
						min="0.01"
						onChange={(e) =>
							field.handleChange(parseFloat(e.target.value) || 0)
						}
						data-test-id="sa-budget-amount"
					/>
				)}
			</form.Field>

			<label>Currency</label>
			<form.Field name="actionData.currency">
				{(field: any) => (
					<Select
						className="currency-select"
						value={String(field.state.value ?? currencies[0])}
						required
						onChange={(e) => field.handleChange(e.target.value)}
						data-test-id="sa-budget-currency"
					>
						{currencies.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</Select>
				)}
			</form.Field>

			<form.Field name="actionData.type">
				{(field: any) => (
					<CreditDebit
						budget={field.state.value || "Credit"}
						handleChangeBudget={(value: string) => field.handleChange(value)}
						data-test-id="sa-budget-type"
					/>
				)}
			</form.Field>

			<form.Field name="actionData.budgetId">
				{(field: any) => (
					<SelectBudget
						budgetId={field.state.value || ""}
						handleChangeBudget={(value: string) => field.handleChange(value)}
						data-test-id="sa-budget-select"
					/>
				)}
			</form.Field>
		</>
	);
}
