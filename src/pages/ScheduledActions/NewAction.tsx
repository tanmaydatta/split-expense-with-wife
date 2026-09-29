import BackButton from "@/components/BackButton";
import ScheduledActionsManager from "@/components/ScheduledActionsManager";
import { UiPage, UiPageDescription, UiPageHeader, UiPageTitle } from "@/components/ui";
import React from "react";
import { useNavigate } from "react-router-dom";

const NewActionPage: React.FC = () => {
	const navigate = useNavigate();
	return (
		<UiPage data-test-id="scheduled-actions-new">
			<UiPageHeader>
				<div>
					<UiPageTitle>Add Scheduled Action</UiPageTitle>
					<UiPageDescription>Choose what to add and when it should run.</UiPageDescription>
				</div>
				<BackButton onClick={() => navigate(-1)} />
			</UiPageHeader>
			<ScheduledActionsManager />
		</UiPage>
	);
};

export default NewActionPage;
