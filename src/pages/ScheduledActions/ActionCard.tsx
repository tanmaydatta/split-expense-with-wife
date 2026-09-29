import React from "react";
import { useNavigate } from "react-router-dom";
import type { ReduxState, ScheduledAction } from "split-expense-shared-types";
import styled from "styled-components";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Surface, UiButton } from "@/components/ui";
import { ActionDetails, ActionMoreSetup } from "./ActionDetails";

const ActionCardShell = styled(Surface)`
  transition: border-color 140ms ease, box-shadow 140ms ease;
  &:hover { border-color: var(--ui-border-strong); box-shadow: 0 8px 26px rgba(30, 54, 90, 0.09); }
`;
const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  @media (max-width: 600px) { flex-direction: column; gap: 10px; }
`;
const Description = styled.h4`
  margin: 0 0 8px;
  color: var(--ui-text);
  font-size: 18px;
  line-height: 1.3;
  overflow-wrap: anywhere;
`;
const Badges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;
const Badge = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 9px;
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 600;
`;
const StatusBadge = styled(Badge)<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? "#e8f7ed" : "#fff3e5")};
  color: ${({ $active }) => ($active ? "#146c36" : "#895000")};
`;
const Amount = styled.div`
  color: var(--ui-text);
  font-size: 22px;
  line-height: 1.2;
  font-weight: 700;
  white-space: nowrap;
`;
const Currency = styled.span`
  margin-left: 5px;
  color: var(--ui-text-muted);
  font-size: 13px;
  font-weight: 600;
`;
const NextRun = styled.div`
  margin-top: 16px;
  color: var(--ui-text-muted);
  font-size: 14px;
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-border);
`;
const MoreSetup = styled.div`
  margin-top: 12px;
`;
const ActionButton = styled(UiButton)`
  @media (max-width: 600px) { flex: 1 1 calc(50% - 8px); }
`;
const MoreSetupButton = styled(ActionButton)`
  min-height: 38px;
  color: var(--ui-accent);
`;

interface ActionCardProps {
	sa: ScheduledAction;
	session: ReduxState["value"];
	busyId: string | null;
	setBusyId: (id: string | null) => void;
	updateAction: {
		mutateAsync: (data: { id: string; isActive: boolean }) => Promise<unknown>;
	};
	requestDelete: (id: string) => void;
	confirmOpen: boolean;
	pendingDeleteId: string | null;
	confirmDelete: () => void;
	closeConfirm: () => void;
}

export const ActionCard: React.FC<ActionCardProps> = ({
	sa,
	session,
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
	const [moreSetupOpen, setMoreSetupOpen] = React.useState(false);
	const [toggleError, setToggleError] = React.useState(false);
	const moreSetupId = `sa-more-setup-${sa.id}`;
	const isBusy = busyId === sa.id;
	const amount = Number(sa.actionData.amount).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

	const handleToggleActive = async () => {
		if (busyId) return;
		setBusyId(sa.id);
		setToggleError(false);
		try {
			await updateAction.mutateAsync({ id: sa.id, isActive: !sa.isActive });
		} catch {
			setToggleError(true);
		} finally {
			setBusyId(null);
		}
	};

	return (
		<ActionCardShell
			data-test-id={`sa-item-${sa.id}`}
			aria-busy={isBusy}
		>
			<CardHeader>
				<div>
					<Description>{sa.actionData.description}</Description>
					<Badges>
						<StatusBadge $active={sa.isActive}>
							{sa.isActive ? "Active" : "Paused"}
						</StatusBadge>
						<Badge>
							{sa.actionType === "add_expense"
								? "Add Expense"
								: "Add to Budget"}
						</Badge>
						<Badge>{sa.frequency.toUpperCase()}</Badge>
					</Badges>
				</div>
				<Amount>
					{amount}
					<Currency>{sa.actionData.currency}</Currency>
				</Amount>
			</CardHeader>
			<NextRun>Next: <strong>{sa.nextExecutionDate}</strong></NextRun>
			<ActionDetails action={sa} session={session} />
			<MoreSetup>
				<MoreSetupButton
					type="button"
					data-test-id={`sa-details-toggle-${sa.id}`}
					aria-expanded={moreSetupOpen}
					aria-controls={moreSetupId}
					onClick={() => setMoreSetupOpen((open) => !open)}
				>
					{moreSetupOpen ? "Hide setup" : "More setup"}
				</MoreSetupButton>
				<ActionMoreSetup id={moreSetupId} action={sa} hidden={!moreSetupOpen} />
			</MoreSetup>
			<Actions>
				<ActionButton
					type="button"
					onClick={() => navigate(`/scheduled-actions/${sa.id}`, { state: sa })}
				>
					History
				</ActionButton>
				<ActionButton
					type="button"
					data-test-id={`sa-edit-${sa.id}`}
					onClick={() =>
						navigate(`/scheduled-actions/${sa.id}/edit`, { state: sa })
					}
				>
					Edit
				</ActionButton>
				<ActionButton
					type="button"
					data-test-id={`sa-toggle-${sa.id}`}
					aria-label={sa.isActive ? "Deactivate action" : "Activate action"}
					disabled={Boolean(busyId)}
					onClick={handleToggleActive}
				>
					{isBusy ? "Saving…" : sa.isActive ? "Pause" : "Resume"}
				</ActionButton>
				<ActionButton
					type="button"
					$tone="danger"
					data-test-id={`sa-delete-${sa.id}`}
					onClick={() => requestDelete(sa.id)}
				>
					Delete
				</ActionButton>
			</Actions>
			{toggleError && (
				<p role="alert">Could not update this action. Please try again.</p>
			)}
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
		</ActionCardShell>
	);
};
