import { eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { ulid } from "ulid";
import type {
	BudgetRequest,
	SeedCookie,
	SeedRequest,
	SeedResponse,
	SplitRequest,
} from "../../../shared-types";
import { auth } from "../auth";
import { getDb } from "../db";
import { user as userTable } from "../db/schema/auth-schema";
import {
	budgetEntries,
	expenseBudgetLinks,
	groupBudgets,
	groups,
	transactionUsers,
	transactions,
} from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	isValidCurrency,
} from "../utils";
import {
	createBudgetEntryStatements,
	createSplitTransactionFromRequest,
} from "../utils/scheduled-action-execution";

const SEED_SECRET_HEADER = "X-E2E-Seed-Secret";

const shortId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

function normalizeSameSite(raw: string | undefined): "Lax" | "Strict" | "None" {
	const v = (raw ?? "Lax").toLowerCase();
	if (v === "strict") return "Strict";
	if (v === "none") return "None";
	return "Lax";
}

function buildAttrMap(attrs: string[]): Map<string, string> {
	const attrMap = new Map<string, string>();
	for (const a of attrs) {
		const i = a.indexOf("=");
		if (i === -1) attrMap.set(a.toLowerCase(), "true");
		else attrMap.set(a.slice(0, i).toLowerCase(), a.slice(i + 1));
	}
	return attrMap;
}

// Parse a Set-Cookie header value into a SeedCookie struct compatible with
// Playwright's BrowserContext.addCookies() input. better-auth may emit multiple
// cookies in a single Set-Cookie header, separated by commas — but only commas
// inside attribute values are problematic; the date format used by Expires uses
// a comma. Use Headers.getSetCookie() to get the proper array if available.
function parseSetCookie(setCookie: string): SeedCookie {
	const parts = setCookie.split(";").map((s) => s.trim());
	const [nameValue, ...attrs] = parts;
	const eq = nameValue.indexOf("=");
	const name = nameValue.slice(0, eq);
	const value = nameValue.slice(eq + 1);
	const attrMap = buildAttrMap(attrs);
	return {
		name,
		value,
		domain: attrMap.get("domain") ?? "",
		path: attrMap.get("path") ?? "/",
		sameSite: normalizeSameSite(attrMap.get("samesite")),
		httpOnly: attrMap.has("httponly"),
		secure: attrMap.has("secure"),
		expires: attrMap.has("max-age")
			? Math.floor(Date.now() / 1000) + Number(attrMap.get("max-age"))
			: undefined,
	};
}

type CreatedUser = {
	id: string;
	email: string;
	username: string;
	password: string;
	name: string;
};

async function createUsers(
	payload: SeedRequest,
	env: Env,
): Promise<Record<string, CreatedUser>> {
	const result: Record<string, CreatedUser> = {};
	const authInstance = auth(env);

	for (const u of payload.users ?? []) {
		const email = u.email ?? `${u.alias}-${shortId()}@e2e.test`;
		// Better-auth's default username validator only permits [a-zA-Z0-9_.],
		// so the auto-generated username uses an underscore separator.
		const username = u.username ?? `${u.alias}_${shortId()}`;
		const password = u.password ?? `pw-${shortId()}-${shortId()}`;
		const name = u.name ?? u.alias;

		// Better-auth's user table has additional required fields (firstName, lastName)
		// configured in cf-worker/src/auth.ts. They have defaultValue: "".
		// signUpEmail accepts arbitrary additionalFields via the body; cast as any to
		// bypass strict typing of the helper.
		const signUp = await authInstance.api.signUpEmail({
			body: {
				email,
				password,
				name,
				username,
				firstName: "",
				lastName: "",
				// biome-ignore lint/suspicious/noExplicitAny: additional fields configured in auth.ts
			} as any,
		});
		if (!signUp || !signUp.user) {
			throw new Error(`failed to create user '${u.alias}' (alias)`);
		}
		result[u.alias] = {
			id: signUp.user.id,
			email,
			username,
			password,
			name,
		};
	}
	return result;
}

