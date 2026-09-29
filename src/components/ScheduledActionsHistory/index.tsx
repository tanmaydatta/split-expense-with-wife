import { Surface, UiButton } from "@/components/ui";
import { Input } from "@/components/Form/Input";
import {
	useRunScheduledActionNow,
	useScheduledActionDetails,
	useScheduledActionHistory,
	useUpdateScheduledAction,
} from "@/hooks/useScheduledActions";
import { dateToFullStr } from "@/utils/date";
import React from "react";
import { useNavigate } from "react-router-dom";
import type {
	ScheduledActionHistory,
	ScheduledActionHistoryListResponse,
} from "split-expense-shared-types";
import styled from "styled-components";

type Props = {
	scheduledActionId?: string;
	executionStatus?: "success" | "failed" | "started";
};

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
`;

const HistoryItem = styled(Surface)`
  width: 100%;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:hover { border-color: var(--ui-border-strong); background: var(--ui-surface-muted); }
  &:focus-visible { outline: 3px solid var(--ui-focus); outline-offset: 2px; }
`;

const Row = styled.span`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const StatusDot = styled.span<{ $status: "success" | "failed" | "started" }>`
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background-color: ${({ $status }) =>
		$status === "success"
			? "#16a34a"
			: $status === "failed"
				? "#dc2626"
				: "#f59e0b"};
  flex-shrink: 0;
`;

const TitleText = styled.span`
  display: block;
  font-size: 16px;
  color: var(--ui-text);
  font-weight: 700;
`;

const Subtext = styled.span`
  display: block;
  font-size: 13px;
  color: var(--ui-text-muted);
`;

const Separator = styled.span`
  margin: 0 6px;
  color: #9ca3af;
`;

const UpcomingContainer = styled.div`
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 24px;
  align-items: center;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 16px;
  }
`;

const UpcomingLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ControlsBar = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas:
    "date"
    "set"
    "run"
    "skip";
  align-items: center;
  gap: 12px;
`;

const ActionButton = styled(UiButton)`
  height: 44px;
  min-width: 120px;
  padding: 0 16px;
`;

const DateInput = styled(Input)`
  height: 44px;
  width: 100%;
  grid-area: date;
`;

const RunButton = styled(ActionButton)`
  grid-area: run;
  justify-self: stretch;
  width: 100%;
`;

const SkipButton = styled(ActionButton)`
  grid-area: skip;
  justify-self: stretch;
  width: 100%;
`;

const SetButton = styled(ActionButton)`
  grid-area: set;
  justify-self: stretch;
  width: 100%;
`;

const ScheduledActionsHistory: React.FC<Props> = ({
	scheduledActionId,
	executionStatus,
}) => {
	const navigate = useNavigate();
	const { data: details } = useScheduledActionDetails(scheduledActionId);
	const updateAction = useUpdateScheduledAction();
	const runNow = useRunScheduledActionNow();
	const [customDate, setCustomDate] = React.useState<string>("");
	const { data, isLoading, isError } = useScheduledActionHistory({
		offset: 0,
		limit: 25,
		scheduledActionId,
		executionStatus,
	});

	const list =
		(data as ScheduledActionHistoryListResponse | undefined)?.history || [];

	const upcoming = (
		details as import("split-expense-shared-types").ScheduledAction | undefined
	)?.nextExecutionDate;
	const isSaving = updateAction.isPending;

	return (
		<div data-test-id="sa-history">
			<Surface data-test-id="sa-upcoming">
				<UpcomingContainer>
					<UpcomingLeft>
						<TitleText>Upcoming run</TitleText>
						<Subtext>
							Next: <strong>{upcoming || "—"}</strong>
						</Subtext>
					</UpcomingLeft>
					<ControlsBar>
						<RunButton
							$tone="primary"
							onClick={() => {
								if (!scheduledActionId || runNow.isPending) return;
								runNow.mutate({ id: scheduledActionId });
							}}
							aria-label="Run this action now"
							data-test-id="sa-run-now"
							disabled={runNow.isPending}
						>
							{runNow.isPending ? "Running…" : "Run now"}
						</RunButton>
						<SkipButton
							onClick={() => {
								if (!scheduledActionId || isSaving) return;
								updateAction.mutate({
									id: scheduledActionId,
									skipNext: true,
								} as any);
							}}
							aria-label="Skip the next scheduled run"
							data-test-id="sa-skip-next"
							disabled={isSaving}
						>
							{isSaving ? "Saving…" : "Skip next"}
						</SkipButton>
						<DateInput
							id="custom-next-date"
							type="date"
							aria-label="Custom next date"
							value={customDate}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setCustomDate(e.target.value)
							}
							data-test-id="sa-custom-next-date-input"
						/>
						<SetButton
							onClick={() => {
								if (!scheduledActionId || !customDate || isSaving) return;
								updateAction.mutate({
									id: scheduledActionId,
									nextExecutionDate: customDate,
								} as any);
							}}
							disabled={!customDate || isSaving}
							aria-label="Set custom next execution date"
							data-test-id="sa-set-custom-next"
						>
							{isSaving ? "Saving…" : "Set date"}
						</SetButton>
					</ControlsBar>
				</UpcomingContainer>
			</Surface>
			{isLoading && <div>Loading...</div>}
			{isError && <div>Failed to load history</div>}
			{!isLoading && !isError && data && list.length === 0 && (
				<Surface>
					<div>No history yet.</div>
				</Surface>
			)}
			{!isLoading && !isError && list.length > 0 && (
				<List>
					{list.map((h: ScheduledActionHistory) => (
						<HistoryItem
							as="button"
							type="button"
							key={h.id}
							onClick={() => navigate(`/scheduled-actions/history/run/${h.id}`)}
							data-test-id={`sa-history-item-${h.id}`}
						>
							<Row>
								<StatusDot $status={h.executionStatus} />
								<span>
									<TitleText>
										{dateToFullStr(new Date(h.executedAt.replace(" ", "T")))}
									</TitleText>
									<Subtext>
										Last run
										<Separator>•</Separator>
										Type: {h.actionType}
										<Separator>•</Separator>
										Status: {h.executionStatus}
									</Subtext>
								</span>
							</Row>
						</HistoryItem>
					))}
				</List>
			)}
		</div>
	);
};

export default ScheduledActionsHistory;
