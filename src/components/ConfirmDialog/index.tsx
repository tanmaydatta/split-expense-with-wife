import * as AlertDialog from "@radix-ui/react-alert-dialog";
import React from "react";
import styled from "styled-components";
import { UiButton } from "@/components/ui";

type ConfirmDialogProps = {
	open: boolean;
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void;
	onCancel: () => void;
};

const Overlay = styled(AlertDialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 26, 45, 0.56);
`;

const Content = styled(AlertDialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 2001;
  width: min(440px, calc(100vw - 32px));
  transform: translate(-50%, -50%);
  padding: 24px;
  background: var(--ui-surface);
  color: var(--ui-text);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  box-shadow: 0 24px 70px rgba(11, 26, 52, 0.25);
`;

const Title = styled(AlertDialog.Title)`
  margin: 0 0 8px;
  color: var(--ui-text);
  font-size: 20px;
  font-weight: 700;
`;

const Description = styled(AlertDialog.Description)`
  margin: 0;
  color: var(--ui-text-muted);
  line-height: 1.5;
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 24px;
  @media (max-width: 480px) { flex-direction: column-reverse; }
`;

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	open,
	title = "Confirm",
	message,
	confirmText = "Delete",
	cancelText = "Cancel",
	onCancel,
	onConfirm,
}) => (
	<AlertDialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
		<AlertDialog.Portal>
			<Overlay />
			<Content>
				<Title>{title}</Title>
				<Description>{message}</Description>
				<Footer>
					<AlertDialog.Cancel asChild>
						<UiButton type="button" onClick={onCancel}>{cancelText}</UiButton>
					</AlertDialog.Cancel>
					<AlertDialog.Action asChild>
						<UiButton type="button" $tone="danger" onClick={onConfirm}>{confirmText}</UiButton>
					</AlertDialog.Action>
				</Footer>
			</Content>
		</AlertDialog.Portal>
	</AlertDialog.Root>
);

export default ConfirmDialog;
