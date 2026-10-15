import { insightPresetRange } from "./presets";
it("uses inclusive UTC rolling days rather than calendar periods", () => {
	expect(insightPresetRange("last7", "2026-10-15")).toEqual({
		dateFrom: "2026-10-09",
		dateTo: "2026-10-15",
	});
	expect(insightPresetRange("last30", "2026-10-15")).toEqual({
		dateFrom: "2026-09-16",
		dateTo: "2026-10-15",
	});
	expect(insightPresetRange("last3months", "2026-10-15")).toEqual({
		dateFrom: "2026-07-16",
		dateTo: "2026-10-15",
	});
});
it("clamps rolling three-month boundaries at month ends including leap years", () => {
	expect(insightPresetRange("last3months", "2026-05-31")).toEqual({
		dateFrom: "2026-03-01",
		dateTo: "2026-05-31",
	});
	expect(insightPresetRange("last3months", "2024-05-31")).toEqual({
		dateFrom: "2024-03-01",
		dateTo: "2024-05-31",
	});
	expect(insightPresetRange("last3months", "2024-05-29")).toEqual({
		dateFrom: "2024-03-01",
		dateTo: "2024-05-29",
	});
	expect(insightPresetRange("last3months", "2025-01-31")).toEqual({
		dateFrom: "2024-11-01",
		dateTo: "2025-01-31",
	});
});
it("keeps This month and Last month calendar based", () => {
	expect(insightPresetRange("thisMonth", "2026-10-15")).toEqual({
		dateFrom: "2026-10-01",
		dateTo: "2026-10-15",
	});
	expect(insightPresetRange("lastMonth", "2024-03-10")).toEqual({
		dateFrom: "2024-02-01",
		dateTo: "2024-02-29",
	});
	expect(insightPresetRange("lastMonth", "2026-01-10")).toEqual({
		dateFrom: "2025-12-01",
		dateTo: "2025-12-31",
	});
	expect(insightPresetRange("custom", "2026-10-15")).toBeNull();
});
