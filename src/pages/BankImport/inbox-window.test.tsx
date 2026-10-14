import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "@/utils/api";
import BankImport from "./index";
jest.mock("@/utils/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("./ConnectionSettings", () => ({ __esModule: true, default: () => <p>Settings fixture</p> }));
const get = api.get as jest.Mock;
const row = (id: string) => ({id,name:id,accountName:"Synthetic",date:"2026-10-14",amountMinor:100,currency:"GBP",pending:false,reviewStatus:"unreviewed"});
const response = (id: string, nextCursor: string | null = "older-cursor") => ({data:{transactions:[row(id)],hasMore:!!nextCursor,nextCursor}});
async function settle() { await act(async () => { jest.advanceTimersByTime(250); }); }
beforeEach(() => {jest.useFakeTimers();get.mockReset();get.mockResolvedValue(response("Recent fixture"));});
afterEach(() => jest.useRealTimers());
it("reloads a clicked active status instead of leaving an empty list", async () => {
 render(<MemoryRouter><BankImport /></MemoryRouter>);await settle();
 fireEvent.click(screen.getByRole("button",{name:"Posted",exact:true}));await settle();
 expect(screen.getByText("Recent fixture")).toBeInTheDocument();expect(get).toHaveBeenCalledTimes(2);
});
it("retains loaded rows after append failure and retries the same cursor", async () => {
 render(<MemoryRouter><BankImport /></MemoryRouter>);await settle();get.mockRejectedValueOnce(new Error("Synthetic failure"));
 fireEvent.click(screen.getByRole("button",{name:"Load more"}));await settle();
 expect(screen.getByText("Recent fixture")).toBeInTheDocument();expect(screen.getByRole("alert")).toBeInTheDocument();
 get.mockResolvedValueOnce(response("Older fixture",null));fireEvent.click(screen.getByRole("button",{name:"Load more"}));await settle();
 expect(screen.getByText("Recent fixture")).toBeInTheDocument();expect(screen.getByText("Older fixture")).toBeInTheDocument();
 expect(get.mock.calls[1][0]).toBe(get.mock.calls[2][0]);expect(get.mock.calls[2][0]).toContain("cursor=older-cursor");
});
it("filter changes reset loaded rows and the request cursor", async () => {
 render(<MemoryRouter><BankImport /></MemoryRouter>);await settle();get.mockResolvedValueOnce(response("Older fixture",null));
 fireEvent.click(screen.getByRole("button",{name:"Load more"}));await settle();
 fireEvent.click(screen.getByRole("button",{name:"Pending",exact:true}));await settle();
 expect(screen.queryByText("Older fixture")).not.toBeInTheDocument();expect(get.mock.calls[2][0]).toContain("status=pending");expect(get.mock.calls[2][0]).not.toContain("cursor=");
});
