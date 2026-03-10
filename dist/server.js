"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const webStandardStreamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
const hono_1 = require("hono");
const http_exception_1 = require("hono/http-exception");
const zod_1 = require("zod");
const chain_1 = require("./chain");
function createApp() {
    const app = new hono_1.Hono();
    // Direct HTTP endpoint
    app.post("/", async (c) => {
        let body;
        try {
            body = await c.req.json();
        }
        catch {
            throw new http_exception_1.HTTPException(400, { message: "Invalid JSON body" });
        }
        const { model, prompts } = body;
        if (!model || !Array.isArray(prompts)) {
            throw new http_exception_1.HTTPException(400, { message: '"model" and "prompts" are required' });
        }
        try {
            const result = await (0, chain_1.runChain)({ model, prompts });
            return c.json(result);
        }
        catch (err) {
            throw new http_exception_1.HTTPException(500, {
                message: err instanceof Error ? err.message : "Chain failed",
            });
        }
    });
    // MCP endpoint
    const mcpServer = new mcp_js_1.McpServer({ name: "critic", version: "1.0.0" });
    mcpServer.registerTool("critique", {
        description: "Run a multi-step critic chain against one or more prompts",
        inputSchema: {
            model: zod_1.z.string().describe("e.g. claude-opus-4-6 or gpt-4o"),
            prompts: zod_1.z.array(zod_1.z.string()).min(1),
        },
    }, async ({ model, prompts }) => {
        const result = await (0, chain_1.runChain)({ model, prompts });
        return { content: [{ type: "text", text: result.final }] };
    });
    const transport = new webStandardStreamableHttp_js_1.WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
    });
    mcpServer.connect(transport);
    app.all("/mcp", async (c) => {
        return transport.handleRequest(c.req.raw);
    });
    return app;
}
//# sourceMappingURL=server.js.map