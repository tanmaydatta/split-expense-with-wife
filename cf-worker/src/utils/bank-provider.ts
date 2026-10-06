import type { bankConnections } from "../db/schema/schema";

export type BankProviderId = "plaid" | "lunch_flow";
export type BankConnection = typeof bankConnections.$inferSelect;
export type BankCapabilities = {
	setup: "link" | "api_key";
	reconnect: "link" | "external";
	revokeRemote: boolean;
	upstreamRefresh: boolean;
	removals: "explicit" | "window_snapshot";
};
export type ImportedAccount = {
	amountMultiplier?: number | null;
	id: string;
	name: string;
	mask: string | null;
	type: string;
	subtype: string | null;
	status: string;
	currency: string | null;
	institutionName: string | null;
};
/** Positive amountMinor means spending; negative means money received. */
export type ImportedTransaction = {
	rawAmountMinor?: number;
	id: string;
	accountId: string;
	date: string;
	name: string;
	merchantName: string | null;
	amountMinor: number;
	currency: string;
	pending: boolean;
	pendingTransactionId: string | null;
};
export type BankChanges = {
	snapshots?: Array<{
		accountId: string;
		from: string;
		to: string;
		transactionIds: string[];
	}>;
	added: ImportedTransaction[];
	modified: ImportedTransaction[];
	removed: string[];
	cursor: string | null;
};
export interface BankProvider {
	id: BankProviderId;
	label: string;
	capabilities: BankCapabilities;
	enabled(env: Env): boolean;
	accounts(env: Env, connection: BankConnection): Promise<ImportedAccount[]>;
	changes(
		env: Env,
		connection: BankConnection,
		selected: ImportedAccount[],
	): Promise<BankChanges>;
	disconnect(env: Env, connection: BankConnection): Promise<void>;
}
export class BankProviderError extends Error {
	constructor(
		public readonly code:
			| "reauthorize"
			| "rate_limited"
			| "unavailable"
			| "invalid_data"
			| "busy",
	) {
		super(`Bank provider ${code}`);
	}
}
export function currencyScale(currency: string): number {
	const digits = new Intl.NumberFormat("en", {
		style: "currency",
		currency,
	}).resolvedOptions().maximumFractionDigits;
	return 10 ** (digits ?? 2);
}
export function amountMinor(amount: number, currency: string): number {
	if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency))
		throw new BankProviderError("invalid_data");
	const result = Math.round(amount * currencyScale(currency));
	if (!Number.isSafeInteger(result))
		throw new BankProviderError("invalid_data");
	return result;
}
