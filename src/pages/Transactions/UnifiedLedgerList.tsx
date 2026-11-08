import React, { useState } from "react";
import { Link } from "react-router-dom";
import getSymbolFromCurrency from "currency-symbol-map";
import type { UnifiedLedgerRow } from "split-expense-shared-types";
import { BulkCategoryCheckbox, type BulkCategories } from "@/components/BulkCategories";
import { Calendar, CardText, Coin, Trash, XLg } from "@/components/Icons";
import { Table, TableWrapper } from "@/components/Table";
import { dateToFullStr } from "@/utils/date";

export interface UnifiedLedgerListProps {
	rows: UnifiedLedgerRow[];
	onDelete: (row: UnifiedLedgerRow) => void;
	bankLinkedIds?: Set<string>;
	bulk?: BulkCategories;
	categoryMap?: Record<string, string>;
	isMobile?: boolean;
}

function formatAmount(amount: number, currency: string, isTransfer: boolean) {
	const symbol = getSymbolFromCurrency(currency) || currency;
	const formatted = Math.abs(amount).toFixed(2);
	if (isTransfer) return `${symbol}${formatted}`;
	const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
	return `${sign}${symbol}${formatted}`;
}

function getAmountClass(amount: number, isTransfer: boolean) {
	if (isTransfer) return "zero";
	if (amount > 0) return "positive";
	if (amount < 0) return "negative";
	return "zero";
}

function getRowTypeLabel(kind: UnifiedLedgerRow["kind"]) {
	if (kind === "purchase") return "Purchase";
	if (kind === "transfer") return "Budget transfer";
	return "Budget adjustment";
}

export function LedgerRowDetails({ row }: { row: UnifiedLedgerRow }) {
	const formattedAmount = formatAmount(row.amount, row.currency, row.kind === "transfer");

	return (
		<div className="transaction-details-container" data-test-id="ledger-row-details">
			<div className="transaction-full-description" data-test-id="full-description">
				<strong>Full Description:</strong> {row.description}
			</div>
			<div>
				<strong>Type:</strong> {getRowTypeLabel(row.kind)}
			</div>
			<div>
				<strong>Date:</strong> {dateToFullStr(new Date(row.timestamp))}
			</div>
			<div>
				<strong>Amount:</strong> {formattedAmount}
			</div>
			{row.kind === "purchase" && row.transactionId && (
				<div style={{ marginTop: 8 }}>
					<Link
						to={`/transaction/${row.transactionId}`}
						data-test-id="view-transaction-detail"
						style={{ color: "#0066cc", textDecoration: "underline" }}
					>
						View transaction details →
					</Link>
				</div>
			)}
			{row.kind === "purchase" && (row.budgetEntryIds?.length ?? 0) > 0 && (
				<div style={{ marginTop: 4 }}>
					<Link
						to={`/budget-entry/${row.budgetEntryIds[0]}`}
						data-test-id="view-linked-budget-entry"
						style={{ color: "#0066cc", textDecoration: "underline" }}
					>
						View budget entry →
					</Link>
				</div>
			)}
			{row.kind === "budget_adjustment" && (row.budgetEntryIds?.length ?? 0) > 0 && (
				<div style={{ marginTop: 8 }}>
					<Link
						to={`/budget-entry/${row.budgetEntryIds[0]}`}
						data-test-id="view-budget-entry"
						style={{ color: "#0066cc", textDecoration: "underline" }}
					>
						View budget entry →
					</Link>
				</div>
			)}
			{row.kind === "transfer" && (
				<div style={{ marginTop: 4, color: "#666" }}>
					Paired transfer between budgets
				</div>
			)}
		</div>
	);
}

function DesktopLedgerRow({
	row,
	isSelected,
	onSelect,
	onDelete,
	bankLinkedIds,
	bulk,
	categoryName,
}: {
	row: UnifiedLedgerRow;
	isSelected: boolean;
	onSelect: () => void;
	onDelete: () => void;
	bankLinkedIds?: Set<string>;
	bulk?: BulkCategories;
	categoryName: string;
}) {
	const isTransfer = row.kind === "transfer";
	const formattedAmount = formatAmount(row.amount, row.currency, isTransfer);
	const amountClass = getAmountClass(row.amount, isTransfer);

	return (
		<React.Fragment>
			<tr
				className="transaction-row"
				data-test-id={`ledger-row-${row.kind}`}
				data-transaction-id={row.transactionId}
				onClick={onSelect}
			>
				<td>
					{bulk && row.transactionId && (
						<BulkCategoryCheckbox
							bulk={bulk}
							id={row.transactionId}
							label={row.description}
						/>
					)}{" "}
					{dateToFullStr(new Date(row.timestamp))}
				</td>
				<td className="description-cell">
					{row.description}
					{row.transactionId && bankLinkedIds?.has(row.transactionId) && (
						<span
							title="Matched to your bank activity"
							aria-label="Matched to your bank activity"
						>
							{" "}· Bank linked
						</span>
					)}
					{(row.budgetEntryIds?.length ?? 0) > 0 && (
						<span
							className="linked-icon"
							data-test-id="transaction-linked-icon"
							title="Linked to a budget entry"
							aria-label="Linked to a budget entry"
						>
							🔗
						</span>
					)}
				</td>
				<td className={amountClass}>{formattedAmount}</td>
				<td>
					<span style={{ fontSize: "0.85em", color: "#666" }}>{categoryName}</span>
				</td>
				<td>
					<button
						type="button"
						data-test-id="delete-button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "4px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							color: "red",
						}}
						aria-label={`Delete ${row.kind}`}
					>
						<XLg />
					</button>
				</td>
			</tr>
			{isSelected && (
				<tr className="ledger-details-row">
					<td colSpan={5}>
						<LedgerRowDetails row={row} />
					</td>
				</tr>
			)}
		</React.Fragment>
	);
}

