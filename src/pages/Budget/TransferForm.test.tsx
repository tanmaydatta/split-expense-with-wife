import {
	fireEvent,
	render,
	screen,
	within,
	waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TransferForm from "./TransferForm";
import { typedApi } from "@/utils/api";
jest.mock("@/utils/api", () => ({ typedApi: { post: jest.fn() } }));
const post = typedApi.post as jest.Mock;
const budgets = [
	{ id: "food", budgetName: "Food", description: null },
	{ id: "house", budgetName: "Household", description: null },
];
function mount() {
	const onCreated = jest.fn();
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { mutations: { retry: false } } })
			}
		>
			<TransferForm
				budgets={budgets}
				sourceBudgetId="food"
				currencies={["GBP", "EUR"]}
				onCreated={onCreated}
			/>
		</QueryClientProvider>,
	);
	return onCreated;
}
beforeEach(() => {
	post.mockReset();
	Object.defineProperty(global, "crypto", {
		configurable: true,
		value: { randomUUID: jest.fn(() => "synthetic-request-0001") },
	});
});
it("records one currency with an explicit pair and keeps the same request identity after an ambiguous failure", async () => {
	post
		.mockRejectedValueOnce(new Error("Connection interrupted"))
		.mockResolvedValue({
			message: "Transfer recorded",
			transferId: "t",
			sourceEntryId: "s",
			destinationEntryId: "d",
			deleted: false,
		});
	const onCreated = mount();
	fireEvent.click(
		screen.getByRole("button", { name: "Transfer between budgets" }),
	);
	fireEvent.change(screen.getByLabelText("To budget"), {
		target: { value: "house" },
	});
	fireEvent.change(screen.getByLabelText("Amount"), {
		target: { value: "125.50" },
	});
	fireEvent.change(screen.getByLabelText("Date (UTC)"), {
		target: { value: "2026-01-15" },
	});
	fireEvent.change(screen.getByLabelText("Note (optional)"), {
		target: { value: "Allocation" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Record transfer", exact: true }),
	);
	await screen.findByText("Connection interrupted");
	fireEvent.click(
		screen.getByRole("button", { name: "Record transfer", exact: true }),
	);
	await screen.findByText("Transfer recorded");
	expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
	expect(post).toHaveBeenLastCalledWith(
		"/budget-transfer",
		expect.objectContaining({
			sourceBudgetId: "food",
			destinationBudgetId: "house",
			amount: 125.5,
			currency: "GBP",
			date: "2026-01-15",
			note: "Allocation",
		}),
	);
	await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
	expect(
		screen.getByRole("button", { name: "Record transfer", exact: true }),
	).toBeDisabled();
});
it("does not offer the source as destination and explains paired deletion", () => {
	mount();
	fireEvent.click(
		screen.getByRole("button", { name: "Transfer between budgets" }),
	);
	const destination = screen.getByLabelText("To budget");
	expect(
		within(destination).queryByRole("option", { name: "Food" }),
	).toBeNull();
	expect(
		screen.getByText(/Deleting either entry removes both sides/),
	).toBeVisible();
});
