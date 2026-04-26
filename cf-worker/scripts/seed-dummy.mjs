#!/usr/bin/env node
// Seed two known dummy users (alice.dummy / bob.dummy) into the target
// backend's D1 via the /test/seed endpoint. Use for manual testing on
// local, dev, or staging. Idempotent: re-running against a backend that
// already has these users prints a notice and exits 0.
//
// Env:
//   SEED_BACKEND_URL    target worker base URL (default http://localhost:8787)
//   E2E_SEED_SECRET     secret matching the worker's E2E_SEED_SECRET
//                       (falls back to cf-worker/.dev.vars when not set)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfWorkerDir = join(__dirname, "..");

const BACKEND_URL = process.env.SEED_BACKEND_URL || "http://localhost:8787";
const isLocalBackend = BACKEND_URL.startsWith("http://localhost");

function readSecretFromDevVars() {
	try {
		const text = readFileSync(join(cfWorkerDir, ".dev.vars"), "utf8");
		for (const line of text.split("\n")) {
			const m = line.match(/^E2E_SEED_SECRET=(.*)$/);
			if (m) return m[1].trim();
		}
	} catch {
		// .dev.vars may not exist on CI/deploy contexts; that's fine.
	}
	return undefined;
}

const SECRET = process.env.E2E_SEED_SECRET || readSecretFromDevVars();
if (!SECRET) {
	console.error(
		"E2E_SEED_SECRET is not set in env or cf-worker/.dev.vars. " +
			"It must match the worker's E2E_SEED_SECRET.",
	);
	process.exit(1);
}

// Fixed dummy payload. Usernames are stable so a human can always log in
// with the same credentials post-seed.
const DUMMY_PASSWORD = "password123";
const payload = {
	users: [
		{
			alias: "alice",
			username: "alice.dummy",
			password: DUMMY_PASSWORD,
			name: "Alice Dummy",
		},
		{
			alias: "bob",
			username: "bob.dummy",
			password: DUMMY_PASSWORD,
			name: "Bob Dummy",
		},
	],
	groups: [
		{
			alias: "g",
			name: "Dummy Group",
			members: ["alice", "bob"],
			defaultCurrency: "GBP",
			budgets: [
				{ alias: "house", name: "House" },
				{ alias: "food", name: "Food" },
			],
		},
	],
	transactions: [
		{
			alias: "t1",
			group: "g",
			description: "Sample dinner",
			amount: 40,
			currency: "GBP",
			paidByShares: { alice: 40 },
			splitPctShares: { alice: 50, bob: 50 },
		},
	],
	budgetEntries: [
		{
			alias: "b1",
			group: "g",
			budget: "food",
			description: "Sample food entry",
			amount: 50,
			currency: "GBP",
		},
	],
	// Issue sessions for both users so we can post-seed call /auth/update-user
	// to populate firstName/lastName (the seed handler hardcodes them empty,
	// but the dashboard's "paid by" dropdown labels users by firstName).
	authenticate: ["alice", "bob"],
};

const USER_NAMES = {
	alice: { firstName: "Alice", lastName: "Dummy" },
	bob: { firstName: "Bob", lastName: "Dummy" },
};

function cookieHeaderFor(seedResponse, alias) {
	const session = seedResponse?.sessions?.[alias];
	if (!session?.cookies?.length) return undefined;
	return session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

async function setUserNames(seedResponse) {
	for (const [alias, names] of Object.entries(USER_NAMES)) {
		const cookieHeader = cookieHeaderFor(seedResponse, alias);
		if (!cookieHeader) {
			console.error(
				`No session returned for '${alias}'; skipping name update.`,
			);
			continue;
		}
		const res = await fetch(`${BACKEND_URL}/auth/update-user`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Cookie: cookieHeader },
			body: JSON.stringify(names),
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(
				`update-user for '${alias}' failed: ${res.status} ${text}`,
			);
		}
	}
}

// The seed handler stores group metadata as `{ defaultCurrency }` only — no
// `defaultShare`. The Settings page crashes when it tries to read percentages
// keyed by user IDs from `metadata.defaultShare`. Populate it post-seed via
// the public group/metadata endpoint, which expects ID-keyed shares.
async function setDefaultShare(seedResponse) {
	const groupId = seedResponse?.ids?.groups?.g?.id;
	const aliceId = seedResponse?.ids?.users?.alice?.id;
	const bobId = seedResponse?.ids?.users?.bob?.id;
	if (!groupId || !aliceId || !bobId) {
		throw new Error(
			"Seed response missing group / user ids; cannot set defaultShare.",
		);
	}
	const cookieHeader = cookieHeaderFor(seedResponse, "alice");
	if (!cookieHeader) {
		throw new Error("No session for 'alice'; cannot set defaultShare.");
	}
	const res = await fetch(`${BACKEND_URL}/.netlify/functions/group/metadata`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: cookieHeader },
		body: JSON.stringify({
			groupid: groupId,
			defaultShare: { [aliceId]: 50, [bobId]: 50 },
		}),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`group/metadata update failed: ${res.status} ${text}`);
	}
}

console.log(`Seeding dummy users to ${BACKEND_URL} ...`);

let res;
try {
	res = await fetch(`${BACKEND_URL}/test/seed`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-E2E-Seed-Secret": SECRET,
		},
		body: JSON.stringify(payload),
	});
} catch (e) {
	console.error(`Failed to reach ${BACKEND_URL}: ${e.message}`);
	if (isLocalBackend) {
		console.error(
			"Hint: is `yarn dev` running in cf-worker? It must be up before seeding.",
		);
	}
	process.exit(1);
}

const body = await res.text();

if (res.ok) {
	const seedResponse = JSON.parse(body);
	await setUserNames(seedResponse);
	await setDefaultShare(seedResponse);
	console.log("✓ Seed succeeded.");
	console.log("");
	console.log("Login credentials:");
	console.log(`  alice.dummy / ${DUMMY_PASSWORD}`);
	console.log(`  bob.dummy   / ${DUMMY_PASSWORD}`);
	process.exit(0);
}

// Better-auth rejects duplicate usernames/emails; the test-seed handler
// rolls back and returns 500 with the underlying error message.
// Treat that case as "already seeded" so deploy-time seeding is idempotent.
if (
	res.status === 500 &&
	/(username|email) is already taken|already exists|failed to create user/i.test(
		body,
	)
) {
	console.log("ℹ Dummy users already exist on this backend; nothing to seed.");
	console.log(`  alice.dummy / ${DUMMY_PASSWORD}`);
	console.log(`  bob.dummy   / ${DUMMY_PASSWORD}`);
	process.exit(0);
}

// /test/seed only registers when the worker has E2E_SEED_SECRET set as an
// env/secret. On a fresh dev/staging deploy this returns 404 until the
// operator runs `wrangler secret put E2E_SEED_SECRET --env <env>`. Treat
// 404 as a soft skip so the deploy:dev chain doesn't fail.
if (res.status === 404 && !isLocalBackend) {
	console.warn(
		`⚠ /test/seed returned 404 on ${BACKEND_URL}. The endpoint is gated by\n` +
			`  the worker's E2E_SEED_SECRET env. Set it once with:\n` +
			`    wrangler secret put E2E_SEED_SECRET --env dev\n` +
			`  (and re-deploy) to enable post-deploy seeding. Skipping.`,
	);
	process.exit(0);
}

console.error(`Seed failed: ${res.status}`);
console.error(body);
process.exit(1);