type CreatedGroup = { id: string };
type GroupSpec = NonNullable<SeedRequest["groups"]>[number];

async function insertGroupRow(
	g: GroupSpec,
	groupId: string,
	memberUserIds: string[],
	now: string,
	db: ReturnType<typeof getDb>,
): Promise<void> {
	const metadata: Record<string, unknown> = {
		defaultCurrency: g.defaultCurrency ?? "GBP",
		...(g.metadata ?? {}),
	};
	await db.insert(groups).values({
		groupid: groupId,
		groupName: g.name ?? `e2e-group-${shortId()}`,
		userids: JSON.stringify(memberUserIds),
		metadata: JSON.stringify(metadata),
		createdAt: now,
	});
}

// Budgets — only what's explicitly listed in the payload. The seed handler is
// a pure passthrough; the test factory (Task 14) injects any default budget at
// the payload level for ergonomics.
async function insertGroupBudgets(
	g: GroupSpec,
	groupId: string,
	now: string,
	db: ReturnType<typeof getDb>,
	budgetIds: Record<string, { id: string }>,
): Promise<void> {
	for (const b of g.budgets ?? []) {
		const budgetId = ulid();
		budgetIds[b.alias] = { id: budgetId };
		await db.insert(groupBudgets).values({
			id: budgetId,
			groupId,
			budgetName: b.name,
			description: b.description ?? null,
			createdAt: now,
			updatedAt: now,
		});
	}
}

// Update each member user's groupid (better-auth additional field on the user
// table) to point to this group. If a user is a member of multiple groups,
// the LAST group they're a member of wins.
async function updateMembersGroupId(
	g: GroupSpec,
	groupId: string,
	users: Record<string, CreatedUser>,
	db: ReturnType<typeof getDb>,
): Promise<void> {
	for (const memberAlias of g.members) {
		await db
			.update(userTable)
			.set({ groupid: groupId })
			.where(eq(userTable.id, users[memberAlias].id));
	}
}

async function createGroups(
	payload: SeedRequest,
	users: Record<string, CreatedUser>,
	db: ReturnType<typeof getDb>,
): Promise<{
	groups: Record<string, CreatedGroup>;
	budgets: Record<string, { id: string }>;
	defaultCurrencies: Record<string, string>;
}> {
	const groupIds: Record<string, CreatedGroup> = {};
	const budgetIds: Record<string, { id: string }> = {};
	const defaultCurrencies: Record<string, string> = {};
	const now = new Date().toISOString();

	for (const g of payload.groups ?? []) {
		const groupId = ulid();
		groupIds[g.alias] = { id: groupId };
		defaultCurrencies[g.alias] = g.defaultCurrency ?? "GBP";
		const memberUserIds = g.members.map((alias) => users[alias].id);

		await insertGroupRow(g, groupId, memberUserIds, now, db);
		await insertGroupBudgets(g, groupId, now, db, budgetIds);
		await updateMembersGroupId(g, groupId, users, db);
	}

	return { groups: groupIds, budgets: budgetIds, defaultCurrencies };
}

async function createTransactions(
	payload: SeedRequest,
	users: Record<string, CreatedUser>,
	groupIdMap: Record<string, CreatedGroup>,
	groupDefaultCurrency: Record<string, string>,
	db: ReturnType<typeof getDb>,
	env: Env,
): Promise<Record<string, { id: string }>> {
	const txIds: Record<string, { id: string }> = {};

	for (const t of payload.transactions ?? []) {
		const txId = `tx_${ulid()}`;
		txIds[t.alias] = { id: txId };
		const groupId = groupIdMap[t.group].id;

		// Translate alias-keyed share maps to user-id-keyed
		const paidByShares: Record<string, number> = {};
		for (const [alias, val] of Object.entries(t.paidByShares)) {
			paidByShares[users[alias].id] = val;
		}
		const splitPctShares: Record<string, number> = {};
		for (const [alias, val] of Object.entries(t.splitPctShares)) {
			splitPctShares[users[alias].id] = val;
		}

		const splitRequest: SplitRequest = {
			amount: t.amount,
			description: t.description ?? `e2e-tx-${shortId()}`,
			currency: t.currency ?? groupDefaultCurrency[t.group] ?? "GBP",
			paidByShares,
			splitPctShares,
		};

		const result = await createSplitTransactionFromRequest(
			splitRequest,
			groupId,
			db,
			env,
			txId,
		);
		if (result.statements.length > 0) {
			const queries = result.statements.map((s) => s.query);
			await db.batch([queries[0], ...queries.slice(1)]);
		}
	}

	return txIds;
}

