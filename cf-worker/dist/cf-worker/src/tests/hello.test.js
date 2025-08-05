import { env, createExecutionContext, waitOnExecutionContext, } from "cloudflare:test";
// Vitest globals are available through the test environment
import worker from "../index";
describe("Hello handler", () => {
    it("should return hello message", async () => {
        const request = new Request("https://localhost:8787/.netlify/functions/hello", {
            method: "GET",
        });
        const ctx = createExecutionContext();
        const response = await worker.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);
        expect(response.status).toBe(200);
        const json = (await response.json());
        expect(json.message).toBe("Hello from Cloudflare Worker!");
        expect(json.timestamp).toBeDefined();
        expect(json.worker).toBe("cf-worker");
    });
});
//# sourceMappingURL=hello.test.js.map