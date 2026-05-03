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
		{
			alias: "t2",
			group: "g",
			description: "Coffee at Costa",
			amount: 8,
			currency: "GBP",
			paidByShares: { bob: 8 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t3",
			group: "g",
			description: "Grocery shopping at Sainsbury's",
			amount: 65,
			currency: "GBP",
			paidByShares: { alice: 65 },
			splitPctShares: { alice: 60, bob: 40 },
		},
		{
			alias: "t4",
			group: "g",
			description: "Tube tickets",
			amount: 12,
			currency: "GBP",
			paidByShares: { bob: 12 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t5",
			group: "g",
			description: "Takeaway pizza from Domino's",
			amount: 28,
			currency: "GBP",
			paidByShares: { alice: 28 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t6",
			group: "g",
			description: "Cinema tickets",
			amount: 22,
			currency: "GBP",
			paidByShares: { bob: 22 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t7",
			group: "g",
			description: "Online shopping - Amazon",
			amount: 45,
			currency: "GBP",
			paidByShares: { alice: 45 },
			splitPctShares: { alice: 70, bob: 30 },
		},
		{
			alias: "t8",
			group: "g",
			description: "Petrol at Shell",
			amount: 60,
			currency: "GBP",
			paidByShares: { bob: 60 },
			splitPctShares: { alice: 40, bob: 60 },
		},
		{
			alias: "t9",
			group: "g",
			description: "Restaurant dinner at Nando's",
			amount: 52,
			currency: "GBP",
			paidByShares: { alice: 52 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t10",
			group: "g",
			description: "Birthday gift for Sarah",
			amount: 35,
			currency: "GBP",
			paidByShares: { bob: 35 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t11",
			group: "g",
			description: "Train to Brighton",
			amount: 48,
			currency: "GBP",
			paidByShares: { alice: 48 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t12",
			group: "g",
			description: "Tesco weekly shop",
			amount: 78,
			currency: "GBP",
			paidByShares: { bob: 78 },
			splitPctShares: { alice: 60, bob: 40 },
		},
		{
			alias: "t13",
			group: "g",
			description: "Electricity bill",
			amount: 90,
			currency: "GBP",
			paidByShares: { alice: 90 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t14",
			group: "g",
			description: "Pub round",
			amount: 32,
			currency: "GBP",
			paidByShares: { bob: 32 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t15",
			group: "g",
			description: "Parking at Westfield",
			amount: 10,
			currency: "GBP",
			paidByShares: { alice: 10 },
			splitPctShares: { alice: 100, bob: 0 },
		},
		{
			alias: "t16",
			group: "g",
			description: "Indian takeaway",
			amount: 38,
			currency: "GBP",
			paidByShares: { bob: 38 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t17",
			group: "g",
			description: "New headphones",
			amount: 120,
			currency: "GBP",
			paidByShares: { alice: 120 },
			splitPctShares: { alice: 0, bob: 100 },
		},
		{
			alias: "t18",
			group: "g",
			description: "Council tax payment",
			amount: 150,
			currency: "GBP",
			paidByShares: { bob: 150 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t19",
			group: "g",
			description: "Brunch at Dishoom",
			amount: 56,
			currency: "GBP",
			paidByShares: { alice: 56 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t20",
			group: "g",
			description: "Bus pass monthly",
			amount: 75,
			currency: "GBP",
			paidByShares: { bob: 75 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t21",
			group: "g",
			description: "Cleaning supplies from Wilko",
			amount: 18,
			currency: "GBP",
			paidByShares: { alice: 18 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t22",
			group: "g",
			description: "Spotify family subscription",
			amount: 16,
			currency: "GBP",
			paidByShares: { bob: 16 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t23",
			group: "g",
			description: "Lunch at Pret a Manger",
			amount: 14,
			currency: "GBP",
			paidByShares: { alice: 14 },
			splitPctShares: { alice: 70, bob: 30 },
		},
		{
			alias: "t24",
			group: "g",
			description: "New curtains from IKEA",
			amount: 85,
			currency: "GBP",
			paidByShares: { bob: 85 },
			splitPctShares: { alice: 50, bob: 50 },
		},
		{
			alias: "t25",
			group: "g",
			description: "Wine and cheese night",
			amount: 42,
			currency: "GBP",
			paidByShares: { alice: 42 },
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
		{
			alias: "b2",
			group: "g",
			budget: "food",
			description: "Tesco weekly shop",
			amount: 78,
			currency: "GBP",
		},
		{
			alias: "b3",
			group: "g",
			budget: "house",
			description: "Council tax",
			amount: 150,
			currency: "GBP",
		},
		{
			alias: "b4",
			group: "g",
			budget: "food",
			description: "Lunch at Greggs",
			amount: 9,
			currency: "GBP",
		},
		{
			alias: "b5",
			group: "g",
			budget: "house",
			description: "Electricity bill",
			amount: 90,
			currency: "GBP",
		},
		{
			alias: "b6",
			group: "g",
			budget: "food",
			description: "Indian takeaway",
			amount: 38,
			currency: "GBP",
		},
		{
			alias: "b7",
			group: "g",
			budget: "house",
			description: "Boiler service",
			amount: 120,
			currency: "GBP",
		},
		{
			alias: "b8",
			group: "g",
			budget: "food",
			description: "Fresh produce at the market",
			amount: 25,
			currency: "GBP",
		},
		{
			alias: "b9",
			group: "g",
			budget: "house",
			description: "New curtains from IKEA",
			amount: 85,
			currency: "GBP",
		},
		{
			alias: "b10",
			group: "g",
			budget: "food",
			description: "Wine for dinner",
			amount: 18,
			currency: "GBP",
		},
		{
			alias: "b11",
			group: "g",
			budget: "house",
			description: "Cleaning supplies",
			amount: 18,
			currency: "GBP",
		},
		{
			alias: "b12",
			group: "g",
			budget: "food",
			description: "Sainsbury's big shop",
			amount: 95,
			currency: "GBP",
		},
		{
			alias: "b13",
			group: "g",
			budget: "house",
			description: "Broadband bill",
			amount: 35,
			currency: "GBP",
		},
		{
			alias: "b14",
			group: "g",
			budget: "food",
			description: "Sushi restaurant",
			amount: 62,
			currency: "GBP",
		},
		{
			alias: "b15",
			group: "g",
			budget: "house",
			description: "Plumber callout",
			amount: 95,
			currency: "GBP",
		},
		{
			alias: "b16",
			group: "g",
			budget: "food",
			description: "Coffee and cake at café",
			amount: 12,
			currency: "GBP",
		},
		{
			alias: "b17",
			group: "g",
			budget: "house",
			description: "Gas bill",
			amount: 72,
			currency: "GBP",
		},
		{
			alias: "b18",
			group: "g",
			budget: "food",
			description: "Waitrose premium shop",
			amount: 110,
			currency: "GBP",
		},
		{
			alias: "b19",
			group: "g",
			budget: "house",
			description: "Home insurance renewal",
			amount: 200,
			currency: "GBP",
		},
		{
			alias: "b20",
			group: "g",
			budget: "food",
			description: "Pizza night in",
			amount: 22,
			currency: "GBP",
		},
		{
			alias: "b21",
			group: "g",
			budget: "house",
			description: "New kitchen shelf",
			amount: 45,
			currency: "GBP",
		},
		{
			alias: "b22",
			group: "g",
			budget: "food",
			description: "Meal prep ingredients",
			amount: 55,
			currency: "GBP",
		},
		{
			alias: "b23",
			group: "g",
			budget: "house",
			description: "Bin bags and storage boxes",
			amount: 15,
			currency: "GBP",
		},
		{
			alias: "b24",
			group: "g",
			budget: "food",
			description: "Farmers market",
			amount: 30,
			currency: "GBP",
		},
		{
			alias: "b25",
			group: "g",
			budget: "house",
			description: "Water bill",
			amount: 48,
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
		`⚠ /test/seed returned 404 on ${BACKEND_URL}.\n` +
			`  The endpoint returns 404 in two cases (intentionally indistinguishable\n` +
			`  from outside): (a) the worker's E2E_SEED_SECRET env is unset, or\n` +
			`  (b) the X-E2E-Seed-Secret header value this script sent doesn't match\n` +
			`  the value stored on the worker. Required steps:\n` +
			`    1. wrangler secret put E2E_SEED_SECRET --env dev   # set the secret\n` +
			`    2. wrangler deploy -e dev                          # re-deploy so\n` +
			`       Cloudflare injects the secret into a fresh deployment.\n` +
			`    3. Make sure the value the script sends matches the worker's value.\n` +
			`       The script reads from cf-worker/.dev.vars; override per-run with:\n` +
			`         E2E_SEED_SECRET='<value>' yarn seed:dummy:dev\n` +
			`  Skipping seed.`,
	);
	process.exit(0);
}

console.error(`Seed failed: ${res.status}`);
console.error(body);
process.exit(1);
