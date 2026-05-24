import { and, eq, isNull, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { auth } from "../auth";
import { getDb } from "../db";
import { account, user } from "../db/schema/auth-schema";
import { groupBudgets, groups } from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	formatSQLiteTime,
} from "../utils";

const DEFAULT_BUDGETS = ["House", "Food"] as const;

export interface SignupAllowlistEntry {
	email: string;
	username: string;
	groupId: string;
	groupName: string;
}

interface SignupBody {
	email: string;
	username: string;
	password: string;
	name: string;
	firstName: string;
	lastName: string;
}

type SignInRoute = "/auth/sign-in/email" | "/auth/sign-in/username";

function normalizeIdentity(value: string): string {
	return value.trim().toLowerCase();
}

function maskEmail(value: string): string {
	const normalized = normalizeIdentity(value);
	const [localPart, domain] = normalized.split("@");
	if (!localPart || !domain) {
		return "<invalid-email>";
	}

	const prefix = localPart.slice(0, 2);
	return `${prefix}${localPart.length > 2 ? "***" : "*"}@${domain}`;
}

function logSignupAllowlistError(body: SignupBody, error: unknown): void {
	console.error("Allowlisted signup rejected: allowlist check failed", {
		email: maskEmail(body.email),
		username: normalizeIdentity(body.username),
		reason: error instanceof Error ? error.message : "Unknown allowlist error",
	});
}

function getSignupAllowlistEntry(
	body: SignupBody,
	env: Env,
): SignupAllowlistEntry | null {
	const allowlist = parseSignupAllowlist(env.SIGNUP_ALLOWLIST_JSON);
	const entry = findAllowlistEntry(allowlist, body);
	if (!entry) {
		console.warn("Allowlisted signup rejected: no matching entry", {
			email: maskEmail(body.email),
			username: normalizeIdentity(body.username),
			allowlistCount: allowlist.length,
		});
	}

	return entry;
}

