import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { runChain } from "./chain";

export function createApp(): Hono {
  const app = new Hono();

  // Direct HTTP endpoint
  app.post("/", async (c) => {
    let body: { model: string; prompts: string[] };
    try {
      body = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }

    const { model, prompts } = body;
    if (!model || !Array.isArray(prompts)) {
      throw new HTTPException(400, { message: '"model" and "prompts" are required' });
    }

    try {
      const result = await runChain({ model, prompts });
      return c.json(result);
    } catch (err) {
      throw new HTTPException(500, {
        message: err instanceof Error ? err.message : "Chain failed",
      });
    }
  });

  // MCP endpoint
  const mcpServer = new McpServer({ name: "critic", version: "1.0.0" });

  mcpServer.registerTool(
    "critique",
    {
      description: "Run a multi-step critic chain against one or more prompts",
      inputSchema: {
        model: z.string().describe("e.g. claude-opus-4-6 or gpt-4o"),
        prompts: z.array(z.string()).min(1),
      },
    },
    async ({ model, prompts }) => {
      const result = await runChain({ model, prompts });
      return { content: [{ type: "text" as const, text: result.final }] };
    }
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  mcpServer.connect(transport);

  app.all("/mcp", async (c) => {
    return transport.handleRequest(c.req.raw);
  });

  return app;
}
