import { fireEvent, render, screen, act } from "@testing-library/react";
import { SearchInput } from "./index";

jest.useFakeTimers();

describe("SearchInput", () => {
	it("renders with provided value and placeholder", () => {
		render(
			<SearchInput
				value="hello"
				onDebouncedChange={() => {}}
				placeholder="Search expenses"
			/>,
		);
		expect(screen.getByPlaceholderText("Search expenses")).toHaveValue("hello");
	});

	it("calls onDebouncedChange after 300ms of no typing", () => {
		const onChange = jest.fn();
		render(<SearchInput value="" onDebouncedChange={onChange} />);
		const input = screen.getByTestId("search-input");
		fireEvent.change(input, { target: { value: "co" } });
		fireEvent.change(input, { target: { value: "coff" } });
		expect(onChange).not.toHaveBeenCalled();
		act(() => {
			jest.advanceTimersByTime(300);
		});
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith("coff");
	});

	it("clears with the × button and fires onDebouncedChange immediately", () => {
		const onChange = jest.fn();
		render(<SearchInput value="coffee" onDebouncedChange={onChange} />);
		fireEvent.click(screen.getByTestId("search-clear-button"));
		expect(onChange).toHaveBeenCalledWith("");
	});

	it("clears with the Escape key", () => {
		const onChange = jest.fn();
		render(<SearchInput value="coffee" onDebouncedChange={onChange} />);
		const input = screen.getByTestId("search-input");
		fireEvent.keyDown(input, { key: "Escape" });
		expect(onChange).toHaveBeenCalledWith("");
	});

	it("does not render the × button when value is empty", () => {
		render(<SearchInput value="" onDebouncedChange={() => {}} />);
		expect(screen.queryByTestId("search-clear-button")).toBeNull();
	});

	it("syncs internal text when external value prop changes", () => {
		const { rerender } = render(
			<SearchInput value="" onDebouncedChange={() => {}} />,
		);
		rerender(<SearchInput value="updated" onDebouncedChange={() => {}} />);
		expect(screen.getByTestId("search-input")).toHaveValue("updated");
	});
});