async function createLinks(
	payload: SeedRequest,
	txIds: Record<string, { id: string }>,
	beIds: Record<string, { id: string }>,
	groupIds: Record<string, CreatedGroup>,
	groupResolver: (txAlias: string) => string,
	db: ReturnType<typeof getDb>,
): Promise<Record<string, { id: string }>> {
	const linkIds: Record<string, { id: string }> = {};
	const now = new Date().toISOString();

	for (const link of payload.expenseBudgetLinks ?? []) {
		const id = ulid();
		const groupAlias = groupResolver(link.transaction);
		linkIds[`${link.transaction}_${link.budgetEntry}`] = { id };
		await db.insert(expenseBudgetLinks).values({
			id,
			transactionId: txIds[link.transaction].id,
			budgetEntryId: beIds[link.budgetEntry].id,
			groupId: groupIds[groupAlias].id,
			createdAt: now,
		});
	}

	return linkIds;
}

async function createBudgetEntries(
	payload: SeedRequest,
	groupIdMap: Record<string, CreatedGroup>,
	budgetIdMap: Record<string, { id: string }>,
	groupDefaultCurrency: Record<string, string>,
	db: ReturnType<typeof getDb>,
): Promise<Record<string, { id: string }>> {
	const beIds: Record<string, { id: string }> = {};

	for (const be of payload.budgetEntries ?? []) {
		const beId = ulid();
		beIds[be.alias] = { id: beId };
		const groupBudgetsId = budgetIdMap[be.budget].id;
		const groupId = groupIdMap[be.group].id;

		const budgetRequest: BudgetRequest = {
			amount: be.amount,
			description: be.description ?? `e2e-be-${shortId()}`,
			budgetId: groupBudgetsId,
			currency: be.currency ?? groupDefaultCurrency[be.group] ?? "GBP",
			groupid: groupId,
		};

		const result = await createBudgetEntryStatements(budgetRequest, db, beId);
		if (result.statements.length > 0) {
			const queries = result.statements.map((s) => s.query);
			await db.batch([queries[0], ...queries.slice(1)]);
		}
	}

	return beIds;
}

function validateUsernameLength(
	u: NonNullable<SeedRequest["users"]>[number],
): string | null {
	if (u.username !== undefined) {
		if (u.username.length > 30) {
			return `users alias '${u.alias}' username '${u.username}' exceeds 30 chars`;
		}
		return null;
	}
	if (u.alias.length > 21) {
		return `users alias '${u.alias}' too long for default username generation (max 21 chars)`;
	}
	return null;
}

function validateUsers(
	payload: SeedRequest,
	userAliases: Set<string>,
): string | null {
	for (const u of payload.users ?? []) {
		if (userAliases.has(u.alias)) return `users alias '${u.alias}' duplicated`;
		userAliases.add(u.alias);
		const lenErr = validateUsernameLength(u);
		if (lenErr) return lenErr;
	}
	return null;
}

function validateGroup(
	g: NonNullable<SeedRequest["groups"]>[number],
	userAliases: Set<string>,
): string | null {
	for (const member of g.members) {
		if (!userAliases.has(member)) {
			return `group '${g.alias}' member '${member}' not in users[]`;
		}
	}
	if (g.defaultCurrency && !isValidCurrency(g.defaultCurrency)) {
		return `group '${g.alias}' has invalid currency '${g.defaultCurrency}'`;
	}
	return null;
}

