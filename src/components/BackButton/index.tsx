import { Button } from "@/components/Button";
import { ArrowLeft } from "@/components/Icons";
import React from "react";
import styled from "styled-components";

const StyledBack = styled(Button)`
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

type BackButtonProps = {
	onClick: () => void;
	label?: string;
};

const BackButton: React.FC<BackButtonProps> = ({ onClick, label = "Back" }) => (
	<StyledBack onClick={onClick}>
		<ArrowLeft size={14} color="#1e40af" />
		{label}
	</StyledBack>
);

export default BackButton;
