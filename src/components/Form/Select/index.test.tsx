import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { theme } from "../../theme";
import { Select } from "./";

describe("Select", () => {
	it("renders a select with the correct options", () => {
		render(
			<ThemeProvider theme={theme}>
				<Select>
					<option>Option 1</option>
					<option>Option 2</option>
				</Select>
			</ThemeProvider>,
		);
		expect(screen.getByText("Option 1")).toBeInTheDocument();
		expect(screen.getByText("Option 2")).toBeInTheDocument();
	});
});
