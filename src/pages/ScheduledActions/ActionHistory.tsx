import { Button } from "@/components/Button";
import { ArrowLeft } from "@/components/Icons";
import ScheduledActionsHistory from "@/components/ScheduledActionsHistory";
import { useScheduledActionDetails } from "@/hooks/useScheduledActions";
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ScheduledAction } from "split-expense-shared-types";

const ActionHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: details } = useScheduledActionDetails(id);
  const action = details as ScheduledAction | undefined;
  return (
    <div className="settings-container" data-test-id="scheduled-actions-history">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Button
          onClick={() => navigate(-1)}
          style={{
            background: "white",
            color: "#1e40af",
            border: "1px solid #e5e7eb",
            padding: "6px 10px",
            minHeight: 32,
            fontSize: 14,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ArrowLeft size={14} color="#1e40af" />
          Back
        </Button>
        <h3 style={{ margin: 0 }}>Action History</h3>
      </div>
      {action && (
        <div style={{
          marginBottom: 16,
          fontWeight: 600,
          fontSize: 18,
          color: "#111827",
        }}>
          {action.actionData.description}
        </div>
      )}
      <ScheduledActionsHistory scheduledActionId={id} />
    </div>
  );
};

export default ActionHistoryPage;


