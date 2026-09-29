import BackButton from "@/components/BackButton";
import ScheduledActionsManager from "@/components/ScheduledActionsManager";
import { UiPage, UiPageDescription, UiPageHeader, UiPageTitle } from "@/components/ui";
import {
	useScheduledActionDetails,
	useUpdateScheduledAction,
} from "@/hooks/useScheduledActions";
import { scrollToTop } from "@/utils/scroll";
import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";

const ScheduledActionEditPage: React.FC = () => {
	const navigate = useNavigate();
	const { id } = useParams<{ id: string }>();
	const { data: details, refetch } = useScheduledActionDetails(id);
	const update = useUpdateScheduledAction();

	const action = details as ScheduledAction | undefined;

	const initialValues = useMemo(() => {
		if (!action) return undefined;
		return {
			id: action.id,
			actionType: action.actionType,
			frequency: action.frequency,
			startDate: action.startDate,
			actionData: action.actionData as any,
		};
	}, [action]);

	return (
		<UiPage data-test-id="scheduled-actions-edit">
			<UiPageHeader>
				<div>
					<UiPageTitle>Edit Scheduled Action</UiPageTitle>
					<UiPageDescription>Update the details of this recurring action.</UiPageDescription>
				</div>
				<BackButton onClick={() => navigate(-1)} />
			</UiPageHeader>
			{initialValues && (
				<ScheduledActionsManager
					mode="edit"
					initialValues={initialValues}
					submitLabel="Save"
					onSubmit={async (val) => {
						await update.mutateAsync({
							id: initialValues.id!,
							frequency: val.frequency,
							actionData: val.actionData as any,
						} as any);
						await refetch();
						scrollToTop();
					}}
				/>
			)}
		</UiPage>
	);
};

export default ScheduledActionEditPage;
