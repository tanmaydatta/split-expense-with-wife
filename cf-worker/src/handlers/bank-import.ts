import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import {
	bankAccounts,
	bankConnections,
	bankTransactions,
} from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	withAuthLite,
} from "../utils";
import { plaidEnabled, plaidRequest } from "../utils/plaid";
import { decryptBankToken, encryptBankToken } from "../utils/bank-token";
import {
	bankingEnabled,
	bankProvider,
	bankProviders,
} from "../utils/bank-registry";
import {
	acquireBankLease,
	releaseBankLease,
	refreshBankAccounts,
	syncBankConnection,
} from "../utils/bank-sync";

const ExchangeInput = z.object({
	publicToken: z.string().min(1).max(500),
	institutionName: z.string().min(1).max(120),
});

function bankSyncIsBusy(connection: {
	syncLock: string | null;
	syncLockExpiresAt: number | null;
}): boolean {
	return (
		!!connection.syncLock && (connection.syncLockExpiresAt ?? 0) > Date.now()
	);
}

function unavailable(request: Request, env: Env): Response {
	return createErrorResponse(
		"Bank imports are not configured",
		503,
		request,
		env,
	);
}

export async function handleBankLinkToken(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: update-mode guards and Plaid request handling belong to one authenticated operation
	return withAuthLite(request, env, async (session, db) => {
		if (!session.currentUser.groupid)
			return createErrorResponse("Join a group first", 400, request, env);
		try {
			const body: Record<string, unknown> = {
				client_name: "Split Expense Sandbox",
				language: "en",
				country_codes: ["GB"],
				products: ["transactions"],
				transactions: { days_requested: 90 },
				user: { client_user_id: session.user.id },
			};
			const connectionId = new URL(request.url).searchParams.get(
				"connectionId",
			);
			if (connectionId) {
				const connection = (
					await db
						.select()
						.from(bankConnections)
						.where(
							and(
								eq(bankConnections.id, connectionId),
								eq(bankConnections.userId, session.user.id),
							),
						)
						.limit(1)
				)[0];
				if (
					!connection ||
					connection.status === "disconnected" ||
					connection.provider !== "plaid"
				)
					return createErrorResponse(
						"Bank connection not found",
						404,
						request,
						env,
					);
				body.access_token = await decryptBankToken(
					env,
					connection.accessTokenEncrypted,
					connection.provider,
				);
				delete body.products;
				delete body.transactions;
			}
			const webhookOrigin = new URL(env.BASE_URL).origin;
			if (webhookOrigin.startsWith("https://"))
				body.webhook = `${webhookOrigin}/plaid/webhook`;
			const result = await plaidRequest<{ link_token: string }>(
				env,
				"/link/token/create",
				body,
			);
			return createJsonResponse(
				{ linkToken: result.link_token },
				200,
				{},
				request,
				env,
			);
		} catch (error) {
			console.error(
				"Plaid Link token creation failed",
				error instanceof Error ? error.message : "unknown",
			);
			return createErrorResponse(
				"Could not start bank connection",
				502,
				request,
				env,
			);
		}
	});
}

