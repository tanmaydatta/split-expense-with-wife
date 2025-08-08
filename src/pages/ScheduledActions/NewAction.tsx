import { Button } from "@/components/Button";
import { ArrowLeft } from "@/components/Icons";
import ScheduledActionsManager from "@/components/ScheduledActionsManager";
import React from "react";
import { useNavigate } from "react-router-dom";

const NewActionPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="settings-container" data-test-id="scheduled-actions-new">
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
        <h3 style={{ margin: 0 }}>Add Scheduled Action</h3>
      </div>
      <ScheduledActionsManager />
    </div>
  );
};

export default NewActionPage;


