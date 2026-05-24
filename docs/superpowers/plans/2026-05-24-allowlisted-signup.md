# Allowlisted Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable `/signup` only for allowlisted email/username entries and provision the configured group before the new user can authenticate into the app.

**Architecture:** Keep Better Auth as the user/account creator, but intercept `/auth/sign-up/email` in the Worker to validate the allowlist, upsert the group, call Better Auth with `signupComplete: false`, reconcile group membership/default budgets/default shares, then mark the user complete. Sign-in routes and protected auth helpers reject incomplete users so partial signup retries are safe.

**Tech Stack:** Cloudflare Worker, Better Auth, Drizzle ORM, D1 SQLite, Vitest with `cloudflare:test`, React signup/login UI.

---

## File Structure

- Modify `cf-worker/src/db/schema/auth-schema.ts`: add `signupComplete` mapped to `signup_complete`.
- Add `cf-worker/src/db/migrations/0019_add_signup_complete.sql`: production migration with existing-user backfill by default.
- Modify `cf-worker/src/db/migrations/meta/_journal.json`: register migration `0019_add_signup_complete`.
- Modify `cf-worker/src/tests/test-utils.ts`: test schema includes `signup_complete`.
- Modify `cf-worker/src/auth.ts`: expose `signupComplete` as a Better Auth additional user field.
- Create `cf-worker/src/handlers/signup.ts`: allowlist parsing, group upsert, share calculation, group provisioning, signup route handler, sign-in preguard.
- Modify `cf-worker/src/index.ts`: route `/auth/sign-up/email` through the custom handler and preguard sign-in routes.
- Modify `cf-worker/src/utils.ts`: reject incomplete users from `withAuth`, `withAuthLite`, and `enrichSession`.
- Modify `cf-worker/worker-configuration.d.ts`: add `SIGNUP_ALLOWLIST_JSON` to generated env typing if `wrangler types` is not run during implementation.
- Modify `cf-worker/wrangler.toml`: add an empty local default `SIGNUP_ALLOWLIST_JSON = "[]"`.
- Add `cf-worker/src/tests/signup.test.ts`: backend coverage for allowlist, provisioning, idempotency, incomplete-user guards, and migration behavior.

## Task 1: Schema And Migration

**Files:**
- Modify: `cf-worker/src/db/schema/auth-schema.ts`
- Add: `cf-worker/src/db/migrations/0019_add_signup_complete.sql`
- Modify: `cf-worker/src/db/migrations/meta/_journal.json`
- Modify: `cf-worker/src/tests/test-utils.ts`
- Modify: `cf-worker/src/auth.ts`
- Modify: `cf-worker/wrangler.toml`
- Modify: `cf-worker/worker-configuration.d.ts`
- Test: `cf-worker/src/tests/signup.test.ts`

- [ ] **Step 1: Write the failing schema/migration tests**

Create `cf-worker/src/tests/signup.test.ts` with the test harness and the first two tests:

```ts
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import { completeCleanupDatabase, setupAndCleanDatabase } from "./test-utils";

describe("Allowlisted signup", () => {
	beforeAll(async () => {
		await setupAndCleanDatabase(env);
	});

	beforeEach(async () => {
		await completeCleanupDatabase(env);
		env.SIGNUP_ALLOWLIST_JSON = "[]";
	});

	it("stores signupComplete on Better Auth users and defaults direct auth-created users to complete", async () => {
		const authInstance = auth(env);
		const result = await authInstance.api.signUpEmail({
			body: {
				email: "direct-complete@example.com",
				password: "testpassword123",
				name: "Direct Complete",
				username: "directcomplete",
				firstName: "Direct",
				lastName: "Complete",
			} as any,
		});

		const db = getDb(env);
		const rows = await db
			.select()
			.from(user)
			.where(eq(user.id, result.user.id));

		expect(rows).toHaveLength(1);
		expect(rows[0].signupComplete).toBe(true);
	});

	it("can persist an incomplete Better Auth user when signupComplete is false", async () => {
		const authInstance = auth(env);
		const result = await authInstance.api.signUpEmail({
			body: {
				email: "direct-incomplete@example.com",
				password: "testpassword123",
				name: "Direct Incomplete",
				username: "directincomplete",
				firstName: "Direct",
				lastName: "Incomplete",
				signupComplete: false,
			} as any,
		});

		const db = getDb(env);
		const rows = await db
			.select()
			.from(user)
			.where(eq(user.id, result.user.id));

		expect(rows).toHaveLength(1);
		expect(rows[0].signupComplete).toBe(false);
	});
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts --no-file-parallelism
```

