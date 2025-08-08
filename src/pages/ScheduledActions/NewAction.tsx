import BackButton from "@/components/BackButton";
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
	// Back button now reused via component
	const Title = styled.h3`
    margin: 0;
  `;

	return (
		<div className="settings-container" data-test-id="scheduled-actions-new">
			<Header>
				<BackButton onClick={() => navigate(-1)} />
				<Title>Add Scheduled Action</Title>
			</Header>
			<ScheduledActionsManager />
		</div>
	);
};

export default NewActionPage;