function MobileLedgerCard({
	row,
	isSelected,
	onSelect,
	onDelete,
	bankLinkedIds,
	bulk,
	categoryName,
}: {
	row: UnifiedLedgerRow;
	isSelected: boolean;
	onSelect: () => void;
	onDelete: () => void;
	bankLinkedIds?: Set<string>;
	bulk?: BulkCategories;
	categoryName: string;
}) {
	const isTransfer = row.kind === "transfer";
	const formattedAmount = formatAmount(row.amount, row.currency, isTransfer);
	const amountClass = getAmountClass(row.amount, isTransfer);

	return (
		<div
			data-test-id={`ledger-row-${row.kind}`}
			className="ledger-card"
			style={{
				background: "#fff",
				borderRadius: 8,
				padding: 16,
				marginBottom: 12,
				boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
				cursor: "pointer",
			}}
			onClick={onSelect}
		>
			{bulk && row.transactionId && (
				<div className="bulk-entry-selection" style={{ marginBottom: 8 }}>
					<BulkCategoryCheckbox
						bulk={bulk}
						id={row.transactionId}
						label={row.description}
					/>
					{bulk.enabled && " Select expense"}
				</div>
			)}
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
				<div>
					<div style={{ fontWeight: 600, fontSize: 16 }}>
						{row.description}
						{row.transactionId && bankLinkedIds?.has(row.transactionId) && (
							<small style={{ color: "#666", fontWeight: "normal" }}> · Bank linked</small>
						)}
						{(row.budgetEntryIds?.length ?? 0) > 0 && (
							<span
								className="linked-icon"
								data-test-id="transaction-linked-icon"
								title="Linked to a budget entry"
							>
								🔗
							</span>
						)}
					</div>
					<div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
						{dateToFullStr(new Date(row.timestamp))} · {categoryName}
					</div>
				</div>
				<div style={{ textAlign: "right" }}>
					<div className={amountClass} style={{ fontWeight: 700, fontSize: 16 }}>
						{formattedAmount}
					</div>
					<button
						type="button"
						data-test-id="delete-button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							padding: "4px",
							marginTop: 4,
							color: "red",
						}}
						aria-label={`Delete ${row.kind}`}
					>
						<XLg />
					</button>
				</div>
			</div>
			{isSelected && <LedgerRowDetails row={row} />}
		</div>
	);
}

export function UnifiedLedgerList({
	rows,
	onDelete,
	bankLinkedIds,
	bulk,
	categoryMap,
	isMobile = false,
}: UnifiedLedgerListProps) {
	const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

	const handleSelect = (row: UnifiedLedgerRow) => {
		setSelectedRowId((prev) => (prev === row.id ? null : row.id));
	};

	const getCategoryLabel = (row: UnifiedLedgerRow) => {
		if (row.categoryId && categoryMap?.[row.categoryId]) {
			return categoryMap[row.categoryId];
		}
		return getRowTypeLabel(row.kind);
	};

	if (isMobile) {
		return (
			<div className="mobile-cards">
				{rows.map((row) => (
					<MobileLedgerCard
						key={row.id}
						row={row}
						isSelected={selectedRowId === row.id}
						onSelect={() => handleSelect(row)}
						onDelete={() => onDelete(row)}
						bankLinkedIds={bankLinkedIds}
						bulk={bulk}
						categoryName={getCategoryLabel(row)}
					/>
				))}
			</div>
		);
	}

	return (
		<div className="desktop-table">
			<TableWrapper>
				<Table>
					<thead>
						<tr>
							<th>
								<Calendar /> Date
							</th>
							<th>
								<CardText /> Description
							</th>
							<th>
								<Coin /> Amount
							</th>
							<th>Category / Type</th>
							<th>
								<Trash />
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<DesktopLedgerRow
								key={row.id}
								row={row}
								isSelected={selectedRowId === row.id}
								onSelect={() => handleSelect(row)}
								onDelete={() => onDelete(row)}
								bankLinkedIds={bankLinkedIds}
								bulk={bulk}
								categoryName={getCategoryLabel(row)}
							/>
						))}
					</tbody>
				</Table>
			</TableWrapper>
		</div>
	);
}