Expected: TypeScript or runtime failure because `user.signupComplete` and the `signup_complete` test column do not exist yet.

- [ ] **Step 3: Add the schema field**

In `cf-worker/src/db/schema/auth-schema.ts`, add this field to the `user` table after `groupid`:

```ts
signupComplete: integer("signup_complete", { mode: "boolean" })
	.default(true)
	.notNull(),
```

- [ ] **Step 4: Add the migration**

Create `cf-worker/src/db/migrations/0019_add_signup_complete.sql`:

```sql
ALTER TABLE `user` ADD `signup_complete` integer DEFAULT true NOT NULL;
```

Append this entry to `cf-worker/src/db/migrations/meta/_journal.json`:

```json
{
	"idx": 19,
	"version": "6",
	"when": 1779613200000,
	"tag": "0019_add_signup_complete",
	"breakpoints": true
}
```

- [ ] **Step 5: Update test schema setup**

In `cf-worker/src/tests/test-utils.ts`, change the user table DDL inside `setupDatabase` to include `signup_complete INTEGER NOT NULL DEFAULT 1`:

```ts
await env.DB.exec(
	"CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, username TEXT UNIQUE, display_username TEXT, groupid TEXT, signup_complete INTEGER NOT NULL DEFAULT 1, first_name TEXT NOT NULL, last_name TEXT NOT NULL)",
);
```

- [ ] **Step 6: Configure Better Auth additional user field**

In `cf-worker/src/auth.ts`, add this field under `user.additionalFields`:

```ts
signupComplete: {
	type: "boolean",
	required: false,
	defaultValue: true,
	input: true,
},
```

- [ ] **Step 7: Add env typing and local default**

In `cf-worker/wrangler.toml`, add this under `[vars]`:

```toml
SIGNUP_ALLOWLIST_JSON = "[]"
```

In `cf-worker/worker-configuration.d.ts`, add this to `Cloudflare.Env`:

```ts
SIGNUP_ALLOWLIST_JSON: string;
```

- [ ] **Step 8: Run schema tests and commit**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts --no-file-parallelism
yarn lint
```

Expected: `signup.test.ts` passes and `yarn lint` exits 0.

Commit:

```bash
git add cf-worker/src/db/schema/auth-schema.ts cf-worker/src/db/migrations/0019_add_signup_complete.sql cf-worker/src/db/migrations/meta/_journal.json cf-worker/src/tests/test-utils.ts cf-worker/src/auth.ts cf-worker/wrangler.toml cf-worker/worker-configuration.d.ts cf-worker/src/tests/signup.test.ts
git commit -m "feat: add signup completion flag"
```

## Task 2: Allowlist And Provisioning Helpers

**Files:**
- Create: `cf-worker/src/handlers/signup.ts`
- Modify: `cf-worker/src/tests/signup.test.ts`

- [ ] **Step 1: Write failing helper tests**

Append these imports to `cf-worker/src/tests/signup.test.ts`:

```ts
import { groupBudgets, groups } from "../db/schema/schema";
import {
	buildEqualDefaultShare,
	findSignupAllowlistEntry,
	parseSignupAllowlist,
	reconcileSignupProvisioning,
} from "../handlers/signup";
```

Append these tests inside the existing `describe("Allowlisted signup", () => { ... })` block:

```ts
it("parses and matches allowlist entries by normalized email or username", () => {
	const entries = parseSignupAllowlist(
		JSON.stringify([
			{
				email: "Friend@One.Example",
				username: "FriendOne",
				groupId: "friend-couple",
				groupName: "Friend Couple",
			},
		]),
	);

	expect(entries).toEqual([
		{
			email: "friend@one.example",
			username: "friendone",
			groupId: "friend-couple",
			groupName: "Friend Couple",
		},
	]);

	expect(
		findSignupAllowlistEntry(entries, {
			email: " FRIEND@ONE.EXAMPLE ",
			username: "someoneelse",
		})?.groupId,
	).toBe("friend-couple");
	expect(
		findSignupAllowlistEntry(entries, {
			email: "different@example.com",
			username: " FriendOne ",
		})?.groupName,
	).toBe("Friend Couple");
});

