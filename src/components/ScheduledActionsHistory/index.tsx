import { useScheduledActionHistory } from "@/hooks/useScheduledActions";
import React from "react";
import { useNavigate } from "react-router-dom";
import type {
    ScheduledActionHistory,
    ScheduledActionHistoryListResponse,
} from "split-expense-shared-types";

type Props = {
    scheduledActionId?: string;
    executionStatus?: "success" | "failed" | "started";
};

const ScheduledActionsHistory: React.FC<Props> = ({ scheduledActionId, executionStatus }) => {
    const navigate = useNavigate();
    const { data, isLoading, isError } = useScheduledActionHistory({
        offset: 0,
        limit: 25,
        scheduledActionId,
        executionStatus,
    });

    const list = (data as ScheduledActionHistoryListResponse | undefined)?.history || [];

    return (
        <div data-test-id="sa-history">
            {isLoading && <div>Loading...</div>}
            {isError && <div>Failed to load history</div>}
            {!isLoading && !isError && data && list.length === 0 && (
                <div>No history yet.</div>
            )}
            {!isLoading && !isError && list.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {list.map((h: ScheduledActionHistory) => (
                        <li
                          key={h.id}
                          style={{ padding: "8px 0", borderBottom: "1px solid #eee", cursor: "pointer" }}
                          onClick={() => navigate(`/scheduled-actions/history/${h.id}`)}
                          data-test-id={`sa-history-item-${h.id}`}
                        >
                          <div style={{ fontSize: 14, color: "#111827" }}>{h.executedAt}</div>
                          <div style={{ fontSize: 12, color: "#4b5563" }}>
                            {h.actionType} <span style={{ margin: "0 6px", color: "#9ca3af" }}>•</span> {h.executionStatus}
                          </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default ScheduledActionsHistory;


