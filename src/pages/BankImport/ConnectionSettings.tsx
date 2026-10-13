import { useCallback, useEffect, useState } from "react";
import api from "@/utils/api";
import { UiButton } from "@/components/ui";
import AccountChoice from "./AccountChoice";
import LunchFlowSetup from "./LunchFlowSetup";
import type { BankAccount, BankConnection, BankProvider } from "./types";
import { providerLabel } from "./types";
type Link = { open: () => void; destroy: () => void };
type PlaidApi = {
	create: (options: {
		token: string;
		onSuccess: (
			token: string,
			metadata: { institution?: { name?: string } },
		) => void;
		onExit: () => void;
	}) => Link;
};
async function plaidApi(): Promise<PlaidApi> {
	const get = () => (window as Window & { Plaid?: PlaidApi }).Plaid;
	if (!get())
		await new Promise<void>((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
			script.onload = () => resolve();
			script.onerror = () => reject(new Error("Could not load Plaid Link"));
			document.head.appendChild(script);
		});
	const plaid = get();
	if (!plaid) throw new Error("Could not load Plaid Link");
	return plaid;
}
// eslint-disable-next-line max-lines-per-function -- Connection setup retains provider-specific sign calibration and account controls in one settings panel.
export default function ConnectionSettings({
	onChanged,
}: {
	onChanged: () => void;
}): JSX.Element {
	const [connections, setConnections] = useState<BankConnection[]>([]);
	const [accounts, setAccounts] = useState<BankAccount[]>([]);
	const [providers, setProviders] = useState<BankProvider[]>([]);
	const [setup, setSetup] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const refresh = useCallback(async () => {
		const response = await api.get<{
			connections: BankConnection[];
			providers: BankProvider[];
		}>("/bank-import/connections");
		setConnections(response.data.connections);
		setProviders(response.data.providers);
		const rows = await Promise.all(
			response.data.connections.map((c) =>
				api.get<{ accounts: BankAccount[] }>(
					`/bank-import/accounts?connectionId=${encodeURIComponent(c.id)}`,
				),
			),
		);
		setAccounts(rows.flatMap((r) => r.data.accounts));
	}, []);
	useEffect(() => {
		void refresh().catch(() => setError("Could not load connections."));
	}, [refresh]);
	async function run(action: () => Promise<void>) {
		setBusy(true);
		setError("");
		try {
			await action();
			await refresh();
			onChanged();
		} catch {
			setError("Could not update this connection. Please try again.");
		} finally {
			setBusy(false);
		}
	}
	async function connect(connectionId?: string) {
		await run(async () => {
			const plaid = await plaidApi();
			const response = await api.post<{ linkToken: string }>(
				`/bank-import/link-token${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ""}`,
			);
			const link = plaid.create({
				token: response.data.linkToken,
				onExit: () => link.destroy(),
				onSuccess: (publicToken, metadata) => {
					void run(async () => {
						await api.post(
							connectionId
								? "/bank-import/reconnected"
								: "/bank-import/exchange",
							connectionId
								? { connectionId }
								: {
										publicToken,
										institutionName:
											metadata.institution?.name ?? "Connected bank",
									},
						);
					}).finally(() => link.destroy());
				},
			});
			link.open();
		});
	}
	return (
		<div className="bank-settings bank-import-page">
			{error && <p role="alert">{error}</p>}
			{message && <p role="status">{message}</p>}
			<div className="bank-toolbar">
				{providers.some((p) => p.id === "lunch_flow") &&
					!connections.some((c) => c.provider === "lunch_flow") && (
						<UiButton onClick={() => setSetup("")}>Connect Lunch Flow</UiButton>
					)}
				{providers.some((p) => p.id === "plaid") && (
					<UiButton disabled={busy} onClick={() => void connect()}>
						Connect test bank
					</UiButton>
				)}
			</div>
			{setup !== null && (
				<LunchFlowSetup
					connectionId={setup || undefined}
					onCancel={() => setSetup(null)}
					onError={setError}
					onSaved={async () => {
						setSetup(null);
						await refresh();
						onChanged();
					}}
				/>
			)}
			{!connections.length && <p>No banks connected yet.</p>}
			{connections.map((connection) => (
				<section className="bank-connection" key={connection.id}>
					<h3>{providerLabel(connection.provider)}</h3>
					<small>
						{connection.status.replace(/_/g, " ")} ·{" "}
						{connection.lastSyncedAt
							? `Last fetched ${new Date(connection.lastSyncedAt).toLocaleString("en-GB")}`
							: "Not fetched yet"}
					</small>
					<div className="bank-toolbar">
						<UiButton
							disabled={busy}
							onClick={() =>
								void run(async () => {
									const response = await api.post<{
										skippedPendingCount?: number;
									}>(
										"/bank-import/sync",
										{ connectionId: connection.id },
										{ timeout: 180000 },
									);
									setMessage(
										response.data.skippedPendingCount
											? "Updated. Anonymous pending activity is visible; provisional choices stay private until posted confirmation."
											: "Bank activity updated.",
									);
								})
							}
						>
							{busy ? "Working…" : "Sync now"}
						</UiButton>
						{connection.provider === "lunch_flow" ? (
							<>
								<UiButton
									disabled={busy}
									onClick={() => setSetup(connection.id)}
								>
									Replace API key
								</UiButton>
								<a
									href="https://lunchflow.app"
									target="_blank"
									rel="noreferrer"
								>
									Manage in Lunch Flow ↗
								</a>
							</>
						) : (
							<UiButton
								disabled={busy}
								onClick={() => void connect(connection.id)}
							>
								Reconnect
							</UiButton>
						)}
						<UiButton
							disabled={busy}
							$tone="danger"
							onClick={() => {
								if (
									window.confirm(
										"Disconnect and delete private imports and provisional selections? Shared records remain.",
									)
								)
									void run(async () => {
										await api.post("/bank-import/disconnect", {
											connectionId: connection.id,
										});
									});
							}}
						>
							Disconnect
						</UiButton>
					</div>
					{accounts
						.filter((a) => a.connectionId === connection.id)
						.map((account) => (
							<AccountChoice
								key={account.id}
								account={account}
								lunchFlow={connection.provider === "lunch_flow"}
								disabled={busy}
								onError={setError}
								selectAccount={(_account, multiplier) =>
									run(async () => {
										await api.post(
											"/bank-import/accounts/select",
											{
												connectionId: connection.id,
												accountId: account.id,
												selected: !account.selected,
												...(multiplier ? { amountMultiplier: multiplier } : {}),
											},
											{ timeout: 180000 },
										);
									})
								}
							/>
						))}
				</section>
			))}
		</div>
	);
}
