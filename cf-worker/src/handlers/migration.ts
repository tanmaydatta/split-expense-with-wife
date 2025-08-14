import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { account } from "../db/schema/auth-schema";
import { groups, transactionUsers, userBalances } from "../db/schema/schema";
import { createErrorResponse, createJsonResponse } from "../utils";

// ID mapping from old integer IDs to new better-auth string IDs
const idMap = [
	{ oldId: 1, newId: "Rvm030I7qkaaETdWJmb1HkewD3h2KUYh" },
	{ oldId: 2, newId: "3zhTivbcZxsYbW2OabtZwbBsuVxx5vFQ" },
];

// const idMap = [
//   { oldId: 3, newId: '773hAvjPl8otWzSsXHMFFRsxMguEdwyw' },
//   { oldId: 4, newId: 'lUsYNUzFl6sN4AXe9dPicaCU3khcDjvZ' },
//   { oldId: 5, newId: 'uwnwzpESqA2h5Km8SFNFcJc2h4vwS3zg' }
// ];

// Helper function to validate migration request
function validateMigrationRequest(request: Request, env: Env): Response | null {
	if (request.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	const authHeader = request.headers.get("x-migration-secret");
	if (!authHeader || authHeader !== env.MIGRATION_SECRET) {
		return new Response("Unauthorized - Invalid or missing migration secret", {
			status: 401,
		});
	}

	return null;
}

// Helper function to create transaction user update statements
function createTransactionUserStatements(
	db: ReturnType<typeof getDb>,
	idMap: Array<{ oldId: number; newId: string }>,
) {
	const statements = [];

	for (const user of idMap) {
		const oldIdAsString = user.oldId.toString();

		// Update userId references
		statements.push(
			db
				.update(transactionUsers)
				.set({ userId: user.newId })
				.where(eq(transactionUsers.userId, oldIdAsString)),
		);

		// Update owedToUserId references
		statements.push(
			db
				.update(transactionUsers)
				.set({ owedToUserId: user.newId })
				.where(eq(transactionUsers.owedToUserId, oldIdAsString)),
		);
	}

	return statements;
}

// Helper function to create user balance update statements
function createUserBalanceStatements(
	db: ReturnType<typeof getDb>,
	idMap: Array<{ oldId: number; newId: string }>,
) {
	const statements = [];

	for (const user of idMap) {
		const oldIdAsString = user.oldId.toString();

		// Update userId references
		statements.push(
			db
				.update(userBalances)
				.set({ userId: user.newId })
				.where(eq(userBalances.userId, oldIdAsString)),
		);

		// Update owedToUserId references
		statements.push(
			db
				.update(userBalances)
				.set({ owedToUserId: user.newId })
				.where(eq(userBalances.owedToUserId, oldIdAsString)),
		);
	}

	return statements;
}

// Helper function to create group update statements
async function createGroupUpdateStatements(
	db: ReturnType<typeof getDb>,
	idMap: Array<{ oldId: number; newId: string }>,
) {
	const statements = [];
	const allGroups = await db.select().from(groups);

	for (const group of allGroups) {
		if (!group.userids) {
			continue;
		}

		try {
			const oldUserIds: number[] = JSON.parse(group.userids);
			const newUserIds = oldUserIds
				.map((oldId) => {
					const mapping = idMap.find((m) => m.oldId === oldId);
					return mapping ? mapping.newId : null;
				})
				.filter(Boolean);

			if (newUserIds.length > 0) {
				statements.push(
					db
						.update(groups)
						.set({ userids: JSON.stringify(newUserIds) })
						.where(eq(groups.groupid, group.groupid)),
				);
			}
		} catch (jsonError) {
			console.warn(
				`Failed to parse userids for group ${group.groupid}:`,
				jsonError,
			);
		}
	}

	return statements;
}

// Helper function to create password update statements
async function createPasswordUpdateStatements(
	db: ReturnType<typeof getDb>,
	passwords: Array<{ userId: string; plainPassword: string }>,
) {
	const statements = [];

	for (const { userId, plainPassword } of passwords) {
		console.log(`🔄 Hashing password for user: ${userId}`);
		const hashedPassword = await hashPasswordWithWebCrypto(plainPassword);

		statements.push(
			db
				.update(account)
				.set({
					password: hashedPassword,
					updatedAt: new Date(),
				})
				.where(
					and(eq(account.userId, userId), eq(account.providerId, "credential")),
				),
		);
	}

	return statements;
}

export async function handleRelinkData(request: Request, env: Env) {
	// Validate request
	const validationError = validateMigrationRequest(request, env);
	if (validationError) {
		return validationError;
	}

	const db = getDb(env);

	try {
		// Create all statements using helper functions
		const transactionUserStatements = createTransactionUserStatements(
			db,
			idMap,
		);
		const userBalanceStatements = createUserBalanceStatements(db, idMap);
		const groupStatements = await createGroupUpdateStatements(db, idMap);

		const batchStatements = [
			...transactionUserStatements,
			...userBalanceStatements,
			...groupStatements,
		];

		// Execute all prepared statements in a single atomic batch
		console.log(`Executing ${batchStatements.length} migration statements...`);
		if (batchStatements.length > 0) {
			await db.batch([batchStatements[0], ...batchStatements.slice(1)]);
		}

		return new Response(
			JSON.stringify({
				message: "Data migration completed successfully!",
				statementsExecuted: batchStatements.length,
				idMappings: idMap.length,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (error) {
		console.error("MIGRATION FAILED:", error);
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;
		return new Response(
			JSON.stringify({
				error: "Migration failed",
				message: errorMessage,
				stack: errorStack,
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

// Helper function to hash passwords using the same algorithm as auth.ts
async function hashPasswordWithWebCrypto(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);
	const salt = crypto.getRandomValues(new Uint8Array(16));

	// Use PBKDF2 with 10,000 iterations (same as in auth.ts)
	const key = await crypto.subtle.importKey(
		"raw",
		data,
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);

	const hashBuffer = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt: salt,
			iterations: 10000,
			hash: "SHA-256",
		},
		key,
		256,
	);

	// Combine salt + hash for storage
	const combined = new Uint8Array(salt.length + hashBuffer.byteLength);
	combined.set(salt);
	combined.set(new Uint8Array(hashBuffer), salt.length);

	// Return as base64
	return btoa(String.fromCharCode.apply(null, Array.from(combined)));
}

export async function handlePasswordMigration(request: Request, env: Env) {
	// Validate request
	const validationError = validateMigrationRequest(request, env);
	if (validationError) {
		return validationError;
	}

	const db = getDb(env);

	try {
		const body = (await request.json()) as {
			passwords: Array<{
				userId: string;
				plainPassword: string;
			}>;
		};

		console.log("🔒 Starting password hash migration...");
		console.log(`📊 Migrating ${body.passwords.length} passwords`);

		// Create password update statements using helper function
		const batchStatements = await createPasswordUpdateStatements(
			db,
			body.passwords,
		);

		// Execute all updates in a batch
		await db.batch([batchStatements[0], ...batchStatements.slice(1)]);

		console.log("✅ Password migration completed!");
		console.log(`📊 Updated ${body.passwords.length} password accounts`);

		return createJsonResponse(
			{
				success: true,
				message: "Password hash migration completed successfully",
				details: {
					updatedAccounts: body.passwords.length,
					action: "Migrated bcrypt passwords to Web Crypto PBKDF2 hashes",
				},
			},
			200,
			{},
			request,
			env,
		);
	} catch (error) {
		console.error("❌ Password migration failed:", error);
		return createErrorResponse(
			JSON.stringify({
				error: "Password migration failed",
				message: error instanceof Error ? error.message : "Unknown error",
				stack: error instanceof Error ? error.stack : undefined,
			}),
			500,
			request,
			env,
		);
	}
}
