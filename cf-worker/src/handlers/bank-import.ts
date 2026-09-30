import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { bankAccounts, bankConnections, bankTransactions } from "../db/schema/schema";
import { createErrorResponse, createJsonResponse, withAuthLite } from "../utils";
import { decryptPlaidToken, encryptPlaidToken, plaidEnabled, plaidRequest } from "../utils/plaid";
import { refreshBankAccounts, syncBankConnection } from "../utils/plaid-sync";

const ExchangeInput = z.object({
	publicToken: z.string().min(1).max(500),
	institutionName: z.string().min(1).max(120),
});

function unavailable(request: Request, env: Env): Response {
	return createErrorResponse("Plaid Sandbox is not configured", 503, request, env);
}

export async function handleBankLinkToken(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: update-mode guards and Plaid request handling belong to one authenticated operation
	return withAuthLite(request, env, async (session, db) => {
		if (!session.currentUser.groupid) return createErrorResponse("Join a group first", 400, request, env);
		try {
			const body: Record<string, unknown> = {
				client_name: "Split Expense Sandbox",
				language: "en",
				country_codes: ["GB"],
				products: ["transactions"],
				transactions: { days_requested: 90 },
				user: { client_user_id: session.user.id },
			};
			const connectionId = new URL(request.url).searchParams.get("connectionId");
			if (connectionId) {
				const connection = (await db.select().from(bankConnections).where(and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, session.user.id))).limit(1))[0];
				if (!connection || connection.status === "disconnected") return createErrorResponse("Bank connection not found", 404, request, env);
				body.access_token = await decryptPlaidToken(env, connection.accessTokenEncrypted);
				delete body.products;
				delete body.transactions;
			}
			const webhookOrigin = new URL(env.BASE_URL).origin;
			if (webhookOrigin.startsWith("https://")) body.webhook = `${webhookOrigin}/plaid/webhook`;
			const result = await plaidRequest<{ link_token: string }>(env, "/link/token/create", body);
			return createJsonResponse({ linkToken: result.link_token }, 200, {}, request, env);
		} catch (error) {
			console.error("Plaid Link token creation failed", error instanceof Error ? error.message : "unknown");
			return createErrorResponse("Could not start bank connection", 502, request, env);
		}
	});
}

export async function handleBankExchange(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	// Exchange, uniqueness, encryption, and persistence intentionally happen in one request.
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each guard protects a distinct failure mode
	return withAuthLite(request, env, async (session, db) => {
		if (!session.currentUser.groupid) return createErrorResponse("Join a group first", 400, request, env);
		const parsed = ExchangeInput.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse("Invalid bank connection", 400, request, env);
		try {
			const result = await plaidRequest<{ access_token: string; item_id: string }>(env, "/item/public_token/exchange", {
				public_token: parsed.data.publicToken,
			});
			const existing = await db.select().from(bankConnections).where(eq(bankConnections.plaidItemId, result.item_id)).limit(1);
			if (existing.length) {
				return createErrorResponse("This bank connection already exists", 409, request, env);
			}
			const now = new Date().toISOString();
			const id = `bank_${ulid()}`;
			await db.insert(bankConnections).values({
				id,
				userId: session.user.id,
				groupId: session.currentUser.groupid,
				plaidItemId: result.item_id,
				institutionName: parsed.data.institutionName,
				accessTokenEncrypted: await encryptPlaidToken(env, result.access_token),
				status: "connected",
				createdAt: now,
				updatedAt: now,
			});
			const saved = (await db.select().from(bankConnections).where(eq(bankConnections.id, id)).limit(1))[0];
			if (saved) {
				try {
					await refreshBankAccounts(env, db, saved);
					await syncBankConnection(env, db, saved);
				} catch (syncError) {
					console.warn("Initial Plaid sync deferred", syncError instanceof Error ? syncError.message : "unknown");
				}
			}
			return createJsonResponse({ id }, 201, {}, request, env);
		} catch (error) {
			console.error("Plaid exchange failed", error instanceof Error ? error.message : "unknown");
			return createErrorResponse("Could not save bank connection", 502, request, env);
		}
	});
}

const ConnectionInput = z.object({ connectionId: z.string().min(1).max(100) });
const SelectInput = ConnectionInput.extend({ accountId: z.string().min(1).max(200), selected: z.boolean() });

export async function handleBankAccounts(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const connectionId = new URL(request.url).searchParams.get("connectionId") ?? "";
		const connection = (await db.select().from(bankConnections).where(and(eq(bankConnections.id, connectionId), eq(bankConnections.userId, session.user.id))).limit(1))[0];
		if (!connection) return createErrorResponse("Bank connection not found", 404, request, env);
		const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.connectionId, connection.id));
		return createJsonResponse({ accounts }, 200, {}, request, env);
	});
}

