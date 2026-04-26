import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import worker from "../index";

describe("GET /health", () => {
	it("returns 200 with status ok", async () => {
		const req = new Request("https://localhost:8787/health", {
			method: "GET",
		});
		const ctx = createExecutionContext();
		const res = await worker.fetch(req, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ status: "ok" });
	});
});
