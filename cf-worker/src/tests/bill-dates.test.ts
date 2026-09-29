import { allocatedShares, dueDatesInMonth } from "../utils/bill-dates";

describe("bill due dates", () => {
	it("keeps monthly anchor at the end of shorter months", () => {
		expect(dueDatesInMonth("2026-01-31", "monthly", "2026-02")).toEqual(["2026-02-28"]);
		expect(dueDatesInMonth("2026-01-31", "monthly", "2026-03")).toEqual(["2026-03-31"]);
	});
	it("aligns weekly dates to the first due date across month boundaries", () => {
		expect(dueDatesInMonth("2026-01-29", "weekly", "2026-02")).toEqual(["2026-02-05", "2026-02-12", "2026-02-19", "2026-02-26"]);
	});
	it("materializes each daily due date and a one-time date only once", () => {
		expect(dueDatesInMonth("2026-02-27", "daily", "2026-02")).toEqual(["2026-02-27", "2026-02-28"]);
		expect(dueDatesInMonth("2026-02-27", "once", "2026-03")).toEqual([]);
	});
	it("allocates exact integer minor units", () => {
		expect(allocatedShares(101, { bob: 5000, alice: 5000 })).toEqual({ alice: 50, bob: 51 });
	});
});
