import { formatSQLiteTime } from "../utils";
import { getDb } from "../db";
import { groups, budget } from "../db/schema/schema";
import { eq } from "drizzle-orm";

const MONTHLY_CREDITS: { [key: string]: number } = {
	house: 800,
	aayushi: 133,
	tanmay: 150,
	puma: 100,
	default: -1,
};

export async function handleCron(env: Env, cron: string) {
	console.log(`Cron job for ${cron} started`);
	const groupIds = env.GROUP_IDS.split(",").map((id) => id.trim());

	const month = new Date().toLocaleString("default", { month: "long" });
	const year = new Date().getFullYear();
	const description = `${month} ${year}`;
	const db = getDb(env);

	for (const groupId of groupIds) {
		try {
			// Get group data using Drizzle
			const groupResult = await db
				.select()
				.from(groups)
				.where(eq(groups.groupid, Number.parseInt(groupId)))
				.limit(1);

			if (groupResult.length === 0) {
				console.error(`Group with id ${groupId} not found`);
				continue;
			}

			const group = groupResult[0];
			const budgets: string[] = JSON.parse(group.budgets || "[]");
			if (!Array.isArray(budgets)) {
				console.error(`Budgets for group ${groupId} is not an array`);
				continue;
			}

			// Insert budget entries one by one using Drizzle
			for (const budgetName of budgets) {
				const amount =
					// biome-ignore lint/complexity/useLiteralKeys: dynamic key access needed
					MONTHLY_CREDITS[budgetName] || MONTHLY_CREDITS["default"];
				if (amount <= 0) {
					continue;
				}

				await db.insert(budget).values({
					description: description,
					price: `+${amount.toFixed(2)}`,
					addedTime: formatSQLiteTime(),
					amount: amount,
					name: budgetName,
					groupid: Number.parseInt(groupId),
					currency: "GBP",
				});
			}
		} catch (error) {
			console.error(`Error processing group ${groupId}:`, error);
		}
	}

	console.log(`Cron job for ${cron} finished`);
}
