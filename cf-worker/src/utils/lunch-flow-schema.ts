import { z } from "zod";

const Account = z.object({
	id: z.number().int().nonnegative(),
	connection_id: z.number().int().nonnegative(),
	name: z.string().min(1).max(255),
	institution_name: z.string().max(255).nullable().optional(),
	currency: z
		.string()
		.regex(/^[A-Z]{3}$/)
		.nullable()
		.optional(),
	status: z.string().min(1),
	provider: z.string(),
});
const Accounts = z.object({
	accounts: z.array(Account).max(100),
	total: z.number().int().nonnegative(),
});
const Transaction = z
	.object({
		id: z.string().min(1).nullable(),
		accountId: z.number().int().nonnegative(),
		amount: z.number().finite(),
		currency: z.string().regex(/^[A-Z]{3}$/),
		date: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.refine((value) => {
				const parsed = new Date(`${value}T00:00:00Z`);
				return (
					!Number.isNaN(parsed.getTime()) &&
					parsed.toISOString().slice(0, 10) === value
				);
			}),
		merchant: z.string().max(1000).nullable().optional(),
		description: z.string().max(4000).nullable().optional(),
		isPending: z.boolean(),
	})
	.refine((row) => row.id !== null || row.isPending, {
		message: "Posted transactions require a stable ID",
	});
const Transactions = z.object({
	transactions: z.array(Transaction).max(10000),
	total: z.number().int().nonnegative(),
});

export function parseLunchFlowAccounts(value: unknown) {
	const result = Accounts.safeParse(value);
	if (
		!result.success ||
		result.data.total !== result.data.accounts.length ||
		new Set(result.data.accounts.map((row) => row.id)).size !==
			result.data.accounts.length
	)
		return undefined;
	return result.data.accounts;
}
export function parseLunchFlowTransactions(
	value: unknown,
	accountId: string,
	from: string,
	to: string,
) {
	const result = Transactions.safeParse(value);
	if (!result.success || result.data.total !== result.data.transactions.length)
		return undefined;
	if (
		result.data.transactions.some(
			(row) =>
				String(row.accountId) !== accountId || row.date < from || row.date > to,
		) ||
		new Set(
			result.data.transactions
				.filter((row) => row.id !== null)
				.map((row) => row.id),
		).size !== result.data.transactions.filter((row) => row.id !== null).length
	)
		return undefined;
	// Validate the complete snapshot before separating anonymous read-only pending rows.
	const transactions = result.data.transactions.filter(
		(row): row is typeof row & { id: string } => row.id !== null,
	);
	return {
		transactions,
		anonymousPending: result.data.transactions.filter((row) => row.id === null),
		skippedPendingCount: result.data.transactions.length - transactions.length,
	};
}
