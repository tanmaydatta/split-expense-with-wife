import React from "react";
import { Button } from "@/components/Button";
import { Loader } from "@/components/Loader";

interface SettingsActionsProps {
	canSave: boolean;
	isLoading: boolean;
	hasChanges: boolean;
	totalPercentage: number;
	onSaveAllChanges: () => void;
}

export const SettingsActions: React.FC<SettingsActionsProps> = ({
	canSave,
	isLoading,
	hasChanges,
	totalPercentage,
	onSaveAllChanges,
}) => {
	return (
		<div className="settings-actions" data-test-id="settings-actions">
			<Button
				onClick={onSaveAllChanges}
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
	);
};
