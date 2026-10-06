import { useState } from "react";
import api from "@/utils/api";
import type { BankAccount } from "./types";
import { bankAmount } from "./types";

type Sample = {
	date: string;
	name: string;
	rawAmountMinor: number;
	currency: string;
};
type Props = {
	account: BankAccount;
	lunchFlow: boolean;
	disabled: boolean;
	selectAccount: (account: BankAccount, multiplier?: number) => Promise<void>;
	onError: (message: string) => void;
};
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: account availability, preview and explicit sign calibration are displayed together.
export default function AccountChoice({
	account,
	lunchFlow,
	disabled,
	selectAccount,
	onError,
}: Props): JSX.Element {
	const [mapping, setMapping] = useState(
		account.amountMultiplier ? String(account.amountMultiplier) : "",
	);
	const [samples, setSamples] = useState<Sample[]>([]);
	const [previewing, setPreviewing] = useState(false);
	const [previewLoaded, setPreviewLoaded] = useState(false);
	const inactive = account.status && account.status !== "ACTIVE";
	async function preview(): Promise<void> {
		setPreviewing(true);
		onError("");
		try {
			const response = await api.get<{ samples: Sample[] }>(
				`/bank-import/lunch-flow/preview?${new URLSearchParams({ connectionId: account.connectionId, accountId: account.id })}`,
				{ timeout: 150000 },
			);
			setSamples(response.data.samples);
			setPreviewLoaded(true);
		} catch {
			onError(
				"Could not preview this account. Check access in Lunch Flow and try again.",
			);
		} finally {
			setPreviewing(false);
		}
	}
	return (
		<div className="bank-account-choice">
			<label>
				<input
					type="checkbox"
					checked={account.selected}
					disabled={
						disabled ||
						(!account.selected && (!!inactive || (lunchFlow && !mapping)))
					}
					onChange={() =>
						void selectAccount(account, mapping ? Number(mapping) : undefined)
					}
				/>
				<span>
					{account.name}
					{account.mask ? ` •••• ${account.mask}` : ""}
					<small>
						{account.institutionName}
						{account.currency ? ` · ${account.currency}` : ""}
						{inactive
							? ` · ${account.status?.replace(/_/g, " ").toLowerCase()}`
							: ""}
					</small>
				</span>
			</label>
			{lunchFlow && (
				<div className="bank-sign-choice">
					<button
						type="button"
						disabled={disabled || previewing || !!inactive}
						onClick={() => void preview()}
					>
						{previewing ? "Loading preview…" : "Preview raw feed"}
					</button>
					{previewLoaded &&
						(samples.length ? (
							<ul className="bank-preview-list">
								{samples.map((sample, index) => (
									<li key={`${sample.date}-${index}`}>
										<span>
											{sample.date} · {sample.name}
										</span>
										<strong>
											{bankAmount(sample.rawAmountMinor, sample.currency)}
										</strong>
									</li>
								))}
							</ul>
						) : (
							<p>
								No posted activity in the last 90 days. Verify a known purchase
								in Lunch Flow before selecting.
							</p>
						))}
					<label>
						Does a known purchase show as negative or positive in this feed?
						<select
							aria-label={`Purchase sign for ${account.name}`}
							disabled={disabled}
							value={mapping}
							onChange={(event) => setMapping(event.target.value)}
						>
							<option value="">Choose after checking a purchase</option>
							<option value="-1">Negative purchase</option>
							<option value="1">Positive purchase</option>
						</select>
					</label>
					<small>
						Check a known purchase and a deposit. Recheck if you change Reverse
						Amounts in Lunch Flow.
					</small>
					{account.selected &&
						mapping &&
						Number(mapping) !== account.amountMultiplier && (
							<button
								type="button"
								disabled={disabled}
								onClick={() =>
									void selectAccount(
										{ ...account, selected: false },
										Number(mapping),
									)
								}
							>
								Save sign mapping and sync
							</button>
						)}
				</div>
			)}
			{inactive && (
				<p className="bank-account-warning">
					Renew or enable this account in{" "}
					{lunchFlow ? "Lunch Flow" : "the bank provider"}, then sync.
				</p>
			)}
		</div>
	);
}
