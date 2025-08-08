import { Button } from "@/components/Button";
import { ArrowLeft } from "@/components/Icons";
import ScheduledActionsManager from "@/components/ScheduledActionsManager";
import React from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";

const NewActionPage: React.FC = () => {
	const navigate = useNavigate();
	const Header = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  `;
	const BackButton = styled(Button)`
    background: white;
    color: #1e40af;
    border: 1px solid #e5e7eb;
    padding: 6px 10px;
    min-height: 32px;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  `;
	const Title = styled.h3`
    margin: 0;
  `;

	return (
		<div className="settings-container" data-test-id="scheduled-actions-new">
			<Header>
				<BackButton onClick={() => navigate(-1)}>
					<ArrowLeft size={14} color="#1e40af" />
					Back
				</BackButton>
				<Title>Add Scheduled Action</Title>
			</Header>
			<ScheduledActionsManager />
		</div>
	);
};

export default NewActionPage;
