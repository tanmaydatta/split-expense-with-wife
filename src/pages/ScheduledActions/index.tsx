import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Plus } from "@/components/Icons";
import {
	useDeleteScheduledAction,
	useInfiniteScheduledActionsList,
	useUpdateScheduledAction,
} from "@/hooks/useScheduledActions";
import React from "react";
import { useNavigate } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";
import styled, { useTheme } from "styled-components";
import { useIntersectionObserver, useConfirmDialog } from "./hooks";
import { ActionCard } from "./ActionCard";

const HeaderTitle = styled.h3`
  margin: 0;
  font-size: 20px;
  line-height: 36px;
  @media (max-width: 768px) {
    visibility: hidden; /* reserve space to keep button right-aligned */
  }
`;

const StyledIconButton = styled(Button)`
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.light};
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

const ScheduledActionsPage: React.FC = () => {
	const navigate = useNavigate();
	const {
		data,
		isLoading,
		isError,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useInfiniteScheduledActionsList(10);
	const deleteAction = useDeleteScheduledAction();
	const updateAction = useUpdateScheduledAction();
	const [busyId, setBusyId] = React.useState<string | null>(null);

	const actions: ScheduledAction[] =
		data?.pages.flatMap((p) => p.scheduledActions) ?? [];

	// Use custom hooks
	const sentinelRef = useIntersectionObserver(
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	);
	const { confirmOpen, pendingDeleteId, requestDelete, closeConfirm } =
		useConfirmDialog();

	// Create handlers
	const confirmDelete = () => {
		if (pendingDeleteId) {
			deleteAction.mutate({ id: pendingDeleteId });
		}
		closeConfirm();
	};

	const theme = useTheme();

	return (
		<div className="settings-container" data-test-id="scheduled-actions-page">
			<PageHeader>
				<HeaderTitle>Scheduled Actions</HeaderTitle>
				<StyledIconButton onClick={() => navigate("/scheduled-actions/new")}>
					<Plus size={14} color={theme.colors.primary} />
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
						<ActionCard
							key={sa.id}
							sa={sa}
							busyId={busyId}
							setBusyId={setBusyId}
							updateAction={updateAction}
							requestDelete={requestDelete}
							confirmOpen={confirmOpen}
							pendingDeleteId={pendingDeleteId}
							confirmDelete={confirmDelete}
							closeConfirm={closeConfirm}
						/>
					))}
					<div ref={sentinelRef} data-test-id="sa-infinite-sentinel" />
					{isFetchingNextPage && (
						<Card className="settings-card">
							<div>Loading more...</div>
						</Card>
					)}
				</ActionsGrid>
			)}
		</div>
	);
};

export default ScheduledActionsPage;
// Render global confirm dialog
// Keeping it outside component return would break hooks; instead, append here:
// eslint-disable-next-line react/no-unstable-nested-components
export const ScheduledActionsPageWithDialogs: React.FC = () => {
	return <ScheduledActionsPage />;
};
