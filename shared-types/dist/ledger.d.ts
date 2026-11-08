export type LedgerRowKind = "purchase" | "budget_adjustment" | "transfer";
export interface LedgerListRequest {
    limit?: number;
    cursor?: string;
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    currency?: string;
    budgetId?: string;
    categoryId?: string;
    kinds?: Array<LedgerRowKind>;
}
export interface UnifiedLedgerRow {
    id: string;
    kind: LedgerRowKind;
    timestamp: string;
    description: string;
    currency: string;
    amount: number;
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