function requireStringField(
	entry: Record<string, unknown>,
	field: keyof SignupAllowlistEntry,
): string {
	const value = entry[field];
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Incomplete signup allowlist entry: ${field} is required`);
	}
	return value.trim();
}

export function parseSignupAllowlist(
	json: string | undefined,
): SignupAllowlistEntry[] {
	if (!json) {
		throw new Error("Signup allowlist is missing");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("Signup allowlist is malformed");
	}

	if (!Array.isArray(parsed)) {
		throw new Error("Signup allowlist must be an array");
	}

	return parsed.map((rawEntry) => {
		if (rawEntry === null || typeof rawEntry !== "object") {
			throw new Error("Signup allowlist entry is malformed");
		}

		const entry = rawEntry as Record<string, unknown>;
		return {
			email: normalizeIdentity(requireStringField(entry, "email")),
			username: normalizeIdentity(requireStringField(entry, "username")),
			groupId: requireStringField(entry, "groupId"),
			groupName: requireStringField(entry, "groupName"),
		};
	});
}

export function findAllowlistEntry(
	allowlist: SignupAllowlistEntry[],
	identity: { email: string; username: string },
): SignupAllowlistEntry | null {
	const email = normalizeIdentity(identity.email);
	const username = normalizeIdentity(identity.username);
	const matches = allowlist.filter(
		(entry) => entry.email === email || entry.username === username,
	);

	if (matches.length > 1) {
		throw new Error("Ambiguous signup allowlist match");
	}

	return matches[0] ?? null;
}

export function calculateEqualShares(
	userIds: string[],
): Record<string, number> {
	const uniqueSortedIds = Array.from(new Set(userIds)).sort();
	if (uniqueSortedIds.length === 0) {
		return {};
	}

	const totalCents = 10_000;
	const baseShareCents = Math.floor(totalCents / uniqueSortedIds.length);
	const shares: Record<string, number> = {};

	for (const [index, userId] of uniqueSortedIds.entries()) {
		const shareCents =
			index === uniqueSortedIds.length - 1
				? totalCents - baseShareCents * (uniqueSortedIds.length - 1)
				: baseShareCents;
		shares[userId] = shareCents / 100;
	}

	return shares;
}

function parseJsonObject(value: string | null): Record<string, unknown> {
	if (!value) {
		return {};
	}

	try {
		const parsed = JSON.parse(value);
		return parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function parseUserIds(value: string | null): string[] {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((id): id is string => typeof id === "string");
	} catch {
		return [];
	}
}

async function ensureSignupGroupExists(
	db: ReturnType<typeof getDb>,
	entry: Pick<SignupAllowlistEntry, "groupId" | "groupName">,
): Promise<void> {
	await db
		.insert(groups)
		.values({
			groupid: entry.groupId,
			groupName: entry.groupName,
			userids: "[]",
			metadata: JSON.stringify({ defaultCurrency: "GBP", defaultShare: {} }),
		})
		.onConflictDoNothing({ target: groups.groupid });
}

async function getExistingSignupUser(
	db: ReturnType<typeof getDb>,
	email: string,
	username: string,
) {
	const rows = await db
		.select()
		.from(user)
		.where(or(eq(user.email, email), eq(user.username, username)));

	if (rows.length > 1) {
		throw new Error("Multiple existing accounts match this signup");
	}

	return rows[0] ?? null;
}

function matchesAllowlistIdentity(
	existingUser: typeof user.$inferSelect,
	entry: SignupAllowlistEntry,
): boolean {
	return (
		normalizeIdentity(existingUser.email) === entry.email &&
		normalizeIdentity(existingUser.username || "") === entry.username
	);
}

async function getActiveBudgetNames(
	db: ReturnType<typeof getDb>,
	groupId: string,
): Promise<Set<string>> {
	const rows = await db
		.select({ budgetName: groupBudgets.budgetName })
		.from(groupBudgets)
		.where(
			and(eq(groupBudgets.groupId, groupId), isNull(groupBudgets.deleted)),
		);

	return new Set(rows.map((row) => row.budgetName));
}

export async function reconcileSignupProvisioning(
	db: ReturnType<typeof getDb>,
	input: { userId: string; groupId: string; groupName: string },
): Promise<void> {
	const [existingGroup] = await db
		.select()
		.from(groups)
		.where(eq(groups.groupid, input.groupId))
		.limit(1);

	const currentMembers = parseUserIds(existingGroup?.userids ?? null);
	const nextMembers = Array.from(
		new Set([...currentMembers, input.userId]),
	).sort();
	const currentMetadata = parseJsonObject(existingGroup?.metadata ?? null);
	const nextMetadata = {
		...currentMetadata,
		defaultCurrency:
			typeof currentMetadata.defaultCurrency === "string"
				? currentMetadata.defaultCurrency
				: "GBP",
		defaultShare: calculateEqualShares(nextMembers),
	};
	const currentTime = formatSQLiteTime();
	const existingBudgetNames = await getActiveBudgetNames(db, input.groupId);
	const statements: BatchItem<"sqlite">[] = [];

	statements.push(
		db
			.insert(groups)
			.values({
				groupid: input.groupId,
				groupName: input.groupName,
				userids: JSON.stringify(nextMembers),
				metadata: JSON.stringify(nextMetadata),
			})
			.onConflictDoNothing({ target: groups.groupid }),
	);

	statements.push(
		db
			.update(groups)
			.set({
				userids: JSON.stringify(nextMembers),
				metadata: JSON.stringify(nextMetadata),
			})
			.where(eq(groups.groupid, input.groupId)),
	);

	for (const budgetName of DEFAULT_BUDGETS) {
		if (!existingBudgetNames.has(budgetName)) {
			statements.push(
				db
					.insert(groupBudgets)
					.values({
						id: `budget_${budgetName.toLowerCase()}_${input.groupId}`,
						groupId: input.groupId,
						budgetName,
						createdAt: currentTime,
						updatedAt: currentTime,
					})
					.onConflictDoNothing({ target: groupBudgets.id }),
			);
		}
	}

	statements.push(
		db
			.update(user)
			.set({
				groupid: input.groupId,
				signupComplete: true,
				updatedAt: new Date(),
			})
			.where(eq(user.id, input.userId)),
	);

	await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

function validateSignupBody(rawBody: unknown): SignupBody {
	if (rawBody === null || typeof rawBody !== "object") {
		throw new Error("Invalid signup body");
	}

	const body = rawBody as Record<string, unknown>;
	const fields = [
		"email",
		"username",
		"password",
		"name",
		"firstName",
		"lastName",
	] as const;
	const result: Record<(typeof fields)[number], string> = {
		email: "",
		username: "",
		password: "",
		name: "",
		firstName: "",
		lastName: "",
	};

	for (const field of fields) {
		const value = body[field];
		if (typeof value !== "string" || value.trim() === "") {
			throw new Error(`${field} is required`);
		}
		result[field] = field === "password" ? value : value.trim();
	}

	return {
		...result,
		email: normalizeIdentity(result.email),
		username: normalizeIdentity(result.username),
	};
}

function accountExistsResponse(request: Request, env: Env): Response {
	return createErrorResponse("Account already exists", 422, request, env);
}

function incompleteCredentialResponse(request: Request, env: Env): Response {
	return createErrorResponse("Signup setup incomplete", 409, request, env);
}

function invalidCredentialsResponse(request: Request, env: Env): Response {
	return createErrorResponse("Invalid credentials", 401, request, env);
}

async function getSignInIdentity(
	request: Request,
	route: SignInRoute,
): Promise<string | null> {
	let body: unknown;
	try {
		body = await request.clone().json();
	} catch {
		return null;
	}

	if (body === null || typeof body !== "object") {
		return null;
	}

	const field = route === "/auth/sign-in/email" ? "email" : "username";
	const value = (body as Record<string, unknown>)[field];
	return typeof value === "string" && value.trim() !== ""
		? normalizeIdentity(value)
		: null;
}

export async function handleIncompleteSignupSignInPreguard(
	request: Request,
	env: Env,
	path: string,
): Promise<Response | null> {
	if (
		request.method !== "POST" ||
		(path !== "/auth/sign-in/email" && path !== "/auth/sign-in/username")
	) {
		return null;
	}

	const identity = await getSignInIdentity(request, path);
	if (!identity) {
		return null;
	}

	const db = getDb(env);
	const [matchingUser] = await db
		.select({ signupComplete: user.signupComplete })
		.from(user)
		.where(
			path === "/auth/sign-in/email"
				? eq(user.email, identity)
				: eq(user.username, identity),
		)
		.limit(1);

	if (matchingUser && matchingUser.signupComplete !== true) {
		return invalidCredentialsResponse(request, env);
	}

	return null;
}

async function resumeIncompleteSignup(
	db: ReturnType<typeof getDb>,
	existingUser: typeof user.$inferSelect,
	entry: SignupAllowlistEntry,
	request: Request,
	env: Env,
): Promise<Response> {
	if (
		existingUser.signupComplete ||
		existingUser.groupid !== entry.groupId ||
		!matchesAllowlistIdentity(existingUser, entry)
	) {
		return accountExistsResponse(request, env);
	}

	const [credentialAccount] = await db
		.select({ id: account.id })
		.from(account)
		.where(
			and(
				eq(account.userId, existingUser.id),
				eq(account.providerId, "credential"),
			),
		)
		.limit(1);
	if (!credentialAccount) {
		return incompleteCredentialResponse(request, env);
	}

	await reconcileSignupProvisioning(db, {
		userId: existingUser.id,
		groupId: entry.groupId,
		groupName: entry.groupName,
	});

	return createJsonResponse({ user: existingUser }, 200, {}, request, env);
}

export async function handleAllowlistedSignup(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return createErrorResponse("Not Found", 404, request, env);
	}

	let body: SignupBody;
	try {
		body = validateSignupBody(await request.json());
	} catch (error) {
		return createErrorResponse(
			error instanceof Error ? error.message : "Invalid signup body",
			400,
			request,
			env,
		);
	}

	let entry: SignupAllowlistEntry | null;
	try {
		entry = getSignupAllowlistEntry(body, env);
	} catch (error) {
		logSignupAllowlistError(body, error);
		return createErrorResponse("Signup not allowed", 403, request, env);
	}

	if (!entry) {
		return createErrorResponse("Signup not allowed", 403, request, env);
	}

	const db = getDb(env);
	await ensureSignupGroupExists(db, entry);

	try {
		const existingUser = await getExistingSignupUser(
			db,
			body.email,
			body.username,
		);
		if (existingUser) {
			return await resumeIncompleteSignup(
				db,
				existingUser,
				entry,
				request,
				env,
			);
		}
	} catch {
		return accountExistsResponse(request, env);
	}

	try {
		const result = await auth(env).api.signUpEmail({
			body: {
				...body,
				groupid: entry.groupId,
				signupComplete: false,
				// biome-ignore lint/suspicious/noExplicitAny: Better Auth input types omit app-specific additional fields.
			} as any,
		});

		await reconcileSignupProvisioning(db, {
			userId: result.user.id,
			groupId: entry.groupId,
			groupName: entry.groupName,
		});

		return createJsonResponse(result, 200, {}, request, env);
	} catch {
		return accountExistsResponse(request, env);
	}
}
