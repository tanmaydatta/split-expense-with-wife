import React from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { ReduxState, ScheduledAction } from "split-expense-shared-types";
import styled, { useTheme } from "styled-components";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Plus } from "@/components/Icons";
import {
	useDeleteScheduledAction,
	useInfiniteScheduledActionsList,
	useUpdateScheduledAction,
} from "@/hooks/useScheduledActions";
import { ActionCard } from "./ActionCard";
import { useConfirmDialog, useIntersectionObserver } from "./hooks";

const HeaderTitle = styled.h3`
  margin: 0;
  font-size: 20px;
  line-height: 36px;
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
  gap: 12px;
  flex-wrap: wrap;
`;

const ActionsGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
`;

const StateMessage = styled(Card)`
  border: 1px solid #e5e7eb;
  h4 { margin: 0 0 6px; }
  p { margin: 0 0 14px; color: #4b5563; }
`;

const LoadMore = styled(StyledIconButton)`
  justify-self: center;
  margin: 8px 0;
`;

const ScheduledActionsPage: React.FC = () => {
	const navigate = useNavigate();
	const session = useSelector((state: ReduxState) => state.value);
	const {
		data,
		isLoading,
		isError,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
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
				<StateMessage as="output" className="settings-card">
					<h4>Loading scheduled actions…</h4>
					<p>Getting your recurring expenses and budget entries.</p>
				</StateMessage>
			)}
			{isError && (
				<StateMessage className="settings-card" role="alert">
					<h4>Could not load scheduled actions</h4>
					<p>Check your connection and try again.</p>
					<StyledIconButton type="button" onClick={() => refetch()}>
						Try again
					</StyledIconButton>
				</StateMessage>
			)}

			{!isLoading && !isError && actions.length === 0 && (
				<StateMessage className="settings-card">
					<h4>No scheduled actions yet</h4>
					<p>
						Create an action to add an expense or update a budget automatically
						on a schedule.
					</p>
					<StyledIconButton
						type="button"
						onClick={() => navigate("/scheduled-actions/new")}
					>
						Add your first action
					</StyledIconButton>
				</StateMessage>
			)}

			{!isLoading && !isError && actions.length > 0 && (
				<ActionsGrid>
					{actions.map((sa) => (
						<ActionCard
							key={sa.id}
							sa={sa}
							session={session}
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
					{hasNextPage && (
						<>
							<LoadMore
								type="button"
								onClick={() => fetchNextPage()}
								disabled={isFetchingNextPage}
							>
								{isFetchingNextPage ? "Loading more…" : "Load more actions"}
							</LoadMore>
							<div ref={sentinelRef} data-test-id="sa-infinite-sentinel" />
						</>
					)}
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
