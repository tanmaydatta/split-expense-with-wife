import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { bankConnections } from "../db/schema/schema";
import { createErrorResponse, createJsonResponse, withAuthLite } from "../utils";
import { encryptPlaidToken, plaidEnabled, plaidRequest } from "../utils/plaid";

const ExchangeInput = z.object({
	publicToken: z.string().min(1).max(500),
	institutionName: z.string().min(1).max(120),
});

function unavailable(request: Request, env: Env): Response {
	return createErrorResponse("Plaid Sandbox is not configured", 503, request, env);
}

export async function handleBankLinkToken(request: Request, env: Env): Promise<Response> {
	if (!plaidEnabled(env)) return unavailable(request, env);
	return withAuthLite(request, env, async (session) => {
		if (!session.currentUser.groupid) return createErrorResponse("Join a group first", 400, request, env);
		try {
			const result = await plaidRequest<{ link_token: string }>(env, "/link/token/create", {
				client_name: "Split Expense Sandbox",
				language: "en",
				country_codes: ["GB"],
				products: ["transactions"],
				transactions: { days_requested: 90 },
				user: { client_user_id: session.user.id },
			});
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
			return createJsonResponse({ id }, 201, {}, request, env);
		} catch (error) {
			console.error("Plaid exchange failed", error instanceof Error ? error.message : "unknown");
			return createErrorResponse("Could not save bank connection", 502, request, env);
		}
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