export async function handleBankExchange(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	// Exchange, uniqueness, encryption, and persistence intentionally happen in one request.
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each guard protects a distinct failure mode
	return withAuthLite(request, env, async (session, db) => {
		if (!session.currentUser.groupid)
			return createErrorResponse("Join a group first", 400, request, env);
		const parsed = ExchangeInput.safeParse(await request.json());
		if (!parsed.success)
			return createErrorResponse("Invalid bank connection", 400, request, env);
		try {
			const result = await plaidRequest<{
				access_token: string;
				item_id: string;
			}>(env, "/item/public_token/exchange", {
				public_token: parsed.data.publicToken,
			});
			const existing = await db
				.select()
				.from(bankConnections)
				.where(eq(bankConnections.plaidItemId, result.item_id))
				.limit(1);
			if (existing.length) {
				return createErrorResponse(
					"This bank connection already exists",
					409,
					request,
					env,
				);
			}
			const now = new Date().toISOString();
			const id = `bank_${ulid()}`;
			await db.insert(bankConnections).values({
				id,
				userId: session.user.id,
				groupId: session.currentUser.groupid,
				providerConnectionId: result.item_id,
				plaidItemId: result.item_id,
				institutionName: parsed.data.institutionName,
				accessTokenEncrypted: await encryptBankToken(
					env,
					result.access_token,
					"plaid",
				),
				status: "connected",
				createdAt: now,
				updatedAt: now,
			});
			const saved = (
				await db
					.select()
					.from(bankConnections)
					.where(eq(bankConnections.id, id))
					.limit(1)
			)[0];
			if (saved) {
				try {
					await refreshBankAccounts(env, db, saved);
					await syncBankConnection(env, db, saved);
				} catch (syncError) {
					console.warn(
						"Initial Plaid sync deferred",
						syncError instanceof Error ? syncError.message : "unknown",
					);
				}
			}
			return createJsonResponse({ id }, 201, {}, request, env);
		} catch (error) {
			console.error(
				"Plaid exchange failed",
				error instanceof Error ? error.message : "unknown",
			);
			return createErrorResponse(
				"Could not save bank connection",
				502,
				request,
				env,
			);
		}
	});
}

const ConnectionInput = z.object({ connectionId: z.string().min(1).max(100) });
const SelectInput = ConnectionInput.extend({
	accountId: z.string().min(1).max(200),
	selected: z.boolean(),
});

export async function handleBankAccounts(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const connectionId =
			new URL(request.url).searchParams.get("connectionId") ?? "";
		const connection = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, connectionId),
						eq(bankConnections.userId, session.user.id),
					),
				)
				.limit(1)
		)[0];
		if (!connection)
			return createErrorResponse(
				"Bank connection not found",
				404,
				request,
				env,
			);
		if (connection && !bankProvider(connection.provider).enabled(env))
			return unavailable(request, env);
		const accounts = await db
			.select()
			.from(bankAccounts)
			.where(eq(bankAccounts.connectionId, connection.id));
		return createJsonResponse({ accounts }, 200, {}, request, env);
	});
}

export async function handleBankSelectAccount(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ownership, deletion, and backfill form one account-selection operation
	return withAuthLite(request, env, async (session, db) => {
		const parsed = SelectInput.safeParse(await request.json());
		if (!parsed.success)
			return createErrorResponse(
				"Invalid account selection",
				400,
				request,
				env,
			);
		const connection = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, parsed.data.connectionId),
						eq(bankConnections.userId, session.user.id),
					),
				)
				.limit(1)
		)[0];
		if (!connection)
			return createErrorResponse(
				"Bank connection not found",
				404,
				request,
				env,
			);
		if (connection && !bankProvider(connection.provider).enabled(env))
			return unavailable(request, env);
		if (connection.syncLock && (connection.syncLockExpiresAt ?? 0) > Date.now())
			return createErrorResponse(
				"Bank sync is in progress; try again shortly",
				409,
				request,
				env,
			);
		const leased = await acquireBankLease(db, connection.id).catch(() => null);
		if (!leased)
			return createErrorResponse(
				"Bank sync is in progress; try again shortly",
				409,
				request,
				env,
			);
		try {
			const updated = await db
				.update(bankAccounts)
				.set({ selected: parsed.data.selected })
				.where(
					and(
						eq(bankAccounts.id, parsed.data.accountId),
						eq(bankAccounts.connectionId, connection.id),
					),
				)
				.returning({ id: bankAccounts.id });
			if (!updated.length)
				return createErrorResponse("Bank account not found", 404, request, env);
			if (!parsed.data.selected) {
				await db
					.delete(bankTransactions)
					.where(
						and(
							eq(bankTransactions.connectionId, connection.id),
							eq(bankTransactions.accountId, parsed.data.accountId),
						),
					);
			} else {
				// A full replay imports history for a newly selected account without retaining other accounts.
				await db
					.update(bankConnections)
					.set({ cursor: null })
					.where(eq(bankConnections.id, connection.id));
				await releaseBankLease(db, leased);
				try {
					await syncBankConnection(env, db, connection);
				} catch (error) {
					console.warn(
						"Plaid account backfill deferred",
						error instanceof Error ? error.message : "unknown",
					);
				}
			}
			return createJsonResponse(
				{ selected: parsed.data.selected },
				200,
				{},
				request,
				env,
			);
		} finally {
			await releaseBankLease(db, leased);
		}
	});
}

