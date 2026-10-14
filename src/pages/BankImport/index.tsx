import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
	Surface,
	UiButton,
	UiPage,
	UiPageDescription,
	UiPageHeader,
	UiPageTitle,
} from "@/components/ui";
import api from "@/utils/api";
import ConnectionSettings from "./ConnectionSettings";
import type { BankTransaction } from "./types";
import { bankAmount } from "./types";
import "./index.css";
const statuses = ["all", "pending", "posted", "reviewed"] as const;
// eslint-disable-next-line max-lines-per-function -- List filters, paging and accessible settings drawer form one compact page.
export default function BankImport(): JSX.Element {
	const [status, setStatus] = useState<(typeof statuses)[number]>("posted");
	const [q, setQ] = useState("");
	const [cursor, setCursor] = useState("");
 const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [reload, setReload] = useState(0);
	const [rows, setRows] = useState<BankTransaction[]>([]);
	const [more, setMore] = useState(false);
		const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [settings, setSettings] = useState(false);
	useEffect(() => {
		let active = true;
		setLoading(true);
		const timer = setTimeout(() => {
			const params = new URLSearchParams({ status, q, ...(cursor ? { cursor } : {}) });
			void api
				.get<{
					transactions: BankTransaction[];
					hasMore: boolean;
					nextCursor?: string | null;
				}>(`/bank-import/inbox?${params}`)
				.then(({ data }) => {
					if (active) {
						setRows(previous => cursor
 ? Array.from(new Map([...previous, ...data.transactions].map(row => [row.id, row])).values())
 : data.transactions);
						setMore(data.hasMore);
						setNextCursor(data.nextCursor ?? null);
						setError("");
					}
				})
				.catch(() => {
					if (active) setError("Could not load activity. Try refreshing.");
				})
				.finally(() => {
					if (active) setLoading(false);
				});
		}, 200);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [status, q, cursor, reload]);
	return (
		<UiPage className="bank-page">
			<UiPageHeader>
				<div>
					<UiPageTitle>Bank activity</UiPageTitle>
					<UiPageDescription>
						Your private feed. Review one item to match or add shared records.
					</UiPageDescription>
				</div>
				<UiButton onClick={() => setSettings(true)}>
					Connections & settings
				</UiButton>
			</UiPageHeader>
			<Surface className="bank-list-surface">
				<div className="bank-toolbar">
					<label className="bank-search">
						Search activity
						<input
							type="search"
							placeholder="Merchant, description or account"
							value={q}
							onChange={(e) => {
								setQ(e.target.value);
								setCursor("");
 setRows([]);
 setNextCursor(null);
							}}
						/>
					</label>
					<UiButton onClick={() => { setCursor(""); setRows([]); setNextCursor(null); setReload((v) => v + 1); }} disabled={loading}>
						Refresh
					</UiButton>
				</div>
				<div className="bank-tabs" aria-label="Activity filters">
					{statuses.map((value) => (
						<UiButton
							key={value}
							aria-pressed={status === value}
							onClick={() => {
								setStatus(value);
 setReload(v => v + 1);
								setCursor("");
 setRows([]);
 setNextCursor(null);
							}}
						>
							{value === "posted"
								? "Posted"
								: value[0].toUpperCase() + value.slice(1)}
						</UiButton>
					))}
				</div>
				<p className="bank-subtle">
					{cursor ? `${rows.length} items loaded` : "Showing recent activity (last 5 UTC calendar days)"}
					{status === "pending"
						? " · Provisional choices do not change balances"
						: ""}
				</p>
				{error && <p role="alert">{error}</p>}
				{loading && !rows.length ? (
					<p>Loading activity…</p>
				) : !rows.length ? (
					<div className="bank-empty">
						<h2>{more ? "No recent activity" : "Nothing here yet"}</h2>
						<p>{more ? "Choose Load more to see older activity, or adjust filters." : "Choose another filter or sync a connection."}</p>
					</div>
				) : (
					<ul className="bank-compact-list">
						{rows.map((row) => (
							<li key={row.id}>
								<Link
									to={`/bank-import/transactions/${encodeURIComponent(row.id)}`}
									className="bank-row"
								>
									<span className="bank-row-main">
										<strong>{row.merchantName || row.name}</strong>
										<span>
											{row.date} · {row.accountName}
										</span>
									</span>
									<span className="bank-row-end">
										<strong>{bankAmount(row.amountMinor, row.currency)}</strong>
										<span
											className={`bank-badge ${row.pending ? "is-pending" : ""}`}
										>
											{row.noLongerPending
												? "Needs confirmation"
												: row.pending
													? "Pending"
													: row.reviewStatus === "unreviewed"
														? "Posted"
														: row.reviewStatus === "ignored"
															? "Ignored"
															: "Reviewed"}
										</span>
									</span>
									<span aria-hidden="true">›</span>
								</Link>
							</li>
						))}
					</ul>
				)}
				<div className="bank-toolbar bank-pagination">
                    {more && <UiButton disabled={loading || !nextCursor} onClick={() => { if (nextCursor) { setCursor(nextCursor); setReload(v => v + 1); } }}>
                        {loading ? "Loading…" : "Load more"}
                    </UiButton>}
                    <span className="bank-subtle">Older activity loads only when you choose Load more.</span>
                </div>
			</Surface>
			<Dialog.Root open={settings} onOpenChange={setSettings}>
				<Dialog.Portal>
					<Dialog.Overlay className="bank-dialog-overlay" />
					<Dialog.Content className="bank-dialog">
						<div className="bank-dialog-heading">
							<div>
								<Dialog.Title>Connections & settings</Dialog.Title>
								<Dialog.Description>
									Connect accounts, verify signs and fetch cached activity.
								</Dialog.Description>
							</div>
							<Dialog.Close asChild>
								<UiButton>Close</UiButton>
							</Dialog.Close>
						</div>
						<ConnectionSettings onChanged={() => { setCursor(""); setRows([]); setNextCursor(null); setReload(v => v + 1); }} />
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</UiPage>
	);
}