export async function handleBankSelectAccount(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ownership, deletion, and backfill form one account-selection operation
	return withAuthLite(request, env, async (session, db) => {
		const parsed = SelectInput.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse("Invalid account selection", 400, request, env);
		const connection = (await db.select().from(bankConnections).where(and(eq(bankConnections.id, parsed.data.connectionId), eq(bankConnections.userId, session.user.id))).limit(1))[0];
		if (!connection) return createErrorResponse("Bank connection not found", 404, request, env);
		const updated = await db.update(bankAccounts).set({ selected: parsed.data.selected }).where(and(eq(bankAccounts.id, parsed.data.accountId), eq(bankAccounts.connectionId, connection.id))).returning({ id: bankAccounts.id });
		if (!updated.length) return createErrorResponse("Bank account not found", 404, request, env);
		if (!parsed.data.selected) {
			await db.delete(bankTransactions).where(and(eq(bankTransactions.connectionId, connection.id), eq(bankTransactions.accountId, parsed.data.accountId)));
		} else {
			// A full replay imports history for a newly selected account without retaining other accounts.
			await db.update(bankConnections).set({ cursor: null }).where(eq(bankConnections.id, connection.id));
			try {
				await syncBankConnection(env, db, { ...connection, cursor: null });
			} catch (error) {
				console.warn("Plaid account backfill deferred", error instanceof Error ? error.message : "unknown");
			}
		}
		return createJsonResponse({ selected: parsed.data.selected }, 200, {}, request, env);
	});
}

export async function handleBankSync(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const parsed = ConnectionInput.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse("Invalid bank connection", 400, request, env);
		const connection = (await db.select().from(bankConnections).where(and(eq(bankConnections.id, parsed.data.connectionId), eq(bankConnections.userId, session.user.id))).limit(1))[0];
		if (!connection) return createErrorResponse("Bank connection not found", 404, request, env);
		try {
			await refreshBankAccounts(env, db, connection);
			const counts = await syncBankConnection(env, db, connection);
			return createJsonResponse(counts, 200, {}, request, env);
		} catch (error) {
			console.error("Plaid sync failed", error instanceof Error ? error.message : "unknown");
			return createErrorResponse("Could not sync bank activity", 502, request, env);
		}
	});
}

export async function handleBankInbox(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const reviewed = new URL(request.url).searchParams.get("status") === "reviewed";
		const rows = await db.select({
			id: bankTransactions.id, connectionId: bankTransactions.connectionId,
			accountId: bankTransactions.accountId, accountName: bankAccounts.name,
			date: bankTransactions.date, name: bankTransactions.name,
			merchantName: bankTransactions.merchantName, amountMinor: bankTransactions.amountMinor,
			currency: bankTransactions.currency, linkedTransactionId: bankTransactions.linkedTransactionId,
			reviewStatus: bankTransactions.reviewStatus,
		}).from(bankTransactions).innerJoin(bankAccounts, eq(bankTransactions.accountId, bankAccounts.id))
			.where(and(eq(bankTransactions.userId, session.user.id), eq(bankAccounts.selected, true), eq(bankTransactions.pending, false), isNull(bankTransactions.removedAt),
				reviewed ? ne(bankTransactions.reviewStatus, "unreviewed") : eq(bankTransactions.reviewStatus, "unreviewed")))
			.orderBy(desc(bankTransactions.date)).limit(100);
		return createJsonResponse({ transactions: rows }, 200, {}, request, env);
	});
}

export async function handleBankReconnected(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const parsed = ConnectionInput.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse("Invalid bank connection", 400, request, env);
		const connection = (await db.select().from(bankConnections).where(and(eq(bankConnections.id, parsed.data.connectionId), eq(bankConnections.userId, session.user.id))).limit(1))[0];
		if (!connection || connection.status === "disconnected") return createErrorResponse("Bank connection not found", 404, request, env);
		await db.update(bankConnections).set({ status: "connected", updatedAt: new Date().toISOString() }).where(eq(bankConnections.id, connection.id));
		return createJsonResponse({ status: "connected" }, 200, {}, request, env);
	});
}

export async function handleBankDisconnect(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: revoke first, then clear locally only after Plaid confirms
	return withAuthLite(request, env, async (session, db) => {
		const parsed = ConnectionInput.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse("Invalid bank connection", 400, request, env);
		const connection = (await db.select().from(bankConnections).where(and(eq(bankConnections.id, parsed.data.connectionId), eq(bankConnections.userId, session.user.id))).limit(1))[0];
		if (!connection) return createErrorResponse("Bank connection not found", 404, request, env);
		if (connection.status !== "disconnected") {
			try {
				await plaidRequest(env, "/item/remove", { access_token: await decryptPlaidToken(env, connection.accessTokenEncrypted) });
			} catch (error) {
				console.error("Plaid disconnect failed", error instanceof Error ? error.message : "unknown");
				return createErrorResponse("Could not disconnect bank", 502, request, env);
			}
		}
		await db.batch([
			db.delete(bankTransactions).where(eq(bankTransactions.connectionId, connection.id)),
			db.delete(bankAccounts).where(eq(bankAccounts.connectionId, connection.id)),
			db.delete(bankConnections).where(eq(bankConnections.id, connection.id)),
		]);
		return createJsonResponse({ status: "disconnected" }, 200, {}, request, env);
	});
}

export async function handleBankConnections(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session, db) => {
		const groupId = session.currentUser.groupid;
		if (!groupId) return createErrorResponse("Join a group first", 400, request, env);
		const rows = await db.select({
			id: bankConnections.id,
			institutionName: bankConnections.institutionName,
			status: bankConnections.status,
			createdAt: bankConnections.createdAt,
		}).from(bankConnections).where(and(eq(bankConnections.userId, session.user.id), eq(bankConnections.groupId, groupId)))
			.orderBy(desc(bankConnections.createdAt));
		return createJsonResponse({ connections: rows }, 200, {}, request, env);
	});
}
