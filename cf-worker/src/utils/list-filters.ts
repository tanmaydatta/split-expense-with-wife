import { asc, desc, gte, lt, lte, eq, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { FinanceListFilters } from "../../../shared-types";
import { MAX_Q_LENGTH } from "./search";

export function validateListFilters(
	body: FinanceListFilters & { offset: number; direction?: string },
	directions: string[],
): string | undefined {
	if (!body || typeof body !== "object" || Array.isArray(body))
		return "Invalid filters";
	if (!Number.isInteger(body.offset) || body.offset < 0)
		return "Invalid offset";
	if (
		body.q !== undefined &&
		(typeof body.q !== "string" || body.q.trim().length > MAX_Q_LENGTH)
	)
		return "Invalid search";
	for (const key of ["dateFrom", "dateTo"] as const) {
		const value = body[key];
		if (
			value !== undefined &&
			(typeof value !== "string" ||
				!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
				!Number.isFinite(Date.parse(value)) ||
				new Date(value).toISOString().slice(0, 10) !== value)
		)
			return "Invalid date";
	}
	if (body.dateFrom && body.dateTo && body.dateFrom > body.dateTo)
		return "Date from must precede date to";
	for (const key of ["minAmount", "maxAmount"] as const) {
		if (
			body[key] !== undefined &&
			(typeof body[key] !== "number" ||
				!Number.isFinite(body[key]) ||
				body[key] < 0)
		)
			return "Amounts must be finite and nonnegative";
	}
	if (
		body.minAmount !== undefined &&
		body.maxAmount !== undefined &&
		body.minAmount > body.maxAmount
	)
		return "Minimum amount must not exceed maximum";
	if (
		body.currency !== undefined &&
		(typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency))
	)
		return "Invalid currency";
	if (body.direction !== undefined && !directions.includes(body.direction))
		return "Invalid direction";
	if (
		body.sort !== undefined &&
		!["newest", "oldest", "amount-asc", "amount-desc"].includes(body.sort)
	)
		return "Invalid sort";
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