function validateGroups(
	payload: SeedRequest,
	userAliases: Set<string>,
	groupAliases: Set<string>,
): string | null {
	for (const g of payload.groups ?? []) {
		if (groupAliases.has(g.alias))
			return `groups alias '${g.alias}' duplicated`;
		groupAliases.add(g.alias);
		const err = validateGroup(g, userAliases);
		if (err) return err;
	}
	return null;
}

function collectBudgets(
	payload: SeedRequest,
	budgetAliasToGroup: Map<string, string>,
): string | null {
	for (const g of payload.groups ?? []) {
		for (const b of g.budgets ?? []) {
			if (budgetAliasToGroup.has(b.alias)) {
				return `budget alias '${b.alias}' duplicated`;
			}
			budgetAliasToGroup.set(b.alias, g.alias);
		}
	}
	return null;
}

function validateTransactionShares(
	t: NonNullable<SeedRequest["transactions"]>[number],
	userAliases: Set<string>,
): string | null {
	for (const userAlias of Object.keys(t.paidByShares)) {
		if (!userAliases.has(userAlias)) {
			return `transaction '${t.alias}' paidByShares references unknown user '${userAlias}'`;
		}
	}
	for (const userAlias of Object.keys(t.splitPctShares)) {
		if (!userAliases.has(userAlias)) {
			return `transaction '${t.alias}' splitPctShares references unknown user '${userAlias}'`;
		}
	}
	const paidSum = Object.values(t.paidByShares).reduce((a, b) => a + b, 0);
	if (Math.abs(paidSum - t.amount) > 0.01) {
		return `transaction '${t.alias}' paidByShares sum ${paidSum} != amount ${t.amount}`;
	}
	const pctSum = Object.values(t.splitPctShares).reduce((a, b) => a + b, 0);
	if (Math.abs(pctSum - 100) > 0.01) {
		return `transaction '${t.alias}' splitPctShares sum ${pctSum} != 100`;
	}
	if (t.currency && !isValidCurrency(t.currency)) {
		return `transaction '${t.alias}' invalid currency '${t.currency}'`;
	}
	return null;
}

function validateTransactions(
	payload: SeedRequest,
	userAliases: Set<string>,
	groupAliases: Set<string>,
	txAliases: Set<string>,
): string | null {
	for (const t of payload.transactions ?? []) {
		if (txAliases.has(t.alias))
			return `transactions alias '${t.alias}' duplicated`;
		txAliases.add(t.alias);
		if (!groupAliases.has(t.group)) {
			return `transaction '${t.alias}' references unknown group '${t.group}'`;
		}
		const shareErr = validateTransactionShares(t, userAliases);
		if (shareErr) return shareErr;
	}
	return null;
}

function validateBudgetEntry(
	be: NonNullable<SeedRequest["budgetEntries"]>[number],
	groupAliases: Set<string>,
	budgetAliasToGroup: Map<string, string>,
): string | null {
	if (!groupAliases.has(be.group)) {
		return `budgetEntry '${be.alias}' references unknown group '${be.group}'`;
	}
	if (!budgetAliasToGroup.has(be.budget)) {
		return `budgetEntry '${be.alias}' references unknown budget '${be.budget}'`;
	}
	if (budgetAliasToGroup.get(be.budget) !== be.group) {
		return `budgetEntry '${be.alias}' budget '${be.budget}' belongs to a different group`;
	}
	if (be.currency && !isValidCurrency(be.currency)) {
		return `budgetEntry '${be.alias}' invalid currency '${be.currency}'`;
	}
	return null;
}

function validateBudgetEntries(
	payload: SeedRequest,
	groupAliases: Set<string>,
	budgetAliasToGroup: Map<string, string>,
	beAliases: Set<string>,
): string | null {
	for (const be of payload.budgetEntries ?? []) {
		if (beAliases.has(be.alias))
			return `budgetEntries alias '${be.alias}' duplicated`;
		beAliases.add(be.alias);
		const err = validateBudgetEntry(be, groupAliases, budgetAliasToGroup);
		if (err) return err;
	}
	return null;
}

