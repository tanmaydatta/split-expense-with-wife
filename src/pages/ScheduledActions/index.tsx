import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Pause, Pencil, Play, Plus, Trash } from "@/components/Icons";
import {
	useDeleteScheduledAction,
	useInfiniteScheduledActionsList,
	useUpdateScheduledAction,
} from "@/hooks/useScheduledActions";
import React from "react";
import { useNavigate } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";
import styled, { useTheme } from "styled-components";

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

	const sentinelRef = React.useRef<HTMLDivElement | null>(null);

	React.useEffect(() => {
		if (!sentinelRef.current) return;
		const el = sentinelRef.current;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
					fetchNextPage();
				}
			},
			{ root: null, rootMargin: "0px", threshold: 1.0 },
		);
		observer.observe(el);
		return () => observer.unobserve(el);
	}, [fetchNextPage, hasNextPage, isFetchingNextPage]);

	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
		null,
	);

	const requestDelete = (id: string) => {
		setPendingDeleteId(id);
		setConfirmOpen(true);
	};

	const confirmDelete = () => {
		if (pendingDeleteId) {
			deleteAction.mutate({ id: pendingDeleteId });
		}
		setConfirmOpen(false);
		setPendingDeleteId(null);
	};

	const cancelDelete = () => {
		setConfirmOpen(false);
		setPendingDeleteId(null);
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
						<Card
							key={sa.id}
							className="settings-card"
							data-test-id={`sa-item-${sa.id}`}
							style={
								busyId === sa.id
									? { opacity: 0.6, pointerEvents: "none" }
									: undefined
							}
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
								<RightActions>
									<IconButton
										onClick={async () => {
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
										}}
										data-test-id={`sa-toggle-${sa.id}`}
										aria-label={
											sa.isActive ? "Deactivate action" : "Activate action"
										}
										title={
											sa.isActive ? "Deactivate action" : "Activate action"
										}
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
							{confirmOpen && (
								<ConfirmDialog
									open={confirmOpen}
									title="Delete action?"
									message="This will permanently delete the scheduled action. This cannot be undone."
									confirmText="Delete"
									cancelText="Cancel"
									onConfirm={confirmDelete}
									onCancel={cancelDelete}
								/>
							)}
						</Card>
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
