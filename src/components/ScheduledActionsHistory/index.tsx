import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Form/Input";
import {
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
`;

const Row = styled.div`
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

const TitleText = styled.div`
  font-size: 14px;
  color: #111827;
  font-weight: 600;
`;

const Subtext = styled.div`
  font-size: 12px;
  color: #4b5563;
`;

const Separator = styled.span`
  margin: 0 6px;
  color: #9ca3af;
`;

const UpcomingContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: center;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
`;

const UpcomingLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const UpcomingRight = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ActionButton = styled(Button)`
  height: 44px;
  min-width: 120px;
  padding: 0 16px;
`;

const ScheduledActionsHistory: React.FC<Props> = ({
	scheduledActionId,
	executionStatus,
}) => {
	const navigate = useNavigate();
	const { data: details } = useScheduledActionDetails(scheduledActionId);
	const updateAction = useUpdateScheduledAction();
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
			<Card className="settings-card">
				<UpcomingContainer>
					<UpcomingLeft>
						<TitleText>Upcoming run</TitleText>
						<Subtext>
							Next: <strong>{upcoming || "—"}</strong>
						</Subtext>
					</UpcomingLeft>
					<UpcomingRight>
						<ActionButton
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
						</ActionButton>
						<Input
							id="custom-next-date"
							type="date"
							aria-label="Custom next date"
							value={customDate}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setCustomDate(e.target.value)
							}
							data-test-id="sa-custom-next-date-input"
							style={{ minWidth: 260, height: 44 }}
						/>
						<ActionButton
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
						</ActionButton>
					</UpcomingRight>
				</UpcomingContainer>
			</Card>
			{isLoading && <div>Loading...</div>}
			{isError && <div>Failed to load history</div>}
			{!isLoading && !isError && data && list.length === 0 && (
				<Card className="settings-card">
					<div>No history yet.</div>
				</Card>
			)}
			{!isLoading && !isError && list.length > 0 && (
				<List>
					{list.map((h: ScheduledActionHistory) => (
						<Card
							key={h.id}
							className="settings-card"
							onClick={() => navigate(`/scheduled-actions/history/run/${h.id}`)}
							data-test-id={`sa-history-item-${h.id}`}
							style={{ cursor: "pointer" }}
						>
							<Row>
								<StatusDot $status={h.executionStatus} />
								<div>
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
								</div>
							</Row>
						</Card>
					))}
				</List>
			)}
		</div>
	);
};

export default ScheduledActionsHistory;
