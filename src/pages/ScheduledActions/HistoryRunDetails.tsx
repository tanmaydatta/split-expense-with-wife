import BackButton from "@/components/BackButton";
import { Surface, UiPage, UiPageDescription, UiPageHeader, UiPageTitle } from "@/components/ui";
import { useScheduledActionHistoryDetails } from "@/hooks/useScheduledActions";
import { dateToFullStr } from "@/utils/date";
import React from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import type { ReduxState } from "split-expense-shared-types";
import styled from "styled-components";

const Container = styled.div``;
const Row = styled.div`
  margin: 8px 0;
  font-size: 14px;
  color: var(--ui-text);
`;
const Label = styled.span`
  color: var(--ui-text-muted);
  margin-right: 6px;
`;

const SectionTitle = styled.h4`
  margin: 16px 0 8px;
`;

const InlineList = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;
const Pill = styled.span`
  background: var(--ui-surface-muted);
  border: 1px solid var(--ui-border);
  border-radius: 9999px;
  padding: 2px 8px;
  font-size: 12px;
  color: #374151;
`;

const HistoryRunDetailsPage: React.FC = () => {
	const { historyId } = useParams<{ historyId: string }>();
	const navigate = useNavigate();
	const { data, isLoading, isError } =
		useScheduledActionHistoryDetails(historyId);
	const session = useSelector((state: ReduxState) => state.value);
	const usersById = session?.extra?.usersById || {};

	return (
		<UiPage data-test-id="sa-history-run">
			<UiPageHeader>
				<div>
					<UiPageTitle>Run Details</UiPageTitle>
					<UiPageDescription>Review the result and data from this scheduled run.</UiPageDescription>
				</div>
				<BackButton onClick={() => navigate(-1)} />
			</UiPageHeader>
			{isLoading && (
				<Surface>
					<div>Loading...</div>
				</Surface>
			)}
			{isError && (
				<Surface>
					<div>Failed to load</div>
				</Surface>
			)}
			{!isLoading && !isError && data && (
				<Container>
					<Surface>
						<Row>
							<Label>ID:</Label> {data.id}
						</Row>
						<Row>
							<Label>Status:</Label> {data.executionStatus}
						</Row>
						<Row>
							<Label>Executed At:</Label>{" "}
							{dateToFullStr(
								new Date((data.executedAt || "").replace(" ", "T")),
							)}
						</Row>
						{data.errorMessage && (
							<Row>
								<Label>Error:</Label> {data.errorMessage}
							</Row>
						)}
					</Surface>

					<Surface style={{ marginTop: 16 }}>
						<SectionTitle>Action Data</SectionTitle>
						<Row>
							<Label>Type:</Label> {data.actionType}
						</Row>
						{data.actionData && (
							<>
								{"description" in data.actionData && (
									<Row>
										<Label>Description:</Label> {data.actionData.description}
									</Row>
								)}
								{"amount" in data.actionData && (
									<Row>
										<Label>Amount:</Label>{" "}
										{Number(data.actionData.amount).toFixed(2)}
									</Row>
								)}
								{"currency" in data.actionData && (
									<Row>
										<Label>Currency:</Label> {data.actionData.currency}
									</Row>
								)}
								{"paidByUserId" in data.actionData && (
									<Row>
										<Label>Paid By:</Label>{" "}
										{usersById[(data.actionData as any).paidByUserId]
											?.firstName || (data.actionData as any).paidByUserId}
									</Row>
								)}
								{"splitPctShares" in data.actionData &&
									data.actionData.splitPctShares && (
										<Row>
											<Label>Split %:</Label>
											<InlineList>
												{Object.entries<any>(
													data.actionData.splitPctShares,
												).map(([uid, pct]) => (
													<Pill key={uid}>
														{usersById[uid]?.firstName || uid}: {pct}%
													</Pill>
												))}
											</InlineList>
										</Row>
									)}
								{"budgetName" in data.actionData && (
									<Row>
										<Label>Budget:</Label> {data.actionData.budgetName}
									</Row>
								)}
								{"type" in data.actionData && (
									<Row>
										<Label>Credit/Debit:</Label> {data.actionData.type}
									</Row>
								)}
							</>
						)}
					</Surface>
				</Container>
			)}
		</UiPage>
	);
};

export default HistoryRunDetailsPage;
