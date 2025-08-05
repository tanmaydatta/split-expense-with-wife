import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import { theme } from "../theme";
import { Button } from "./";

describe("Button", () => {
	it("renders a button with the correct text", () => {
		render(
			<ThemeProvider theme={theme}>
				<Button>Click me</Button>
			</ThemeProvider>,
		);
		expect(screen.getByText("Click me")).toBeInTheDocument();
	});
});
