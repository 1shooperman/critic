import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { runChain } from "./chain";

export function createApp(): Hono {
  const app = new Hono();

  const httpSchema = z.object({
    model: z.string(),
    promptSet: z.string(),
    variables: z.record(z.string(), z.string()).default({}),
  });

  // Direct HTTP endpoint
  app.post("/", async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }

    const parsed = httpSchema.safeParse(raw);
    if (!parsed.success) {
      throw new HTTPException(400, { message: '"model", "promptSet", and "variables" are required' });
    }

    const { model, promptSet, variables } = parsed.data;

    try {
      const result = await runChain({ model, promptSet, variables });
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
      description: "Run a multi-step critic chain using a named prompt set",
      inputSchema: {
        model: z.string().describe("e.g. claude-opus-4-6 or gpt-4o"),
        promptSet: z.string().describe("Name of the prompt chain (YAML filename without extension)"),
        variables: z.record(z.string(), z.string()).describe("Template variable values").default({}),
      },
    },
    async ({ model, promptSet, variables }) => {
      const result = await runChain({ model, promptSet, variables });
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