function validateExpenseBudgetLinks(
	payload: SeedRequest,
	txAliases: Set<string>,
	beAliases: Set<string>,
): string | null {
	for (const link of payload.expenseBudgetLinks ?? []) {
		if (!txAliases.has(link.transaction)) {
			return `expenseBudgetLink references unknown transaction '${link.transaction}'`;
		}
		if (!beAliases.has(link.budgetEntry)) {
			return `expenseBudgetLink references unknown budget entry '${link.budgetEntry}'`;
		}
	}
	return null;
}

function validateAuthenticate(
	payload: SeedRequest,
	userAliases: Set<string>,
): string | null {
	for (const alias of payload.authenticate ?? []) {
		if (!userAliases.has(alias)) {
			return `authenticate references unknown user '${alias}'`;
		}
	}
	return null;
}

function validate(payload: SeedRequest): string | null {
	const userAliases = new Set<string>();
	const groupAliases = new Set<string>();
	const budgetAliasToGroup = new Map<string, string>();
	const txAliases = new Set<string>();
	const beAliases = new Set<string>();

	return (
		validateUsers(payload, userAliases) ||
		validateGroups(payload, userAliases, groupAliases) ||
		collectBudgets(payload, budgetAliasToGroup) ||
		validateTransactions(payload, userAliases, groupAliases, txAliases) ||
		validateBudgetEntries(
			payload,
			groupAliases,
			budgetAliasToGroup,
			beAliases,
		) ||
		validateExpenseBudgetLinks(payload, txAliases, beAliases) ||
		validateAuthenticate(payload, userAliases)
	);
}

async function issueSessions(
	payload: SeedRequest,
	users: Record<string, CreatedUser>,
	env: Env,
): Promise<Record<string, { cookies: SeedCookie[] }>> {
	const sessions: Record<string, { cookies: SeedCookie[] }> = {};
	if (!payload.authenticate || payload.authenticate.length === 0)
		return sessions;

	const authInstance = auth(env);

	for (const alias of payload.authenticate) {
		const u = users[alias];
		const signInRequest = new Request(
			"http://localhost:8787/auth/sign-in/email",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: u.email, password: u.password }),
			},
		);
		const signInResponse = await authInstance.handler(signInRequest);
		if (signInResponse.status !== 200) {
			throw new Error(
				`sign-in failed for alias '${alias}' (status ${signInResponse.status})`,
			);
		}
		// Use getSetCookie() to handle multi-cookie Set-Cookie headers properly.
		const setCookies =
			typeof signInResponse.headers.getSetCookie === "function"
				? signInResponse.headers.getSetCookie()
				: [signInResponse.headers.get("Set-Cookie") ?? ""].filter(Boolean);
		const cookies: SeedCookie[] = setCookies.map(parseSetCookie);
		sessions[alias] = { cookies };
	}

	return sessions;
}

type SeedExecutionResult = {
	users: Record<string, CreatedUser>;
	groupResult: Awaited<ReturnType<typeof createGroups>>;
	txIdMap: Record<string, { id: string }>;
	beIdMap: Record<string, { id: string }>;
	linkIdMap: Record<string, { id: string }>;
	sessions: Record<string, { cookies: SeedCookie[] }>;
};

