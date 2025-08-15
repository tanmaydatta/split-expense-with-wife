import { Button } from "@/components/Button";
import { ArrowLeft } from "@/components/Icons";
import ScheduledActionsManager from "@/components/ScheduledActionsManager";
import {
	useScheduledActionDetails,
	useUpdateScheduledAction,
} from "@/hooks/useScheduledActions";
import { scrollToTop } from "@/utils/scroll";
import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";
import styled from "styled-components";

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
`;
const BackButton = styled(Button)`
  background: white;
  color: #1e40af;
  border: 1px solid #e5e7eb;
  padding: 6px 10px;
  min-height: 32px;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;
const Title = styled.h3`
  margin: 0;
`;

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
		<div className="settings-container" data-test-id="scheduled-actions-edit">
			<Header>
				<BackButton onClick={() => navigate(-1)}>
					<ArrowLeft size={14} color="#1e40af" />
					Back
				</BackButton>
				<Title>Edit Scheduled Action</Title>
			</Header>
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
		</div>
	);
};

export default ScheduledActionEditPage;
