import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Plus, Trash } from "@/components/Icons";
import {
    useDeleteScheduledAction,
    useScheduledActionsList,
} from "@/hooks/useScheduledActions";
import React from "react";
import { useNavigate } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";
import styled from "styled-components";

const HeaderTitle = styled.h3`
  margin: 0;
  font-size: 20px;
  line-height: 36px;
  @media (max-width: 768px) {
    visibility: hidden; /* reserve space to keep button right-aligned */
  }
`;

const StyledIconButton = styled(Button)`
  background: white;
  color: #1e40af;
  border: 1px solid #e5e7eb;
  padding: 8px 12px;
  min-height: 36px;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  @media (max-width: 768px) {
    padding: 6px 10px;
    min-height: 32px;
    font-size: 14px;
  }
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const ActionsGrid = styled.div`
  display: grid;
  gap: 12px;
`;

const CardRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
`;

const StatusDot = styled.span<{ $active: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: ${(p) => (p.$active ? "#16a34a" : "#dc2626")};
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.03);
  flex: 0 0 auto;
`;

const TitleText = styled.div`
  font-weight: 600;
  font-size: 16px;
`;

const Subtext = styled.div`
  font-size: 12px;
  color: #4b5563;
`;

const Separator = styled.span`
  margin: 0 6px;
  color: #9ca3af;
`;

const IconButton = styled.span`
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 12px;
`;

const ScheduledActionsPage: React.FC = () => {
    const navigate = useNavigate();
    const { data, isLoading, isError } = useScheduledActionsList();
    const deleteAction = useDeleteScheduledAction();

    const actions: ScheduledAction[] = (data as any)?.scheduledActions || [];

    return (
        <div className="settings-container" data-test-id="scheduled-actions-page">
            <PageHeader>
                <HeaderTitle>Scheduled Actions</HeaderTitle>
                <StyledIconButton onClick={() => navigate("/scheduled-actions/new")}>
                    <Plus size={14} color="#1e40af" />
                    Add Action
                </StyledIconButton>
            </PageHeader>

            {isLoading && (
                <Card className="settings-card">
                    <div>Loading...</div>
                </Card>
            )}
            {isError && (
                <Card className="settings-card">
                    <div>Failed to load scheduled actions</div>
                </Card>
            )}

            {!isLoading && !isError && actions.length === 0 && (
                <Card className="settings-card">
                    <div>No scheduled actions yet.</div>
                </Card>
            )}

            {!isLoading && !isError && actions.length > 0 && (
                <ActionsGrid>
                    {actions.map((sa) => (
                        <Card
                            key={sa.id}
                            className="settings-card"
                            data-test-id={`sa-item-${sa.id}`}
                        >
                            <CardRow>
                                <LeftSection
                                    onClick={() =>
                                        navigate(`/scheduled-actions/${sa.id}`, { state: sa })
                                    }
                                >
                                    <StatusDot
                                        $active={sa.isActive}
                                        aria-label={sa.isActive ? "Active" : "Inactive"}
                                        title={sa.isActive ? "Active" : "Inactive"}
                                    />
                                    <div>
                                        <TitleText>{sa.actionData.description}</TitleText>
                                        <Subtext>
                                            <span
                                                style={{
                                                    textTransform: "uppercase",
                                                    letterSpacing: 0.3 as unknown as number,
                                                }}
                                            >
                                                {sa.frequency}
                                            </span>
                                            <Separator>•</Separator>
                                            <span>
                                                {sa.actionType === "add_expense"
                                                    ? "Add Expense"
                                                    : "Add to Budget"}
                                            </span>
                                            <Separator>•</Separator>
                                            <span>Next: {sa.nextExecutionDate}</span>
                                        </Subtext>
                                    </div>
                                </LeftSection>
                                <IconButton
                                    onClick={() => {
                                        // Confirmation dialog before deleting
                                        // eslint-disable-next-line no-alert
                                        if (
                                            window.confirm(
                                                "Are you sure you want to delete this scheduled action?",
                                            )
                                        ) {
                                            deleteAction.mutate({ id: sa.id });
                                        }
                                    }}
                                    data-test-id={`sa-delete-${sa.id}`}
                                    aria-label="Delete"
                                    title="Delete"
                                >
                                    <Trash size={18} color="#dc2626" />
                                </IconButton>
                                <IconButton
                                    onClick={() => navigate(`/scheduled-actions/${sa.id}/edit`, { state: sa })}
                                    data-test-id={`sa-edit-${sa.id}`}
                                    aria-label="Edit"
                                    title="Edit"
                                >
                                    <span style={{ fontSize: 12, color: "#1e40af" }}>Edit</span>
                                </IconButton>
                            </CardRow>
                        </Card>
                    ))}
                </ActionsGrid>
            )}
        </div>
    );
};

export default ScheduledActionsPage;
