import { getDb } from '../db';
import { eq } from 'drizzle-orm';
import { groups, transactionUsers, userBalances } from '../db/schema/schema';

// ID mapping from old integer IDs to new better-auth string IDs
const idMap = [
  { oldId: 1, newId: 'VPmIFs25sK6pnHiEkOyZaabrlkTcNwg7' },
  { oldId: 2, newId: '1g5YVURae7c4TjLKTnTrFUqZkEl3ORrB' }
];

export async function handleRelinkData(request: Request, env: Env) {
  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Security check - require a secret header to prevent unauthorized access
  const authHeader = request.headers.get('x-migration-secret');
  if (!authHeader || authHeader !== env.MIGRATION_SECRET) {
    return new Response('Unauthorized - Invalid or missing migration secret', { status: 401 });
  }

  const db = getDb(env);

  try {
    const batchStatements = [];

    // === Prepare statements for transactionUsers table ===
    for (const user of idMap) {
      const oldIdAsString = user.oldId.toString();

      // Update userId references in transactionUsers
      batchStatements.push(
        db.update(transactionUsers)
          .set({ userId: user.newId })
          .where(eq(transactionUsers.userId, oldIdAsString))
      );

      // Update owedToUserId references in transactionUsers
      batchStatements.push(
        db.update(transactionUsers)
          .set({ owedToUserId: user.newId })
          .where(eq(transactionUsers.owedToUserId, oldIdAsString))
      );
    }

    // === Prepare statements for userBalances table ===
    for (const user of idMap) {
      const oldIdAsString = user.oldId.toString();

      // Update userId references in userBalances
      batchStatements.push(
        db.update(userBalances)
          .set({ userId: user.newId })
          .where(eq(userBalances.userId, oldIdAsString))
      );

      // Update owedToUserId references in userBalances
      batchStatements.push(
        db.update(userBalances)
          .set({ owedToUserId: user.newId })
          .where(eq(userBalances.owedToUserId, oldIdAsString))
      );
    }

    // === Prepare statements for JSON data in groups table ===
    // We must read the data first, then prepare the updates
    const allGroups = await db.select().from(groups);

    for (const group of allGroups) {
      if (!group.userids) {
        continue;
      }

      try {
        const oldUserIds: number[] = JSON.parse(group.userids);

        // Map old IDs to new IDs
        const newUserIds = oldUserIds.map(oldId => {
          const mapping = idMap.find(m => m.oldId === oldId);
          return mapping ? mapping.newId : null;
        }).filter(Boolean); // Remove any null values

        // Only update if we found valid mappings
        if (newUserIds.length > 0) {
          batchStatements.push(
            db.update(groups)
              .set({ userids: JSON.stringify(newUserIds) })
              .where(eq(groups.groupid, group.groupid))
          );
        }
      } catch (jsonError) {
        console.warn(`Failed to parse userids for group ${group.groupid}:`, jsonError);
        // Continue with other groups if one fails
      }
    }

    // Execute all prepared statements in a single atomic batch
    console.log(`Executing ${batchStatements.length} migration statements...`);
    if (batchStatements.length > 0) {
      await db.batch([batchStatements[0], ...batchStatements.slice(1)]);
    }

    return new Response(
      JSON.stringify({
        message: 'Data migration completed successfully!',
        statementsExecuted: batchStatements.length,
        idMappings: idMap.length
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('MIGRATION FAILED:', error);
    return new Response(
      JSON.stringify({
        error: 'Migration failed',
        message: error.message,
        stack: error.stack
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