it("fails closed for malformed, incomplete, or ambiguous allowlists", () => {
	expect(() => parseSignupAllowlist("not-json")).toThrow("Invalid signup allowlist");
	expect(() =>
		parseSignupAllowlist(
			JSON.stringify([{ email: "a@example.com", username: "a", groupId: "g" }]),
		),
	).toThrow("Invalid signup allowlist entry");

	const entries = parseSignupAllowlist(
		JSON.stringify([
			{ email: "a@example.com", username: "a", groupId: "g1", groupName: "G1" },
			{ email: "a@example.com", username: "a2", groupId: "g2", groupName: "G2" },
		]),
	);
	expect(() =>
		findSignupAllowlistEntry(entries, {
			email: "a@example.com",
			username: "anything",
		}),
	).toThrow("Ambiguous signup allowlist match");
});

it("builds deterministic equal shares that sum to exactly 100", () => {
	expect(buildEqualDefaultShare(["u1"])).toEqual({ u1: 100 });
	expect(buildEqualDefaultShare(["u2", "u1"])).toEqual({ u1: 50, u2: 50 });
	expect(buildEqualDefaultShare(["u3", "u1", "u2"])).toEqual({
		u1: 33.33,
		u2: 33.33,
		u3: 33.34,
	});
});

it("reconciles group membership, budgets, metadata, and signup completion idempotently", async () => {
	const db = getDb(env);
	await db.insert(user).values({
		id: "signup-user-1",
		email: "friend1@example.com",
		name: "Friend One",
		username: "friend1",
		displayUsername: "friend1",
		groupid: "friend-couple",
		signupComplete: false,
		firstName: "Friend",
		lastName: "One",
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	await reconcileSignupProvisioning(db, {
		userId: "signup-user-1",
		groupId: "friend-couple",
		groupName: "Friend Couple",
	});
	await reconcileSignupProvisioning(db, {
		userId: "signup-user-1",
		groupId: "friend-couple",
		groupName: "Friend Couple",
	});

	const groupRows = await db
		.select()
		.from(groups)
		.where(eq(groups.groupid, "friend-couple"));
	const budgetRows = await db
		.select()
		.from(groupBudgets)
		.where(eq(groupBudgets.groupId, "friend-couple"));
	const userRows = await db
		.select()
		.from(user)
		.where(eq(user.id, "signup-user-1"));

	expect(groupRows).toHaveLength(1);
	expect(JSON.parse(groupRows[0].userids || "[]")).toEqual(["signup-user-1"]);
	expect(JSON.parse(groupRows[0].metadata || "{}")).toEqual({
		defaultCurrency: "GBP",
		defaultShare: { "signup-user-1": 100 },
	});
	expect(budgetRows.map((budget) => budget.budgetName).sort()).toEqual([
		"Food",
		"House",
	]);
	expect(userRows[0].signupComplete).toBe(true);
});
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts --no-file-parallelism
```

Expected: module `../handlers/signup` does not exist.

- [ ] **Step 3: Create the helper module**

Create `cf-worker/src/handlers/signup.ts` with these exports:

```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import { groupBudgets, groups } from "../db/schema/schema";
import { formatSQLiteTime } from "../utils";

export type SignupAllowlistEntry = {
	email: string;
	username: string;
	groupId: string;
	groupName: string;
};

const rawAllowlistEntrySchema = z.object({
	email: z.string().email(),
	username: z.string().min(1),
	groupId: z.string().min(1),
	groupName: z.string().min(1),
});

const signupRequestSchema = z.object({
	email: z.string().email(),
	username: z.string().min(1),
	password: z.string().min(1),
	name: z.string().min(1),
	firstName: z.string().min(1),
	lastName: z.string().min(1),
});

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

export function parseSignupAllowlist(raw: string | undefined): SignupAllowlistEntry[] {
	if (!raw) {
		throw new Error("Invalid signup allowlist");
	}
	try {
		const parsed = z.array(rawAllowlistEntrySchema).parse(JSON.parse(raw));
		return parsed.map((entry) => ({
			email: normalize(entry.email),
			username: normalize(entry.username),
			groupId: entry.groupId.trim(),
			groupName: entry.groupName.trim(),
		}));
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new Error("Invalid signup allowlist entry");
		}
		throw new Error("Invalid signup allowlist");
	}
}

export function findSignupAllowlistEntry(
	entries: SignupAllowlistEntry[],
	input: { email: string; username: string },
): SignupAllowlistEntry | null {
	const email = normalize(input.email);
	const username = normalize(input.username);
	const matches = entries.filter(
		(entry) => entry.email === email || entry.username === username,
	);
	if (matches.length > 1) {
		throw new Error("Ambiguous signup allowlist match");
	}
	return matches[0] ?? null;
}

export function buildEqualDefaultShare(userIds: string[]): Record<string, number> {
	const sorted = [...new Set(userIds)].sort();
	if (sorted.length === 0) {
		return {};
	}
	const base = Math.floor((100 / sorted.length) * 100) / 100;
	const shares: Record<string, number> = {};
	let assigned = 0;
	for (let index = 0; index < sorted.length; index++) {
		const userId = sorted[index];
		const value =
			index === sorted.length - 1 ? Number((100 - assigned).toFixed(2)) : base;
		shares[userId] = value;
		assigned = Number((assigned + value).toFixed(2));
	}
	return shares;
}

export async function reconcileSignupProvisioning(
	db: ReturnType<typeof getDb>,
	input: { userId: string; groupId: string; groupName: string },
): Promise<void> {
	const now = formatSQLiteTime();
	await db
		.insert(groups)
		.values({
			groupid: input.groupId,
			groupName: input.groupName,
			userids: "[]",
			metadata: JSON.stringify({ defaultCurrency: "GBP", defaultShare: {} }),
		})
		.onConflictDoNothing();

	const existingGroups = await db
		.select()
		.from(groups)
		.where(eq(groups.groupid, input.groupId))
		.limit(1);
	const existingGroup = existingGroups[0];
	const existingUserIds = JSON.parse(existingGroup?.userids || "[]") as string[];
	const nextUserIds = [...new Set([...existingUserIds, input.userId])].sort();
	const currentMetadata = JSON.parse(existingGroup?.metadata || "{}") as Record<
		string,
		unknown
	>;
	const nextMetadata = {
		...currentMetadata,
		defaultCurrency:
			typeof currentMetadata.defaultCurrency === "string"
				? currentMetadata.defaultCurrency
				: "GBP",
		defaultShare: buildEqualDefaultShare(nextUserIds),
	};
	const defaultBudgets = ["House", "Food"].map((budgetName) =>
		db
			.insert(groupBudgets)
			.values({
				id: `budget_${input.groupId}_${budgetName.toLowerCase()}`,
				groupId: input.groupId,
				budgetName,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing(),
	);

	await db.batch([
		db
			.update(groups)
			.set({
				groupName: existingGroup?.groupName || input.groupName,
				userids: JSON.stringify(nextUserIds),
				metadata: JSON.stringify(nextMetadata),
			})
			.where(eq(groups.groupid, input.groupId)),
		...defaultBudgets,
		db
			.update(user)
			.set({ signupComplete: true, groupid: input.groupId, updatedAt: new Date() })
			.where(eq(user.id, input.userId)),
	]);
}
```

- [ ] **Step 4: Run helper tests and commit**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts --no-file-parallelism
yarn lint
```

Expected: helper tests pass and lint exits 0.

Commit:

```bash
git add cf-worker/src/handlers/signup.ts cf-worker/src/tests/signup.test.ts
git commit -m "feat: add signup provisioning helpers"
```

## Task 3: Custom Signup Route

**Files:**
- Modify: `cf-worker/src/handlers/signup.ts`
- Modify: `cf-worker/src/index.ts`
- Modify: `cf-worker/src/tests/signup.test.ts`

- [ ] **Step 1: Write failing route tests**

Change the Drizzle import in `cf-worker/src/tests/signup.test.ts` to include `or`:

```ts
import { eq, or } from "drizzle-orm";
```

Append these tests to `cf-worker/src/tests/signup.test.ts`:

```ts
async function postSignup(body: Record<string, unknown>): Promise<Response> {
	return await (
		await import("../index")
	).default.fetch(
		new Request("http://localhost:8787/auth/sign-up/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		env,
		{} as ExecutionContext,
	);
}

it("rejects non-allowlisted signup with 403 and creates no user", async () => {
	env.SIGNUP_ALLOWLIST_JSON = JSON.stringify([
		{
			email: "friend@example.com",
			username: "friend",
			groupId: "friend-couple",
			groupName: "Friend Couple",
		},
	]);

	const response = await postSignup({
		email: "stranger@example.com",
		username: "stranger",
		password: "testpassword123",
		name: "Stranger User",
		firstName: "Stranger",
		lastName: "User",
	});

	const db = getDb(env);
	const rows = await db.select().from(user);

	expect(response.status).toBe(403);
	expect(rows).toHaveLength(0);
});

it("allowlisted signup creates user, group, default budgets, and complete membership", async () => {
	env.SIGNUP_ALLOWLIST_JSON = JSON.stringify([
		{
			email: "friend1@example.com",
			username: "friend1",
			groupId: "friend-couple",
			groupName: "Friend Couple",
		},
	]);

	const response = await postSignup({
		email: "friend1@example.com",
		username: "friend1",
		password: "testpassword123",
		name: "Friend One",
		firstName: "Friend",
		lastName: "One",
	});

	const db = getDb(env);
	const users = await db
		.select()
		.from(user)
		.where(eq(user.email, "friend1@example.com"));
	const groupRows = await db
		.select()
		.from(groups)
		.where(eq(groups.groupid, "friend-couple"));
	const budgetRows = await db
		.select()
		.from(groupBudgets)
		.where(eq(groupBudgets.groupId, "friend-couple"));

	expect(response.status).toBe(200);
	expect(users[0].groupid).toBe("friend-couple");
	expect(users[0].signupComplete).toBe(true);
	expect(JSON.parse(groupRows[0].userids || "[]")).toEqual([users[0].id]);
	expect(JSON.parse(groupRows[0].metadata || "{}").defaultShare).toEqual({
		[users[0].id]: 100,
	});
	expect(budgetRows.map((budget) => budget.budgetName).sort()).toEqual([
		"Food",
		"House",
	]);
});

it("second allowlisted signup reuses group and recomputes 50/50 shares", async () => {
	env.SIGNUP_ALLOWLIST_JSON = JSON.stringify([
		{ email: "friend1@example.com", username: "friend1", groupId: "friend-couple", groupName: "Friend Couple" },
		{ email: "friend2@example.com", username: "friend2", groupId: "friend-couple", groupName: "Friend Couple" },
	]);

	await postSignup({
		email: "friend1@example.com",
		username: "friend1",
		password: "testpassword123",
		name: "Friend One",
		firstName: "Friend",
		lastName: "One",
	});
	await postSignup({
		email: "friend2@example.com",
		username: "friend2",
		password: "testpassword123",
		name: "Friend Two",
		firstName: "Friend",
		lastName: "Two",
	});

	const db = getDb(env);
	const users = await db
		.select()
		.from(user)
		.where(or(eq(user.email, "friend1@example.com"), eq(user.email, "friend2@example.com")));
	const groupRows = await db
		.select()
		.from(groups)
		.where(eq(groups.groupid, "friend-couple"));
	const memberIds = users.map((row) => row.id).sort();
	const metadata = JSON.parse(groupRows[0].metadata || "{}");

	expect(JSON.parse(groupRows[0].userids || "[]").sort()).toEqual(memberIds);
	expect(metadata.defaultShare).toEqual({
		[memberIds[0]]: 50,
		[memberIds[1]]: 50,
	});
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts --no-file-parallelism
```

Expected: signup routes still return 404 because `cf-worker/src/index.ts` blocks signup.

- [ ] **Step 3: Add signup route handler**

Extend the imports in `cf-worker/src/handlers/signup.ts`:

```ts
import { eq, or } from "drizzle-orm";
import { auth } from "../auth";
import { createErrorResponse, formatSQLiteTime } from "../utils";
```

Then add `handleAllowlistedSignup`:

```ts
export async function handleAllowlistedSignup(
	request: Request,
	env: Env,
): Promise<Response> {
	let body: z.infer<typeof signupRequestSchema>;
	let entry: SignupAllowlistEntry | null;

	try {
		body = signupRequestSchema.parse(await request.clone().json());
		const entries = parseSignupAllowlist(env.SIGNUP_ALLOWLIST_JSON);
		entry = findSignupAllowlistEntry(entries, {
			email: body.email,
			username: body.username,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid signup request";
		return createErrorResponse(message, message.includes("allowlist") ? 403 : 400, request, env);
	}

	if (!entry) {
		return createErrorResponse("Signup is not allowed", 403, request, env);
	}

	const db = getDb(env);
	await db
		.insert(groups)
		.values({
			groupid: entry.groupId,
			groupName: entry.groupName,
			userids: "[]",
			metadata: JSON.stringify({ defaultCurrency: "GBP", defaultShare: {} }),
		})
		.onConflictDoNothing();

	const existing = await db
		.select()
		.from(user)
		.where(or(eq(user.email, normalize(body.email)), eq(user.username, normalize(body.username))))
		.limit(1);

	let userId = existing[0]?.id;
	let authResponse: Response | null = null;
	if (existing[0]) {
		if (
			existing[0].signupComplete ||
			existing[0].groupid !== entry.groupId ||
			existing[0].email !== normalize(entry.email) ||
			existing[0].username !== normalize(entry.username)
		) {
			return createErrorResponse("User already exists", 422, request, env);
		}
	} else {
		const authBody = {
			...body,
			email: normalize(body.email),
			username: normalize(body.username),
			groupid: entry.groupId,
			signupComplete: false,
		};
		authResponse = await auth(env).handler(
			new Request(request.url, {
				method: "POST",
				headers: request.headers,
				body: JSON.stringify(authBody),
			}),
		);
		if (authResponse.status < 200 || authResponse.status >= 300) {
			return authResponse;
		}
		const payload = (await authResponse.clone().json()) as { user?: { id?: string } };
		userId = payload.user?.id;
	}

	if (!userId) {
		return createErrorResponse("Failed to create user", 500, request, env);
	}

	await reconcileSignupProvisioning(db, {
		userId,
		groupId: entry.groupId,
		groupName: entry.groupName,
	});

	if (authResponse) {
		return authResponse;
	}
	return new Response(JSON.stringify({ token: null, user: { id: userId } }), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}
```

When adding this code, move `normalize` from private to exported or keep it private and use it in the same file.

- [ ] **Step 4: Route signup through the handler**

Modify `cf-worker/src/index.ts`:

```ts
import { handleAllowlistedSignup, preguardIncompleteSignIn } from "./handlers/signup";
```

Replace the signup-route 404 block in `handleAuthRoutes` with:

```ts
if (path === "/auth/sign-up/email" && request.method === "POST") {
	const response = await handleAllowlistedSignup(request, env);
	return addCORSHeaders(response, request, env);
}

if (signupRoutes.some((route) => path.startsWith(route))) {
	return createErrorResponse("Not Found", 404, request, env);
}
```

- [ ] **Step 5: Run route tests and commit**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts --no-file-parallelism
yarn lint
```

Expected: route tests pass and lint exits 0.

Commit:

```bash
git add cf-worker/src/handlers/signup.ts cf-worker/src/index.ts cf-worker/src/tests/signup.test.ts
git commit -m "feat: enable allowlisted signup"
```

## Task 4: Retry Safety And Incomplete-User Guards

**Files:**
- Modify: `cf-worker/src/handlers/signup.ts`
- Modify: `cf-worker/src/index.ts`
- Modify: `cf-worker/src/utils.ts`
- Modify: `cf-worker/src/tests/signup.test.ts`

- [ ] **Step 1: Write failing retry and guard tests**

Append these tests to `cf-worker/src/tests/signup.test.ts`:

```ts
it("retrying an incomplete user resumes provisioning without duplicating membership or budgets", async () => {
	env.SIGNUP_ALLOWLIST_JSON = JSON.stringify([
		{ email: "retry@example.com", username: "retryuser", groupId: "retry-group", groupName: "Retry Group" },
	]);
	const db = getDb(env);
	const authInstance = auth(env);
	const created = await authInstance.api.signUpEmail({
		body: {
			email: "retry@example.com",
			username: "retryuser",
			password: "testpassword123",
			name: "Retry User",
			firstName: "Retry",
			lastName: "User",
			groupid: "retry-group",
			signupComplete: false,
		} as any,
	});

	const response = await postSignup({
		email: "retry@example.com",
		username: "retryuser",
		password: "differentpassword123",
		name: "Retry User",
		firstName: "Retry",
		lastName: "User",
	});

	const groupRows = await db
		.select()
		.from(groups)
		.where(eq(groups.groupid, "retry-group"));
	const budgetRows = await db
		.select()
		.from(groupBudgets)
		.where(eq(groupBudgets.groupId, "retry-group"));
	const userRows = await db
		.select()
		.from(user)
		.where(eq(user.id, created.user.id));

	expect(response.status).toBe(200);
	expect(JSON.parse(groupRows[0].userids || "[]")).toEqual([created.user.id]);
	expect(budgetRows).toHaveLength(2);
	expect(userRows[0].signupComplete).toBe(true);
});

it("complete duplicate signup returns an account-exists style error", async () => {
	env.SIGNUP_ALLOWLIST_JSON = JSON.stringify([
		{ email: "duplicate@example.com", username: "duplicate", groupId: "dup-group", groupName: "Duplicate Group" },
	]);

	await postSignup({
		email: "duplicate@example.com",
		username: "duplicate",
		password: "testpassword123",
		name: "Duplicate User",
		firstName: "Duplicate",
		lastName: "User",
	});
	const response = await postSignup({
		email: "duplicate@example.com",
		username: "duplicate",
		password: "testpassword123",
		name: "Duplicate User",
		firstName: "Duplicate",
		lastName: "User",
	});

	expect(response.status).toBe(422);
});

it("incomplete users cannot sign in by username or email", async () => {
	const authInstance = auth(env);
	await authInstance.api.signUpEmail({
		body: {
			email: "blocked@example.com",
			username: "blockeduser",
			password: "testpassword123",
			name: "Blocked User",
			firstName: "Blocked",
			lastName: "User",
			groupid: "blocked-group",
			signupComplete: false,
		} as any,
	});

	const usernameResponse = await (
		await import("../index")
	).default.fetch(
		new Request("http://localhost:8787/auth/sign-in/username", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: "blockeduser", password: "testpassword123" }),
		}),
		env,
		{} as ExecutionContext,
	);
	const emailResponse = await (
		await import("../index")
	).default.fetch(
		new Request("http://localhost:8787/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "blocked@example.com", password: "testpassword123" }),
		}),
		env,
		{} as ExecutionContext,
	);

	expect(usernameResponse.status).toBe(401);
	expect(emailResponse.status).toBe(401);
});
```

- [ ] **Step 2: Run retry and guard tests and verify they fail**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts --no-file-parallelism
```

