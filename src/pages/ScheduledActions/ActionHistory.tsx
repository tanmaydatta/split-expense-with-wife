import { Button } from "@/components/Button";
import { ArrowLeft } from "@/components/Icons";
import ScheduledActionsHistory from "@/components/ScheduledActionsHistory";
import { useScheduledActionDetails } from "@/hooks/useScheduledActions";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";
import styled from "styled-components";

const ActionHistoryPage: React.FC = () => {
	const navigate = useNavigate();
	const { id } = useParams<{ id: string }>();
	const { data: details } = useScheduledActionDetails(id);
	const action = details as ScheduledAction | undefined;
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
  const Description = styled.div`
    margin-bottom: 16px;
    font-weight: 600;
    font-size: 18px;
    color: #111827;
  `;

  return (
    <div className="settings-container" data-test-id="scheduled-actions-history">
      <Header>
        <BackButton onClick={() => navigate(-1)}>
          <ArrowLeft size={14} color="#1e40af" />
          Back
        </BackButton>
        <Title>Action History</Title>
      </Header>
      {action && <Description>{action.actionData.description}</Description>}
      <ScheduledActionsHistory scheduledActionId={id} />
    </div>
  );
};

export default ActionHistoryPage;
