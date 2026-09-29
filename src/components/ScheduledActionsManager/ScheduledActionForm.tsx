import React from "react";
import { UiButton } from "@/components/ui";
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
import styled from "styled-components";

const StyledForm = styled(FormContainer)`
  max-width: 680px;
  label { color: var(--ui-text); }
  input:not([type="checkbox"]), select {
    border-color: var(--ui-border-strong);
    border-radius: var(--ui-radius-sm);
  }
  input:focus-visible, select:focus-visible {
    outline: 3px solid var(--ui-focus);
    outline-offset: 2px;
  }
`;

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
		<StyledForm
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
				<UiButton
					type="submit"
					$tone="primary"
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
				</UiButton>
			</ButtonRow>
		</StyledForm>
	);
};
