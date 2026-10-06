import { useState } from "react";
import api from "@/utils/api";

type Props = {
	connectionId?: string;
	onSaved: () => Promise<void>;
	onCancel: () => void;
	onError: (message: string) => void;
};
export default function LunchFlowSetup({
	connectionId,
	onSaved,
	onCancel,
	onError,
}: Props): JSX.Element {
	const [key, setKey] = useState("");
	const [saving, setSaving] = useState(false);
	return (
		<form
			className="bank-setup-panel"
			onSubmit={(event) => {
				event.preventDefault();
				setSaving(true);
				onError("");
				void api
					.post(
						"/bank-import/lunch-flow/setup",
						{ apiKey: key, ...(connectionId ? { connectionId } : {}) },
						{ timeout: 150000 },
					)
					.then(async () => {
						setKey("");
						await onSaved();
					})
					.catch((error: { response?: { data?: { error?: string } } }) =>
						onError(
							error.response?.data?.error ?? "Could not connect Lunch Flow.",
						),
					)
					.finally(() => setSaving(false));
			}}
		>
			<h2>{connectionId ? "Replace Lunch Flow key" : "Connect Lunch Flow"}</h2>
			<p>
				Connect your bank in{" "}
				<a href="https://lunchflow.app" target="_blank" rel="noreferrer">
					Lunch Flow
				</a>
				, then create a Personal API destination and enable accounts in Account
				Access. For a UK bank choose UK Banks.
			</p>
			<p>
				This destination can contain accounts from several banks. Your key goes
				to this app's backend and is saved encrypted for your account.
			</p>
			<label>
				Personal API key{" "}
				<input
					type="password"
					autoComplete="off"
					value={key}
					onChange={(event) => setKey(event.target.value)}
					minLength={8}
					maxLength={4096}
					required
				/>
			</label>
			<div className="bank-connection-actions">
				<button type="submit" disabled={saving || key.trim().length < 8}>
					{saving
						? "Checking destination…"
						: connectionId
							? "Save replacement key"
							: "Save Lunch Flow connection"}
				</button>
				<button
					type="button"
					disabled={saving}
					onClick={() => {
						setKey("");
						onCancel();
					}}
				>
					Cancel
				</button>
			</div>
		</form>
	);
}
