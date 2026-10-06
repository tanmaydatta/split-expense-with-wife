import type { Page } from "@playwright/test";
import { expect, skipIfRemoteBackend, test } from "../fixtures/setup";

async function capture(page: Page, name: string) {
 if (process.env.CAPTURE_BANK_PREVIEW !== "1") return;
 await page.getByRole("main").evaluate(main => {
  if (!(main instanceof HTMLElement)) throw new Error("Expected HTML main");
  let node: HTMLElement | null = main;
  while (node) { node.dataset.bankCaptureStyle = node.getAttribute("style") ?? ""; node.style.height = "auto"; node.style.maxHeight = "none"; node.style.overflow = "visible"; node.scrollTop = 0; node = node.parentElement; }
  window.scrollTo(0, 0);
 });
 try { await page.screenshot({ fullPage: true, path: `docs/previews/${name}-${test.info().project.name.replace(/\s+/g, "-").toLowerCase()}.png` }); }
 finally { await page.evaluate(() => { document.querySelectorAll<HTMLElement>("[data-bank-capture-style]").forEach(node => { node.setAttribute("style", node.dataset.bankCaptureStyle ?? ""); delete node.dataset.bankCaptureStyle; }); }); }
}

test.describe("Lunch Flow personal bank inbox", () => {
 test.beforeAll(skipIfRemoteBackend);
 test("sets up a private destination, calibrates a purchase and filters a combined inbox", async ({ authedPageWithGroupOf }) => {
  const { page } = await authedPageWithGroupOf(2);
  let connected = false; let selected = false;
  const setupPayloads: Record<string, unknown>[] = []; const selectionPayloads: Record<string, unknown>[] = []; const reviewPayloads: Record<string, unknown>[] = [];
  const capabilities = { setup: "api_key", reconnect: "external", revokeRemote: false, upstreamRefresh: false, removals: "window_snapshot" };
  await page.route("**/.netlify/functions/bank-import/**", async route => {
   const url = new URL(route.request().url()); let payload: unknown = {};
   if (url.pathname.endsWith("/connections")) payload = { providers: [{ id: "plaid", label: "Plaid Sandbox", capabilities: { ...capabilities, setup: "link", reconnect: "link" } }, { id: "lunch_flow", label: "Lunch Flow", capabilities }], connections: [
    { id: "plaid_bank", provider: "plaid", institutionName: "Sandbox bank", status: "connected", createdAt: "2026-10-01", lastSyncedAt: "2026-10-06T08:00:00Z" },
    ...(connected ? [{ id: "lf_destination", provider: "lunch_flow", institutionName: "Lunch Flow personal destination", status: "connected", createdAt: "2026-10-06", lastSyncedAt: selected ? "2026-10-06T09:00:00Z" : null, capabilities }] : [])] };
   if (url.pathname.endsWith("/accounts")) payload = { accounts: url.searchParams.get("connectionId") === "plaid_bank" ? [{ id: "plaid_account", connectionId: "plaid_bank", name: "Sandbox current", selected: true, mask: "1234", status: "ACTIVE" }] : [{ id: "lf_destination:1", connectionId: "lf_destination", name: "UK current", institutionName: "Example UK Bank", currency: "GBP", selected, mask: null, status: "ACTIVE", amountMultiplier: selected ? -1 : null }] };
   if (url.pathname.endsWith("/inbox")) payload = { transactions: [
    { id: "plaid_charge", connectionId: "plaid_bank", provider: "plaid", accountId: "plaid_account", accountName: "Sandbox current", date: "2026-10-05", name: "Sandbox purchase", merchantName: "Sandbox purchase", amountMinor: 500, currency: "GBP", linkedTransactionId: null, reviewStatus: "unreviewed", rowVersion: 0 },
    ...(selected ? [{ id: "lf_destination:1:charge", connectionId: "lf_destination", provider: "lunch_flow", accountId: "lf_destination:1", accountName: "UK current", institutionName: "Example UK Bank", date: "2026-10-06", name: "Coffee", merchantName: "Coffee Shop", amountMinor: 1234, currency: "GBP", linkedTransactionId: null, reviewStatus: "unreviewed", rowVersion: 2 }] : [])] };
   if (url.pathname.endsWith("/lunch-flow/setup")) { setupPayloads.push(route.request().postDataJSON()); connected = true; payload = { id: "lf_destination", accountCount: 1 }; }
   if (url.pathname.endsWith("/lunch-flow/preview")) payload = { samples: [{ date: "2026-10-06", name: "Coffee Shop", rawAmountMinor: -1234, currency: "GBP" }, { date: "2026-10-05", name: "Salary deposit", rawAmountMinor: 10000, currency: "GBP" }] };
   if (url.pathname.endsWith("/accounts/select")) { selectionPayloads.push(route.request().postDataJSON()); selected = true; payload = { selected: true }; }
   if (url.pathname.endsWith("/candidates")) payload = { candidates: [{ id: "existing_expense", description: "Coffee already entered", amount: 12.34, currency: "GBP", date: "2026-10-06", suggested: true, scheduled: false }] };
   if (url.pathname.endsWith("/match")) { reviewPayloads.push(route.request().postDataJSON()); payload = { transactionId: "existing_expense" }; }
   await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.goto("/bank-import"); await page.getByRole("button", { name: "Connect Lunch Flow", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect Lunch Flow", exact: true })).toBeVisible();
  await page.getByLabel("Personal API key").fill("fixture-private-key"); await page.getByRole("button", { name: "Save Lunch Flow connection" }).click();
  const account = page.getByRole("checkbox", { name: /UK current/ }); await expect(account).toBeDisabled();
  await page.getByRole("button", { name: "Preview raw feed" }).click(); await expect(page.getByText("-£12.34", { exact: true })).toBeVisible();
  await page.getByLabel("Purchase sign for UK current").selectOption("-1"); await account.click(); await expect(account).toBeChecked();
  await expect(page.getByText("Coffee Shop", { exact: true }).last()).toBeVisible(); await expect(page.locator(".bank-activity-list").getByText("Sandbox purchase", { exact: true })).toBeVisible();
  expect(setupPayloads).toEqual([{ apiKey: "fixture-private-key" }]); expect(selectionPayloads[0]).toMatchObject({ amountMultiplier: -1, selected: true }); expect(reviewPayloads).toHaveLength(0);
  await expect(page.getByLabel("Personal API key")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, "bank-providers");
  await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("lunch_flow"); await expect(page.locator(".bank-activity-list").getByText("Sandbox purchase", { exact: true })).toBeHidden();
  await page.getByRole("combobox", { name: "Account", exact: true }).selectOption("lf_destination:1");
  await page.getByRole("button", { name: "Match existing" }).click(); await expect(page.getByRole("button", { name: "Confirm match" })).toBeVisible(); expect(reviewPayloads).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm match" }).click(); await expect(page.getByRole("status")).toContainText("Existing expense matched");
  expect(reviewPayloads[0]).toMatchObject({ bankTransactionId: "lf_destination:1:charge", sourceVersion: 2, transactionId: "existing_expense" });
 });
 test("shows removed reviewed activity with a shared-expense preservation warning", async ({ authedPageWithGroupOf }) => {
  const { page } = await authedPageWithGroupOf(2);
  await page.route("**/.netlify/functions/bank-import/**", async route => {
   const path = new URL(route.request().url()).pathname; let payload: unknown = {};
   if (path.endsWith("/connections")) payload = { providers: [{ id: "lunch_flow", label: "Lunch Flow" }], connections: [{ id: "lf_destination", provider: "lunch_flow", institutionName: "Lunch Flow", status: "needs_attention", lastError: "reauthorize", createdAt: "2026-10-06" }] };
   if (path.endsWith("/accounts")) payload = { accounts: [{ id: "lf_destination:1", connectionId: "lf_destination", name: "UK current", institutionName: "Example UK Bank", selected: true, amountMultiplier: -1, status: "UNAVAILABLE" }] };
   if (path.endsWith("/inbox")) payload = { transactions: new URL(route.request().url()).searchParams.get("status") === "reviewed" ? [{ id: "lf_removed", connectionId: "lf_destination", provider: "lunch_flow", accountId: "lf_destination:1", accountName: "UK current", date: "2026-10-05", name: "Reviewed charge", amountMinor: 1200, currency: "GBP", reviewStatus: "matched", linkedTransactionId: "confirmed", sourceChanged: true, removedAt: "2026-10-06T09:00:00Z" }] : [] };
   await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  await page.goto("/bank-import"); await page.getByRole("button", { name: "Reviewed", exact: true }).click();
  await expect(page.getByRole("note")).toContainText("The provider removed this reviewed activity"); await expect(page.getByRole("note")).toContainText("Your confirmed shared expense is unchanged");
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0); await expect(page.getByRole("link", { name: "Manage or renew in Lunch Flow" })).toBeVisible();
  await capture(page, "bank-reviewed");
 });
});