Expected: sign-in guard tests fail because sign-in routes still delegate straight to Better Auth.

- [ ] **Step 3: Add sign-in preguard**

Add this export to `cf-worker/src/handlers/signup.ts`:

```ts
export async function preguardIncompleteSignIn(
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

	const body = (await request.clone().json().catch(() => null)) as
		| { email?: string; username?: string }
		| null;
	if (!body) {
		return null;
	}

	const db = getDb(env);
	const rows =
		path === "/auth/sign-in/email" && body.email
			? await db
					.select()
					.from(user)
					.where(eq(user.email, normalize(body.email)))
					.limit(1)
			: body.username
				? await db
						.select()
						.from(user)
						.where(eq(user.username, normalize(body.username)))
						.limit(1)
				: [];

	if (rows[0] && !rows[0].signupComplete) {
		return createErrorResponse("Invalid credentials", 401, request, env);
	}
	return null;
}
```

In `cf-worker/src/index.ts`, run the preguard before `authInstance.handler(request)`:

```ts
const signInPreguardResponse = await preguardIncompleteSignIn(request, env, path);
if (signInPreguardResponse) {
	return addCORSHeaders(signInPreguardResponse, request, env);
}
```

- [ ] **Step 4: Guard protected helpers**

In `cf-worker/src/utils.ts`, add a reusable check near `withAuth`:

