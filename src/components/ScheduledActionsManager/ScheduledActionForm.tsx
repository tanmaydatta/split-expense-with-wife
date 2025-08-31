import React from "react";
import { Button } from "@/components/Button";
import { ButtonRow, FormContainer } from "@/components/Form/Layout";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import type { AuthenticatedUser } from "split-expense-shared-types";
import {
	ActionTypeField,
	FrequencyField,
	StartDateField,
	ExpenseFields,
	BudgetFields,
} from "./FormFields";

interface ScheduledActionFormProps {
	form: any;
	mode: "create" | "edit";
	error: string;
	success: string;
	setError: (error: string) => void;
	setSuccess: (success: string) => void;
	actionType: string;
	todayAsLocalISODate: string;
	users: AuthenticatedUser[];
	currencies: string[];
	splitTotal: number;
	canSubmit: boolean;
	isSubmitting: boolean;
	submitLabel?: string;
	createAction: any;
	paidByUserId: string;
}

export const ScheduledActionForm: React.FC<ScheduledActionFormProps> = ({
	form,
	mode,
	error,
	success,
	setError,
	setSuccess,
	actionType,
	todayAsLocalISODate,
	users,
	currencies,
	splitTotal,
	canSubmit,
	isSubmitting,
	submitLabel,
	createAction,
	paidByUserId,
}) => {
	return (
		<FormContainer
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
			data-test-id="scheduled-action-form"
		>
			{error && <ErrorContainer message={error} onClose={() => setError("")} />}
			{success && (
				<SuccessContainer message={success} onClose={() => setSuccess("")} />
			)}
			<ActionTypeField form={form} mode={mode} />
			<FrequencyField form={form} />
			<StartDateField
				form={form}
				mode={mode}
				todayAsLocalISODate={todayAsLocalISODate}
			/>

			{actionType === "add_expense" && (
				<ExpenseFields
					form={form}
					users={users}
					currencies={currencies}
					splitTotal={splitTotal}
				/>
			)}

			{actionType === "add_budget" && (
				<BudgetFields form={form} currencies={currencies} />
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
	);
};
