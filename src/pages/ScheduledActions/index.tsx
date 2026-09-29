import React from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import type {
	ReduxState,
	ScheduledAction,
	ScheduledActionListRequest,
} from "split-expense-shared-types";
import styled from "styled-components";
import { Select } from "@/components/Form/Select";
import { FieldLabel, Surface, UiButton } from "@/components/ui";
import {
	useDeleteScheduledAction,
	useInfiniteScheduledActionsList,
	useUpdateScheduledAction,
} from "@/hooks/useScheduledActions";
import { ActionCard } from "./ActionCard";
import { useConfirmDialog, useIntersectionObserver } from "./hooks";

const PageShell = styled.main`
  width: min(100%, 960px);
  margin: 0 auto;
  padding: 24px 16px 60px;
  color: var(--ui-text);
  @media (max-width: 600px) { padding: 16px 0 40px; }
`;

const HeaderTitle = styled.h1`
  margin: 0;
  color: var(--ui-text);
  font-size: clamp(24px, 3vw, 30px);
  font-weight: 750;
  line-height: 1.15;
`;

const HeaderCopy = styled.p`
  margin: 8px 0 0;
  color: var(--ui-text-muted);
  font-size: 14px;
`;

const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
  gap: 16px;
  flex-wrap: wrap;
`;

const ActionsGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
`;

const FilterPanel = styled(Surface)`
  margin-bottom: 22px;
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;

  @media (max-width: 768px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 480px) { grid-template-columns: minmax(0, 1fr); }
`;

const FilterSummary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
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
				<FieldLabel>
					Status
					<Select
						value={filters.status}
						onChange={(event) => setFilter("status", event.target.value)}
					>
						<option value="all">All statuses</option>
						<option value="active">Active</option>
						<option value="paused">Paused</option>
					</Select>
				</FieldLabel>
				<FieldLabel>
					Type
					<Select
						value={filters.actionType}
						onChange={(event) => setFilter("actionType", event.target.value)}
					>
						<option value="all">All types</option>
						<option value="add_expense">Expense</option>
						<option value="add_budget">Budget</option>
					</Select>
				</FieldLabel>
				<FieldLabel>
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
				</FieldLabel>
				<FieldLabel>
					Sort by
					<Select
						value={filters.sort}
						onChange={(event) => setFilter("sort", event.target.value)}
					>
						<option value="recent">Recently added</option>
						<option value="next_run">Next run soonest</option>
						<option value="name">Name A–Z</option>
					</Select>
				</FieldLabel>
			</FilterGrid>
			<FilterSummary>
				<span role="status">
					{totalCount == null
						? isError ? "Actions unavailable" : "Loading actions…"
						: `${totalCount} matching ${totalCount === 1 ? "action" : "actions"}`}
				</span>
				{hasFilters && (
					<UiButton type="button" $tone="quiet" onClick={clearFilters}>
						Clear filters
					</UiButton>
				)}
			</FilterSummary>
		</FilterPanel>
	);
}

const StateMessage = styled(Surface)`
  h4 { margin: 0 0 6px; }
  p { margin: 0 0 14px; color: var(--ui-text-muted); }
`;

const LoadMore = styled(UiButton)`
  justify-self: center;
  margin: 8px 0;
`;

const ScheduledActionsPage: React.FC = () => {
	const navigate = useNavigate();
	const session = useSelector((state: ReduxState) => state.value);
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
		<PageShell data-test-id="scheduled-actions-page">
			<PageHeader>
				<div>
					<HeaderTitle>Scheduled actions</HeaderTitle>
					<HeaderCopy>Manage what happens automatically, and when.</HeaderCopy>
				</div>
				<UiButton type="button" $tone="primary" onClick={() => navigate("/scheduled-actions/new")}>
					<span aria-hidden="true">＋</span> Add action
				</UiButton>
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
				<StateMessage as="output">
					<h4>Loading scheduled actions…</h4>
					<p>Getting your recurring expenses and budget entries.</p>
				</StateMessage>
			)}
			{isError && (
				<StateMessage role="alert">
					<h4>Could not load scheduled actions</h4>
					<p>Check your connection and try again.</p>
					<UiButton type="button" onClick={() => refetch()}>
						Try again
					</UiButton>
				</StateMessage>
			)}

			{!isLoading && !isError && actions.length === 0 && hasFilters && (
				<StateMessage>
					<h4>No matching scheduled actions</h4>
					<p>Try another filter or clear the filters to see all actions.</p>
					<UiButton type="button" onClick={clearFilters}>
						Clear filters
					</UiButton>
				</StateMessage>
			)}
			{!isLoading && !isError && actions.length === 0 && !hasFilters && (
				<StateMessage>
					<h4>No scheduled actions yet</h4>
					<p>
						Create an action to add an expense or update a budget automatically
						on a schedule.
					</p>
					<UiButton
						type="button"
						onClick={() => navigate("/scheduled-actions/new")}
					>
						Add your first action
					</UiButton>
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
						<Surface>
							<div>Loading more...</div>
						</Surface>
					)}
				</ActionsGrid>
			)}
		</PageShell>
	);
};

export default ScheduledActionsPage;
// Render global confirm dialog
// Keeping it outside component return would break hooks; instead, append here:
// eslint-disable-next-line react/no-unstable-nested-components
export const ScheduledActionsPageWithDialogs: React.FC = () => {
	return <ScheduledActionsPage />;
};
