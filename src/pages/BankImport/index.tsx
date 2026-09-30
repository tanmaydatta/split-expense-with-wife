import { useCallback, useEffect, useState } from "react";
import api from "@/utils/api";
import { useSelector } from "react-redux";
import type { ReduxState } from "split-expense-shared-types";
import "./index.css";

type BankConnection = { id: string; institutionName: string; status: string; createdAt: string };
type BankAccount = { id: string; connectionId: string; name: string; mask: string | null; selected: boolean };
type BankTransaction = { id: string; connectionId: string; accountId: string; accountName: string; date: string; name: string; merchantName: string | null; amountMinor: number; currency: string; linkedTransactionId: string | null; reviewStatus: string };
type Candidate = { id: string; description: string; amount: number; currency: string; date: string; scheduled: boolean; suggested: boolean };
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
	const data = useSelector((state: ReduxState) => state.value);
	const [connections, setConnections] = useState<BankConnection[]>([]);
	const [accounts, setAccounts] = useState<BankAccount[]>([]);
	const [transactions, setTransactions] = useState<BankTransaction[]>([]);
	const [loading, setLoading] = useState(true);
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [reviewed, setReviewed] = useState(false);
	const [active, setActive] = useState<BankTransaction | null>(null);
	const [action, setAction] = useState<"match" | "create" | null>(null);
	const [candidates, setCandidates] = useState<Candidate[]>([]);
	const [candidateId, setCandidateId] = useState("");
	const [description, setDescription] = useState("");
	const [shares, setShares] = useState<Record<string, number>>({});
	const [allowPossibleDuplicate, setAllowPossibleDuplicate] = useState(false);
	const [duplicateWarning, setDuplicateWarning] = useState(false);
	const [saving, setSaving] = useState(false);

	const members = Object.values(data?.extra?.usersById ?? {}) as Array<{ id: string; firstName: string }>;
	const shareTotal = Object.values(shares).reduce((sum, value) => sum + value, 0);
	const amountText = (transaction: BankTransaction) => new Intl.NumberFormat("en-GB", { style: "currency", currency: transaction.currency })
		.format(transaction.amountMinor / (transaction.currency === "JPY" ? 1 : 100));

	const refresh = useCallback(async (): Promise<void> => {
		try {
			const response = await api.get<{ connections: BankConnection[] }>("/bank-import/connections");
			setConnections(response.data.connections);
			const [accountResponses, inbox] = await Promise.all([
				Promise.all(response.data.connections.map(connection => api.get<{ accounts: BankAccount[] }>(`/bank-import/accounts?connectionId=${encodeURIComponent(connection.id)}`))),
				api.get<{ transactions: BankTransaction[] }>(`/bank-import/inbox${reviewed ? "?status=reviewed" : ""}`),
			]);
			setAccounts(accountResponses.flatMap(result => result.data.accounts));
			setTransactions(inbox.data.transactions);
			setError("");
		} catch {
			setError("Bank imports are unavailable. Ask the administrator to configure Plaid Sandbox.");
		} finally {
			setLoading(false);
		}
	}, [reviewed]);

	useEffect(() => { void refresh(); }, [refresh]);

	async function openReview(transaction: BankTransaction, nextAction: "match" | "create"): Promise<void> {
		setActive(transaction);
		setAction(nextAction);
		setError("");
		setAllowPossibleDuplicate(false);
		setDuplicateWarning(false);
		if (nextAction === "match") {
			try {
				const { data } = await api.get<{ candidates: Candidate[] }>(`/bank-import/candidates?bankTransactionId=${encodeURIComponent(transaction.id)}`);
				setCandidates(data.candidates);
				setCandidateId(data.candidates.find(candidate => candidate.suggested)?.id ?? "");
			} catch { setError("Could not load matching expenses."); }
		} else {
			setDescription(transaction.merchantName ?? transaction.name);
			const defaults = data?.extra?.group?.metadata?.defaultShare ?? {};
			const equal = members.length ? Math.floor(10000 / members.length) / 100 : 0;
			const nextShares = Object.fromEntries(members.map((member, index) => [member.id,
				Object.keys(defaults).length ? (defaults[member.id] ?? 0) : index === members.length - 1 ? 100 - equal * (members.length - 1) : equal]));
			setShares(nextShares);
		}
	}

	async function completeReview(kind: "match" | "create" | "ignore" | "restore", transaction: BankTransaction): Promise<void> {
		setSaving(true);
		setError("");
		try {
			if (kind === "match") await api.post("/bank-import/match", { bankTransactionId: transaction.id, transactionId: candidateId });
			if (kind === "create") await api.post("/bank-import/create-expense", { bankTransactionId: transaction.id, description, splitPctShares: shares, allowPossibleDuplicate });
			if (kind === "ignore") await api.post("/bank-import/ignore", { bankTransactionId: transaction.id });
			if (kind === "restore") await api.post("/bank-import/restore", { bankTransactionId: transaction.id });
			setMessage(kind === "create" ? "Shared expense created and linked." : kind === "match" ? "Existing expense matched." : kind === "ignore" ? "Bank activity ignored." : "Bank activity returned to the inbox.");
			setActive(null);
			setAction(null);
			await refresh();
		} catch (caught) {
			const apiError = caught as { response?: { status?: number; data?: { error?: string } } };
			const detail = apiError.response?.data?.error ?? "Could not review bank activity.";
			setDuplicateWarning(kind === "create" && apiError.response?.status === 409 && detail.includes("scheduled expense"));
			setError(detail);
		} finally { setSaving(false); }
	}

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
						setMessage(connectionId ? "Bank reconnected." : "Bank connected. Select an account to import its posted activity.");
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
		if (!window.confirm("Disconnect this bank and delete its imported activity? Confirmed shared expenses will remain.")) return;
		try {
			await api.post("/bank-import/disconnect", { connectionId });
			await refresh();
			setMessage("Bank disconnected and imported activity deleted.");
		} catch { setError("Could not disconnect this bank."); }
	}

	return <BankImportView {...{ connections, accounts, transactions, loading, connecting, error, message, reviewed,
    active, action, candidates, candidateId, description, shares, allowPossibleDuplicate, duplicateWarning, saving, members, shareTotal,
    amountText, connect, sync, selectAccount, disconnect, openReview, completeReview, setReviewed, setActive,
    setCandidateId, setDescription, setShares, setAllowPossibleDuplicate }} />;
}

