import BackButton from "@/components/BackButton";
import ScheduledActionsHistory from "@/components/ScheduledActionsHistory";
import { UiPage, UiPageDescription, UiPageHeader, UiPageTitle } from "@/components/ui";
import { useScheduledActionDetails } from "@/hooks/useScheduledActions";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";

const ActionHistoryPage: React.FC = () => {
	const navigate = useNavigate();
	const { id } = useParams<{ id: string }>();
	const { data: details } = useScheduledActionDetails(id);
	const action = details as ScheduledAction | undefined;
	return (
		<UiPage data-test-id="scheduled-actions-history">
			<UiPageHeader>
				<div>
					<UiPageTitle>Action History</UiPageTitle>
					<UiPageDescription>{action?.actionData.description || "Review upcoming and completed runs."}</UiPageDescription>
				</div>
				<BackButton onClick={() => navigate(-1)} />
			</UiPageHeader>
			<ScheduledActionsHistory scheduledActionId={id} />
		</UiPage>
	);
};

export default ActionHistoryPage;
