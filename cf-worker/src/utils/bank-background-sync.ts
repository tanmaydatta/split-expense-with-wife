import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { bankConnections } from "../db/schema/schema";
import { BankProviderError } from "./bank-provider";
import { bankProvider, bankProviders } from "./bank-registry";
import { refreshBankAccounts, syncBankConnection } from "./bank-sync";
import type { BankEnv } from "./bank-token";
export type BankSyncParams = { connectionId: string };
export type BankWorkflowEnv = BankEnv & {
	BANK_SYNC_WORKFLOW?: Workflow<BankSyncParams>;
};
/** Daily bounded fan-out; per-connection Workflows isolate delays and failures. */
export async function enqueueDailyBankSync(
	env: Env,
	day = new Date().toISOString().slice(0, 10),
): Promise<{ queued: number; failed: number }> {
	const config = env as BankWorkflowEnv;
	if (
		config.BANK_BACKGROUND_SYNC_ENABLED !== "true" ||
		!config.BANK_SYNC_WORKFLOW
	)
		return { queued: 0, failed: 0 };
	const providers = Object.values(bankProviders)
		.filter((provider) => provider.enabled(env))
		.map((provider) => provider.id);
	if (!providers.length) return { queued: 0, failed: 0 };
	const db = getDb(env);
	const rows = await db
		.select({ id: bankConnections.id })
		.from(bankConnections)
		.where(
			and(
				inArray(bankConnections.provider, providers),
				ne(bankConnections.status, "disconnected"),
				sql`EXISTS (SELECT 1 FROM bank_accounts WHERE connection_id = ${bankConnections.id} AND selected = 1)`,
			),
		)
		.orderBy(
			asc(bankConnections.lastBackgroundAttemptAt),
			asc(bankConnections.id),
		)
		.limit(50);
	let queued = 0;
	let failed = 0;
	for (const row of rows) {
		await db
			.update(bankConnections)
			.set({ lastBackgroundAttemptAt: new Date().toISOString() })
			.where(eq(bankConnections.id, row.id));
		try {
			await config.BANK_SYNC_WORKFLOW.create({
				id: `bank-sync-${row.id}-${day}`,
				params: { connectionId: row.id },
			});
			queued++;
		} catch {
			// Repeated cron delivery may encounter an existing deterministic workflow. Do not overwrite sync health.
			failed++;
		}
	}
	return { queued, failed };
}
export async function runBankBackgroundSync(
	env: Env,
	connectionId: string,
): Promise<{
	skipped: boolean;
	added?: number;
	modified?: number;
	removed?: number;
}> {
	if ((env as BankEnv).BANK_BACKGROUND_SYNC_ENABLED !== "true")
		return { skipped: true };
	const db = getDb(env);
	const connection = (
		await db
			.select()
			.from(bankConnections)
			.where(eq(bankConnections.id, connectionId))
			.limit(1)
	)[0];
	if (
		!connection ||
		connection.status === "disconnected" ||
		!bankProvider(connection.provider).enabled(env)
	)
		return { skipped: true };
	try {
		await refreshBankAccounts(env, db, connection);
		return {
			skipped: false,
			...(await syncBankConnection(env, db, connection)),
		};
	} catch (error) {
		throw new BankProviderError(
			error instanceof BankProviderError ? error.code : "unavailable",
		);
	}
}
