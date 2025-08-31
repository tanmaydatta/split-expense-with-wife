import React from "react";
import { Card } from "@/components/Card";
import { Input } from "@/components/Form/Input";

interface GroupInfoSectionProps {
	groupName: string;
	onGroupNameChange: (value: string) => void;
}

export const GroupInfoSection: React.FC<GroupInfoSectionProps> = ({
	groupName,
	onGroupNameChange,
}) => {
	return (
		<Card className="settings-card" data-test-id="group-info-section">
			<h3>Group Information</h3>
			<div className="form-group">
				<label htmlFor="groupName">Group Name</label>
				<Input
					id="groupName"
					type="text"
					value={groupName}
					onChange={(e) => onGroupNameChange(e.target.value)}
					placeholder="Enter group name"
					data-test-id="group-name-input"
				/>
			</div>
		</Card>
	);
};
