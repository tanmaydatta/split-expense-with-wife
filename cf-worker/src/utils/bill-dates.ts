/** Bill due dates are UTC calendar dates, never browser-local instants. */
export function dueDatesInMonth(
	firstDueDate: string,
	recurrence: "once" | "daily" | "weekly" | "monthly",
	month: string,
): string[] {
	const firstMonth = firstDueDate.slice(0, 7);
	if (month < firstMonth) return [];
	if (recurrence === "once") return month === firstMonth ? [firstDueDate] : [];
	const anchorDay = Number(firstDueDate.slice(8, 10));
	const [year, monthNumber] = month.split("-").map(Number);
	const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
	if (recurrence === "monthly") return [`${month}-${String(Math.min(anchorDay, days)).padStart(2, "0")}`];
	return intervalDates(firstDueDate, recurrence, month, days);
}

function intervalDates(firstDueDate: string, recurrence: "daily" | "weekly", month: string, days: number): string[] {
	const dates: string[] = [];
	const start = Date.parse(`${firstDueDate}T00:00:00Z`);
	for (let day = 1; day <= days; day++) {
		const date = `${month}-${String(day).padStart(2, "0")}`;
		if (date < firstDueDate) continue;
		const elapsed = Math.round((Date.parse(`${date}T00:00:00Z`) - start) / 86_400_000);
		if (recurrence === "daily" || elapsed % 7 === 0) dates.push(date);
	}
	return dates;
}

export function addUtcDays(date: string, days: number): string {
	const result = new Date(`${date}T00:00:00Z`);
	result.setUTCDate(result.getUTCDate() + days);
	return result.toISOString().slice(0, 10);
}

export function allocatedShares(
	amountMinor: number,
	splitBasisPoints: Record<string, number>,
): Record<string, number> {
	const userIds = Object.keys(splitBasisPoints).sort();
	const shares: Record<string, number> = {};
	let assigned = 0;
	for (const [index, userId] of userIds.entries()) {
		const share = index === userIds.length - 1
			? amountMinor - assigned
			: Math.floor(amountMinor * splitBasisPoints[userId] / 10_000);
		shares[userId] = share;
		assigned += share;
	}
	return shares;
}