```ts
function isSignupComplete(currentUser: typeof user.$inferSelect): boolean {
	return currentUser.signupComplete === true;
}
```

In `enrichSession`, after `currentUser` is loaded:

```ts
if (!isSignupComplete(currentUser[0])) {
	throw new Error("Signup incomplete");
}
```

In `withAuthLite`, after `currentUser` is loaded:

```ts
if (!isSignupComplete(currentUser[0])) {
	return createErrorResponse("Authentication failed", 401, request, env);
}
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
cd cf-worker
yarn vitest run src/tests/signup.test.ts src/tests/auth.test.ts --no-file-parallelism
yarn lint
```

Expected: focused tests pass and lint exits 0.

Commit:

```bash
git add cf-worker/src/handlers/signup.ts cf-worker/src/index.ts cf-worker/src/utils.ts cf-worker/src/tests/signup.test.ts
git commit -m "feat: guard incomplete signups"
```

## Task 5: Full Verification And Manual Check

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run backend test suite**

Run:

```bash
cd cf-worker
yarn test
```

Expected: all backend tests pass. E2E tests remain skipped unless `RUN_E2E_TESTS=true`.

- [ ] **Step 2: Run project lint**

Run:

```bash
yarn lint
cd cf-worker
yarn lint
```

Expected: both lint commands exit 0.

