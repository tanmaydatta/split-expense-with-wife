import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { bankAccounts, bankConnections } from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	withAuthLite,
} from "../utils";
import { BankProviderError, amountMinor } from "../utils/bank-provider";
import { encryptBankToken, decryptBankToken } from "../utils/bank-token";
import { acquireBankLease, releaseBankLease } from "../utils/bank-sync";
import {
	lunchFlowAccounts,
	lunchFlowEnabled,
	lunchFlowTransactions,
	lunchFlowWindow,
} from "../utils/lunch-flow";
const Setup = z.object({
	apiKey: z.string().trim().min(8).max(4096),
	connectionId: z.string().min(1).max(100).optional(),
});
function failure(request: Request, env: Env, error: unknown): Response {
	const code = error instanceof BankProviderError ? error.code : "unavailable";
	const message =
		code === "reauthorize"
			? "Lunch Flow rejected access. Check your API destination key and Account Access settings."
			: code === "rate_limited"
				? "Lunch Flow rate limit reached. Try again later."
				: code === "invalid_data"
					? "Lunch Flow returned incomplete or unsupported data. No activity was imported."
					: "Could not fetch Lunch Flow data. Try again later.";
	return createErrorResponse(message, 502, request, env);
}
/** A destination belongs to one authenticated owner and may contain several banks. */
export async function handleLunchFlowSetup(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!lunchFlowEnabled(env))
		return createErrorResponse(
			"Lunch Flow is not configured",
			503,
			request,
			env,
		);
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validate upstream before storing the owner's credential and preserve existing account choices.
	return withAuthLite(request, env, async (session, db) => {
		if (!session.currentUser.groupid)
			return createErrorResponse("Join a group first", 400, request, env);
		const input = Setup.safeParse(await request.json().catch(() => null));
		if (!input.success)
			return createErrorResponse("Invalid Lunch Flow setup", 400, request, env);
		const existing = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.userId, session.user.id),
						eq(bankConnections.provider, "lunch_flow"),
					),
				)
				.limit(1)
		)[0];
		if (
			input.data.connectionId &&
			(!existing || existing.id !== input.data.connectionId)
		)
			return createErrorResponse(
				"Bank connection not found",
				404,
				request,
				env,
			);
		if (existing && !input.data.connectionId)
			return createErrorResponse(
				"Lunch Flow is already connected. Replace its key or disconnect first.",
				409,
				request,
				env,
			);
		if (existing && existing.groupId !== session.currentUser.groupid)
			return createErrorResponse(
				"Disconnect the previous group's destination first",
				409,
				request,
				env,
			);
		let accounts: Awaited<ReturnType<typeof lunchFlowAccounts>>;
		try {
			accounts = await lunchFlowAccounts(env, input.data.apiKey);
		} catch (error) {
			return failure(request, env, error);
		}
		if (!accounts.length)
			return createErrorResponse(
				"Enable at least one account in your Lunch Flow API destination's Account Access settings",
				400,
				request,
				env,
			);
		const leased = existing
			? await acquireBankLease(db, existing.id).catch(() => null)
			: null;
		if (existing && !leased)
			return createErrorResponse(
				"Bank sync is in progress; try again shortly",
				409,
				request,
				env,
			);
		const now = new Date().toISOString();
		const id = existing?.id ?? `bank_${ulid()}`;
		try {
			const credential = await encryptBankToken(
				env,
				input.data.apiKey,
				"lunch_flow",
			);
			const destinationId =
				existing?.providerConnectionId ?? `lunch_flow:${ulid()}`;
			const saved = existing
				? db
						.update(bankConnections)
						.set({
							accessTokenEncrypted: credential,
							status: "connected",
							lastError: null,
							updatedAt: now,
						})
						.where(
							and(
								eq(bankConnections.id, id),
								eq(bankConnections.syncLock, leased?.syncLock ?? ""),
							),
						)
				: db
						.insert(bankConnections)
						.values({
							id,
							userId: session.user.id,
							groupId: session.currentUser.groupid,
							provider: "lunch_flow",
							providerConnectionId: destinationId,
							plaidItemId: destinationId,
							institutionName: "Lunch Flow personal destination",
							accessTokenEncrypted: credential,
							status: "connected",
							createdAt: now,
							updatedAt: now,
						});
			const accountWrites = accounts.map((account) => {
				const fields = {
					providerAccountId: account.id,
					name: account.name,
					mask: account.mask,
					type: account.type,
					subtype: account.subtype,
					status: account.status,
					currency: account.currency,
					institutionName: account.institutionName,
				};
				return db
					.insert(bankAccounts)
					.values({
						id: `${id}:${account.id}`,
						connectionId: id,
						...fields,
						selected: false,
					})
					.onConflictDoUpdate({ target: bankAccounts.id, set: fields });
			});
			await db.batch([saved, ...accountWrites]);
			return createJsonResponse(
				{ id, accountCount: accounts.length },
				existing ? 200 : 201,
				{},
				request,
				env,
			);
		} catch {
			return createErrorResponse(
				"Could not save Lunch Flow destination",
				409,
				request,
				env,
			);
		} finally {
			if (leased) await releaseBankLease(db, leased);
		}
	});
}
export async function handleLunchFlowPreview(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!lunchFlowEnabled(env))
		return createErrorResponse(
			"Lunch Flow is not configured",
			503,
			request,
			env,
		);
	return withAuthLite(request, env, async (session, db) => {
		const params = new URL(request.url).searchParams;
		const connection = (
			await db
				.select()
				.from(bankConnections)
				.where(
					and(
						eq(bankConnections.id, params.get("connectionId") ?? ""),
						eq(bankConnections.userId, session.user.id),
						eq(bankConnections.provider, "lunch_flow"),
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
		const account = (
			await db
				.select()
				.from(bankAccounts)
				.where(
					and(
						eq(bankAccounts.id, params.get("accountId") ?? ""),
						eq(bankAccounts.connectionId, connection.id),
					),
				)
				.limit(1)
		)[0];
		if (!account)
			return createErrorResponse("Bank account not found", 404, request, env);
		try {
			const key = await decryptBankToken(
				env,
				connection.accessTokenEncrypted,
				"lunch_flow",
			);
			const window = lunchFlowWindow();
			const rows = await lunchFlowTransactions(
				env,
				key,
				account.providerAccountId,
				window.from,
				window.to,
			);
			return createJsonResponse(
				{
					samples: rows
						.filter((row) => !row.isPending)
						.sort((a, b) => b.date.localeCompare(a.date))
						.slice(0, 10)
						.map((row) => ({
							date: row.date,
							name: row.merchant || row.description || "Bank activity",
							rawAmountMinor: amountMinor(row.amount, row.currency),
							currency: row.currency,
						})),
				},
				200,
				{},
				request,
				env,
			);
		} catch (error) {
			return failure(request, env, error);
		}
	});
}
