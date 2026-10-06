import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { configureStore } from "@reduxjs/toolkit";
import { ThemeProvider } from "styled-components";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "./index";
import { theme } from "../theme";
jest.mock("@/utils/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
function view(providers: Array<{ id: string }>) {
 (useQuery as jest.Mock).mockReturnValue({ data: { providers } });
 const store = configureStore({ reducer: () => ({ value: { extra: { currentUser: { id: "owner", firstName: "Owner" } } } }) });
 return render(<Provider store={store}><ThemeProvider theme={theme}><MemoryRouter><Sidebar /></MemoryRouter></ThemeProvider></Provider>);
}
it("shows bank imports when the backend enables Lunch Flow", () => { view([{ id: "lunch_flow" }]); expect(screen.getByRole("button", { name: "Bank imports" })).toBeInTheDocument(); });
it("hides bank imports when the backend has no enabled providers", () => { view([]); expect(screen.queryByRole("button", { name: "Bank imports" })).not.toBeInTheDocument(); });
