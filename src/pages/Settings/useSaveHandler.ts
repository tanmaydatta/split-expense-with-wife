import { setData } from "@/redux/data";
import { store } from "@/redux/store";
import { scrollToTop } from "@/utils/scroll";
import type { UpdateGroupMetadataRequest } from "split-expense-shared-types";

interface UseSaveHandlerProps {
	groupDetailsData: any;
	data: any;
	state: any;
	updateGroupMutation: any;
	refreshGroupDetails: any;
	setSuccess: (message: string) => void;
	resetDirtyFlags: () => void;
}

export function useSaveHandler({
	groupDetailsData,
	data,
	state,
	updateGroupMutation,
	refreshGroupDetails,
	setSuccess,
	resetDirtyFlags,
}: UseSaveHandlerProps) {
	const saveAllChanges = async () => {
		if (!groupDetailsData) {
			return;
		}

		try {
			const updateRequest: UpdateGroupMetadataRequest = {
				groupid: groupDetailsData.groupid,
			};

			// Add changes to the request
			if (state.groupNameDirty) {
				updateRequest.groupName = state.groupName.trim();
			}

			if (state.currencyDirty) {
				updateRequest.defaultCurrency = state.defaultCurrency;
			}

			if (state.sharesDirty) {
				updateRequest.defaultShare = state.userPercentages;
			}

			if (state.budgetsDirty) {
				updateRequest.budgets = state.budgets;
			}

			// Only make API call if there are changes
			if (Object.keys(updateRequest).length <= 1) {
				// Only groupid
				return;
			}

			// Update via React Query mutation
			await updateGroupMutation.mutateAsync(updateRequest);

			// Force refresh to get fresh data from backend bypassing session cache
			const freshGroupDetails = await refreshGroupDetails();

			// Update Redux store with fresh data (preserve existing pattern)
			let updatedData = { ...data };

			// Helper function to safely update nested properties
			const updateNestedData = (data: any, updates: any) => {
				return {
					...data,
					extra: {
						...data.extra,
						group: {
							...data.extra?.group,
							...updates.group,
							metadata: {
								...data.extra?.group?.metadata,
								...updates.group?.metadata,
							},
						},
					},
				};
			};

			// Prepare updates object with fresh data
			const updates: any = { group: {} };

			if (state.currencyDirty || state.sharesDirty) {
				updates.group.metadata = {};
				if (state.currencyDirty) {
					updates.group.metadata.defaultCurrency =
						freshGroupDetails.metadata.defaultCurrency;
				}
				if (state.sharesDirty) {
					updates.group.metadata.defaultShare =
						freshGroupDetails.metadata.defaultShare;
				}
			}

			if (state.budgetsDirty) {
				updates.group.budgets = freshGroupDetails.budgets;
			}

			// Apply updates with fresh data
			updatedData = updateNestedData(updatedData, updates);
			store.dispatch(setData(updatedData));

			setSuccess("Settings saved successfully!");
			resetDirtyFlags();
		} catch (error: any) {
			// Error is handled by React Query, but we can show user-friendly message
			console.error("Failed to save settings:", error);
		} finally {
			// Scroll to top to show success or error message
			scrollToTop();
		}
	};

	return { saveAllChanges };
}