type BankImportViewProps = {
  connections: BankConnection[]; accounts: BankAccount[]; transactions: BankTransaction[];
  loading: boolean; connecting: boolean; error: string; message: string; reviewed: boolean;
  active: BankTransaction | null; action: "match" | "create" | null; candidates: Candidate[];
  candidateId: string; description: string; shares: Record<string, number>; allowPossibleDuplicate: boolean; duplicateWarning: boolean;
  saving: boolean; members: Array<{ id: string; firstName: string }>; shareTotal: number;
  amountText: (transaction: BankTransaction) => string;
  connect: (connectionId?: string) => Promise<void>; sync: (connectionId: string) => Promise<void>;
  selectAccount: (account: BankAccount) => Promise<void>; disconnect: (connectionId: string) => Promise<void>;
  openReview: (transaction: BankTransaction, action: "match" | "create") => Promise<void>;
  completeReview: (kind: "match" | "create" | "ignore" | "restore", transaction: BankTransaction) => Promise<void>;
  setReviewed: (value: boolean) => void; setActive: (value: BankTransaction | null) => void;
  setCandidateId: (value: string) => void; setDescription: (value: string) => void;
  setShares: (value: Record<string, number>) => void; setAllowPossibleDuplicate: (value: boolean) => void;
};

function BankImportView({ connections, accounts, transactions, loading, connecting, error, message, reviewed,
  active, action, candidates, candidateId, description, shares, allowPossibleDuplicate, duplicateWarning, saving, members, shareTotal,
  amountText, connect, sync, selectAccount, disconnect, openReview, completeReview, setReviewed, setActive,
  setCandidateId, setDescription, setShares, setAllowPossibleDuplicate }: BankImportViewProps): JSX.Element {
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
		<h2>Bank activity</h2>
		<p>Select an account to import its posted activity. Deselecting deletes that account's imported activity. Connecting or syncing does not create expenses or change balances.</p>
		<div className="bank-review-tabs"><button type="button" aria-pressed={!reviewed} onClick={() => setReviewed(false)}>To review</button>
			<button type="button" aria-pressed={reviewed} onClick={() => setReviewed(true)}>Reviewed</button></div>
		{transactions.length === 0 ? <p>No posted bank activity yet.</p> : <ul className="bank-activity-list">
			{transactions.map(transaction => <li key={transaction.id}>
				<div><strong>{transaction.merchantName ?? transaction.name}</strong><small>{transaction.date} · {transaction.accountName}</small></div>
				<span>{amountText(transaction)}</span>
				{reviewed ? <div className="bank-review-actions"><span>{transaction.reviewStatus}</span>
					{transaction.reviewStatus === "ignored" && <button type="button" onClick={() => void completeReview("restore", transaction)}>Restore</button>}</div> :
					<div className="bank-review-actions">
						{transaction.amountMinor > 0 && <><button type="button" onClick={() => void openReview(transaction, "match")}>Match existing</button>
							<button type="button" onClick={() => void openReview(transaction, "create")}>Add shared expense</button></>}
						<button type="button" onClick={() => void completeReview("ignore", transaction)}>Ignore</button>
					</div>}
				{active?.id === transaction.id && action === "match" && <div className="bank-review-panel">
					<h3>Match an existing expense</h3><p>Choose a shared expense for {amountText(transaction)}. Suggestions still require your confirmation.</p>
					{candidates.length ? <><select aria-label="Existing expense" value={candidateId} onChange={event => setCandidateId(event.target.value)}>
						<option value="">Choose an expense</option>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>
							{candidate.suggested ? "Suggested · " : ""}{candidate.description} · {candidate.date.slice(0, 10)}{candidate.scheduled ? " · scheduled" : ""}
						</option>)}</select><button type="button" disabled={!candidateId || saving} onClick={() => void completeReview("match", transaction)}>Confirm match</button></> :
						<p>No same-amount expenses found. You can add a shared expense instead.</p>}
					<button type="button" onClick={() => setActive(null)}>Cancel</button>
				</div>}
				{active?.id === transaction.id && action === "create" && <form className="bank-review-panel" onSubmit={event => { event.preventDefault(); void completeReview("create", transaction); }}>
					<h3>Add shared expense</h3><p>{amountText(transaction)} paid by you. This will change shared balances only after confirmation.</p>
					<label>Description <input value={description} onChange={event => setDescription(event.target.value)} maxLength={255} required /></label>
					{members.map(member => <label key={member.id}>{member.firstName} share (%)
						<input type="number" min="0" max="100" step="0.01" value={shares[member.id] ?? 0}
							onChange={event => setShares({ ...shares, [member.id]: Number(event.target.value) })} /></label>)}
					<p>Shares total {shareTotal.toFixed(2)}%.</p>
					{duplicateWarning && <><p id="bank-duplicate-warning">A scheduled expense may already cover this charge. Match it if it is the same purchase. For a separate purchase, confirm below.</p><label><input type="checkbox" checked={allowPossibleDuplicate} aria-describedby="bank-duplicate-warning" onChange={event => setAllowPossibleDuplicate(event.target.checked)} /> Add anyway if this is a separate purchase</label></>}
					<button type="submit" disabled={saving || Math.abs(shareTotal - 100) > 0.001}>Confirm shared expense</button>
					<button type="button" onClick={() => setActive(null)}>Cancel</button>
				</form>}
			</li>)}
		</ul>}
	</main>;
}
