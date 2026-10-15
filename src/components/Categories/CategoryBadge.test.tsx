import { render, screen } from "@testing-library/react";
import { CategoryBadge } from "./index";
const mockCategories = jest.fn();
jest.mock("@/hooks/useCategories", () => ({ useCategories: () => mockCategories() }));
jest.mock("@/utils/api", () => ({ __esModule: true, default: { post: jest.fn() } }));
beforeEach(() =>
	mockCategories.mockReturnValue({
		data: {
			enabled: true,
			categories: [
				{ id: "groceries", name: "Groceries", slug: "groceries" },
				{ id: "legacy", name: "Archived custom category", archivedAt: "2025-01-01" },
			],
		},
	}),
);
it("shows a decorative category icon with the saved name", () => {
	render(<CategoryBadge record={{ categoryId: "groceries", categoryName: "Groceries" }} />);
	expect(screen.getByText("Groceries")).toBeVisible();
	expect(screen.getByText("🛒")).toHaveAttribute("aria-hidden", "true");
});
it("keeps saved archived names and uses a generic icon for custom categories", () => {
	render(
		<CategoryBadge record={{ categoryId: "legacy", categoryName: "Archived custom category" }} />,
	);
	expect(screen.getByText("Archived custom category")).toBeVisible();
	expect(screen.getByText("🏷")).toHaveAttribute("aria-hidden", "true");
});
it("shows Uncategorised explicitly when metadata is missing", () => {
	render(<CategoryBadge record={{}} />);
	expect(screen.getByText("Uncategorised")).toBeVisible();
	expect(screen.getByText("❔")).toHaveAttribute("aria-hidden", "true");
});
it("does not display a category while the rollout is disabled", () => {
	mockCategories.mockReturnValue({ data: { enabled: false, categories: [] } });
	const { container } = render(<CategoryBadge record={{ categoryName: "Groceries" }} />);
	expect(container).toBeEmptyDOMElement();
});
