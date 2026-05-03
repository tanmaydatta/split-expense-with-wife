import { buildLikePattern, MAX_Q_LENGTH } from "../utils/search";

describe("buildLikePattern", () => {
	it("returns null for undefined", () => {
		expect(buildLikePattern(undefined)).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(buildLikePattern("")).toBeNull();
	});

	it("returns null for whitespace only", () => {
		expect(buildLikePattern("   ")).toBeNull();
	});

	it("wraps a plain string with %", () => {
		expect(buildLikePattern("coffee")).toBe("%coffee%");
	});

	it("trims surrounding whitespace before wrapping", () => {
		expect(buildLikePattern("  coffee  ")).toBe("%coffee%");
	});

	it("escapes % so it is matched literally", () => {
		expect(buildLikePattern("50%")).toBe("%50\\%%");
	});

	it("escapes _ so it is matched literally", () => {
		expect(buildLikePattern("a_b")).toBe("%a\\_b%");
	});

	it("escapes backslash", () => {
		expect(buildLikePattern("a\\b")).toBe("%a\\\\b%");
	});

	it("MAX_Q_LENGTH is 100", () => {
		expect(MAX_Q_LENGTH).toBe(100);
	});
});
