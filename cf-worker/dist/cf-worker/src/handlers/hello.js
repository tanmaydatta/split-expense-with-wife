import { createJsonResponse } from "../utils";
// Handle hello world
export async function handleHelloWorld(request, env) {
    return createJsonResponse({
        message: "Hello from Cloudflare Worker!",
        timestamp: new Date().toISOString(),
        worker: "cf-worker",
    }, 200, {}, request, env);
}
//# sourceMappingURL=hello.js.map