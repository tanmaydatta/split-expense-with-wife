import { useState, useEffect } from "react";
import type { GroupBudgetData, User } from "split-expense-shared-types";

interface SettingsState {
	success: string;
	groupName: string;
	defaultCurrency: string;
	userPercentages: Record<string, number>;
	budgets: GroupBudgetData[];
	newBudgetName: string;
	newBudgetDescription: string;
	groupNameDirty: boolean;
	currencyDirty: boolean;
	sharesDirty: boolean;
	budgetsDirty: boolean;
}

interface UseSettingsStateProps {
	groupDetailsData: any;
}

export function useSettingsState({ groupDetailsData }: UseSettingsStateProps) {
	const [state, setState] = useState<SettingsState>({
		success: "",
		groupName: "",
		defaultCurrency: "USD",
		userPercentages: {},
		budgets: [],
		newBudgetName: "",
		newBudgetDescription: "",
		groupNameDirty: false,
		currencyDirty: false,
		sharesDirty: false,
		budgetsDirty: false,
	});

	// Initialize form state when React Query data changes
	useEffect(() => {
		if (groupDetailsData) {
			const response = groupDetailsData;

			// Initialize form with current values
			const initialPercentages: Record<string, number> = {};
			response.users.forEach((user: User) => {
				const userIdStr = user.Id.toString();
				initialPercentages[userIdStr] =
					response.metadata.defaultShare[userIdStr] || 0;
			});

			setState((prev) => ({
				...prev,
				groupName: response.groupName,
				defaultCurrency: response.metadata.defaultCurrency,
				userPercentages: initialPercentages,
				budgets: [...response.budgets],
				// Reset dirty flags when fresh data loads
				groupNameDirty: false,
				currencyDirty: false,
				sharesDirty: false,
				budgetsDirty: false,
			}));
		}
	}, [groupDetailsData]);

	const clearMessages = () => {
		setState((prev) => ({ ...prev, success: "" }));
	};

	const updateGroupName = (groupName: string) => {
		setState((prev) => ({
			...prev,
			groupName,
			groupNameDirty: groupName.trim() !== groupDetailsData?.groupName,
		}));
	};

	const updateDefaultCurrency = (currency: string) => {
		setState((prev) => ({
			...prev,
			defaultCurrency: currency,
			currencyDirty: currency !== groupDetailsData?.metadata.defaultCurrency,
		}));
	};

	const updateUserPercentage = (userId: string, percentage: number) => {
		setState((prev) => {
			const newPercentages = { ...prev.userPercentages, [userId]: percentage };
			const originalPercentages = groupDetailsData?.metadata.defaultShare || {};
			const isDirty = Object.keys(newPercentages).some(
				(id) => newPercentages[id] !== (originalPercentages[id] || 0),
			);

			return {
				...prev,
				userPercentages: newPercentages,
				sharesDirty: isDirty,
			};
		});
	};

	const updateNewBudgetName = (name: string) => {
		setState((prev) => ({ ...prev, newBudgetName: name }));
	};

	const updateNewBudgetDescription = (description: string) => {
		setState((prev) => ({ ...prev, newBudgetDescription: description }));
	};

	const addBudget = () => {
		const trimmedName = state.newBudgetName.trim();
		const trimmedDescription = state.newBudgetDescription.trim();

		if (
			!trimmedName ||
			state.budgets.some(
				(b) => b.budgetName.toLowerCase() === trimmedName.toLowerCase(),
			)
		)
			return;

		const newBudget: GroupBudgetData = {
			id: `new_${Date.now()}`, // Temporary ID for new budgets
			budgetName: trimmedName,
			description: trimmedDescription || null,
		};

		setState((prev) => ({
			...prev,
			budgets: [...prev.budgets, newBudget],
			newBudgetName: "",
			newBudgetDescription: "",
			budgetsDirty: true,
		}));
	};

	const removeBudget = (budgetId: string) => {
		setState((prev) => ({
			...prev,
			budgets: prev.budgets.filter((budget) => budget.id !== budgetId),
			budgetsDirty: true,
		}));
	};

	const setSuccess = (message: string) => {
		setState((prev) => ({ ...prev, success: message }));
	};

	const resetDirtyFlags = () => {
		setState((prev) => ({
			...prev,
			groupNameDirty: false,
			currencyDirty: false,
			sharesDirty: false,
			budgetsDirty: false,
		}));
	};

	const totalPercentage = Object.values(state.userPercentages).reduce(
		(sum, pct) => sum + pct,
		0,
	);

	const hasChanges =
		state.groupNameDirty ||
		state.currencyDirty ||
		state.sharesDirty ||
		state.budgetsDirty;

	return {
		state,
		setState,
		clearMessages,
		updateGroupName,
		updateDefaultCurrency,
		updateUserPercentage,
		updateNewBudgetName,
		updateNewBudgetDescription,
		addBudget,
		removeBudget,
		setSuccess,
		resetDirtyFlags,
		totalPercentage,
		hasChanges,
	};
}
