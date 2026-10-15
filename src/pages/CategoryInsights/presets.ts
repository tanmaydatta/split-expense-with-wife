export const insightPresets = [
	["thisMonth", "This month"],
	["lastMonth", "Last month"],
	["last7", "Last 7 days"],
	["last30", "Last 30 days"],
	["last3months", "Last 3 months"],
	["custom", "Custom"],
] as const;
export type InsightPreset = (typeof insightPresets)[number][0];
const dateString = (date: Date) => date.toISOString().slice(0, 10);
export function insightPresetRange(
	preset: InsightPreset,
	today: string,
): { dateFrom: string; dateTo: string } | null {
	if (preset === "custom") return null;
	const end = new Date(`${today}T00:00:00Z`),
		start = new Date(end);
	if (preset === "thisMonth") start.setUTCDate(1);
	if (preset === "lastMonth") {
		end.setUTCDate(0);
		start.setTime(end.getTime());
		start.setUTCDate(1);
	}
	if (preset === "last7" || preset === "last30")
		start.setUTCDate(start.getUTCDate() - (preset === "last7" ? 6 : 29));
	if (preset === "last3months") {
		const day = start.getUTCDate();
		start.setUTCDate(1);
		start.setUTCMonth(start.getUTCMonth() - 3);
		const lastDay = new Date(
			Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
		).getUTCDate();
		start.setUTCDate(Math.min(day, lastDay) + 1);
	}
	return { dateFrom: dateString(start), dateTo: dateString(end) };
}
