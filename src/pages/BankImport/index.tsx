import { useEffect, useState } from "react";
import api from "@/utils/api";
import "./index.css";

type BankConnection = { id: string; institutionName: string; status: string; createdAt: string };
type BankAccount = { id: string; connectionId: string; name: string; mask: string | null; selected: boolean };
type BankTransaction = { id: string; connectionId: string; accountId: string; accountName: string; date: string; name: string; merchantName: string | null; amountMinor: number; currency: string; linkedTransactionId: string | null };
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
	const [accounts, setAccounts] = useState<BankAccount[]>([]);
	const [transactions, setTransactions] = useState<BankTransaction[]>([]);
	const [loading, setLoading] = useState(true);
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");

	async function refresh(): Promise<void> {
		try {
			const response = await api.get<{ connections: BankConnection[] }>("/bank-import/connections");
			setConnections(response.data.connections);
			const [accountResponses, inbox] = await Promise.all([
				Promise.all(response.data.connections.map(connection => api.get<{ accounts: BankAccount[] }>(`/bank-import/accounts?connectionId=${encodeURIComponent(connection.id)}`))),
				api.get<{ transactions: BankTransaction[] }>("/bank-import/inbox"),
			]);
			setAccounts(accountResponses.flatMap(result => result.data.accounts));
			setTransactions(inbox.data.transactions);
			setError("");
		} catch {
			setError("Bank imports are unavailable. Ask the administrator to configure Plaid Sandbox.");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => { void refresh(); }, []);

	async function connect(connectionId?: string): Promise<void> {
		setConnecting(true);
		setError("");
		setMessage("");
		try {
			await loadPlaidScript();
			const suffix = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
			const { data } = await api.post<{ linkToken: string }>(`/bank-import/link-token${suffix}`);
			const plaid = (window as PlaidWindow).Plaid;
			if (!plaid) throw new Error("Plaid Link did not load");
			const link = plaid.create({
				token: data.linkToken,
				onSuccess: (publicToken, metadata) => {
					void (async () => {
						try {
							if (connectionId) await api.post("/bank-import/reconnected", { connectionId });
							else await api.post("/bank-import/exchange", { publicToken, institutionName: metadata.institution?.name ?? "Connected bank" });
							setMessage(connectionId ? "Bank reconnected." : "Bank connected. You can now review posted bank activity.");
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

	async function sync(connectionId: string): Promise<void> {
		setError("");
		try {
			await api.post("/bank-import/sync", { connectionId });
			await refresh();
			setMessage("Bank activity is up to date.");
		} catch { setError("Could not sync this bank. Try reconnecting if it needs attention."); }
	}

	async function selectAccount(account: BankAccount): Promise<void> {
		try {
			await api.post("/bank-import/accounts/select", { connectionId: account.connectionId, accountId: account.id, selected: !account.selected });
			await refresh();
		} catch { setError("Could not update account selection."); }
	}

	async function disconnect(connectionId: string): Promise<void> {
		if (!window.confirm("Disconnect this bank? Its imported activity will remain visible, but it will stop syncing.")) return;
		try {
			await api.post("/bank-import/disconnect", { connectionId });
			await refresh();
			setMessage("Bank disconnected.");
		} catch { setError("Could not disconnect this bank."); }
	}

	return <main className="bank-import-page">
		<h1>Bank imports</h1>
		<p>Connect a test bank through Plaid Sandbox. Imported activity stays in a review inbox until you choose what to do with it.</p>
		<button type="button" onClick={() => void connect()} disabled={connecting || loading}>Connect test bank</button>
		{error && <p role="alert" className="bank-import-error">{error}</p>}
		{message && <p role="status">{message}</p>}
		<h2>Connections</h2>
		{loading ? <p>Loading connections…</p> : connections.length === 0 ? <p>No banks connected yet.</p> :
			<ul>{connections.map(connection => <li key={connection.id} className="bank-connection">
				<div><strong>{connection.institutionName}</strong> <span>{connection.status.replace("_", " ")}</span></div>
				{connection.status !== "disconnected" && <div className="bank-connection-actions">
					<button type="button" onClick={() => void sync(connection.id)}>Sync now</button>
					{connection.status === "needs_attention" && <button type="button" onClick={() => void connect(connection.id)}>Reconnect</button>}
					<button type="button" onClick={() => void disconnect(connection.id)}>Disconnect</button>
				</div>}
				{accounts.filter(account => account.connectionId === connection.id).map(account => <label key={account.id}>
					<input type="checkbox" checked={account.selected} onChange={() => void selectAccount(account)} />
					{account.name}{account.mask ? ` •••• ${account.mask}` : ""}
				</label>)}
			</li>)}</ul>}
		<h2>Review inbox</h2>
		<p>Posted activity from selected accounts appears below. Connecting or syncing does not create expenses or change balances.</p>
		{transactions.length === 0 ? <p>No posted bank activity yet.</p> : <ul className="bank-activity-list">
			{transactions.map(transaction => <li key={transaction.id}>
				<div><strong>{transaction.merchantName ?? transaction.name}</strong><small>{transaction.date} · {transaction.accountName}</small></div>
				<span>{new Intl.NumberFormat("en-GB", { style: "currency", currency: transaction.currency }).format(transaction.amountMinor / (transaction.currency === "JPY" ? 1 : 100))}</span>
			</li>)}
		</ul>}
	</main>;
}
