import { UiButton } from "@/components/ui";
import { ArrowLeft } from "@/components/Icons";
import React from "react";
import styled from "styled-components";

const StyledBack = styled(UiButton)`
  color: var(--ui-accent);
`;

type BackButtonProps = {
	onClick: () => void;
	label?: string;
};

const BackButton: React.FC<BackButtonProps> = ({ onClick, label = "Back" }) => (
	<StyledBack type="button" onClick={onClick}>
		<ArrowLeft size={14} color="currentColor" />
		{label}
	</StyledBack>
);

export default BackButton;
