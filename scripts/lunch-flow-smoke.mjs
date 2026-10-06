// Read-only Personal API verification. Run only after the owner supplies a NEW key.
// Never log credentials, account IDs/names, balances, transaction descriptions or amounts.
import { readFile } from "node:fs/promises";
import { parseLunchFlowAccounts, parseLunchFlowTransactions } from "../cf-worker/src/utils/lunch-flow-schema.ts";
const vars = await readFile(new URL("../cf-worker/.dev.vars", import.meta.url), "utf8");
const line = vars.split(/\r?\n/).find(value => value.startsWith("LUNCH_FLOW_API_KEY="));
const key = line?.slice("LUNCH_FLOW_API_KEY=".length).trim().replace(/^['"]|['"]$/g, "");
if (!key || key.includes("replace-with")) throw new Error("Save a new Personal API key as LUNCH_FLOW_API_KEY in the ignored cf-worker/.dev.vars first");
async function get(path) {
 const result = await fetch(`https://lunchflow.app/api/v1${path}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(15000) });
 if (!result.ok) throw new Error(`Lunch Flow HTTP ${result.status}; response redacted`);
 try { return await result.json(); } catch { throw new Error("Lunch Flow response is not valid JSON"); }
}
const accounts = parseLunchFlowAccounts(await get("/accounts"));
if (!accounts) throw new Error("Account contract mismatch; details redacted");
const to = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const summary = { accountCount: accounts.length, activeCount: accounts.filter(account => account.status === "ACTIVE").length, verifiedAccounts: 0, transactionCount: 0, pendingCount: 0, negativeCount: 0, positiveCount: 0 };
for (const account of accounts.filter(account => account.status === "ACTIVE").slice(0, 5)) {
 const rows = parseLunchFlowTransactions(await get(`/accounts/${encodeURIComponent(account.id)}/transactions?${new URLSearchParams({ from, to, include_pending: "true" })}`), String(account.id), from, to);
 if (!rows) throw new Error("Transaction contract mismatch; details redacted");
 for (const row of rows) {
  summary.transactionCount++; summary.pendingCount += Number(row.isPending);
  summary.negativeCount += Number(row.amount < 0); summary.positiveCount += Number(row.amount > 0);
 }
 summary.verifiedAccounts++;
}
console.log(JSON.stringify(summary));
console.log("Read-only contract check complete. Verify a known purchase and deposit in the private account preview before choosing the sign mapping. No shared expenses were created.");
