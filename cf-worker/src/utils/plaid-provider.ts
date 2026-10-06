import type {
	BankProvider,
	BankChanges,
	ImportedTransaction,
} from "./bank-provider";
import { amountMinor } from "./bank-provider";
import { decryptBankToken } from "./bank-token";
import { plaidEnabled, plaidRequest } from "./plaid";

type PlaidTransaction = {
	transaction_id: string;
	account_id: string;
	date: string;
	name: string;
	merchant_name: string | null;
	amount: number;
	iso_currency_code: string | null;
	unofficial_currency_code: string | null;
	pending: boolean;
	pending_transaction_id: string | null;
};
type SyncPage = {
	added: PlaidTransaction[];
	modified: PlaidTransaction[];
	removed: Array<{ transaction_id: string }>;
	has_more: boolean;
	next_cursor: string;
};
function normalize(row: PlaidTransaction): ImportedTransaction {
	const currency = row.iso_currency_code ?? row.unofficial_currency_code;
	if (!currency) throw new Error("Bank currency is missing");
	return {
		id: row.transaction_id,
		accountId: row.account_id,
		date: row.date,
		name: row.name,
		merchantName: row.merchant_name,
		amountMinor: amountMinor(row.amount, currency),
		currency,
		pending: row.pending,
		pendingTransactionId: row.pending_transaction_id,
	};
}
export const plaidProvider: BankProvider = {
	id: "plaid",
	label: "Plaid Sandbox",
	capabilities: {
		setup: "link",
		reconnect: "link",
		revokeRemote: true,
		upstreamRefresh: false,
		removals: "explicit",
	},
	enabled: plaidEnabled,
	async accounts(env, connection) {
		const access_token = await decryptBankToken(
			env,
			connection.accessTokenEncrypted,
			"plaid",
		);
		const result = await plaidRequest<{
			accounts: Array<{
				account_id: string;
				name: string;
				mask: string | null;
				type: string;
				subtype: string | null;
			}>;
		}>(env, "/accounts/get", { access_token });
		return result.accounts.map((row) => ({
			id: row.account_id,
			name: row.name,
			mask: row.mask,
			type: row.type,
			subtype: row.subtype,
			status: "ACTIVE",
			currency: null,
			institutionName: connection.institutionName,
		}));
	},
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Plaid pagination mutation must restart from the original cursor.
	async changes(env, connection) {
		const access_token = await decryptBankToken(
			env,
			connection.accessTokenEncrypted,
			"plaid",
		);
		const started = Date.now();
		let changes: BankChanges = {
			added: [],
			modified: [],
			removed: [],
			cursor: connection.cursor,
		};
		let pages = 0;
		let restarts = 0;
		while (true) {
			if (Date.now() - started > 120000)
				throw new Error("Bank sync time limit");
			let page: SyncPage;
			try {
				page = await plaidRequest<SyncPage>(env, "/transactions/sync", {
					access_token,
					cursor: changes.cursor,
					count: 500,
				});
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes(
						"TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
					) &&
					restarts < 2
				) {
					changes = {
						added: [],
						modified: [],
						removed: [],
						cursor: connection.cursor,
					};
					pages = 0;
					restarts++;
					continue;
				}
				throw error;
			}
			changes.added.push(...page.added.map(normalize));
			changes.modified.push(...page.modified.map(normalize));
			changes.removed.push(...page.removed.map((row) => row.transaction_id));
			changes.cursor = page.next_cursor;
			if (!page.has_more) return changes;
			if (++pages >= 100)
				throw new Error("Bank sync page limit; cursor was not advanced");
		}
	},
	async disconnect(env, connection) {
		await plaidRequest(env, "/item/remove", {
			access_token: await decryptBankToken(
				env,
				connection.accessTokenEncrypted,
				"plaid",
			),
		});
	},
};
