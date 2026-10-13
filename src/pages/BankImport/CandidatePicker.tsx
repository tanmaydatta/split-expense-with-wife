import { useEffect, useState } from "react";
import { UiButton } from "@/components/ui";
import api from "@/utils/api";
import type { Candidate } from "./types";
// eslint-disable-next-line max-lines-per-function -- One bounded candidate picker keeps its independent search filters and selected record together.
export default function CandidatePicker({
	bankId,
	kind,
	value,
	onChange,
	disabled,
}: {
	bankId: string;
	kind: "expense" | "budget";
	value: string;
	onChange: (id: string) => void;
	disabled?: boolean;
}): JSX.Element {
	const [q, setQ] = useState("");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const [offset, setOffset] = useState(0);
	const [rows, setRows] = useState<Candidate[]>([]);
	const [more, setMore] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (disabled) return;
		let active = true;
		setLoading(true);
		const timer = setTimeout(() => {
			const params = new URLSearchParams({
				bankTransactionId: bankId,
				kind,
				q,
				offset: String(offset),
				...(from ? { from } : {}),
				...(to ? { to } : {}),
			});
			void api
				.get<{ candidates: Candidate[]; hasMore: boolean }>(
					`/bank-import/review-candidates?${params}`,
				)
				.then(({ data }) => {
					if (active) {
						setRows(data.candidates);
						setMore(data.hasMore);
						setError("");
					}
				})
				.catch(() => {
					if (active) setError("Could not search records.");
				})
				.finally(() => {
					if (active) setLoading(false);
				});
		}, 200);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [bankId, kind, q, from, to, offset, disabled]);
	if (disabled)
		return (
			<p className="bank-subtle">
				The confirmed {kind} association is retained.
			</p>
		);
	return (
		<fieldset className="bank-picker">
			<legend>{kind === "expense" ? "Expense" : "Budget entry"}</legend>
			<label>
				Search records
				<input
					type="search"
					value={q}
					placeholder="Description"
					onChange={(e) => {
						setQ(e.target.value);
						setOffset(0);
					}}
				/>
			</label>
			<div className="bank-date-search">
				<label>
					From
					<input
						type="date"
						value={from}
						onChange={(e) => {
							setFrom(e.target.value);
							setOffset(0);
						}}
					/>
				</label>
				<label>
					To
					<input
						type="date"
						value={to}
						onChange={(e) => {
							setTo(e.target.value);
							setOffset(0);
						}}
					/>
				</label>
			</div>
			<p className="bank-subtle">
				Only records with the same amount, currency and direction are eligible.
			</p>
			{value && (
				<p className="bank-subtle">
					Selected record:{" "}
					{rows.find((row) => row.id === value)?.description ??
						"Saved selection"}{" "}
					<UiButton onClick={() => onChange("")}>Clear</UiButton>
				</p>
			)}
			{error && <p role="alert">{error}</p>}
			{loading ? (
				<p>Searching…</p>
			) : !rows.length ? (
				<p>No matching records. Adjust search or add a new entry.</p>
			) : (
				<ul className="bank-candidates">
					{rows.map((row) => (
						<li key={row.id}>
							<label>
								<input
									type="radio"
									name={`candidate-${kind}`}
									checked={value === row.id}
									onChange={() => onChange(row.id)}
								/>
								<span>
									<strong>{row.description}</strong>
									<small>
										{row.date.slice(0, 10)} ·{" "}
										{new Intl.NumberFormat("en-GB", {
											style: "currency",
											currency: row.currency,
										}).format(row.amount)}
									</small>
								</span>
							</label>
						</li>
					))}
				</ul>
			)}
			<div className="bank-toolbar">
				<UiButton
					disabled={!offset || loading}
					onClick={() => setOffset((v) => Math.max(0, v - 50))}
				>
					Previous
				</UiButton>
				<UiButton
					disabled={!more || loading}
					onClick={() => setOffset((v) => v + 50)}
				>
					More records
				</UiButton>
			</div>
		</fieldset>
	);
}
