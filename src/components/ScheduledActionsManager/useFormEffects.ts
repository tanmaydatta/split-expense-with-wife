import React from "react";
import { useStore } from "@tanstack/react-form";
import { computeExpenseActionData, computeBudgetActionData } from "./helpers";
import {
	createDefaultShareGetter,
	createDefaultSplitsApplier,
	createDefaultPaidByApplier,
} from "./formHandlers";
import type { ReduxState } from "split-expense-shared-types";

interface UseFormEffectsProps {
	form: any;
	session: ReduxState["value"];
	defaultCurrency: string;
	defaultPayer: string;
	groupDefaultShare: Record<string, number>;
	budgets: string[];
	initialValues?: any;
}

export function useFormEffects({
	form,
	session,
	defaultCurrency,
	defaultPayer,
	groupDefaultShare,
	budgets,
	initialValues,
}: UseFormEffectsProps) {
	// Get reactive form values
	const actionType = useStore(form.store, (s: any) => s.values.actionType);
	const currentAmount = useStore(
		form.store,
		(s: any) => (s.values as any)?.actionData?.amount ?? 0,
	);
	const currentDescription = useStore(
		form.store,
		(s: any) => (s.values as any)?.actionData?.description ?? "",
	);
	const currentCurrency = useStore(
		form.store,
		(s: any) => (s.values as any)?.actionData?.currency ?? defaultCurrency,
	);
	const existingBudget = useStore(
		form.store,
		(s: any) => (s.values as any)?.actionData?.budgetId,
	);
	const existingType = useStore(
		form.store,
		(s: any) => (s.values as any)?.actionData?.type,
	);

	// Create helper functions
	const getDefaultShare = React.useCallback(
		() => createDefaultShareGetter(session)(),
		[session],
	);
	const applyDefaultSplitsIfMissing = React.useCallback(
		() => createDefaultSplitsApplier(form, getDefaultShare)(),
		[form, getDefaultShare],
	);
	const applyDefaultPaidByIfMissing = React.useCallback(
		() => createDefaultPaidByApplier(form, getDefaultShare, session)(),
		[form, getDefaultShare, session],
	);

	// Effect to initialize form defaults
	React.useEffect(() => {
		if (initialValues) return;
		form.setFieldValue("actionData.currency", defaultCurrency as any as any);
		applyDefaultSplitsIfMissing();
		applyDefaultPaidByIfMissing();
	}, [
		defaultCurrency,
		session,
		form,
		initialValues,
		applyDefaultSplitsIfMissing,
		applyDefaultPaidByIfMissing,
	]);

	// Effect to ensure actionData shape matches actionType
	React.useEffect(() => {
		if (actionType === "add_expense") {
			const currentPaid =
				(form.getFieldValue("actionData.paidByUserId") as string | undefined) ??
				defaultPayer;
			const splitsNow =
				(form.getFieldValue("actionData.splitPctShares") as
					| Record<string, number>
					| undefined) ?? groupDefaultShare;
			form.setFieldValue(
				"actionData",
				computeExpenseActionData(
					currentAmount,
					currentDescription,
					currentCurrency,
					currentPaid,
					splitsNow,
				),
			);
		} else if (actionType === "add_budget") {
			form.setFieldValue(
				"actionData",
				computeBudgetActionData(
					currentAmount,
					currentDescription,
					currentCurrency,
					(existingBudget as string) ?? (budgets[0] || ""),
					(existingType as any) ?? "Credit",
				),
			);
		}
	}, [
		actionType,
		currentAmount,
		currentDescription,
		currentCurrency,
		existingBudget,
		existingType,
		budgets,
		form,
		defaultPayer,
		groupDefaultShare,
	]);

	return {
		actionType,
		currentAmount,
		currentDescription,
		currentCurrency,
		existingBudget,
		existingType,
	};
}
