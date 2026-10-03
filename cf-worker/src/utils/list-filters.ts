import { asc, desc, gte, lt, lte, eq, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { FinanceListFilters } from "../../../shared-types";
import { z } from "zod";
import { MAX_Q_LENGTH } from "./search";

const calendarDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(
		(value) =>
			Number.isFinite(Date.parse(value)) &&
			new Date(value).toISOString().slice(0, 10) === value,
		"Invalid date",
	);
const filterSchema = z
	.object({
		offset: z.number().int().nonnegative(),
		q: z.string().trim().max(MAX_Q_LENGTH).optional(),
		dateFrom: calendarDate.optional(),
		dateTo: calendarDate.optional(),
		minAmount: z.number().finite().nonnegative().optional(),
		maxAmount: z.number().finite().nonnegative().optional(),
		currency: z
			.string()
			.regex(/^[A-Z]{3}$/)
			.optional(),
		direction: z.string().optional(),
		sort: z.enum(["newest", "oldest", "amount-asc", "amount-desc"]).optional(),
	})
	.refine(
		(value) =>
			!value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
		"Date from must precede date to",
	)
	.refine(
		(value) =>
			value.minAmount === undefined ||
			value.maxAmount === undefined ||
			value.minAmount <= value.maxAmount,
		"Minimum amount must not exceed maximum",
	);

export function validateListFilters(
	body: unknown,
	directions: string[],
): string | undefined {
	const result = filterSchema.safeParse(body);
	if (!result.success) return result.error.issues[0].message;
	if (result.data.direction && !directions.includes(result.data.direction))
		return "Invalid direction";
}

export function listFilterConditions(
	body: FinanceListFilters,
	date: AnySQLiteColumn,
	amount: AnySQLiteColumn,
	currency: AnySQLiteColumn,
): SQL[] {
	const conditions: SQL[] = [];
	if (body.dateFrom) conditions.push(gte(date, `${body.dateFrom} 00:00:00`));
	if (body.dateTo) {
		const next = new Date(`${body.dateTo}T00:00:00Z`);
		next.setUTCDate(next.getUTCDate() + 1);
		conditions.push(lt(date, `${next.toISOString().slice(0, 10)} 00:00:00`));
	}
	if (body.minAmount !== undefined)
		conditions.push(gte(sql`ABS(${amount})`, body.minAmount));
	if (body.maxAmount !== undefined)
		conditions.push(lte(sql`ABS(${amount})`, body.maxAmount));
	if (body.currency) conditions.push(eq(currency, body.currency));
	return conditions;
}

export function listOrder(
	body: FinanceListFilters,
	date: AnySQLiteColumn,
	amount: AnySQLiteColumn,
	id: AnySQLiteColumn,
): SQL[] {
	const magnitude = sql`ABS(${amount})`;
	const first =
		body.sort === "oldest"
			? asc(date)
			: body.sort === "amount-asc"
				? asc(magnitude)
				: body.sort === "amount-desc"
					? desc(magnitude)
					: desc(date);
	return [first, desc(id)];
}
