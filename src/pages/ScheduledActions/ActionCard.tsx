import React from "react";
import { Card } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Pause, Pencil, Play, Trash } from "@/components/Icons";
import { useNavigate } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";
import styled, { useTheme } from "styled-components";

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
  background-color: ${(p) => (p.$active ? p.theme.colors.success : p.theme.colors.danger)};
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.03);
  flex: 0 0 auto;
`;

const TitleText = styled.div`
  font-weight: 600;
  font-size: 16px;
`;

const Subtext = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.secondary};
`;

const Separator = styled.span`
  margin: 0 6px;
  color: ${({ theme }) => theme.colors.secondary};
`;

const RightActions = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 12px;
`;

const IconButton = styled.span`
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 12px;
`;

interface ActionCardProps {
	sa: ScheduledAction;
	busyId: string | null;
	setBusyId: (id: string | null) => void;
	updateAction: any;
	requestDelete: (id: string) => void;
	confirmOpen: boolean;
	pendingDeleteId: string | null;
	confirmDelete: () => void;
	closeConfirm: () => void;
}

export const ActionCard: React.FC<ActionCardProps> = ({
	sa,
	busyId,
	setBusyId,
	updateAction,
	requestDelete,
	confirmOpen,
	pendingDeleteId,
	confirmDelete,
	closeConfirm,
}) => {
	const navigate = useNavigate();
	const theme = useTheme();

	const handleToggleActive = async () => {
		if (busyId) return;
		setBusyId(sa.id);
		try {
			await updateAction.mutateAsync({
				id: sa.id,
				isActive: !sa.isActive,
			});
		} finally {
			setBusyId(null);
		}
	};

	return (
		<Card
			key={sa.id}
			className="settings-card"
			data-test-id={`sa-item-${sa.id}`}
			style={
				busyId === sa.id ? { opacity: 0.6, pointerEvents: "none" } : undefined
			}
		>
			<CardRow>
				<LeftSection
					onClick={() => navigate(`/scheduled-actions/${sa.id}`, { state: sa })}
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
				<RightActions>
					<IconButton
						onClick={handleToggleActive}
						data-test-id={`sa-toggle-${sa.id}`}
						aria-label={sa.isActive ? "Deactivate action" : "Activate action"}
						title={sa.isActive ? "Deactivate action" : "Activate action"}
					>
						{busyId === sa.id ? (
							<span aria-busy="true" style={{ opacity: 0.6 }}>
								•••
							</span>
						) : sa.isActive ? (
							<Pause size={18} color={theme.colors.danger} />
						) : (
							<Play size={18} color={theme.colors.success} />
						)}
					</IconButton>
					<IconButton
						onClick={() =>
							navigate(`/scheduled-actions/${sa.id}/edit`, {
								state: sa,
							})
						}
						data-test-id={`sa-edit-${sa.id}`}
						aria-label="Edit"
						title="Edit"
					>
						<Pencil size={18} color={theme.colors.primary} outline />
					</IconButton>
					<IconButton
						onClick={() => requestDelete(sa.id)}
						data-test-id={`sa-delete-${sa.id}`}
						aria-label="Delete"
						title="Delete"
					>
						<Trash size={18} color={theme.colors.danger} />
					</IconButton>
				</RightActions>
			</CardRow>
			{confirmOpen && pendingDeleteId === sa.id && (
				<ConfirmDialog
					open={confirmOpen}
					title="Delete action?"
					message="This will permanently delete the scheduled action. This cannot be undone."
					confirmText="Delete"
					cancelText="Cancel"
					onConfirm={confirmDelete}
					onCancel={closeConfirm}
				/>
			)}
		</Card>
	);
};
