import { z } from "zod";
import { BankProviderError, amountMinor } from "./bank-provider";
import type {
	BankProvider,
	ImportedAccount,
	ImportedTransaction,
} from "./bank-provider";
import { bankEncryptionConfigured, decryptBankToken } from "./bank-token";
import type { BankEnv } from "./bank-token";
const BASE = "https://lunchflow.app/api/v1";
const Account = z.object({
	id: z.number().int().nonnegative(),
	connection_id: z.number().int().nonnegative(),
	name: z.string().min(1).max(255),
	institution_name: z.string().max(255).nullable().optional(),
	currency: z.string().regex(/^[A-Z]{3}$/),
	status: z.string().min(1),
	provider: z.string(),
});
const Accounts = z.object({
	accounts: z.array(Account).max(100),
	total: z.number().int().nonnegative(),
});
const Transaction = z.object({
	id: z.string().min(1),
	accountId: z.number().int().nonnegative(),
	amount: z.number().finite(),
	currency: z.string().regex(/^[A-Z]{3}$/),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.refine((value) => {
			const parsed = new Date(`${value}T00:00:00Z`);
			return (
				!Number.isNaN(parsed.getTime()) &&
				parsed.toISOString().slice(0, 10) === value
			);
		}),
	merchant: z.string().max(1000).nullable().optional(),
	description: z.string().max(4000).nullable().optional(),
	isPending: z.boolean(),
});
const Transactions = z.object({
	transactions: z.array(Transaction).max(10000),
	total: z.number().int().nonnegative(),
});
export function lunchFlowEnabled(env: Env): boolean {
	return (
		(env as BankEnv).LUNCH_FLOW_ENABLED === "true" &&
		bankEncryptionConfigured(env)
	);
}
/** Fetches cached destination data only. This never asks GoCardless to refresh a bank. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded retries distinguish authorization, rate limits, permanent errors and invalid responses.
export async function lunchFlowRequest(
	env: Env,
	apiKey: string,
	path: string,
): Promise<unknown> {
	if (!lunchFlowEnabled(env)) throw new BankProviderError("unavailable");
	for (let attempt = 0; attempt < 3; attempt++) {
		let response: Response;
		try {
			response = await fetch(`${BASE}${path}`, {
				method: "GET",
				headers: { "x-api-key": apiKey, Accept: "application/json" },
				signal: AbortSignal.timeout(15000),
			});
		} catch {
			if (attempt < 2) continue;
			throw new BankProviderError("unavailable");
		}
		if (response.status === 401 || response.status === 403)
			throw new BankProviderError("reauthorize");
		if (response.ok) {
			try {
				return await response.json();
			} catch {
				throw new BankProviderError("invalid_data");
			}
		}
		if (response.status === 429 || response.status >= 500) {
			const retry = Number(response.headers.get("Retry-After") ?? "0");
			if (attempt < 2 && Number.isFinite(retry) && retry >= 0 && retry <= 2) {
				if (retry)
					await new Promise((resolve) => setTimeout(resolve, retry * 1000));
				continue;
			}
			throw new BankProviderError(
				response.status === 429 ? "rate_limited" : "unavailable",
			);
		}
		throw new BankProviderError(
			response.status === 404 ? "reauthorize" : "unavailable",
		);
	}
	throw new BankProviderError("unavailable");
}
export async function lunchFlowAccounts(
	env: Env,
	apiKey: string,
): Promise<ImportedAccount[]> {
	const result = Accounts.safeParse(
		await lunchFlowRequest(env, apiKey, "/accounts"),
	);
	if (!result.success || result.data.total !== result.data.accounts.length)
		throw new BankProviderError("invalid_data");
	const ids = new Set(result.data.accounts.map((row) => row.id));
	if (ids.size !== result.data.accounts.length)
		throw new BankProviderError("invalid_data");
	return result.data.accounts.map((row) => ({
		id: String(row.id),
		name: row.name,
		mask: null,
		type: "bank",
		subtype: row.provider,
		status: row.status,
		currency: row.currency,
		institutionName: row.institution_name ?? null,
	}));
}
export async function lunchFlowTransactions(
	env: Env,
	apiKey: string,
	accountId: string,
	from: string,
	to: string,
): Promise<Array<z.infer<typeof Transaction>>> {
	const query = new URLSearchParams({ include_pending: "true", from, to });
	const result = Transactions.safeParse(
		await lunchFlowRequest(
			env,
			apiKey,
			`/accounts/${encodeURIComponent(accountId)}/transactions?${query}`,
		),
	);
	if (!result.success || result.data.total !== result.data.transactions.length)
		throw new BankProviderError("invalid_data");
	if (
		result.data.transactions.some(
			(row) =>
				String(row.accountId) !== accountId || row.date < from || row.date > to,
		)
	)
		throw new BankProviderError("invalid_data");
	if (
		new Set(result.data.transactions.map((row) => row.id)).size !==
		result.data.transactions.length
	)
		throw new BankProviderError("invalid_data");
	return result.data.transactions;
}
export function lunchFlowWindow(now = new Date()): {
	from: string;
	to: string;
} {
	return {
		from: new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10),
		to: now.toISOString().slice(0, 10),
	};
}
export const lunchFlowProvider: BankProvider = {
	id: "lunch_flow",
	label: "Lunch Flow",
	capabilities: {
		setup: "api_key",
		reconnect: "external",
		revokeRemote: false,
		upstreamRefresh: false,
		removals: "window_snapshot",
	},
	enabled: lunchFlowEnabled,
	async accounts(env, connection) {
		return lunchFlowAccounts(
			env,
			await decryptBankToken(
				env,
				connection.accessTokenEncrypted,
				"lunch_flow",
			),
		);
	},
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fetch only complete calibrated account snapshots within a bounded window.
	async changes(env, connection, selected) {
		if (selected.length > 25) throw new BankProviderError("invalid_data");
		const apiKey = await decryptBankToken(
			env,
			connection.accessTokenEncrypted,
			"lunch_flow",
		);
		const window = lunchFlowWindow();
		const started = Date.now();
		const added: ImportedTransaction[] = [];
		const snapshots: Array<{
			accountId: string;
			from: string;
			to: string;
			transactionIds: string[];
		}> = [];
		for (const account of selected) {
			if (account.status !== "ACTIVE") continue;
			if (account.amountMultiplier !== 1 && account.amountMultiplier !== -1)
				throw new BankProviderError("invalid_data");
			if (Date.now() - started > 120000)
				throw new BankProviderError("unavailable");
			const rows = await lunchFlowTransactions(
				env,
				apiKey,
				account.id,
				window.from,
				window.to,
			);
			for (const row of rows) {
				const rawAmountMinor = amountMinor(row.amount, row.currency);
				added.push({
					id: row.id,
					accountId: account.id,
					date: row.date,
					name: row.description || row.merchant || "Bank activity",
					merchantName: row.merchant ?? null,
					amountMinor: rawAmountMinor * account.amountMultiplier,
					rawAmountMinor,
					currency: row.currency,
					pending: row.isPending,
					pendingTransactionId: null,
				});
			}
			snapshots.push({
				accountId: account.id,
				...window,
				transactionIds: rows.map((row) => row.id),
			});
		}
		return { added, modified: [], removed: [], cursor: null, snapshots };
	},
	async disconnect() {
		/* Personal API has no remote revoke endpoint. Delete credentials locally; dashboard revocation is explicit. */
	},
};