- [ ] **Step 3: Apply local migration and start Worker**

Run:

```bash
cd cf-worker
yarn db:migrate:local
SIGNUP_ALLOWLIST_JSON='[{"email":"friend1@example.com","username":"friend1","groupId":"friend-couple","groupName":"Friend Couple"},{"email":"friend2@example.com","username":"friend2","groupId":"friend-couple","groupName":"Friend Couple"}]' yarn dev
```

Expected: Worker starts on `http://localhost:8787`.

- [ ] **Step 4: Start frontend**

In a separate terminal:

```bash
REACT_APP_AUTH_BASE_URL=http://localhost:8787 yarn start
```

Expected: React app starts on `http://localhost:3000` or the next available port.

- [ ] **Step 5: Manual signup check**

Use the browser:

1. Open `/signup`.
2. Sign up `friend1@example.com` / `friend1`.
3. Log in as `friend1`.
4. Confirm dashboard/group defaults show one user, `100`, `GBP`, `House`, and `Food`.
5. Log out.
6. Sign up `friend2@example.com` / `friend2`.
7. Log in as `friend2`.
8. Confirm defaults show two users with `50 / 50`, `GBP`, `House`, and `Food`.
9. Submit one linked expense/budget entry and confirm it appears.
10. Try signing up a non-allowlisted user and confirm signup fails.

- [ ] **Step 6: Final commit for verification fixes**

If verification required fixes in the signup implementation, commit the exact changed files:

```bash
git add cf-worker/src/handlers/signup.ts cf-worker/src/index.ts cf-worker/src/utils.ts cf-worker/src/tests/signup.test.ts cf-worker/src/db/schema/auth-schema.ts cf-worker/src/tests/test-utils.ts cf-worker/wrangler.toml cf-worker/worker-configuration.d.ts
git commit -m "fix: stabilize allowlisted signup"
```

If no fixes were required, do not create an empty commit.

## Self-Review Notes

- Spec coverage: schema/backfill, allowlist matching, group upsert, default budgets, equal shares, idempotent retry, complete-user duplicate failure, incomplete-user sign-in block, protected helper guard, and manual local verification are covered.
- Scope: this is one backend-centered feature with one frontend manual path; no e2e automation is planned.
- Type consistency: plan uses `signupComplete` in TypeScript and `signup_complete` in SQLite/Better Auth mapping.
- Known implementation risk: if Better Auth creates a user row but fails before creating the credential account, a retry will find an incomplete user without a credential account. During implementation, detect that state and return a 409 setup-incomplete error instead of overwriting passwords or creating an account outside Better Auth.
