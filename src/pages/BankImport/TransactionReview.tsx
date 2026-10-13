import { useCallback, useEffect, useState } from "react";
import {
	Link,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import {
	Surface,
	UiButton,
	UiPage,
	UiPageDescription,
	UiPageHeader,
	UiPageTitle,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import api from "@/utils/api";
import CandidatePicker from "./CandidatePicker";
import type { BankTransaction } from "./types";
import { bankAmount, providerLabel } from "./types";
import "./index.css";
type Mode = "expense" | "budget" | "both";
// eslint-disable-next-line max-lines-per-function -- Dedicated review presents source details, immutable matched links, provisional choices and one explicit confirmation.
export default function TransactionReview(): JSX.Element {
	const { id = "" } = useParams();
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const requestedDraft = params.get("draftId") ?? "";
	const [row, setRow] = useState<BankTransaction | null>(null);
	const [settlements, setSettlements] = useState<BankTransaction[]>([]);
	const [mode, setMode] = useState<Mode>("expense");
	const [expense, setExpense] = useState("");
	const [budget, setBudget] = useState("");
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [confirm, setConfirm] = useState(false);
	const refresh = useCallback(async () => {
		const query = new URLSearchParams({
			id,
			...(requestedDraft ? { draftId: requestedDraft } : {}),
		});
		const { data } = await api.get<{
			transaction: BankTransaction;
			settlementCandidates: BankTransaction[];
		}>(`/bank-import/transaction?${query}`);
		const bank = data.transaction;
		setRow(bank);
		setSettlements(data.settlementCandidates ?? []);
		setExpense(bank.linkedTransactionId ?? bank.provisionalTransactionId ?? "");
		setBudget(bank.linkedBudgetEntryId ?? bank.provisionalBudgetEntryId ?? "");
		setMode(
			bank.provisionalTransactionId && bank.provisionalBudgetEntryId
				? "both"
				: bank.provisionalBudgetEntryId ||
						bank.amountMinor < 0 ||
						bank.linkedTransactionId
					? "budget"
					: bank.linkedBudgetEntryId
						? "expense"
						: "expense",
		);
	}, [id, requestedDraft]);
	useEffect(() => {
		setRow(null);
		setError("");
		void refresh().catch(() =>
			setError("Activity unavailable. Return to the inbox and refresh."),
		);
	}, [refresh]);
	async function perform(action: () => Promise<void>, success: string) {
		setBusy(true);
		setError("");
		try {
			await action();
			setMessage(success);
			await refresh();
		} catch (caught) {
			const detail = caught as { response?: { data?: { error?: string } } };
			setError(
				detail.response?.data?.error ??
					"Could not save. Refresh and try again.",
			);
		} finally {
			setBusy(false);
			setConfirm(false);
		}
	}
	async function cancelProvisional() {
		if (!row?.draftId) return;
		setBusy(true);
		setError("");
		try {
			await api.post("/bank-import/provisional-cancel", {
				draftId: row.draftId,
				draftVersion: row.draftVersion,
			});
			navigate("/bank-import");
		} catch {
			setError("Could not cancel. Refresh and try again.");
		} finally {
			setBusy(false);
		}
	}
	async function save() {
		if (!row) return;
		const transactionId =
			row.linkedTransactionId ||
			(mode === "expense" || mode === "both" ? expense : undefined);
		const budgetEntryId =
			row.linkedBudgetEntryId ||
			(mode === "budget" || mode === "both" ? budget : undefined);
		await perform(
			async () => {
				await api.post(
					row.pending ? "/bank-import/provisional" : "/bank-import/match",
					{
						bankTransactionId: row.id,
						sourceVersion: row.rowVersion,
						transactionId: transactionId || undefined,
						budgetEntryId: budgetEntryId || undefined,
						...(row.pending
							? { draftVersion: row.draftVersion }
							: row.draftId &&
									row.draftStatus === "active" &&
									!row.provisionalSourceChanged
								? { draftId: row.draftId, draftVersion: row.draftVersion }
								: {}),
					},
				);
			},
			row.pending
				? "Private provisional selection saved. Confirm after it posts."
				: "Existing records associated. Amounts and balances are unchanged.",
		);
	}
	const selectionComplete =
		!!row &&
		((mode === "expense" && !!expense) ||
			(mode === "budget" && !!budget) ||
			(mode === "both" && !!expense && !!budget));
	const locked =
		!!row &&
		(!!row.removedAt ||
			!!row.noLongerPending ||
			row.reviewStatus === "ignored" ||
			!!(row.linkedTransactionId && row.linkedBudgetEntryId));
	return (
		<UiPage className="bank-page">
			<UiPageHeader>
				<div>
					<UiPageTitle>Review bank activity</UiPageTitle>
					<UiPageDescription>
						Check the source and its shared record associations.
					</UiPageDescription>
				</div>
				<Link className="bank-text-link" to="/bank-import">
					← Bank activity
				</Link>
			</UiPageHeader>
			{error && (
				<p role="alert" className="bank-import-error">
					{error}
				</p>
			)}
			{message && <p role="status">{message}</p>}
			{!row ? (
				<Surface>
					{error
						? "Return to the inbox to choose another item."
						: "Loading activity…"}
				</Surface>
			) : (
				<>
					<Surface className="bank-source-card">
						<div className="bank-source-heading">
							<div>
								<span className="bank-badge">
									{row.noLongerPending
										? "Needs confirmation"
										: row.pending
											? "Pending"
											: row.reviewStatus === "unreviewed"
												? "Posted"
												: row.reviewStatus}
								</span>
								<h2>{row.merchantName || row.name}</h2>
								<p>{row.name !== row.merchantName ? row.name : ""}</p>
							</div>
							<strong className="bank-source-amount">
								{bankAmount(row.amountMinor, row.currency)}
							</strong>
						</div>
						<dl className="bank-source-meta">
							<div>
								<dt>Date</dt>
								<dd>{row.date}</dd>
							</div>
							<div>
								<dt>Account</dt>
								<dd>{row.accountName}</dd>
							</div>
							<div>
								<dt>Provider</dt>
								<dd>{providerLabel(row.provider)}</dd>
							</div>
						</dl>
						{row.pending && (
							<p className="bank-note">
								A provisional choice is private and changes no balances. A
								posted item still needs your confirmation.
							</p>
						)}
						{row.noLongerPending && (
							<p className="bank-source-warning">
								The original pending item is no longer reported. It may have
								settled with a different ID or been cancelled. Your original
								choices are retained; shared records are unchanged.
							</p>
						)}
						{(row.sourceChanged || row.provisionalSourceChanged) && (
							<p className="bank-source-warning">
								The source changed. Check its current amount and currency and
								choose compatible records before confirming.
							</p>
						)}
						{row.removedAt && (
							<p className="bank-source-warning">
								The provider removed this activity. Existing shared records
								remain.
							</p>
						)}
					</Surface>
					{(row.linkedTransactionId || row.linkedBudgetEntryId) && (
						<Surface className="bank-matched">
							<h2>Matched to</h2>
							{row.linkedTransactionId && (
								<Link
									to={`/transaction/${encodeURIComponent(row.linkedTransactionId)}`}
								>
									Expense · {row.expenseDescription ?? "View expense"} ↗
								</Link>
							)}
							{row.linkedBudgetEntryId && (
								<Link
									to={`/budget-entry/${encodeURIComponent(row.linkedBudgetEntryId)}`}
								>
									Budget entry · {row.budgetDescription ?? "View budget entry"}{" "}
									↗
								</Link>
							)}
						</Surface>
					)}
					{(row.provisionalTransactionId || row.provisionalBudgetEntryId) && (
						<Surface className="bank-matched">
							<h2>Private provisional choice</h2>
							<p>
								These choices are tentative until you confirm a posted item.
							</p>
							{row.provisionalTransactionId && (
								<Link
									to={`/transaction/${encodeURIComponent(row.provisionalTransactionId)}`}
								>
									View chosen expense ↗
								</Link>
							)}
							{row.provisionalBudgetEntryId && (
								<Link
									to={`/budget-entry/${encodeURIComponent(row.provisionalBudgetEntryId)}`}
								>
									View chosen budget entry ↗
								</Link>
							)}
						</Surface>
					)}
					{row.noLongerPending && (
						<Surface>
							<h2>Possible posted items</h2>
							<p>
								Suggestions share an account, currency, amount and nearby date.
								They are not confirmed identities. Choose only the item you
								recognise.
							</p>
							{settlements.length ? (
								<ul className="bank-candidates">
									{settlements.map((item) => (
										<li key={item.id}>
											<Link
												to={`/bank-import/transactions/${encodeURIComponent(item.id)}?draftId=${encodeURIComponent(row.draftId ?? "")}`}
											>
												{item.name} · {item.date} ·{" "}
												{bankAmount(item.amountMinor, item.currency)} → Review
											</Link>
										</li>
									))}
								</ul>
							) : (
								<p>
									No compatible posted item found yet. Sync later or cancel the
									provisional selection.
								</p>
							)}
						</Surface>
					)}
					{!locked && (
						<Surface className="bank-review-work">
							<h2>
								{row.pending
									? "Provisional selection"
									: "Match existing records"}
							</h2>
							<p>
								Associate records you have already added.{" "}
								{row.pending
									? "No ledger links are created yet."
									: "This creates no new charges and changes no amounts or balances."}
							</p>
							<div className="bank-tabs">
								{(["expense", "budget", "both"] as const).map((value) => (
									<UiButton
										key={value}
										disabled={row.amountMinor <= 0 && value !== "budget"}
										aria-pressed={mode === value}
										onClick={() => setMode(value)}
									>
										{value === "both"
											? "Both"
											: value === "expense"
												? "Expense"
												: "Budget entry"}
									</UiButton>
								))}
							</div>
							{(mode === "expense" || mode === "both") && (
								<CandidatePicker
									bankId={row.id}
									kind="expense"
									value={expense}
									onChange={setExpense}
									disabled={!!row.linkedTransactionId}
								/>
							)}
							{(mode === "budget" || mode === "both") && (
								<CandidatePicker
									bankId={row.id}
									kind="budget"
									value={budget}
									onChange={setBudget}
									disabled={!!row.linkedBudgetEntryId}
								/>
							)}
							<UiButton
								disabled={busy || !selectionComplete}
								onClick={() => setConfirm(true)}
							>
								{row.pending
									? "Save provisional selection"
									: "Confirm association"}
							</UiButton>
							{!row.pending && (
								<div className="bank-add-actions">
									<h3>Need a new record?</h3>
									<p>
										Use the existing Add form, prefilled from this posted item.
									</p>
									<div className="bank-toolbar">
										{row.amountMinor > 0 && !row.linkedTransactionId && (
											<Link
												to={`/bank-import/transactions/${encodeURIComponent(row.id)}/add?mode=expense`}
											>
												Add expense
											</Link>
										)}
										{!row.linkedBudgetEntryId && (
											<Link
												to={`/bank-import/transactions/${encodeURIComponent(row.id)}/add?mode=budget`}
											>
												Add budget entry
											</Link>
										)}
										{row.amountMinor > 0 &&
											!row.linkedTransactionId &&
											!row.linkedBudgetEntryId && (
												<Link
													to={`/bank-import/transactions/${encodeURIComponent(row.id)}/add?mode=both`}
												>
													Add both
												</Link>
											)}
									</div>
								</div>
							)}
						</Surface>
					)}
					<div className="bank-toolbar">
						{row.draftId && row.draftStatus === "active" && (
							<UiButton
								disabled={busy}
								onClick={() => void cancelProvisional()}
							>
								Cancel provisional selection
							</UiButton>
						)}
						{!row.pending &&
							!row.linkedTransactionId &&
							!row.linkedBudgetEntryId &&
							!row.removedAt && (
								<UiButton
									disabled={busy}
									onClick={() =>
										void perform(
											async () => {
												await api.post(
													`/bank-import/${row.reviewStatus === "ignored" ? "restore" : "ignore"}`,
													{
														bankTransactionId: row.id,
														sourceVersion: row.rowVersion,
													},
												);
											},
											row.reviewStatus === "ignored"
												? "Returned to review."
												: "Activity ignored.",
										)
									}
								>
									{row.reviewStatus === "ignored"
										? "Return to review"
										: "Ignore activity"}
								</UiButton>
							)}
					</div>
					<ConfirmDialog
						open={confirm}
						title={
							row.pending
								? "Save private provisional selection?"
								: "Associate existing records?"
						}
						message={
							row.pending
								? "No balances or shared ledger links change. You will confirm once it posts."
								: "No new charges are created. If both records are selected, they will also be linked to each other."
						}
						confirmText={row.pending ? "Save selection" : "Confirm association"}
						onCancel={() => setConfirm(false)}
						onConfirm={() => void save()}
					/>
				</>
			)}
		</UiPage>
	);
}
