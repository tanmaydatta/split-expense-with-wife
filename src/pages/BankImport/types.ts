export type ProviderId = "plaid" | "lunch_flow";
export type BankCapabilities = {
	setup: "link" | "api_key";
	reconnect: "link" | "external";
	revokeRemote: boolean;
	upstreamRefresh: boolean;
	removals: "explicit" | "window_snapshot";
};
export type BankProvider = {
	id: ProviderId;
	label: string;
	capabilities: BankCapabilities;
};
export type BankConnection = {
	id: string;
	provider?: ProviderId;
	institutionName: string;
	status: string;
	createdAt: string;
	lastSyncedAt?: string | null;
	lastError?: string | null;
	capabilities?: BankCapabilities;
};
export type BankAccount = {
	id: string;
	connectionId: string;
	name: string;
	mask: string | null;
	selected: boolean;
	status?: string;
	currency?: string | null;
	institutionName?: string | null;
	amountMultiplier?: number | null;
};
export type BankTransaction = {
	id: string;
	connectionId: string;
	provider?: ProviderId;
	accountId: string;
	accountName: string;
	institutionName?: string | null;
	date: string;
	updatedAt?: string;
	rowVersion?: number;
	name: string;
	merchantName: string | null;
	amountMinor: number;
	currency: string;
	linkedTransactionId: string | null;
	reviewStatus: string;
	sourceChanged?: boolean;
	removedAt?: string | null;
	pending?: boolean;
};
export type Candidate = {
	id: string;
	description: string;
	amount: number;
	currency: string;
	date: string;
	scheduled: boolean;
	suggested: boolean;
};
export const providerLabel = (id?: ProviderId) =>
	id === "lunch_flow" ? "Lunch Flow" : "Plaid Sandbox";
export function bankAmount(amountMinor: number, currency: string): string {
	const formatter = new Intl.NumberFormat("en-GB", {
		style: "currency",
		currency,
	});
	return formatter.format(
		amountMinor /
			10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2),
	);
}
