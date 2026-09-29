import type React from "react";
import type { ReduxState, ScheduledAction } from "split-expense-shared-types";
import styled from "styled-components";

const DefinitionList = styled.dl`
  display: grid;
  grid-template-columns: minmax(110px, 150px) minmax(0, 1fr);
  gap: 8px 16px;
  margin: 0;
  font-size: 14px;
  dt { color: #6b7280; }
  dd { margin: 0; overflow-wrap: anywhere; }
  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 2px;
    dd { margin-bottom: 8px; }
  }
`;

const PrimaryDetails = styled.fieldset`
  margin-top: 16px;
  margin-left: 0;
  margin-right: 0;
  margin-bottom: 0;
  padding: 14px 0 0;
  min-width: 0;
  border: 0;
  border-top: 1px solid #e5e7eb;
`;

const SecondaryDetails = styled.section`
  margin-top: 10px;
  padding: 14px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
`;

interface ActionDetailsProps {
	action: ScheduledAction;
	session: ReduxState["value"];
}

export const ActionDetails: React.FC<ActionDetailsProps> = ({
	action,
	session,
}) => {
	const data = action.actionData;
	const users = session?.extra?.usersById ?? {};
	const displayUser = (userId: string) => {
		const user = users[userId];
		return user
			? [user.firstName, user.lastName].filter(Boolean).join(" ") || userId
			: userId;
	};
	const budget =
		"budgetId" in data
			? session?.extra?.group?.budgets?.find(
					(item) => item.id === data.budgetId,
				)
			: undefined;

	return (
		<PrimaryDetails
			aria-label={`${data.description} setup`}
			data-test-id={`sa-details-${action.id}`}
		>
			<DefinitionList>
				{action.actionType === "add_expense" && "paidByUserId" in data ? (
					<>
						<dt>Paid by</dt>
						<dd>{displayUser(data.paidByUserId)}</dd>
						<dt>Split</dt>
						<dd>
							{Object.entries(data.splitPctShares).map(
								([userId, percentage]) => (
									<div key={userId}>
										{displayUser(userId)}: {percentage}%
									</div>
								),
							)}
						</dd>
					</>
				) : "budgetId" in data ? (
					<>
						<dt>Budget</dt>
						<dd>{budget?.budgetName || data.budgetId}</dd>
						<dt>Entry type</dt>
						<dd>{data.type}</dd>
					</>
				) : null}
			</DefinitionList>
		</PrimaryDetails>
	);
};

export const ActionMoreSetup: React.FC<{
	id: string;
	action: ScheduledAction;
	hidden: boolean;
}> = ({ id, action, hidden }) => (
	<SecondaryDetails
		id={id}
		hidden={hidden}
		aria-label={`${action.actionData.description} more setup`}
		data-test-id={`sa-more-setup-${action.id}`}
	>
		<DefinitionList>
			<dt>Starts</dt>
			<dd>{action.startDate}</dd>
			<dt>Last run</dt>
			<dd>{action.lastExecutedAt || "Not run yet"}</dd>
		</DefinitionList>
	</SecondaryDetails>
);
