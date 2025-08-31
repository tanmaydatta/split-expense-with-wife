import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import {
	useGroupDetails,
	useUpdateGroupMetadata,
	useRefreshGroupDetails,
} from "@/hooks/useGroupDetails";
import React from "react";
import { useSelector } from "react-redux";
import type { ReduxState } from "split-expense-shared-types";
import { GroupInfoSection } from "./GroupInfoSection";
import { CurrencySection } from "./CurrencySection";
import { SharesSection } from "./SharesSection";
import { BudgetsSection } from "./BudgetsSection";
import { SettingsActions } from "./SettingsActions";
import { useSettingsState } from "./useSettingsState";
import { useSaveHandler } from "./useSaveHandler";
import "./index.css";

const Settings: React.FC = () => {
	const data = useSelector((state: ReduxState) => state.value);
	// React Query hooks
	const groupDetailsQuery = useGroupDetails();
	const updateGroupMutation = useUpdateGroupMetadata();
	const refreshGroupDetails = useRefreshGroupDetails();

	// Custom hooks for state and save handler
	const {
		state,
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
	} = useSettingsState({ groupDetailsData: groupDetailsQuery.data });

	const { saveAllChanges } = useSaveHandler({
		groupDetailsData: groupDetailsQuery.data,
		data,
		state,
		updateGroupMutation,
		refreshGroupDetails,
		setSuccess,
		resetDirtyFlags,
	});

	const isLoading =
		groupDetailsQuery.isLoading || updateGroupMutation.isPending;
	const canSave =
		hasChanges && !isLoading && Math.abs(totalPercentage - 100) <= 0.001;

	if (groupDetailsQuery.isLoading) {
		return (
			<div className="settings-container">
				<div
					style={{ display: "flex", justifyContent: "center", padding: "2rem" }}
				>
					<Loader />
				</div>
			</div>
		);
	}

	return (
		<div className="settings-container" data-test-id="settings-container">
			{groupDetailsQuery.error && (
				<ErrorContainer
					message={
						groupDetailsQuery.error.message || "Failed to load group details"
					}
					onClose={() => groupDetailsQuery.refetch()}
				/>
			)}

			{updateGroupMutation.error && (
				<ErrorContainer
					message={
						updateGroupMutation.error.message || "Failed to save settings"
					}
					onClose={updateGroupMutation.reset}
				/>
			)}

			{state.success && (
				<SuccessContainer message={state.success} onClose={clearMessages} />
			)}

			<GroupInfoSection
				groupName={state.groupName}
				onGroupNameChange={updateGroupName}
			/>

			<CurrencySection
				defaultCurrency={state.defaultCurrency}
				onCurrencyChange={updateDefaultCurrency}
				availableCurrencies={data?.extra?.currencies || ["USD"]}
				isLoading={isLoading}
			/>

			<SharesSection
				users={groupDetailsQuery.data?.users || []}
				userPercentages={state.userPercentages}
				onUpdateUserPercentage={updateUserPercentage}
				totalPercentage={totalPercentage}
			/>

			<BudgetsSection
				budgets={state.budgets}
				newBudgetName={state.newBudgetName}
				newBudgetDescription={state.newBudgetDescription}
				onNewBudgetNameChange={updateNewBudgetName}
				onNewBudgetDescriptionChange={updateNewBudgetDescription}
				onAddBudget={addBudget}
				onRemoveBudget={removeBudget}
			/>

			<SettingsActions
				canSave={canSave}
				isLoading={isLoading}
				hasChanges={hasChanges}
				totalPercentage={totalPercentage}
				onSaveAllChanges={saveAllChanges}
			/>
		</div>
	);
};

export default Settings;