export async function handleBankSync(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const parsed = ConnectionInput.safeParse(await request.json());
		if (!parsed.success)
			return createErrorResponse("Invalid bank connection", 400, request, env);
		const connection = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, parsed.data.connectionId),
						eq(bankConnections.userId, session.user.id),
					),
				)
				.limit(1)
		)[0];
		if (!connection)
			return createErrorResponse(
				"Bank connection not found",
				404,
				request,
				env,
			);
		if (!bankProvider(connection.provider).enabled(env))
			return unavailable(request, env);
		if (bankSyncIsBusy(connection))
			return createErrorResponse(
				"Bank sync is in progress; try again shortly",
				409,
				request,
				env,
			);
		try {
			await refreshBankAccounts(env, db, connection);
			const counts = await syncBankConnection(env, db, connection);
			return createJsonResponse(counts, 200, {}, request, env);
		} catch {
			console.error("Bank sync failed");
			return createErrorResponse(
				"Could not sync bank activity",
				502,
				request,
				env,
			);
		}
	});
}

export async function handleBankInbox(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const reviewed =
			new URL(request.url).searchParams.get("status") === "reviewed";
		const rows = await db
			.select({
				id: bankTransactions.id,
				connectionId: bankTransactions.connectionId,
				accountId: bankTransactions.accountId,
				accountName: bankAccounts.name,
				date: bankTransactions.date,
				name: bankTransactions.name,
				merchantName: bankTransactions.merchantName,
				amountMinor: bankTransactions.amountMinor,
				currency: bankTransactions.currency,
				linkedTransactionId: bankTransactions.linkedTransactionId,
				reviewStatus: bankTransactions.reviewStatus,
				sourceChanged: bankTransactions.sourceChanged,
				removedAt: bankTransactions.removedAt,
				pending: bankTransactions.pending,
				provider: bankConnections.provider,
				institutionName: bankAccounts.institutionName,
			})
			.from(bankTransactions)
			.innerJoin(bankAccounts, eq(bankTransactions.accountId, bankAccounts.id))
			.innerJoin(
				bankConnections,
				eq(bankTransactions.connectionId, bankConnections.id),
			)
			.where(
				and(
					eq(bankTransactions.userId, session.user.id),
					eq(bankAccounts.selected, true),
					reviewed ? undefined : eq(bankTransactions.pending, false),
					reviewed ? undefined : isNull(bankTransactions.removedAt),
					inArray(
						bankConnections.provider,
						Object.values(bankProviders)
							.filter((provider) => provider.enabled(env))
							.map((provider) => provider.id),
					),
					reviewed
						? ne(bankTransactions.reviewStatus, "unreviewed")
						: eq(bankTransactions.reviewStatus, "unreviewed"),
				),
			)
			.orderBy(desc(bankTransactions.date))
			.limit(100);
		return createJsonResponse({ transactions: rows }, 200, {}, request, env);
	});
}

