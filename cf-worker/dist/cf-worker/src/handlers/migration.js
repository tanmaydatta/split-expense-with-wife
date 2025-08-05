import { getDb } from "../db";
import { eq, and } from "drizzle-orm";
import { groups, transactionUsers, userBalances } from "../db/schema/schema";
import { account } from "../db/schema/auth-schema";
import { createJsonResponse, createErrorResponse } from "../utils";
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
export async function handleRelinkData(request, env) {
    // Only allow POST requests
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }
    // Security check - require a secret header to prevent unauthorized access
    const authHeader = request.headers.get("x-migration-secret");
    if (!authHeader || authHeader !== env.MIGRATION_SECRET) {
        return new Response("Unauthorized - Invalid or missing migration secret", {
            status: 401,
        });
    }
    const db = getDb(env);
    try {
        const batchStatements = [];
        // === Prepare statements for transactionUsers table ===
        for (const user of idMap) {
            const oldIdAsString = user.oldId.toString();
            // Update userId references in transactionUsers
            batchStatements.push(db
                .update(transactionUsers)
                .set({ userId: user.newId })
                .where(eq(transactionUsers.userId, oldIdAsString)));
            // Update owedToUserId references in transactionUsers
            batchStatements.push(db
                .update(transactionUsers)
                .set({ owedToUserId: user.newId })
                .where(eq(transactionUsers.owedToUserId, oldIdAsString)));
        }
        // === Prepare statements for userBalances table ===
        for (const user of idMap) {
            const oldIdAsString = user.oldId.toString();
            // Update userId references in userBalances
            batchStatements.push(db
                .update(userBalances)
                .set({ userId: user.newId })
                .where(eq(userBalances.userId, oldIdAsString)));
            // Update owedToUserId references in userBalances
            batchStatements.push(db
                .update(userBalances)
                .set({ owedToUserId: user.newId })
                .where(eq(userBalances.owedToUserId, oldIdAsString)));
        }
        // === Prepare statements for JSON data in groups table ===
        // We must read the data first, then prepare the updates
        const allGroups = await db.select().from(groups);
        for (const group of allGroups) {
            if (!group.userids) {
                continue;
            }
            try {
                const oldUserIds = JSON.parse(group.userids);
                // Map old IDs to new IDs
                const newUserIds = oldUserIds
                    .map((oldId) => {
                    const mapping = idMap.find((m) => m.oldId === oldId);
                    return mapping ? mapping.newId : null;
                })
                    .filter(Boolean); // Remove any null values
                // Only update if we found valid mappings
                if (newUserIds.length > 0) {
                    batchStatements.push(db
                        .update(groups)
                        .set({ userids: JSON.stringify(newUserIds) })
                        .where(eq(groups.groupid, group.groupid)));
                }
            }
            catch (jsonError) {
                console.warn(`Failed to parse userids for group ${group.groupid}:`, jsonError);
                // Continue with other groups if one fails
            }
        }
        // Execute all prepared statements in a single atomic batch
        console.log(`Executing ${batchStatements.length} migration statements...`);
        if (batchStatements.length > 0) {
            await db.batch([batchStatements[0], ...batchStatements.slice(1)]);
        }
        return new Response(JSON.stringify({
            message: "Data migration completed successfully!",
            statementsExecuted: batchStatements.length,
            idMappings: idMap.length,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
    catch (error) {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        console.error("MIGRATION FAILED:", error);
        return new Response(JSON.stringify({
            error: "Migration failed",
            message: error.message,
            stack: error.stack,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
// Helper function to hash passwords using the same algorithm as auth.ts
async function hashPasswordWithWebCrypto(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    // Use PBKDF2 with 10,000 iterations (same as in auth.ts)
    const key = await crypto.subtle.importKey("raw", data, { name: "PBKDF2" }, false, ["deriveBits"]);
    const hashBuffer = await crypto.subtle.deriveBits({
        name: "PBKDF2",
        salt: salt,
        iterations: 10000,
        hash: "SHA-256",
    }, key, 256);
    // Combine salt + hash for storage
    const combined = new Uint8Array(salt.length + hashBuffer.byteLength);
    combined.set(salt);
    combined.set(new Uint8Array(hashBuffer), salt.length);
    // Return as base64
    return btoa(String.fromCharCode.apply(null, Array.from(combined)));
}
export async function handlePasswordMigration(request, env) {
    // Only allow POST requests
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }
    // Check for migration secret
    const migrationSecret = request.headers.get("x-migration-secret");
    if (!migrationSecret || migrationSecret !== env.MIGRATION_SECRET) {
        return createErrorResponse("Unauthorized", 401, request, env);
    }
    const db = getDb(env);
    try {
        const body = (await request.json());
        console.log("🔒 Starting password hash migration...");
        console.log(`📊 Migrating ${body.passwords.length} passwords`);
        const batchStatements = [];
        for (const { userId, plainPassword } of body.passwords) {
            console.log(`🔄 Hashing password for user: ${userId}`);
            // Hash the password using our new Web Crypto implementation
            const hashedPassword = await hashPasswordWithWebCrypto(plainPassword);
            // Update the account table where userId matches and providerId is 'credential'
            batchStatements.push(db
                .update(account)
                .set({
                password: hashedPassword,
                updatedAt: new Date(),
            })
                .where(and(eq(account.userId, userId), eq(account.providerId, "credential"))));
        }
        // Execute all updates in a batch
        await db.batch([batchStatements[0], ...batchStatements.slice(1)]);
        console.log("✅ Password migration completed!");
        console.log(`📊 Updated ${body.passwords.length} password accounts`);
        return createJsonResponse({
            success: true,
            message: "Password hash migration completed successfully",
            details: {
                updatedAccounts: body.passwords.length,
                action: "Migrated bcrypt passwords to Web Crypto PBKDF2 hashes",
            },
        }, 200, {}, request, env);
    }
    catch (error) {
        console.error("❌ Password migration failed:", error);
        return createErrorResponse(JSON.stringify({
            error: "Password migration failed",
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
        }), 500, request, env);
    }
}
//# sourceMappingURL=migration.js.map