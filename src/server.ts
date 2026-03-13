import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { runChain } from "./chain";
import { runPipeline } from "./pipeline";

export function createApp(): Hono {
  const app = new Hono();

  const httpSchema = z.object({
    model: z.string(),
    promptSet: z.string().optional(),
    pipeline: z.string().optional(),
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
      throw new HTTPException(400, { message: "Invalid request body" });
    }

    const { model, promptSet, pipeline, variables } = parsed.data;

    if (!promptSet && !pipeline) {
      throw new HTTPException(400, { message: 'Either "promptSet" or "pipeline" is required' });
    }
    if (promptSet && pipeline) {
      throw new HTTPException(400, { message: '"promptSet" and "pipeline" are mutually exclusive' });
    }

    try {
      const result = pipeline
        ? await runPipeline({ model, pipelineName: pipeline, variables })
        : await runChain({ model, promptSet: promptSet ?? "", variables });
      return c.json(result);
    } catch (err) {
      throw new HTTPException(500, {
        message: err instanceof Error ? err.message : "Chain failed",
      });
    }
  });

  // MCP endpoint. Stateless mode requires a new transport (and server) per request;
  // reusing one transport throws "Stateless transport cannot be reused across requests."
  function createMcpServer(): McpServer {
    const server = new McpServer({ name: "critic", version: "1.0.0" });
    server.registerTool(
      "critique",
      {
        description: "Run a named prompt set as a single multi-step chain",
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
    server.registerTool(
      "critique_pipeline",
      {
        description: "Run an ordered pipeline of prompt sets, wiring outputs between stages",
        inputSchema: {
          model: z.string().describe("e.g. claude-opus-4-6 or gpt-4o"),
          pipeline: z.string().describe("Name of the pipeline (YAML filename without extension)"),
          variables: z.record(z.string(), z.string()).describe("Top-level input variable values").default({}),
        },
      },
      async ({ model, pipeline, variables }) => {
        const result = await runPipeline({ model, pipelineName: pipeline, variables });
        return { content: [{ type: "text" as const, text: result.final }] };
      }
    );
    return server;
  }

  app.all("/mcp", async (c) => {
    try {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      const mcpServer = createMcpServer();
      mcpServer.connect(transport);
      return transport.handleRequest(c.req.raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[MCP] request failed:", message, err);
      return c.json(
        { jsonrpc: "2.0", error: { code: -32603, message }, id: null },
        500,
        { "Content-Type": "application/json" }
      );
    }
  });

  return app;
}
