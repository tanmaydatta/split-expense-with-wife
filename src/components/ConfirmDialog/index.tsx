import { Button } from "@/components/Button";
import React from "react";
import styled from "styled-components";

type ConfirmDialogProps = {
	open: boolean;
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void;
	onCancel: () => void;
};

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
`;

const Dialog = styled.div`
  background: #ffffff;
  border-radius: 10px;
  width: min(420px, 92vw);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  overflow: hidden;
`;

const Header = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid #e5e7eb;
  font-weight: 600;
`;

const Body = styled.div`
  padding: 16px;
  color: #374151;
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px 16px 16px;
`;

const SecondaryButton = styled(Button)`
  background: #ffffff;
  color: #374151;
  border: 1px solid #e5e7eb;
  min-height: 36px;
`;

const DangerButton = styled(Button)`
  background: #dc2626;
  color: #ffffff;
  border: 1px solid #dc2626;
  min-height: 36px;
`;

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	open,
	title = "Confirm",
	message,
	confirmText = "Delete",
	cancelText = "Cancel",
	onCancel,
	onConfirm,
}) => {
	if (!open) return null;
	return (
		<Overlay role="dialog" aria-modal="true" aria-label={title}>
			<Dialog>
				<Header>{title}</Header>
				<Body>{message}</Body>
				<Footer>
					<SecondaryButton onClick={onCancel}>{cancelText}</SecondaryButton>
					<DangerButton onClick={onConfirm}>{confirmText}</DangerButton>
				</Footer>
			</Dialog>
		</Overlay>
	);
};

export default ConfirmDialog;
