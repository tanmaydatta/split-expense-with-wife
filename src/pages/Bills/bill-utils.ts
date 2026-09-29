import type { BillScheduledOption, Currency } from "split-expense-shared-types";

export function scheduledRunsOnDate(action: BillScheduledOption | undefined, date: string): boolean {
	if (!action || date < action.startDate) return false;
	if (action.frequency === "daily") return true;
	if (action.frequency === "weekly") return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${action.startDate}T00:00:00Z`)) / 86_400_000) % 7 === 0;
	const day = Number(action.startDate.slice(8, 10));
	const [year, month] = date.split("-").map(Number);
	return Number(date.slice(8, 10)) === Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

export function amountToMinor(value: string, currency: Currency): number | null {
	const decimals = currency === "JPY" ? 0 : 2;
	const pattern = decimals === 0 ? /^(0|[1-9]\d*)$/ : /^(0|[1-9]\d*)(\.\d{1,2})?$/;
	if (!pattern.test(value)) return null;
	const [major, fractional = ""] = value.split(".");
	const minor = Number(major) * (decimals === 0 ? 1 : 100) + Number(fractional.padEnd(decimals, "0"));
	return Number.isSafeInteger(minor) && minor > 0 && minor <= 1_000_000_000 ? minor : null;
}

export function minorToInput(amountMinor: number, currency: Currency): string {
	return currency === "JPY" ? String(amountMinor) : (amountMinor / 100).toFixed(2);
}

export function formatMoney(amountMinor: number, currency: Currency): string {
	return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountMinor / (currency === "JPY" ? 1 : 100));
}

export function formatBillDate(date: string): string {
	const [year, month, day] = date.split("-").map(Number);
	return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
		.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function shiftMonth(month: string, offset: number): string {
	const [year, monthNumber] = month.split("-").map(Number);
	return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
	const [year, monthNumber] = month.split("-").map(Number);
	return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
		.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
