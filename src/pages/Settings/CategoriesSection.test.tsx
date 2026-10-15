import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "styled-components";
import { theme } from "@/components/theme";
import { CategoriesSection } from "./CategoriesSection";
import api from "@/utils/api";
jest.mock("@/utils/api", () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock("@/hooks/useCategories", () => ({
	useCategories: () => ({
		data: {
			enabled: true,
			categories: [
				{
					id: "transfer",
					name: "Household movements",
					excludeFromInsights: false,
					archivedAt: "2026-01-01",
				},
			],
		},
	}),
}));
it("sends only an explicit category exclusion patch and invalidates category/insight caches", async () => {
	(api.post as jest.Mock).mockResolvedValue({ data: {} });
	const client = new QueryClient();
	const spy = jest.spyOn(client, "invalidateQueries");
	render(
		<QueryClientProvider client={client}>
			<ThemeProvider theme={theme}>
				<CategoriesSection />
			</ThemeProvider>
		</QueryClientProvider>,
	);
	const checkbox = screen.getByRole("checkbox", {
		name: "Exclude Household movements from spending insights",
	});
	expect(checkbox).not.toBeChecked();
	fireEvent.click(checkbox);
	await waitFor(() =>
		expect(api.post).toHaveBeenCalledWith("/categories", {
			action: "insight-exclusion",
			id: "transfer",
			excluded: true,
		}),
	);
	await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["category-insights"] }));
	expect(spy).toHaveBeenCalledWith({ queryKey: ["categories"] });
	expect(screen.getByText("Household movements · archived")).toBeInTheDocument();
	client.clear();
});