export async function handleBankReconnected(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const parsed = ConnectionInput.safeParse(await request.json());
		if (!parsed.success)
			return createErrorResponse("Invalid bank connection", 400, request, env);
		const connection = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, parsed.data.connectionId),
						eq(bankConnections.userId, session.user.id),
					),
				)
				.limit(1)
		)[0];
		if (
			!connection ||
			connection.status === "disconnected" ||
			connection.provider !== "plaid"
		)
			return createErrorResponse(
				"Bank connection not found",
				404,
				request,
				env,
			);
		if (connection && !bankProvider(connection.provider).enabled(env))
			return unavailable(request, env);
		await db
			.update(bankConnections)
			.set({ status: "connected", updatedAt: new Date().toISOString() })
			.where(eq(bankConnections.id, connection.id));
		return createJsonResponse({ status: "connected" }, 200, {}, request, env);
	});
}

export async function handleBankDisconnect(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: revoke first, then clear locally only after Plaid confirms
	return withAuthLite(request, env, async (session, db) => {
		const parsed = ConnectionInput.safeParse(await request.json());
		if (!parsed.success)
			return createErrorResponse("Invalid bank connection", 400, request, env);
		const connection = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, parsed.data.connectionId),
						eq(bankConnections.userId, session.user.id),
					),
				)
				.limit(1)
		)[0];
		if (!connection)
			return createErrorResponse(
				"Bank connection not found",
				404,
				request,
				env,
			);
		if (connection && !bankProvider(connection.provider).enabled(env))
			return unavailable(request, env);
		if (connection.syncLock && (connection.syncLockExpiresAt ?? 0) > Date.now())
			return createErrorResponse(
				"Bank sync is in progress; try again shortly",
				409,
				request,
				env,
			);
		const leased = await acquireBankLease(db, connection.id).catch(() => null);
		if (!leased)
			return createErrorResponse(
				"Bank sync is in progress; try again shortly",
				409,
				request,
				env,
			);
		try {
			if (connection.status !== "disconnected") {
				try {
					await bankProvider(connection.provider).disconnect(env, connection);
				} catch (error) {
					console.error(
						"Plaid disconnect failed",
						error instanceof Error ? error.message : "unknown",
					);
					return createErrorResponse(
						"Could not disconnect bank",
						502,
						request,
						env,
					);
				}
			}
			await db.batch([
				db
					.delete(bankTransactions)
					.where(eq(bankTransactions.connectionId, connection.id)),
				db
					.delete(bankAccounts)
					.where(eq(bankAccounts.connectionId, connection.id)),
				db.delete(bankConnections).where(eq(bankConnections.id, connection.id)),
			]);
			return createJsonResponse(
				{ status: "disconnected" },
				200,
				{},
				request,
				env,
			);
		} finally {
			await releaseBankLease(db, leased);
		}
	});
}

export async function handleBankConnections(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!bankingEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const groupId = session.currentUser.groupid;
		if (!groupId)
			return createErrorResponse("Join a group first", 400, request, env);
		const rows = await db
			.select({
				id: bankConnections.id,
				institutionName: bankConnections.institutionName,
				provider: bankConnections.provider,
				lastSyncedAt: bankConnections.lastSyncedAt,
				lastError: bankConnections.lastError,
				status: bankConnections.status,
				createdAt: bankConnections.createdAt,
			})
			.from(bankConnections)
			.where(
				and(
					eq(bankConnections.userId, session.user.id),
					eq(bankConnections.groupId, groupId),
					inArray(
						bankConnections.provider,
						Object.values(bankProviders)
							.filter((provider) => provider.enabled(env))
							.map((provider) => provider.id),
					),
				),
			)
			.orderBy(desc(bankConnections.createdAt));
		return createJsonResponse(
			{
				connections: rows.map((row) => ({
					...row,
					capabilities: bankProvider(row.provider).capabilities,
				})),
				providers: Object.values(bankProviders)
					.filter((provider) => provider.enabled(env))
					.map((provider) => ({
						id: provider.id,
						label: provider.label,
						capabilities: provider.capabilities,
					})),
			},
			200,
			{},
			request,
			env,
		);
	});
}
