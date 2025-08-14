import { createHistoryId } from "../utils";

describe("Utils Functions", () => {
	describe("createHistoryId", () => {
		it("should generate correct format for standard inputs", () => {
			const actionId = "action123";
			const currentDate = "2024-01-15";
			
			const result = createHistoryId(actionId, currentDate);
			
			expect(result).toBe("hist_action123-2024-01-15");
		});

		it("should handle special characters in action ID", () => {
			const actionId = "action-with-dashes_123";
			const currentDate = "2024-12-31";
			
			const result = createHistoryId(actionId, currentDate);
			
			expect(result).toBe("hist_action-with-dashes_123-2024-12-31");
		});

		it("should be consistent with same inputs", () => {
			const actionId = "test-action";
			const currentDate = "2024-06-15";
			
			const result1 = createHistoryId(actionId, currentDate);
			const result2 = createHistoryId(actionId, currentDate);
			
			expect(result1).toBe(result2);
			expect(result1).toBe("hist_test-action-2024-06-15");
		});

		it("should handle ULID-style action IDs", () => {
			const actionId = "01HKB9X8F2N3Q4R5T6V7W8Y9Z0";
			const currentDate = "2024-03-20";
			
			const result = createHistoryId(actionId, currentDate);
			
			expect(result).toBe("hist_01HKB9X8F2N3Q4R5T6V7W8Y9Z0-2024-03-20");
		});

		it("should handle different date formats consistently", () => {
			const actionId = "test";
			
			const result1 = createHistoryId(actionId, "2024-01-01");
			const result2 = createHistoryId(actionId, "2024-12-31");
			
			expect(result1).toBe("hist_test-2024-01-01");
			expect(result2).toBe("hist_test-2024-12-31");
		});
	});
});
