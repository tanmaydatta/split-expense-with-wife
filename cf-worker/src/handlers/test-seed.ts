import { customAlphabet } from "nanoid";
import type { SeedRequest, SeedResponse } from "../../../shared-types";
import { auth } from "../auth";
import {
	createErrorResponse,
	createJsonResponse,
	isValidCurrency,
} from "../utils";

const SEED_SECRET_HEADER = "X-E2E-Seed-Secret";

const shortId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

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

function validateUsers(
	payload: SeedRequest,
	userAliases: Set<string>,
): string | null {
	for (const u of payload.users ?? []) {
		if (userAliases.has(u.alias)) return `users alias '${u.alias}' duplicated`;
		userAliases.add(u.alias);
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
): string | null {
	const txAliases = new Set<string>();
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
): string | null {
	const beAliases = new Set<string>();
	for (const be of payload.budgetEntries ?? []) {
		if (beAliases.has(be.alias))
			return `budgetEntries alias '${be.alias}' duplicated`;
		beAliases.add(be.alias);
		const err = validateBudgetEntry(be, groupAliases, budgetAliasToGroup);
		if (err) return err;
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

	return (
		validateUsers(payload, userAliases) ||
		validateGroups(payload, userAliases, groupAliases) ||
		collectBudgets(payload, budgetAliasToGroup) ||
		validateTransactions(payload, userAliases, groupAliases) ||
		validateBudgetEntries(payload, groupAliases, budgetAliasToGroup) ||
		validateAuthenticate(payload, userAliases)
	);
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

	let users: Record<string, CreatedUser>;
	try {
		users = await createUsers(payload, env);
	} catch (e) {
		return createErrorResponse(
			`user creation failed: ${(e as Error).message}`,
			500,
			request,
			env,
		);
	}

	const response: SeedResponse = {
		ids: {
			users: Object.fromEntries(
				Object.entries(users).map(([alias, u]) => [
					alias,
					{ id: u.id, email: u.email, username: u.username },
				]),
			),
			groups: {},
			transactions: {},
			budgetEntries: {},
		},
		sessions: {},
	};
	return createJsonResponse(response, 200, {}, request, env);
}
