import { Input } from "@/components/Form/Input";
import { Select } from "@/components/Form/Select";
import {
	SplitPercentageContainer,
	SplitPercentageInputContainer,
} from "@/components/Form/Layout";
import { SelectBudget } from "@/SelectBudget";
import { CreditDebit } from "./CreditDebit";
import type { DashboardUser } from "split-expense-shared-types";

interface FormFieldsProps {
	form: any;
	loading: boolean;
	addExpense: boolean;
	updateBudget: boolean;
	users: DashboardUser[];
	usersState: DashboardUser[];
	updateUserPercentage: (userId: string, percentage: number) => void;
}

export function DescriptionField({
	form,
	loading,
}: Pick<FormFieldsProps, "form" | "loading">) {
	return (
		<>
			<label>Description</label>
			<form.Field name="description">
				{(field: any) => (
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
		</>
	);
}

export function AmountField({
	form,
	loading,
}: Pick<FormFieldsProps, "form" | "loading">) {
	return (
		<>
			<label>Amount</label>
			<form.Field name="amount">
				{(field: any) => (
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
		</>
	);
}

export function SplitPercentageFields({
	users,
	updateUserPercentage,
	loading,
	addExpense,
}: Pick<
	FormFieldsProps,
	"users" | "updateUserPercentage" | "loading" | "addExpense"
>) {
	if (!addExpense) return null;

	return (
		<SplitPercentageContainer>
			{users.map((u: DashboardUser) => (
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
	);
}

export function CurrencyField({
	form,
	loading,
}: Pick<FormFieldsProps, "form" | "loading">) {
	return (
		<>
			<label>Currency</label>
			<form.Field name="currency">
				{(field: any) => (
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
		</>
	);
}

export function PaidByField({
	form,
	loading,
	addExpense,
	usersState,
}: Pick<FormFieldsProps, "form" | "loading" | "addExpense" | "usersState">) {
	if (!addExpense) return null;

	return (
		<>
			<label>Paid By</label>
			<form.Field name="paidBy">
				{(field: any) => (
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
	);
}

export function BudgetFields({
	form,
	loading,
	updateBudget,
}: Pick<FormFieldsProps, "form" | "loading" | "updateBudget">) {
	if (!updateBudget) return null;

	return (
		<>
			<form.Field name="creditDebit">
				{(field: any) => (
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
				{(field: any) => (
					<SelectBudget
						budgetId={field.state.value || ""}
						handleChangeBudget={(value: string) => field.handleChange(value)}
						disabled={loading}
					/>
				)}
			</form.Field>
		</>
	);
}

export function ActionSelection({
	form,
	loading,
}: Pick<FormFieldsProps, "form" | "loading">) {
	return (
		<div className="action-selection">
			<label>Actions to perform:</label>
			<div className="checkbox-group">
				<label className="checkbox-label">
					<form.Field name="addExpense">
						{(field: any) => (
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
						{(field: any) => (
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
	);
}
