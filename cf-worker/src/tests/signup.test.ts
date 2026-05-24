import { env as testEnv } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { auth } from "../auth";
import { getDb } from "../db";
import { account, user } from "../db/schema/auth-schema";
import { groupBudgets, groups } from "../db/schema/schema";
import {
	calculateEqualShares,
	findAllowlistEntry,
	handleAllowlistedSignup,
	parseSignupAllowlist,
	reconcileSignupProvisioning,
} from "../handlers/signup";
import worker from "../index";
import { completeCleanupDatabase, setupAndCleanDatabase } from "./test-utils";

const env = testEnv as unknown as Env;
const signupBody = {
	email: "First.User@Example.COM ",
	username: " FirstUser ",
	password: "testpassword123",
	name: "First User",
	firstName: "First",
	lastName: "User",
};
let authInstance: ReturnType<typeof auth>;

function withAllowlist(entries: unknown[]): Env {
	return {
		...env,
		SIGNUP_ALLOWLIST_JSON: JSON.stringify(entries),
	} as Env;
}

function createSignupRequest(body: unknown): Request {
	return new Request("https://localhost:8787/auth/sign-up/email", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function getSignupComplete(email: string): Promise<boolean> {
	const [row] = await getDb(env)
		.select({ signupComplete: user.signupComplete })
		.from(user)
		.where(eq(user.email, email))
		.limit(1);

	if (!row) {
		throw new Error(`User not found for ${email}`);
	}

	return row.signupComplete;
}

async function getGroup(groupId: string) {
	const [row] = await getDb(env)
		.select()
		.from(groups)
		.where(eq(groups.groupid, groupId))
		.limit(1);
	return row;
}

async function getUsers() {
	return await getDb(env).select().from(user);
}

async function getBudgets(groupId: string) {
	return await getDb(env)
		.select()
		.from(groupBudgets)
		.where(eq(groupBudgets.groupId, groupId));
}

async function getPasswordHash(userId: string) {
	const [row] = await getDb(env)
		.select({ password: account.password })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
		.limit(1);
	return row?.password;
}

async function createAuthUser(input: {
	email: string;
	username: string;
	password?: string;
	signupComplete?: boolean;
	groupid?: string;
}) {
	return await authInstance.api.signUpEmail({
		body: {
			email: input.email,
			username: input.username,
			password: input.password ?? "testpassword123",
			name: "Auth User",
			firstName: "Auth",
			lastName: "User",
			groupid: input.groupid,
			signupComplete: input.signupComplete,
			// biome-ignore lint/suspicious/noExplicitAny: Better Auth input types omit app-specific additional fields.
		} as any,
	});
}

async function setSignupComplete(userId: string, signupComplete: boolean) {
	await getDb(env)
		.update(user)
		.set({ signupComplete, updatedAt: new Date() })
		.where(eq(user.id, userId));
}

function createSignInRequest(
	path: "/auth/sign-in/email" | "/auth/sign-in/username",
	body: Record<string, string>,
): Request {
	return new Request(`https://localhost:8787${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("signup", () => {
	beforeAll(async () => {
		await setupAndCleanDatabase(env);
	});

	beforeEach(async () => {
		await completeCleanupDatabase(env);
		authInstance = auth(env);
	});

	it("defaults signupComplete to true for direct Better Auth signup", async () => {
		const email = `signup-default-${crypto.randomUUID()}@example.com`;

		await authInstance.api.signUpEmail({
			body: {
				email,
				password: "testpassword123",
				name: "Signup Default",
				firstName: "Signup",
				lastName: "Default",
				// biome-ignore lint/suspicious/noExplicitAny: Better Auth input types omit app-specific additional fields.
			} as any,
		});

		await expect(getSignupComplete(email)).resolves.toBe(true);
	});

	it("persists signupComplete false for direct Better Auth signup", async () => {
		const email = `signup-incomplete-${crypto.randomUUID()}@example.com`;

		await authInstance.api.signUpEmail({
			body: {
				email,
				password: "testpassword123",
				name: "Signup Incomplete",
				firstName: "Signup",
				lastName: "Incomplete",
				signupComplete: false,
				// biome-ignore lint/suspicious/noExplicitAny: Better Auth input types omit app-specific additional fields.
			} as any,
		});

		await expect(getSignupComplete(email)).resolves.toBe(false);
	});

	it("parses and matches allowlist entries by normalized email or username", () => {
		const allowlist = parseSignupAllowlist(
			JSON.stringify([
				{
					email: " Invited@Example.COM ",
					username: " InvitedUser ",
					groupId: "household",
					groupName: "Household",
				},
			]),
		);

		expect(allowlist).toEqual([
			{
				email: "invited@example.com",
				username: "inviteduser",
				groupId: "household",
				groupName: "Household",
			},
		]);
		expect(
			findAllowlistEntry(allowlist, {
				email: "INVITED@example.com",
				username: "someoneelse",
			})?.groupId,
		).toBe("household");
		expect(
			findAllowlistEntry(allowlist, {
				email: "other@example.com",
				username: "INVITEDUSER",
			})?.groupId,
		).toBe("household");
	});

	it("fails closed for malformed, incomplete, and ambiguous allowlists", () => {
		expect(() => parseSignupAllowlist("not-json")).toThrow(/allowlist/i);
		expect(() =>
			parseSignupAllowlist(
				JSON.stringify([
					{
						email: "invited@example.com",
						username: "invited",
						groupId: "household",
					},
				]),
			),
		).toThrow(/incomplete/i);

		const allowlist = parseSignupAllowlist(
			JSON.stringify([
				{
					email: "invited@example.com",
					username: "first",
					groupId: "one",
					groupName: "One",
				},
				{
					email: "other@example.com",
					username: "first",
					groupId: "two",
					groupName: "Two",
				},
			]),
		);

		expect(() =>
			findAllowlistEntry(allowlist, {
				email: "INVITED@example.com",
				username: "FIRST",
			}),
		).toThrow(/ambiguous/i);
	});

	it("calculates deterministic equal shares that total exactly 100", () => {
		expect(calculateEqualShares(["b"])).toEqual({ b: 100 });
		expect(calculateEqualShares(["b", "a"])).toEqual({ a: 50, b: 50 });
		expect(calculateEqualShares(["c", "a", "b", "a"])).toEqual({
			a: 33.33,
			b: 33.33,
			c: 33.34,
		});
	});

	it("reconciles signup provisioning idempotently", async () => {
		const created = await authInstance.api.signUpEmail({
			body: {
				email: "reconcile@example.com",
				username: "reconcileuser",
				password: "testpassword123",
				name: "Reconcile User",
				firstName: "Reconcile",
				lastName: "User",
				groupid: "reconcile-group",
				signupComplete: false,
				// biome-ignore lint/suspicious/noExplicitAny: Better Auth input types omit app-specific additional fields.
			} as any,
		});

		await reconcileSignupProvisioning(getDb(env), {
			userId: created.user.id,
			groupId: "reconcile-group",
			groupName: "Reconcile Group",
		});
		await reconcileSignupProvisioning(getDb(env), {
			userId: created.user.id,
			groupId: "reconcile-group",
			groupName: "Reconcile Group",
		});

		const group = await getGroup("reconcile-group");
		const metadata = JSON.parse(group.metadata || "{}");
		expect(JSON.parse(group.userids || "[]")).toEqual([created.user.id]);
		expect(metadata).toEqual({
			defaultCurrency: "GBP",
			defaultShare: { [created.user.id]: 100 },
		});
		expect(await getBudgets("reconcile-group")).toHaveLength(2);
		await expect(getSignupComplete("reconcile@example.com")).resolves.toBe(true);
	});

	it("returns 403 and creates no user for non-allowlisted signup", async () => {
		const response = await handleAllowlistedSignup(
			createSignupRequest(signupBody),
			withAllowlist([
				{
					email: "someone@example.com",
					username: "someone",
					groupId: "household",
					groupName: "Household",
				},
			]),
		);

		expect(response.status).toBe(403);
		expect(await getUsers()).toHaveLength(0);
	});

	it("creates a complete user, group, budgets, and membership for an allowlisted signup", async () => {
		const response = await worker.fetch(
			createSignupRequest(signupBody),
			withAllowlist([
				{
					email: "first.user@example.com",
					username: "firstuser",
					groupId: "household",
					groupName: "Household",
				},
			]),
			{} as ExecutionContext,
		);
		const data = (await response.json()) as { user: { id: string } };

		expect(response.status).toBe(200);
		const [createdUser] = await getUsers();
		expect(createdUser.email).toBe("first.user@example.com");
		expect(createdUser.username).toBe("firstuser");
		expect(createdUser.groupid).toBe("household");
		expect(createdUser.signupComplete).toBe(true);
		expect(data.user.id).toBe(createdUser.id);

		const group = await getGroup("household");
		const metadata = JSON.parse(group.metadata || "{}");
		expect(group.groupName).toBe("Household");
		expect(JSON.parse(group.userids || "[]")).toEqual([createdUser.id]);
		expect(metadata).toEqual({
			defaultCurrency: "GBP",
			defaultShare: { [createdUser.id]: 100 },
		});
		expect((await getBudgets("household")).map((budget) => budget.budgetName)).toEqual([
			"House",
			"Food",
		]);
	});

	it("recomputes 50/50 shares when a second signup joins the same group", async () => {
		const signupEnv = withAllowlist([
			{
				email: "first.user@example.com",
				username: "firstuser",
				groupId: "household",
				groupName: "Household",
			},
			{
				email: "second.user@example.com",
				username: "seconduser",
				groupId: "household",
				groupName: "Household",
			},
		]);

		const firstResponse = await handleAllowlistedSignup(
			createSignupRequest(signupBody),
			signupEnv,
		);
		const secondResponse = await handleAllowlistedSignup(
			createSignupRequest({
				...signupBody,
				email: "second.user@example.com",
				username: "seconduser",
				name: "Second User",
				firstName: "Second",
				lastName: "User",
			}),
			signupEnv,
		);
		const firstData = (await firstResponse.json()) as { user: { id: string } };
		const secondData = (await secondResponse.json()) as { user: { id: string } };

		expect(firstResponse.status).toBe(200);
		expect(secondResponse.status).toBe(200);
		const group = await getGroup("household");
		const metadata = JSON.parse(group.metadata || "{}");
		expect(JSON.parse(group.userids || "[]").sort()).toEqual(
			[firstData.user.id, secondData.user.id].sort(),
		);
		expect(metadata.defaultShare).toEqual({
			[firstData.user.id]: 50,
			[secondData.user.id]: 50,
		});
	});

	it("retries an existing incomplete user without duplicating membership or overwriting password", async () => {
		const created = await authInstance.api.signUpEmail({
			body: {
				email: "retry@example.com",
				username: "retryuser",
				password: "originalpassword123",
				name: "Retry User",
				firstName: "Retry",
				lastName: "User",
				groupid: "retry-group",
				signupComplete: false,
				// biome-ignore lint/suspicious/noExplicitAny: Better Auth input types omit app-specific additional fields.
			} as any,
		});
		const originalPasswordHash = await getPasswordHash(created.user.id);

		const response = await handleAllowlistedSignup(
			createSignupRequest({
				email: "retry@example.com",
				username: "retryuser",
				password: "newpassword123",
				name: "Retry User",
				firstName: "Retry",
				lastName: "User",
			}),
			withAllowlist([
				{
					email: "retry@example.com",
					username: "retryuser",
					groupId: "retry-group",
					groupName: "Retry Group",
				},
			]),
		);
		const data = (await response.json()) as { user: { id: string } };

		expect(response.status).toBe(200);
		expect(data.user.id).toBe(created.user.id);
		expect(await getUsers()).toHaveLength(1);
		expect(await getPasswordHash(created.user.id)).toBe(originalPasswordHash);
		const group = await getGroup("retry-group");
		expect(JSON.parse(group.userids || "[]")).toEqual([created.user.id]);
		expect(await getBudgets("retry-group")).toHaveLength(2);
		await expect(getSignupComplete("retry@example.com")).resolves.toBe(true);
	});

	it("returns a duplicate-style error for complete duplicate signup", async () => {
		const signupEnv = withAllowlist([
			{
				email: "duplicate@example.com",
				username: "duplicate",
				groupId: "duplicate-group",
				groupName: "Duplicate Group",
			},
		]);

		await handleAllowlistedSignup(
			createSignupRequest({
				email: "duplicate@example.com",
				username: "duplicate",
				password: "testpassword123",
				name: "Duplicate User",
				firstName: "Duplicate",
				lastName: "User",
			}),
			signupEnv,
		);
		const response = await handleAllowlistedSignup(
			createSignupRequest({
				email: "duplicate@example.com",
				username: "duplicate",
				password: "anotherpassword123",
				name: "Duplicate User",
				firstName: "Duplicate",
				lastName: "User",
			}),
			signupEnv,
		);

		expect(response.status).toBe(422);
		expect(await getUsers()).toHaveLength(1);
	});

	it("rejects username sign-in for incomplete users before Better Auth", async () => {
		await createAuthUser({
			email: "incomplete-username@example.com",
			username: "incompleteusername",
			signupComplete: false,
		});

		const response = await worker.fetch(
			createSignInRequest("/auth/sign-in/username", {
				username: "incompleteusername",
				password: "testpassword123",
			}),
			env,
			{} as ExecutionContext,
		);

		expect(response.status).toBe(401);
	});

	it("rejects email sign-in for incomplete users before Better Auth", async () => {
		await createAuthUser({
			email: "incomplete-email@example.com",
			username: "incompleteemail",
			signupComplete: false,
		});

		const response = await worker.fetch(
			createSignInRequest("/auth/sign-in/email", {
				email: "incomplete-email@example.com",
				password: "testpassword123",
			}),
			env,
			{} as ExecutionContext,
		);

		expect(response.status).toBe(401);
	});

	it("allows complete users to sign in by email and username", async () => {
		await createAuthUser({
			email: "complete-signin@example.com",
			username: "completesignin",
			signupComplete: true,
		});

		const emailResponse = await worker.fetch(
			createSignInRequest("/auth/sign-in/email", {
				email: "complete-signin@example.com",
				password: "testpassword123",
			}),
			env,
			{} as ExecutionContext,
		);
		const usernameResponse = await worker.fetch(
			createSignInRequest("/auth/sign-in/username", {
				username: "completesignin",
				password: "testpassword123",
			}),
			env,
			{} as ExecutionContext,
		);

		expect(emailResponse.status).toBe(200);
		expect(usernameResponse.status).toBe(200);
	});

	it("rejects protected worker routes for incomplete users with an existing session", async () => {
		const created = await createAuthUser({
			email: "incomplete-session@example.com",
			username: "incompletesession",
			signupComplete: true,
		});
		const signInResponse = await worker.fetch(
			createSignInRequest("/auth/sign-in/email", {
				email: "incomplete-session@example.com",
				password: "testpassword123",
			}),
			env,
			{} as ExecutionContext,
		);
		const cookie = signInResponse.headers.get("Set-Cookie");
		if (!cookie) {
			throw new Error("Expected sign-in to return a session cookie");
		}
		await setSignupComplete(created.user.id, false);

		const response = await worker.fetch(
			new Request("https://localhost:8787/.netlify/functions/balances", {
				method: "POST",
				headers: { Cookie: cookie },
			}),
			env,
			{} as ExecutionContext,
		);

		expect(response.status).toBe(401);
	});
});