async function executeSeedPhases(
	payload: SeedRequest,
	env: Env,
	db: ReturnType<typeof getDb>,
	cleanup: Array<() => Promise<void>>,
): Promise<SeedExecutionResult> {
	// Phase 1: users
	const users = await createUsers(payload, env);
	cleanup.push(async () => {
		for (const u of Object.values(users)) {
			await db.delete(userTable).where(eq(userTable.id, u.id));
		}
	});

	// Phase 2: groups + group_budgets
	const groupResult = await createGroups(payload, users, db);
	cleanup.push(async () => {
		for (const b of Object.values(groupResult.budgets)) {
			await db.delete(groupBudgets).where(eq(groupBudgets.id, b.id));
		}
		for (const g of Object.values(groupResult.groups)) {
			await db.delete(groups).where(eq(groups.groupid, g.id));
		}
	});

	// Phase 3: transactions
	const txIdMap = await createTransactions(
		payload,
		users,
		groupResult.groups,
		groupResult.defaultCurrencies,
		db,
		env,
	);
	cleanup.push(async () => {
		for (const t of Object.values(txIdMap)) {
			await db
				.delete(transactions)
				.where(eq(transactions.transactionId, t.id));
			await db
				.delete(transactionUsers)
				.where(eq(transactionUsers.transactionId, t.id));
		}
	});

	// Phase 4: budget entries
	const beIdMap = await createBudgetEntries(
		payload,
		groupResult.groups,
		groupResult.budgets,
		groupResult.defaultCurrencies,
		db,
	);
	cleanup.push(async () => {
		for (const be of Object.values(beIdMap)) {
			await db
				.delete(budgetEntries)
				.where(eq(budgetEntries.budgetEntryId, be.id));
		}
	});

	// Phase 5: expense_budget_links
	const txAliasToGroupAlias = new Map<string, string>();
	for (const t of payload.transactions ?? []) {
		txAliasToGroupAlias.set(t.alias, t.group);
	}
	const linkIdMap = await createLinks(
		payload,
		txIdMap,
		beIdMap,
		groupResult.groups,
		(alias) => txAliasToGroupAlias.get(alias) as string,
		db,
	);
	cleanup.push(async () => {
		for (const l of Object.values(linkIdMap)) {
			await db
				.delete(expenseBudgetLinks)
				.where(eq(expenseBudgetLinks.id, l.id));
		}
	});

	// Phase 6: sessions (no DB writes specific to this phase that need rollback,
	// but include for symmetry — better-auth's signIn updates session table; if
	// earlier phases all succeeded then session creation rarely fails).
	const sessions = await issueSessions(payload, users, env);

	return { users, groupResult, txIdMap, beIdMap, linkIdMap, sessions };
}

function buildSeedResponse(result: SeedExecutionResult): SeedResponse {
	return {
		ids: {
			users: Object.fromEntries(
				Object.entries(result.users).map(([alias, u]) => [
					alias,
					{ id: u.id, email: u.email, username: u.username },
				]),
			),
			groups: result.groupResult.groups,
			transactions: result.txIdMap,
			budgetEntries: result.beIdMap,
			expenseBudgetLinks: result.linkIdMap,
		},
		sessions: result.sessions,
	};
}

export async function handleTestSeed(
	request: Request,
	env: Env,
): Promise<Response> {
	// Layer 2: per-request secret check
	const provided = request.headers.get(SEED_SECRET_HEADER);
	if (!provided || provided !== env.E2E_SEED_SECRET) {
		return createErrorResponse("Not Found", 404, request, env);
	}

	let payload: SeedRequest;
	try {
		payload = (await request.json()) as SeedRequest;
	} catch {
		return createErrorResponse("Invalid JSON", 400, request, env);
	}

	const error = validate(payload);
	if (error) {
		return createErrorResponse(error, 400, request, env);
	}

	const db = getDb(env);
	const cleanup: Array<() => Promise<void>> = [];

	try {
		const result = await executeSeedPhases(payload, env, db, cleanup);
		return createJsonResponse(buildSeedResponse(result), 200, {}, request, env);
	} catch (e) {
		// Best-effort rollback in reverse order of insertion
		for (const undo of cleanup.reverse()) {
			try {
				await undo();
			} catch {
				// Swallow individual cleanup errors so we still attempt all of them.
			}
		}
		return createErrorResponse(
			`seed failed: ${(e as Error).message}`,
			500,
			request,
			env,
		);
	}
}
