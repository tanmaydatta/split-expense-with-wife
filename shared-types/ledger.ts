export type LedgerRowKind = "purchase" | "budget_adjustment" | "transfer";

export interface LedgerListRequest {
	limit?: number; // 1..50, default 25
	cursor?: string; // opaque; stable event timestamp + canonical identity
	q?: string;
	dateFrom?: string;
	dateTo?: string;
	currency?: string;
	budgetId?: string;
	categoryId?: string;
	kinds?: Array<LedgerRowKind>;
}

export interface UnifiedLedgerRow {
	id: string; // tx:<transactionId>, be:<budgetEntryId>, transfer:<transferId>
	kind: LedgerRowKind;
	timestamp: string;
	description: string;
	currency: string;
	amount: number; // signed in the visible budget direction (e.g. negative for debit/spend, positive for credit)
	transactionId?: string;
	budgetEntryIds: string[];
	budgetIds: string[];
	categoryId?: string | null;
	categoryName?: string | null;
	paidByUserId?: string;
	transferId?: string;
}

export interface LedgerListResponse {
	rows: UnifiedLedgerRow[];
	nextCursor: string | null;
}
