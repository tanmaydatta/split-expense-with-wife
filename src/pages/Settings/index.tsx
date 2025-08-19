import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Form/Input";
import { Select } from "@/components/Form/Select";
import { useGroupDetails, useUpdateGroupMetadata, useRefreshGroupDetails } from "@/hooks/useGroupDetails";
import { setData } from "@/redux/data";
import { store } from "@/redux/store";
import { scrollToTop } from "@/utils/scroll";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";

import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import type {
	GroupBudgetData,
	ReduxState,
	UpdateGroupMetadataRequest,
	User,
} from "split-expense-shared-types";
import "./index.css";

interface SettingsState {
	success: string;

	// Form fields
	groupName: string;
	defaultCurrency: string;
	userPercentages: Record<string, number>;
	budgets: GroupBudgetData[];
	newBudgetName: string;
	newBudgetDescription: string;

	// Dirty flags
	groupNameDirty: boolean;
	currencyDirty: boolean;
	sharesDirty: boolean;
	budgetsDirty: boolean;
}

const Settings: React.FC = () => {
	const data = useSelector((state: ReduxState) => state.value);
	// React Query hooks
	const groupDetailsQuery = useGroupDetails();
	const updateGroupMutation = useUpdateGroupMetadata();
	const refreshGroupDetails = useRefreshGroupDetails();

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
		if (groupDetailsQuery.data) {
			const response = groupDetailsQuery.data;
			
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
	}, [groupDetailsQuery.data]);

	const clearMessages = () => {
		setState((prev) => ({ ...prev, success: "" }));
	};

	const updateUserPercentage = (userId: string, percentage: number) => {
		setState((prev) => {
			const newPercentages = { ...prev.userPercentages, [userId]: percentage };
			const originalPercentages =
				groupDetailsQuery.data?.metadata.defaultShare || {};
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

	const saveAllChanges = async () => {
		setState((prev) => ({ ...prev, success: "" }));

		if (!groupDetailsQuery.data) {
			return;
		}

		try {
			const updateRequest: UpdateGroupMetadataRequest = {
				groupid: groupDetailsQuery.data.groupid,
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
			if (Object.keys(updateRequest).length <= 1) { // Only groupid
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
					updates.group.metadata.defaultCurrency = freshGroupDetails.metadata.defaultCurrency;
				}
				if (state.sharesDirty) {
					updates.group.metadata.defaultShare = freshGroupDetails.metadata.defaultShare;
				}
			}

			if (state.budgetsDirty) {
				updates.group.budgets = freshGroupDetails.budgets;
			}

			// Apply updates with fresh data
			updatedData = updateNestedData(updatedData, updates);
			store.dispatch(setData(updatedData));

			setState((prev) => ({
				...prev,
				success: "Settings saved successfully!",
				groupNameDirty: false,
				currencyDirty: false,
				sharesDirty: false,
				budgetsDirty: false,
			}));
		} catch (error: any) {
			// Error is handled by React Query, but we can show user-friendly message
			console.error("Failed to save settings:", error);
		} finally {
			// Scroll to top to show success or error message
			scrollToTop();
		}
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
	const isLoading = groupDetailsQuery.isLoading || updateGroupMutation.isPending;
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
					message={groupDetailsQuery.error.message || "Failed to load group details"} 
					onClose={() => groupDetailsQuery.refetch()} 
				/>
			)}

			{updateGroupMutation.error && (
				<ErrorContainer 
					message={updateGroupMutation.error.message || "Failed to save settings"} 
					onClose={updateGroupMutation.reset} 
				/>
			)}

			{state.success && (
				<SuccessContainer message={state.success} onClose={clearMessages} />
			)}

			{/* Group Info Card */}
			<Card className="settings-card" data-test-id="group-info-section">
				<h3>Group Information</h3>
				<div className="form-group">
					<label htmlFor="groupName">Group Name</label>
					<Input
						id="groupName"
						type="text"
						value={state.groupName}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								groupName: e.target.value,
								groupNameDirty:
									e.target.value.trim() !== groupDetailsQuery.data?.groupName,
							}))
						}
						placeholder="Enter group name"
						data-test-id="group-name-input"
					/>
				</div>
			</Card>

			{/* Default Currency Card */}
			<Card className="settings-card" data-test-id="currency-section">
				<h3>Default Currency</h3>
				<div className="form-group">
					<label htmlFor="defaultCurrency">Currency</label>
					<Select
						id="defaultCurrency"
						value={state.defaultCurrency}
						onChange={(e) =>
							setState((prev) => ({
								...prev,
								defaultCurrency: e.target.value,
								currencyDirty:
									e.target.value !==
									groupDetailsQuery.data?.metadata.defaultCurrency,
							}))
						}
						className="currency-select"
						name="defaultCurrency"
						data-test-id="currency-select"
						disabled={isLoading}
						required
						title="Please select a currency"
					>
						{(data?.extra?.currencies || ["USD"]).map((currency: string) => (
							<option key={currency} value={currency}>
								{currency}
							</option>
						))}
					</Select>
				</div>
			</Card>

			{/* Default Shares Card */}
			<Card className="settings-card" data-test-id="shares-section">
				<h3>Default Share Percentages</h3>
				<div className="shares-form">
					{groupDetailsQuery.data?.users.map((user: User) => (
						<div key={user.Id} className="form-group">
							<label htmlFor={`user-${user.Id}`}>
								{user.FirstName}
								{user.LastName ? ` ${user.LastName}` : ""}
							</label>
							<div
								className="percentage-input-wrapper"
								data-test-id={`percentage-wrapper-${user.Id}`}
							>
								<Input
									id={`user-${user.Id}`}
									type="number"
									min="0"
									max="100"
									step="0.01"
									value={
										state.userPercentages[user.Id.toString()]?.toString() || "0"
									}
									onChange={(e) =>
										updateUserPercentage(
											user.Id.toString(),
											parseFloat(e.target.value) || 0,
										)
									}
									className="percentage-input"
									data-test-id={`user-${user.Id}-percentage`}
								/>
								<span
									className="percentage-symbol"
									data-test-id="percentage-symbol"
								>
									%
								</span>
							</div>
						</div>
					))}
					<div
						className={`total-percentage ${Math.abs(totalPercentage - 100) > 0.001 ? "invalid" : "valid"}`}
						data-test-id="total-percentage"
					>
						Total: {totalPercentage.toFixed(2)}%
					</div>
				</div>
			</Card>

			{/* Budget Categories Card */}
			<Card className="settings-card" data-test-id="budgets-section">
				<h3>Budget Categories</h3>
				<div className="budget-manager">
					<div className="budget-list">
						{state.budgets.map((budget, index) => (
							<div key={budget.id} className="budget-item">
								<div className="budget-info">
									<span className="budget-name">{budget.budgetName}</span>
									{budget.description && (
										<span className="budget-description">
											{budget.description}
										</span>
									)}
								</div>
								<Button
									onClick={() => removeBudget(budget.id)}
									className="remove-button"
									data-test-id={`remove-budget-${index}`}
								>
									Remove
								</Button>
							</div>
						))}
					</div>

					<div className="add-budget">
						<div className="form-group">
							<label htmlFor="newBudgetName">Budget Name</label>
							<Input
								id="newBudgetName"
								type="text"
								value={state.newBudgetName}
								onChange={(e) =>
									setState((prev) => ({
										...prev,
										newBudgetName: e.target.value,
									}))
								}
								placeholder="Enter budget name"
								onKeyPress={(e) => e.key === "Enter" && addBudget()}
								data-test-id="new-budget-input"
							/>
						</div>
						<div className="form-group">
							<label htmlFor="newBudgetDescription">
								Description (optional)
							</label>
							<Input
								id="newBudgetDescription"
								type="text"
								value={state.newBudgetDescription}
								onChange={(e) =>
									setState((prev) => ({
										...prev,
										newBudgetDescription: e.target.value,
									}))
								}
								placeholder="Enter budget description"
								onKeyPress={(e) => e.key === "Enter" && addBudget()}
								data-test-id="new-budget-description-input"
							/>
						</div>
						<Button
							onClick={addBudget}
							disabled={!state.newBudgetName.trim()}
							data-test-id="add-budget-button"
						>
							Add Budget
						</Button>
					</div>
				</div>
			</Card>

			{/* Single Submit Button */}
			<div className="settings-actions" data-test-id="settings-actions">
				<Button
					onClick={saveAllChanges}
					disabled={!canSave}
					className="save-all-button"
					data-test-id="save-all-button"
				>
					{isLoading ? (
						<Loader data-test-id="loading-indicator" />
					) : (
						"Save All Changes"
					)}
				</Button>
				{!hasChanges && (
					<p className="no-changes" data-test-id="no-changes-message">
						No changes to save
					</p>
				)}
				{hasChanges && Math.abs(totalPercentage - 100) > 0.001 && (
					<p className="validation-error" data-test-id="validation-error">
						Percentages must total 100%
					</p>
				)}
			</div>
		</div>
	);
};

export default Settings;
