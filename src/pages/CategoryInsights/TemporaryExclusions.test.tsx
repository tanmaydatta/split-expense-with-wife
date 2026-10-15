import { render, screen, fireEvent } from "@testing-library/react";
import {
	TemporaryExclusions,
	applyTemporaryExclusions,
	temporaryCategoryIds,
} from "./TemporaryExclusions";
it("applies only explicit temporary choices and Reset preserves saved exclusions", () => {
	const apply = jest.fn();
	render(
		<TemporaryExclusions
			categories={[
				{ id: "saved", name: "Transfers", excludeFromInsights: true },
				{ id: "no-rows", name: "Archived travel", archivedAt: "2020-01-01" },
			]}
			applied={[]}
			onApply={apply}
		/>,
	);
	expect(screen.getByRole("checkbox", { name: /Transfers/ })).toBeChecked();
	expect(screen.getByRole("checkbox", { name: /Transfers/ })).toBeDisabled();
	fireEvent.click(screen.getByRole("checkbox", { name: "Archived travel" }));
	expect(apply).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Apply exclusions" }));
	expect(apply).toHaveBeenLastCalledWith(["no-rows"]);
	fireEvent.click(screen.getByRole("button", { name: "Reset temporary exclusions" }));
	expect(apply).toHaveBeenLastCalledWith([]);
	expect(screen.getByRole("checkbox", { name: /Transfers/ })).toBeChecked();
});
it("URL updates preserve budget, currency, dates and preset and never store Settings changes", () => {
	const original = new URLSearchParams(
		"budget=food&currency=GBP&dateFrom=2026-01-01&dateTo=2026-01-31&preset=custom&exclude=old",
	);
	const updated = applyTemporaryExclusions(original, ["uncategorised", "grocery", "grocery"]);
	expect(temporaryCategoryIds(updated)).toEqual(["grocery", "uncategorised"]);
	expect(updated.get("budget")).toBe("food");
	expect(updated.get("dateFrom")).toBe("2026-01-01");
	expect(updated.get("currency")).toBe("GBP");
	expect(applyTemporaryExclusions(updated, []).toString()).toBe(
		"budget=food&currency=GBP&dateFrom=2026-01-01&dateTo=2026-01-31&preset=custom",
	);
	expect(original.getAll("exclude")).toEqual(["old"]);
});
it("keeps Uncategorised and Reset available when there are no report rows", () => {
	const apply = jest.fn();
	render(<TemporaryExclusions categories={[]} applied={["unknown"]} onApply={apply} />);
	expect(screen.getByRole("checkbox", { name: "Uncategorised" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Reset temporary exclusions" }));
	expect(apply).toHaveBeenCalledWith([]);
});
