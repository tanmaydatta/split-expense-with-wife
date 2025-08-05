import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { typedApi } from "@/utils/api";
import { setData } from "@/redux/data";
import { store } from "@/redux/store";
import { scrollToTop } from "@/utils/scroll";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";
import { Select } from "@/components/Form/Select";

import { Loader } from "@/components/Loader";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import type {
	GroupDetailsResponse,
	ReduxState,
	UpdateGroupMetadataRequest,
	User,
} from "@shared-types";
import "./index.css";

interface SettingsState {
	loading: boolean;
	error: string;
	success: string;
	groupDetails: GroupDetailsResponse | null;

	// Form fields
	groupName: string;
	defaultCurrency: string;
	userPercentages: Record<string, number>;
	budgets: string[];
	newBudgetName: string;

	// Dirty flags
	groupNameDirty: boolean;
	currencyDirty: boolean;
	sharesDirty: boolean;
	budgetsDirty: boolean;
}

const Settings: React.FC = () => {
	const data = useSelector((state: ReduxState) => state.value);
	const [state, setState] = useState<SettingsState>({
		loading: false,
		error: "",
		success: "",
		groupDetails: null,
		groupName: "",
		defaultCurrency: "USD",
		userPercentages: {},
		budgets: [],
		newBudgetName: "",
		groupNameDirty: false,
		currencyDirty: false,
		sharesDirty: false,
		budgetsDirty: false,
	});

	// Load group details on mount
	useEffect(() => {
		const fetchGroupDetails = async () => {
			setState((prev) => ({ ...prev, loading: true, error: "" }));

			try {
				const response: GroupDetailsResponse =
					await typedApi.get("/group/details");

				// Initialize form with current values
				const initialPercentages: Record<string, number> = {};
				response.users.forEach((user: User) => {
					const userIdStr = user.Id.toString();
					initialPercentages[userIdStr] =
						response.metadata.defaultShare[userIdStr] || 0;
				});

				setState((prev) => ({
					...prev,
					loading: false,
					groupDetails: response,
					groupName: response.groupName,
					defaultCurrency: response.metadata.defaultCurrency,
					userPercentages: initialPercentages,
					budgets: [...response.budgets],
				}));
			} catch (error: any) {
				setState((prev) => ({
					...prev,
					loading: false,
					error: error.message || "Failed to load group details",
				}));
			}
		};

		fetchGroupDetails();
	}, []);

	const clearMessages = () => {
		setState((prev) => ({ ...prev, error: "", success: "" }));
	};

	const updateUserPercentage = (userId: string, percentage: number) => {
		setState((prev) => {
			const newPercentages = { ...prev.userPercentages, [userId]: percentage };
			const originalPercentages =
				prev.groupDetails?.metadata.defaultShare || {};
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
		if (!trimmedName || state.budgets.includes(trimmedName)) return;

		setState((prev) => ({
			...prev,
			budgets: [...prev.budgets, trimmedName],
			newBudgetName: "",
			budgetsDirty: true,
		}));
	};

	const removeBudget = (budgetToRemove: string) => {
		setState((prev) => ({
			...prev,
			budgets: prev.budgets.filter((budget) => budget !== budgetToRemove),
			budgetsDirty: true,
		}));
	};

	const saveAllChanges = async () => {
		setState((prev) => ({ ...prev, loading: true, error: "", success: "" }));

		try {
			const updateRequest: UpdateGroupMetadataRequest = {
				groupid: state.groupDetails!.groupid,
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
			if (Object.keys(updateRequest).length === 0) {
				setState((prev) => ({
					...prev,
					loading: false,
					error: "No changes to save",
				}));
				return;
			}

			await typedApi.post("/group/metadata", updateRequest);

			// Update Redux store with new data
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

			// Prepare updates object
			const updates: any = { group: {} };

			if (state.currencyDirty || state.sharesDirty) {
				updates.group.metadata = {};
				if (state.currencyDirty) {
					updates.group.metadata.defaultCurrency = state.defaultCurrency;
				}
				if (state.sharesDirty) {
					updates.group.metadata.defaultShare = state.userPercentages;
				}
			}

			if (state.budgetsDirty) {
				updates.group.budgets = state.budgets;
			}

			// Apply updates
			updatedData = updateNestedData(updatedData, updates);
			console.log("updatedData", updatedData);
			store.dispatch(setData(updatedData));

			setState((prev) => ({
				...prev,
				loading: false,
				success: "Settings saved successfully!",
				groupNameDirty: false,
				currencyDirty: false,
				sharesDirty: false,
				budgetsDirty: false,
				groupDetails: prev.groupDetails
					? {
							...prev.groupDetails,
							groupName: state.groupName.trim(),
							metadata: {
								...prev.groupDetails.metadata,
								defaultCurrency: state.defaultCurrency,
								defaultShare: state.userPercentages,
								budgets: state.budgets,
							},
						}
					: null,
			}));
		} catch (error: any) {
			setState((prev) => ({
				...prev,
				loading: false,
				error: error.message || "Failed to save settings",
			}));
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
	const canSave =
		hasChanges && !state.loading && Math.abs(totalPercentage - 100) <= 0.001;

	if (state.loading && !state.groupDetails) {
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
			{state.error && (
				<ErrorContainer message={state.error} onClose={clearMessages} />
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
									e.target.value.trim() !== state.groupDetails?.groupName,
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
									state.groupDetails?.metadata.defaultCurrency,
							}))
						}
						className="currency-select"
						name="defaultCurrency"
						data-test-id="currency-select"
						disabled={state.loading}
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
					{state.groupDetails?.users.map((user: User) => (
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
							<div key={budget} className="budget-item">
								<span>{budget}</span>
								<Button
									onClick={() => removeBudget(budget)}
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
							<Input
								type="text"
								value={state.newBudgetName}
								onChange={(e) =>
									setState((prev) => ({
										...prev,
										newBudgetName: e.target.value,
									}))
								}
								placeholder="Enter new budget category"
								onKeyPress={(e) => e.key === "Enter" && addBudget()}
								data-test-id="new-budget-input"
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
					{state.loading ? (
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
