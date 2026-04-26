import { customAlphabet } from "nanoid";
import type { SeedRequest } from "../../../shared-types";

const nano = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

type UserSpec = NonNullable<SeedRequest["users"]>[number];
type GroupSpec = NonNullable<SeedRequest["groups"]>[number];
type TxSpec = NonNullable<SeedRequest["transactions"]>[number];
type BeSpec = NonNullable<SeedRequest["budgetEntries"]>[number];

export const factories = {
	user(overrides: Partial<UserSpec> = {}): UserSpec {
		return { alias: overrides.alias ?? `u-${nano()}`, ...overrides };
	},

	group(overrides: Partial<GroupSpec> = {}): GroupSpec {
		return {
			alias: overrides.alias ?? `g-${nano()}`,
			members: overrides.members ?? [],
			defaultCurrency: overrides.defaultCurrency ?? "GBP",
			budgets: overrides.budgets ?? [{ alias: `b-${nano()}`, name: "Default" }],
			...overrides,
		};
	},

	transaction(args: {
		alias?: string;
		group: string;
		paidBy: string; // user alias
		amount: number;
		currency?: string;
		description?: string;
		splitAcross?: string[]; // user aliases; defaults to [paidBy]
		splitPcts?: number[]; // matching percentages summing to 100
		paidByShares?: Record<string, number>;
		splitPctShares?: Record<string, number>;
	}): TxSpec {
		const splitAcross = args.splitAcross ?? [args.paidBy];
		const splitPcts =
			args.splitPcts ?? splitAcross.map(() => 100 / splitAcross.length);
		return {
			alias: args.alias ?? `t-${nano()}`,
			group: args.group,
			amount: args.amount,
			currency: args.currency ?? "GBP",
			description: args.description ?? `e2e-tx-${nano()}`,
			paidByShares: args.paidByShares ?? { [args.paidBy]: args.amount },
			splitPctShares:
				args.splitPctShares ??
				Object.fromEntries(splitAcross.map((u, i) => [u, splitPcts[i]])),
		};
	},

	budgetEntry(args: {
		alias?: string;
		group: string;
		budget: string;
		amount: number;
		currency?: string;
		description?: string;
		addedTime?: string;
	}): BeSpec {
		return {
			alias: args.alias ?? `be-${nano()}`,
			group: args.group,
			budget: args.budget,
			amount: args.amount,
			currency: args.currency ?? "GBP",
			description: args.description ?? `e2e-be-${nano()}`,
			addedTime: args.addedTime,
		};
	},
};
