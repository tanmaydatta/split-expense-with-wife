import React from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
	ReduxState,
	ScheduledAction,
	ScheduledActionListRequest,
} from "split-expense-shared-types";
import styled, { useTheme } from "styled-components";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Plus } from "@/components/Icons";
import { Select } from "@/components/Form/Select";
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

const FilterPanel = styled.div`
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.white};
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 768px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 480px) { grid-template-columns: minmax(0, 1fr); }
`;

const FilterField = styled.label`
  display: grid;
  gap: 5px;
  font-size: 14px;
  font-weight: 600;
  min-width: 0;

  .form-select { border-color: #b8bec8; }
`;

const FilterSummary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  color: #4b5563;
  font-size: 14px;
`;

type FilterKey = "status" | "actionType" | "frequency" | "sort";
const filterDefaults = {
	status: "all",
	actionType: "all",
	frequency: "all",
	sort: "recent",
} as const;
const filterOptions = {
	status: ["all", "active", "paused"],
	actionType: ["all", "add_expense", "add_budget"],
	frequency: ["all", "daily", "weekly", "monthly"],
	sort: ["recent", "next_run", "name"],
} as const;

function readFilter<K extends FilterKey>(
	params: URLSearchParams,
	key: K,
): (typeof filterOptions)[K][number] {
	const value = params.get(key);
	const options = filterOptions[key] as readonly string[];
	return (
		value && options.includes(value) ? value : filterDefaults[key]
	) as (typeof filterOptions)[K][number];
}

function useActionFilters() {
	const [searchParams, setSearchParams] = useSearchParams();
	const filters: Pick<ScheduledActionListRequest, FilterKey> = {
		status: readFilter(searchParams, "status"),
		actionType: readFilter(searchParams, "actionType"),
		frequency: readFilter(searchParams, "frequency"),
		sort: readFilter(searchParams, "sort"),
	};
	const hasFilters =
		filters.status !== "all" ||
		filters.actionType !== "all" ||
		filters.frequency !== "all";
	const setFilter = (key: FilterKey, value: string) => {
		const next = new URLSearchParams(searchParams);
		if (value === filterDefaults[key]) next.delete(key);
		else next.set(key, value);
		setSearchParams(next);
	};
	const clearFilters = () => {
		const next = new URLSearchParams(searchParams);
		next.delete("status");
		next.delete("actionType");
		next.delete("frequency");
		setSearchParams(next);
	};
	return { filters, hasFilters, setFilter, clearFilters };
}

function FilterControls({
	filters,
	totalCount,
	isError,
	hasFilters,
	setFilter,
	clearFilters,
}: {
	filters: Pick<ScheduledActionListRequest, FilterKey>;
	totalCount?: number;
	isError: boolean;
	hasFilters: boolean;
	setFilter: (key: FilterKey, value: string) => void;
	clearFilters: () => void;
}) {
	return (
		<FilterPanel as="section" aria-label="Filter and sort scheduled actions">
			<FilterGrid>
				<FilterField>
					Status
					<Select
						value={filters.status}
						onChange={(event) => setFilter("status", event.target.value)}
					>
						<option value="all">All statuses</option>
						<option value="active">Active</option>
						<option value="paused">Paused</option>
					</Select>
				</FilterField>
				<FilterField>
					Type
					<Select
						value={filters.actionType}
						onChange={(event) => setFilter("actionType", event.target.value)}
					>
						<option value="all">All types</option>
						<option value="add_expense">Expense</option>
						<option value="add_budget">Budget</option>
					</Select>
				</FilterField>
				<FilterField>
					Frequency
					<Select
						value={filters.frequency}
						onChange={(event) => setFilter("frequency", event.target.value)}
					>
						<option value="all">Any frequency</option>
						<option value="daily">Daily</option>
						<option value="weekly">Weekly</option>
						<option value="monthly">Monthly</option>
					</Select>
				</FilterField>
				<FilterField>
					Sort by
					<Select
						value={filters.sort}
						onChange={(event) => setFilter("sort", event.target.value)}
					>
						<option value="recent">Recently added</option>
						<option value="next_run">Next run soonest</option>
						<option value="name">Name A–Z</option>
					</Select>
				</FilterField>
			</FilterGrid>
			<FilterSummary>
				<span role="status">
					{totalCount == null
						? isError ? "Actions unavailable" : "Loading actions…"
						: `${totalCount} matching ${totalCount === 1 ? "action" : "actions"}`}
				</span>
				{hasFilters && (
					<StyledIconButton type="button" onClick={clearFilters}>
						Clear filters
					</StyledIconButton>
				)}
			</FilterSummary>
		</FilterPanel>
	);
}

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
	const theme = useTheme();
	const { filters, hasFilters, setFilter, clearFilters } = useActionFilters();
	const {
		data,
		isLoading,
		isError,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = useInfiniteScheduledActionsList(10, filters);
	const deleteAction = useDeleteScheduledAction();
	const updateAction = useUpdateScheduledAction();
	const [busyId, setBusyId] = React.useState<string | null>(null);

	const actions: ScheduledAction[] =
		data?.pages.flatMap((p) => p.scheduledActions) ?? [];
	const totalCount = data?.pages[0]?.totalCount;
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

	return (
		<div className="settings-container" data-test-id="scheduled-actions-page">
			<PageHeader>
				<HeaderTitle>Scheduled Actions</HeaderTitle>
				<StyledIconButton onClick={() => navigate("/scheduled-actions/new")}>
					<Plus size={14} color={theme.colors.primary} />
					Add Action
				</StyledIconButton>
			</PageHeader>
			<FilterControls
				filters={filters}
				totalCount={totalCount}
				isError={isError}
				hasFilters={hasFilters}
				setFilter={setFilter}
				clearFilters={clearFilters}
			/>

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

			{!isLoading && !isError && actions.length === 0 && hasFilters && (
				<StateMessage className="settings-card">
					<h4>No matching scheduled actions</h4>
					<p>Try another filter or clear the filters to see all actions.</p>
					<StyledIconButton type="button" onClick={clearFilters}>
						Clear filters
					</StyledIconButton>
				</StateMessage>
			)}
			{!isLoading && !isError && actions.length === 0 && !hasFilters && (
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
