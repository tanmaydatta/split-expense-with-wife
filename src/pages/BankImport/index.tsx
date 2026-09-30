import { useEffect, useState } from "react";
import api from "@/utils/api";
import "./index.css";

type BankConnection = { id: string; institutionName: string; status: string; createdAt: string };
type PlaidLink = { open: () => void; destroy: () => void };
type PlaidWindow = Window & { Plaid?: { create: (options: {
	token: string;
	onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
	onExit: (error: unknown) => void;
}) => PlaidLink } };

let scriptPromise: Promise<void> | null = null;
function loadPlaidScript(): Promise<void> {
	if ((window as PlaidWindow).Plaid) return Promise.resolve();
	if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => { scriptPromise = null; reject(new Error("Could not load Plaid Link")); };
		document.head.appendChild(script);
	});
	return scriptPromise;
}

export default function BankImport(): JSX.Element {
	const [connections, setConnections] = useState<BankConnection[]>([]);
	const [loading, setLoading] = useState(true);
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");

	async function refresh(): Promise<void> {
		try {
			const response = await api.get<{ connections: BankConnection[] }>("/bank-import/connections");
			setConnections(response.data.connections);
			setError("");
		} catch {
			setError("Bank imports are unavailable. Ask the administrator to configure Plaid Sandbox.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => { void refresh(); }, []);

	async function connect(): Promise<void> {
		setConnecting(true);
		setError("");
		setMessage("");
		try {
			await loadPlaidScript();
			const { data } = await api.post<{ linkToken: string }>("/bank-import/link-token");
			const plaid = (window as PlaidWindow).Plaid;
			if (!plaid) throw new Error("Plaid Link did not load");
			const link = plaid.create({
				token: data.linkToken,
				onSuccess: (publicToken, metadata) => {
					void (async () => {
						try {
							await api.post("/bank-import/exchange", { publicToken, institutionName: metadata.institution?.name ?? "Connected bank" });
							setMessage("Bank connected. Transaction review will appear here when the first sync completes.");
							await refresh();
						} catch {
							setError("The bank connected in Plaid, but we could not save it. Please try again.");
						} finally {
							setConnecting(false);
							link.destroy();
						}
					})();
				},
				onExit: () => { setConnecting(false); link.destroy(); },
			});
			link.open();
		} catch {
			setConnecting(false);
			setError("Could not open bank connection. Please try again.");
		}
	}

	return <main className="bank-import-page">
		<h1>Bank imports</h1>
		<p>Connect a test bank through Plaid Sandbox. Imported activity stays in a review inbox until you choose what to do with it.</p>
		<button type="button" onClick={() => void connect()} disabled={connecting || loading}>Connect test bank</button>
		{error && <p role="alert" className="bank-import-error">{error}</p>}
		{message && <p role="status">{message}</p>}
		<h2>Connections</h2>
		{loading ? <p>Loading connections…</p> : connections.length === 0 ? <p>No banks connected yet.</p> :
			<ul>{connections.map(connection => <li key={connection.id}>
				<strong>{connection.institutionName}</strong> <span>{connection.status.replace("_", " ")}</span>
			</li>)}</ul>}
		<h2>Review inbox</h2>
		<p>Transactions will appear here after the first sync. Connecting a bank does not create expenses or change balances.</p>
	</main>;
}
