import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
	BudgetTransferRequest,
	GroupBudgetData,
} from "split-expense-shared-types";
import { typedApi } from "@/utils/api";
import { Surface, UiButton } from "@/components/ui";
import {
	ErrorContainer,
	SuccessContainer,
} from "@/components/MessageContainer";
import "./transfers.css";
interface Props {
	budgets: GroupBudgetData[];
	sourceBudgetId: string;
	currencies: string[];
	onCreated(): void;
}
export default function TransferForm({
	budgets,
	sourceBudgetId,
	currencies,
	onCreated,
}: Props) {
	const [open, setOpen] = useState(false),
		[source, setSource] = useState(sourceBudgetId),
		[destination, setDestination] = useState(""),
		[amount, setAmount] = useState(""),
		[currency, setCurrency] = useState(currencies[0] ?? "GBP"),
		[date, setDate] = useState(new Date().toISOString().slice(0, 10)),
		[note, setNote] = useState("");
	const pending = useRef<{ fingerprint: string; requestId: string } | null>(
			null,
		),
		queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: (body: BudgetTransferRequest) =>
			typedApi.post("/budget-transfer", body),
		onSuccess: () => {
			queryClient.removeQueries({
				queryKey: ["budget", "history"],
				type: "inactive",
			});
			queryClient.invalidateQueries({
				queryKey: ["budget"],
				refetchType: "none",
			});
			queryClient.invalidateQueries({ queryKey: ["budget", "total"] });
			queryClient.invalidateQueries({ queryKey: ["category-insights"] });

			onCreated();
		},
	});
	function submit(event: React.FormEvent) {
		event.preventDefault();
		const data = {
			sourceBudgetId: source,
			destinationBudgetId: destination,
			amount: Number(amount),
			currency,
			date,
			note,
		};
		const fingerprint = JSON.stringify(data);
		if (pending.current?.fingerprint !== fingerprint)
			pending.current = { fingerprint, requestId: crypto.randomUUID() };
		mutation.mutate({ ...data, requestId: pending.current.requestId });
	}
	if (budgets.length < 2)
		return (
			<p className="finance-filter-help">
				Add a second budget in Settings to transfer between budgets.
			</p>
		);
	return (
		<Surface className="budget-transfer-panel">
			<UiButton
				type="button"
				onClick={() => {
					setOpen(!open);
					if (!open) setSource(sourceBudgetId);
				}}
				aria-expanded={open}
			>
				Transfer between budgets
			</UiButton>
			{open && (
				<form onSubmit={submit} className="budget-transfer-form">
					<h3>Transfer between budgets</h3>
					<p>
						Move one currency between household budgets. Both entries are
						recorded together and excluded from spending insights. Negative
						budget balances are allowed.
					</p>
					{mutation.error && (
						<ErrorContainer
							message={mutation.error.message}
							onClose={() => mutation.reset()}
						/>
					)}
					{mutation.isSuccess && (
						<SuccessContainer
							message={mutation.data.message}
							onClose={() => mutation.reset()}
						/>
					)}
					<fieldset
						disabled={mutation.isPending || mutation.isSuccess}
						className="budget-transfer-inputs"
					>
						<TransferFields
							{...{
								budgets,
								currencies,
								source,
								destination,
								amount,
								currency,
								date,
								note,
								setSource: (next: string) => {
									setSource(next);
									if (destination === next) setDestination("");
								},
								setDestination,
								setAmount,
								setCurrency,
								setDate,
								setNote,
							}}
						/>
					</fieldset>
					<p className="finance-filter-help">
						Today or earlier; no currency conversion. Deleting either entry
						removes both sides.
					</p>
					<UiButton
						$tone="primary"
						type="submit"
						disabled={
							mutation.isPending ||
							mutation.isSuccess ||
							source === destination ||
							!destination
						}
					>
						{mutation.isPending ? "Recording transfer…" : "Record transfer"}
					</UiButton>
					<>
						{mutation.isSuccess && (
							<UiButton
								type="button"
								onClick={() => {
									mutation.reset();
									pending.current = null;
									setAmount("");
									setNote("");
								}}
							>
								Record another transfer
							</UiButton>
						)}
					</>
				</form>
			)}
		</Surface>
	);
}

function TransferFields({
	budgets,
	currencies,
	source,
	destination,
	amount,
	currency,
	date,
	note,
	setSource,
	setDestination,
	setAmount,
	setCurrency,
	setDate,
	setNote,
}: {
	budgets: GroupBudgetData[];
	currencies: string[];
	source: string;
	setSource: (value: string) => void;
	destination: string;
	setDestination: (value: string) => void;
	amount: string;
	setAmount: (value: string) => void;
	currency: string;
	setCurrency: (value: string) => void;
	date: string;
	setDate: (value: string) => void;
	note: string;
	setNote: (value: string) => void;
}) {
	return (
		<div className="budget-transfer-fields">
			<label>
				From budget
				<select
					required
					value={source}
					onChange={(e) => setSource(e.target.value)}
				>
					{budgets.map((b) => (
						<option key={b.id} value={b.id}>
							{b.budgetName}
						</option>
					))}
				</select>
			</label>
			<label>
				To budget
				<select
					required
					value={destination}
					onChange={(e) => setDestination(e.target.value)}
				>
					<option value="">Choose destination</option>
					{budgets
						.filter((b) => b.id !== source)
						.map((b) => (
							<option key={b.id} value={b.id}>
								{b.budgetName}
							</option>
						))}
				</select>
			</label>
			<label>
				Amount
				<input
					required
					type="number"
					min="0.01"
					max="1000000000"
					step="0.01"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
				/>
			</label>
			<label>
				Currency
				<select value={currency} onChange={(e) => setCurrency(e.target.value)}>
					{currencies.map((c) => (
						<option key={c}>{c}</option>
					))}
				</select>
			</label>
			<label>
				Date (UTC)
				<input
					required
					type="date"
					max={new Date().toISOString().slice(0, 10)}
					value={date}
					onChange={(e) => setDate(e.target.value)}
				/>
			</label>
			<label className="budget-transfer-note">
				Note (optional)
				<input
					maxLength={200}
					value={note}
					onChange={(e) => setNote(e.target.value)}
				/>
			</label>
		</div>
	);
}
