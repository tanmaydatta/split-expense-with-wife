import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { FinanceListFilters } from "split-expense-shared-types";

export const filterKeys = [
	"q",
	"dateFrom",
	"dateTo",
	"minAmount",
	"maxAmount",
	"currency",
	"direction",
	"sort",
] as const;
export type ListFilters = FinanceListFilters & { direction?: string };

export function useFinanceListFilters(directions: string[]) {
	const [params, setParams] = useSearchParams();
	const serialized = params.toString();
	const { filters, error, activeCount } = useMemo(() => {
		const values = new URLSearchParams(serialized);
		const filters: ListFilters = {};
		let error = "";
		let activeCount = 0;
		for (const key of filterKeys) {
			const value = values.get(key);
			if (
				!value ||
				(key === "direction" && value === "all") ||
				(key === "sort" && value === "newest")
			)
				continue;
			activeCount++;
			if (key === "minAmount" || key === "maxAmount") {
				const number = Number(value);
				if (!Number.isFinite(number) || number < 0)
					error = "Enter a nonnegative total amount.";
				filters[key] = number;
			} else if (key === "sort") {
				if (!["newest", "oldest", "amount-asc", "amount-desc"].includes(value))
					error = "Choose a valid sort order.";
				filters.sort = value as FinanceListFilters["sort"];
			} else filters[key] = value;
		}
		for (const date of [filters.dateFrom, filters.dateTo]) {
			if (
				date &&
				(!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
					!Number.isFinite(Date.parse(date)) ||
					new Date(date).toISOString().slice(0, 10) !== date)
			)
				error = "Enter valid dates.";
		}
		if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
			error = "Date from must be on or before date to.";
		if (
			filters.minAmount !== undefined &&
			filters.maxAmount !== undefined &&
			filters.minAmount > filters.maxAmount
		)
			error = "Minimum amount must not exceed maximum.";
		if (filters.direction && !directions.includes(filters.direction))
			error = "Choose a valid direction.";
		if (filters.currency && !/^[A-Z]{3}$/.test(filters.currency))
			error = "Choose a valid currency.";
		return { filters, error, activeCount };
		// Directions are fixed per screen.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [serialized]);
	const update = (key: (typeof filterKeys)[number], value: string) =>
		setParams((previous) => {
			const next = new URLSearchParams(previous);
			if (value) next.set(key, value);
			else next.delete(key);
			return next;
		});
	const clear = () =>
		setParams((previous) => {
			const next = new URLSearchParams(previous);
			filterKeys.forEach((key) => next.delete(key));
			return next;
		});
	return {
		filters,
		error,
		activeCount,
		update,
		clear,
		params,
		key: JSON.stringify(filters),
	};
}
