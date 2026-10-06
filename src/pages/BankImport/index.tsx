import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type { ReduxState } from "split-expense-shared-types";
import api from "@/utils/api";
import "./index.css";

import AccountChoice from "./AccountChoice";
import LunchFlowSetup from "./LunchFlowSetup";
import type {
	BankAccount,
	BankConnection,
	BankProvider,
	BankTransaction,
	Candidate,
} from "./types";
import { bankAmount, providerLabel } from "./types";

type PlaidLink = { open: () => void; destroy: () => void };
type PlaidWindow = Window & {
	Plaid?: {
		create: (options: {
			token: string;
			onSuccess: (
				publicToken: string,
				metadata: { institution?: { name?: string } },
			) => void;
			onExit: (error: unknown) => void;
		}) => PlaidLink;
	};
};

let scriptPromise: Promise<void> | null = null;
function loadPlaidScript(): Promise<void> {
	if ((window as PlaidWindow).Plaid) return Promise.resolve();
	if (!scriptPromise)
		scriptPromise = new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
			script.async = true;
			script.onload = () => resolve();
			script.onerror = () => {
				scriptPromise = null;
				reject(new Error("Could not load Plaid Link"));
			};
			document.head.appendChild(script);
		});
	return scriptPromise;
}

// eslint-disable-next-line max-lines-per-function -- Existing page owns the review and connection state together.
export default function BankImport(): JSX.Element {
	const data = useSelector((state: ReduxState) => state.value);
	const [providers, setProviders] = useState<BankProvider[]>([]);
	const [showLunchFlowSetup, setShowLunchFlowSetup] = useState(false);
	const [lunchFlowConnectionId, setLunchFlowConnectionId] = useState<
		string | undefined
	>();
	const [busyConnectionId, setBusyConnectionId] = useState("");
	const [providerFilter, setProviderFilter] = useState("");
	const [accountFilter, setAccountFilter] = useState("");
	const [connectionFilter, setConnectionFilter] = useState("");
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

	const members = Object.values(data?.extra?.usersById ?? {}) as Array<{
		id: string;
		firstName: string;
	}>;
	const shareTotal = Object.values(shares).reduce(
		(sum, value) => sum + value,
		0,
	);
	const amountText = (transaction: BankTransaction) =>
		bankAmount(transaction.amountMinor, transaction.currency);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: reload owned connections, account choices and the filtered inbox together.
	const refresh = useCallback(async (): Promise<void> => {
		try {
			const response = await api.get<{
				connections: BankConnection[];
				providers?: BankProvider[];
			}>("/bank-import/connections");
			setConnections(response.data.connections);
			setProviders(response.data.providers ?? []);
			const [accountResponses, inbox] = await Promise.all([
				Promise.all(
					response.data.connections.map((connection) =>
						api.get<{ accounts: BankAccount[] }>(
							`/bank-import/accounts?connectionId=${encodeURIComponent(connection.id)}`,
						),
					),
				),
				api.get<{ transactions: BankTransaction[] }>(
					`/bank-import/inbox?${new URLSearchParams({ ...(reviewed ? { status: "reviewed" } : {}), ...(providerFilter ? { provider: providerFilter } : {}), ...(connectionFilter ? { connectionId: connectionFilter } : {}), ...(accountFilter ? { accountId: accountFilter } : {}) })}`,
				),
			]);
			setAccounts(accountResponses.flatMap((result) => result.data.accounts));
			setTransactions(inbox.data.transactions);
			setError("");
		} catch {
			setError(
				"Bank imports are unavailable. Ask the administrator to enable a bank provider.",
			);
		} finally {
			setLoading(false);
		}
	}, [reviewed, providerFilter, accountFilter, connectionFilter]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: initialize the existing match or expense confirmation flow.
	async function openReview(
		transaction: BankTransaction,
		nextAction: "match" | "create",
	): Promise<void> {
		setActive(transaction);
		setAction(nextAction);
		setError("");
		setAllowPossibleDuplicate(false);
		setDuplicateWarning(false);
		if (nextAction === "match") {
			try {
				const { data } = await api.get<{ candidates: Candidate[] }>(
					`/bank-import/candidates?bankTransactionId=${encodeURIComponent(transaction.id)}`,
				);
				setCandidates(data.candidates);
				setCandidateId(
					data.candidates.find((candidate) => candidate.suggested)?.id ?? "",
				);
			} catch {
				setError("Could not load matching expenses.");
			}
		} else {
			setDescription(transaction.merchantName ?? transaction.name);
			const defaults = data?.extra?.group?.metadata?.defaultShare ?? {};
			const equal = members.length
				? Math.floor(10000 / members.length) / 100
				: 0;
			const nextShares = Object.fromEntries(
				members.map((member, index) => [
					member.id,
					Object.keys(defaults).length
						? (defaults[member.id] ?? 0)
						: index === members.length - 1
							? 100 - equal * (members.length - 1)
							: equal,
				]),
			);
			setShares(nextShares);
		}
	}

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: existing review actions share error, duplicate-warning and refresh handling.
	async function completeReview(
		kind: "match" | "create" | "ignore" | "restore",
		transaction: BankTransaction,
	): Promise<void> {
		setSaving(true);
		setError("");
		try {
			if (kind === "match")
				await api.post("/bank-import/match", {
					bankTransactionId: transaction.id,
					sourceVersion: transaction.rowVersion,
					transactionId: candidateId,
				});
			if (kind === "create")
				await api.post("/bank-import/create-expense", {
					bankTransactionId: transaction.id,
					sourceVersion: transaction.rowVersion,
					description,
					splitPctShares: shares,
					allowPossibleDuplicate,
				});
			if (kind === "ignore")
				await api.post("/bank-import/ignore", {
					bankTransactionId: transaction.id,
					sourceVersion: transaction.rowVersion,
				});
			if (kind === "restore")
				await api.post("/bank-import/restore", {
					bankTransactionId: transaction.id,
					sourceVersion: transaction.rowVersion,
				});
			setMessage(
				kind === "create"
					? "Shared expense created and linked."
					: kind === "match"
						? "Existing expense matched."
						: kind === "ignore"
							? "Bank activity ignored."
							: "Bank activity returned to the inbox.",
			);
			setActive(null);
			setAction(null);
			await refresh();
		} catch (caught) {
			const apiError = caught as {
				response?: { status?: number; data?: { error?: string } };
			};
			const detail =
				apiError.response?.data?.error ?? "Could not review bank activity.";
			setDuplicateWarning(
				kind === "create" &&
					apiError.response?.status === 409 &&
					detail.includes("scheduled expense"),
			);
			setError(detail);
		} finally {
			setSaving(false);
		}
	}

	async function connect(connectionId?: string): Promise<void> {
		setConnecting(true);
		setError("");
		setMessage("");
		try {
			await loadPlaidScript();
			const suffix = connectionId
				? `?connectionId=${encodeURIComponent(connectionId)}`
				: "";
			const { data } = await api.post<{ linkToken: string }>(
				`/bank-import/link-token${suffix}`,
			);
			const plaid = (window as PlaidWindow).Plaid;
			if (!plaid) throw new Error("Plaid Link did not load");
			const link = plaid.create({
				token: data.linkToken,
				onSuccess: (publicToken, metadata) => {
					// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: existing Plaid success callback saves a new connection or completes reconnection.
					void (async () => {
						try {
							if (connectionId)
								await api.post("/bank-import/reconnected", { connectionId });
							else
								await api.post("/bank-import/exchange", {
									publicToken,
									institutionName:
										metadata.institution?.name ?? "Connected bank",
								});
							setMessage(
								connectionId
									? "Bank reconnected."
									: "Bank connected. Select an account to import its posted activity.",
							);
							await refresh();
						} catch {
							setError(
								"The bank connected in Plaid, but we could not save it. Please try again.",
							);
						} finally {
							setConnecting(false);
							link.destroy();
						}
					})();
				},
				onExit: () => {
					setConnecting(false);
					link.destroy();
				},
			});
			link.open();
		} catch {
			setConnecting(false);
			setError("Could not open bank connection. Please try again.");
		}
	}

	async function sync(connectionId: string): Promise<void> {
		setBusyConnectionId(connectionId);
		setError("");
		try {
			await api.post(
				"/bank-import/sync",
				{ connectionId },
				{ timeout: 180000 },
			);
			await refresh();
			setMessage("Bank activity is up to date.");
		} catch {
			setError(
				"Could not sync this bank. Try reconnecting if it needs attention.",
			);
		} finally {
			setBusyConnectionId("");
		}
	}

	async function selectAccount(
		account: BankAccount,
		multiplier?: number,
	): Promise<void> {
		setBusyConnectionId(account.connectionId);
		try {
			await api.post(
				"/bank-import/accounts/select",
				{
					connectionId: account.connectionId,
					accountId: account.id,
					selected: !account.selected,
					...(multiplier ? { amountMultiplier: multiplier } : {}),
				},
				{ timeout: 180000 },
			);
			await refresh();
		} catch {
			setError("Could not update account selection.");
		} finally {
			setBusyConnectionId("");
		}
	}

	async function disconnect(connectionId: string): Promise<void> {
		const isLunchFlow =
			connections.find((connection) => connection.id === connectionId)
				?.provider === "lunch_flow";
		if (
			!window.confirm(
				`Disconnect and delete this app's private imported activity? Confirmed shared expenses remain.${isLunchFlow ? " Revoke upstream access separately in the Lunch Flow dashboard." : ""}`,
			)
		)
			return;
		setBusyConnectionId(connectionId);
		try {
			await api.post("/bank-import/disconnect", { connectionId });
			await refresh();
			setMessage("Bank disconnected and imported activity deleted.");
		} catch {
			setError("Could not disconnect this bank.");
		} finally {
			setBusyConnectionId("");
		}
	}

	async function savedLunchFlow(): Promise<void> {
		setShowLunchFlowSetup(false);
		setLunchFlowConnectionId(undefined);
		setMessage(
			"Lunch Flow connected. Preview a known purchase and verify signs before selecting accounts.",
		);
		await refresh();
	}
	function setupLunchFlow(connectionId?: string): void {
		setLunchFlowConnectionId(connectionId);
		setShowLunchFlowSetup(true);
		setError("");
	}
	const visibleTransactions = transactions.filter(
		(transaction) =>
			(!providerFilter ||
				(transaction.provider ?? "plaid") === providerFilter) &&
			(!accountFilter || transaction.accountId === accountFilter) &&
			(!connectionFilter || transaction.connectionId === connectionFilter),
	);
	return (
		<BankImportView
			{...{
				providers,
				showLunchFlowSetup,
				lunchFlowConnectionId,
				busyConnectionId,
				providerFilter,
				accountFilter,
				connectionFilter,
				setProviderFilter,
				setAccountFilter,
				setConnectionFilter,
				savedLunchFlow,
				setupLunchFlow,
				setShowLunchFlowSetup,
				setError,
				connections,
				accounts,
				transactions: visibleTransactions,
				loading,
				connecting,
				error,
				message,
				reviewed,
				active,
				action,
				candidates,
				candidateId,
				description,
				shares,
				allowPossibleDuplicate,
				duplicateWarning,
				saving,
				members,
				shareTotal,
				amountText,
				connect,
				sync,
				selectAccount,
				disconnect,
				openReview,
				completeReview,
				setReviewed,
				setActive,
				setCandidateId,
				setDescription,
				setShares,
				setAllowPossibleDuplicate,
			}}
		/>
	);
}

type BankImportViewProps = {
	providers: BankProvider[];
	showLunchFlowSetup: boolean;
	lunchFlowConnectionId?: string;
	busyConnectionId: string;
	providerFilter: string;
	accountFilter: string;
	connectionFilter: string;
	setProviderFilter: (value: string) => void;
	setAccountFilter: (value: string) => void;
	setConnectionFilter: (value: string) => void;
	savedLunchFlow: () => Promise<void>;
	setupLunchFlow: (connectionId?: string) => void;
	setShowLunchFlowSetup: (value: boolean) => void;
	setError: (value: string) => void;
	connections: BankConnection[];
	accounts: BankAccount[];
	transactions: BankTransaction[];
	loading: boolean;
	connecting: boolean;
	error: string;
	message: string;
	reviewed: boolean;
	active: BankTransaction | null;
	action: "match" | "create" | null;
	candidates: Candidate[];
	candidateId: string;
	description: string;
	shares: Record<string, number>;
	allowPossibleDuplicate: boolean;
	duplicateWarning: boolean;
	saving: boolean;
	members: Array<{ id: string; firstName: string }>;
	shareTotal: number;
	amountText: (transaction: BankTransaction) => string;
	connect: (connectionId?: string) => Promise<void>;
	sync: (connectionId: string) => Promise<void>;
	selectAccount: (account: BankAccount, multiplier?: number) => Promise<void>;
	disconnect: (connectionId: string) => Promise<void>;
	openReview: (
		transaction: BankTransaction,
		action: "match" | "create",
	) => Promise<void>;
	completeReview: (
		kind: "match" | "create" | "ignore" | "restore",
		transaction: BankTransaction,
	) => Promise<void>;
	setReviewed: (value: boolean) => void;
	setActive: (value: BankTransaction | null) => void;
	setCandidateId: (value: string) => void;
	setDescription: (value: string) => void;
	setShares: (value: Record<string, number>) => void;
	setAllowPossibleDuplicate: (value: boolean) => void;
};

// eslint-disable-next-line max-lines-per-function -- Declarative page sections include the existing explicit review forms.
function BankImportView({
	providers,
	showLunchFlowSetup,
	lunchFlowConnectionId,
	busyConnectionId,
	providerFilter,
	accountFilter,
	connectionFilter,
	setProviderFilter,
	setAccountFilter,
	setConnectionFilter,
	savedLunchFlow,
	setupLunchFlow,
	setShowLunchFlowSetup,
	setError,
	connections,
	accounts,
	transactions,
	loading,
	connecting,
	error,
	message,
	reviewed,
	active,
	action,
	candidates,
	candidateId,
	description,
	shares,
	allowPossibleDuplicate,
	duplicateWarning,
	saving,
	members,
	shareTotal,
	amountText,
	connect,
	sync,
	selectAccount,
	disconnect,
	openReview,
	completeReview,
	setReviewed,
	setActive,
	setCandidateId,
	setDescription,
	setShares,
	setAllowPossibleDuplicate,
}: BankImportViewProps): JSX.Element {
	return (
		<main className="bank-import-page">
			<h1>Bank imports</h1>
			<p>
				Connect your personal bank feed. Imported activity is private to you
				until you confirm a shared expense or match an existing one.
			</p>
			<div className="bank-connection-actions">
				{providers.some((provider) => provider.id === "plaid") && (
					<button
						type="button"
						onClick={() => void connect()}
						disabled={connecting || loading}
					>
						Connect test bank
					</button>
				)}
				{providers.some((provider) => provider.id === "lunch_flow") &&
					!connections.some(
						(connection) => connection.provider === "lunch_flow",
					) && (
						<button
							type="button"
							onClick={() => setupLunchFlow()}
							disabled={loading}
						>
							Connect Lunch Flow
						</button>
					)}
			</div>
			{showLunchFlowSetup && (
				<LunchFlowSetup
					connectionId={lunchFlowConnectionId}
					onSaved={savedLunchFlow}
					onCancel={() => setShowLunchFlowSetup(false)}
					onError={setError}
				/>
			)}
			{error && (
				<p role="alert" className="bank-import-error">
					{error}
				</p>
			)}
			{message && <output>{message}</output>}
			<h2>Connections</h2>
			{loading ? (
				<p>Loading connections…</p>
			) : connections.length === 0 ? (
				<p>No banks connected yet.</p>
			) : (
				<ul>
					{connections.map(
						// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: connection card reflects provider-specific capabilities, status and account choices.
						(connection) => (
							<li key={connection.id} className="bank-connection">
								<div>
									<strong>
										{connection.provider === "lunch_flow"
											? "Lunch Flow"
											: connection.institutionName}
									</strong>{" "}
									<span className="bank-provider-label">
										{providerLabel(connection.provider)}
									</span>{" "}
									<span>{connection.status.replace(/_/g, " ")}</span>
								</div>
								<small>
									{connection.lastSyncedAt
										? `Last fetched ${new Date(connection.lastSyncedAt).toLocaleString("en-GB")}`
										: "Not fetched yet"}
									{connection.lastError
										? ` · ${connection.lastError.replace(/_/g, " ")}`
										: ""}
								</small>
								{connection.status !== "disconnected" && (
									<div className="bank-connection-actions">
										<button
											type="button"
											disabled={!!busyConnectionId}
											onClick={() => void sync(connection.id)}
										>
											{busyConnectionId === connection.id
												? "Working…"
												: "Sync now"}
										</button>
										{connection.provider === "lunch_flow" ? (
											<>
												<a
													href="https://lunchflow.app"
													target="_blank"
													rel="noreferrer"
												>
													Manage or renew in Lunch Flow
												</a>
												<button
													type="button"
													disabled={!!busyConnectionId}
													onClick={() => setupLunchFlow(connection.id)}
												>
													Replace API key
												</button>
											</>
										) : (
											connection.status === "needs_attention" && (
												<button
													type="button"
													disabled={!!busyConnectionId}
													onClick={() => void connect(connection.id)}
												>
													Reconnect
												</button>
											)
										)}
										<button
											type="button"
											disabled={!!busyConnectionId}
											onClick={() => void disconnect(connection.id)}
										>
											Disconnect
										</button>
									</div>
								)}
								{connection.provider === "lunch_flow" && (
									<p className="bank-provider-note">
										Sync fetches Lunch Flow's latest cached data. Banks usually
										update daily. Disconnect removes this app's key and imports;
										revoke upstream access in Lunch Flow separately.
									</p>
								)}
								{accounts
									.filter((account) => account.connectionId === connection.id)
									.map((account) => (
										<AccountChoice
											key={account.id}
											account={account}
											lunchFlow={connection.provider === "lunch_flow"}
											disabled={!!busyConnectionId}
											selectAccount={selectAccount}
											onError={setError}
										/>
									))}
							</li>
						),
					)}
					{/* eslint-enable max-lines-per-function */}
				</ul>
			)}
			<h2>Bank activity</h2>
			<p>
				Select an account to import its posted activity. Deselecting deletes
				that account's imported activity. Connecting or syncing does not create
				expenses or change balances.
			</p>
			<div className="bank-inbox-filters">
				<label>
					Provider
					<select
						value={providerFilter}
						onChange={(event) => {
							setProviderFilter(event.target.value);
							setConnectionFilter("");
							setAccountFilter("");
						}}
					>
						<option value="">All providers</option>
						{providers.map((provider) => (
							<option key={provider.id} value={provider.id}>
								{provider.label}
							</option>
						))}
					</select>
				</label>
				<label>
					Connection
					<select
						value={connectionFilter}
						onChange={(event) => {
							setConnectionFilter(event.target.value);
							setAccountFilter("");
						}}
					>
						<option value="">All connections</option>
						{connections
							.filter(
								(connection) =>
									!providerFilter ||
									(connection.provider ?? "plaid") === providerFilter,
							)
							.map((connection) => (
								<option key={connection.id} value={connection.id}>
									{connection.provider === "lunch_flow"
										? "Lunch Flow destination"
										: connection.institutionName}
								</option>
							))}
					</select>
				</label>
				<label>
					Account
					<select
						value={accountFilter}
						onChange={(event) => setAccountFilter(event.target.value)}
					>
						<option value="">All accounts</option>
						{accounts
							.filter(
								(account) =>
									!connectionFilter ||
									account.connectionId === connectionFilter,
							)
							.filter(
								(account) =>
									!providerFilter ||
									(connections.find(
										(connection) => connection.id === account.connectionId,
									)?.provider ?? "plaid") === providerFilter,
							)
							.map((account) => (
								<option key={account.id} value={account.id}>
									{account.institutionName
										? `${account.institutionName} · `
										: ""}
									{account.name}
								</option>
							))}
					</select>
				</label>
			</div>
			<div className="bank-review-tabs">
				<button
					type="button"
					aria-pressed={!reviewed}
					onClick={() => setReviewed(false)}
				>
					To review
				</button>
				<button
					type="button"
					aria-pressed={reviewed}
					onClick={() => setReviewed(true)}
				>
					Reviewed
				</button>
			</div>
			{transactions.length === 0 ? (
				<p>No posted bank activity yet.</p>
			) : (
				<ul className="bank-activity-list">
					{transactions.map(
						/* eslint-disable max-lines-per-function -- Keep each activity and its explicit review form together. */
						// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: existing inline review forms display the transaction, warnings and explicit confirmation controls.
						(transaction) => (
							<li key={transaction.id}>
								<div>
									<strong>
										{transaction.merchantName ?? transaction.name}
									</strong>
									<small>
										{transaction.date} · {providerLabel(transaction.provider)} ·{" "}
										{transaction.institutionName
											? `${transaction.institutionName} · `
											: ""}
										{transaction.accountName}
									</small>
								</div>
								<span>{amountText(transaction)}</span>
								{transaction.sourceChanged && (
									<p className="bank-source-warning" role="note">
										{transaction.removedAt
											? "The provider removed this reviewed activity."
											: "The provider changed this reviewed activity."}{" "}
										{transaction.linkedTransactionId
											? "Your confirmed shared expense is unchanged. Check it before making a correction."
											: "Check the updated activity before restoring it."}
									</p>
								)}
								{reviewed ? (
									<div className="bank-review-actions">
										<span>{transaction.reviewStatus}</span>
										{transaction.reviewStatus === "ignored" &&
											!transaction.removedAt &&
											!transaction.pending && (
												<button
													type="button"
													onClick={() =>
														void completeReview("restore", transaction)
													}
												>
													Restore
												</button>
											)}
									</div>
								) : (
									<div className="bank-review-actions">
										{transaction.amountMinor > 0 && (
											<>
												<button
													type="button"
													onClick={() => void openReview(transaction, "match")}
												>
													Match existing
												</button>
												<button
													type="button"
													onClick={() => void openReview(transaction, "create")}
												>
													Add shared expense
												</button>
											</>
										)}
										<button
											type="button"
											onClick={() => void completeReview("ignore", transaction)}
										>
											Ignore
										</button>
									</div>
								)}
								{active?.id === transaction.id && action === "match" && (
									<div className="bank-review-panel">
										<h3>Match an existing expense</h3>
										<p>
											Choose a shared expense for {amountText(transaction)}.
											Suggestions still require your confirmation.
										</p>
										{candidates.length ? (
											<>
												<select
													aria-label="Existing expense"
													value={candidateId}
													onChange={(event) =>
														setCandidateId(event.target.value)
													}
												>
													<option value="">Choose an expense</option>
													{candidates.map((candidate) => (
														<option key={candidate.id} value={candidate.id}>
															{candidate.suggested ? "Suggested · " : ""}
															{candidate.description} ·{" "}
															{candidate.date.slice(0, 10)}
															{candidate.scheduled ? " · scheduled" : ""}
														</option>
													))}
												</select>
												<button
													type="button"
													disabled={!candidateId || saving}
													onClick={() =>
														void completeReview("match", transaction)
													}
												>
													Confirm match
												</button>
											</>
										) : (
											<p>
												No same-amount expenses found. You can add a shared
												expense instead.
											</p>
										)}
										<button type="button" onClick={() => setActive(null)}>
											Cancel
										</button>
									</div>
								)}
								{active?.id === transaction.id && action === "create" && (
									<form
										className="bank-review-panel"
										onSubmit={(event) => {
											event.preventDefault();
											void completeReview("create", transaction);
										}}
									>
										<h3>Add shared expense</h3>
										<p>
											{amountText(transaction)} paid by you. This will change
											shared balances only after confirmation.
										</p>
										<label>
											Description{" "}
											<input
												value={description}
												onChange={(event) => setDescription(event.target.value)}
												maxLength={255}
												required
											/>
										</label>
										{members.map((member) => (
											<label key={member.id}>
												{member.firstName} share (%)
												<input
													type="number"
													min="0"
													max="100"
													step="0.01"
													value={shares[member.id] ?? 0}
													onChange={(event) =>
														setShares({
															...shares,
															[member.id]: Number(event.target.value),
														})
													}
												/>
											</label>
										))}
										<p>Shares total {shareTotal.toFixed(2)}%.</p>
										{duplicateWarning && (
											<>
												<p id="bank-duplicate-warning">
													A scheduled expense may already cover this charge.
													Match it if it is the same purchase. For a separate
													purchase, confirm below.
												</p>
												<label>
													<input
														type="checkbox"
														checked={allowPossibleDuplicate}
														aria-describedby="bank-duplicate-warning"
														onChange={(event) =>
															setAllowPossibleDuplicate(event.target.checked)
														}
													/>{" "}
													Add anyway if this is a separate purchase
												</label>
											</>
										)}
										<button
											type="submit"
											disabled={saving || Math.abs(shareTotal - 100) > 0.001}
										>
											Confirm shared expense
										</button>
										<button type="button" onClick={() => setActive(null)}>
											Cancel
										</button>
									</form>
								)}
							</li>
						),
					)}
					{/* eslint-enable max-lines-per-function */}
				</ul>
			)}
		</main>
	);
}
