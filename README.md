# Critic

An LLM-powered devil's advocate agent delivered as an HTTP/MCP server. Critic chains prompts sequentially — injecting each step's output into the next — to produce rigorous, multi-stage critical analysis of any claim or plan.

Designed to run as a Docker container inside a multi-agent platform. Other agents call it at `http://critic:3000`.

---

## Table of Contents

- [How It Works](#how-it-works)
- [User Guide](#user-guide)
  - [Prerequisites](#prerequisites)
  - [Configuration](#configuration)
  - [Running with Docker](#running-with-docker)
  - [API Reference](#api-reference)
  - [MCP Reference](#mcp-reference)
  - [Supported Models](#supported-models)
- [Developer Guide](#developer-guide)
  - [Project Structure](#project-structure)
  - [Local Development](#local-development)
  - [Architecture](#architecture)
  - [Testing](#testing)
  - [Linting and Formatting](#linting-and-formatting)
  - [Building for Production](#building-for-production)
  - [Adding a New LLM Provider](#adding-a-new-llm-provider)

---

## How It Works

Critic accepts a model name and an ordered list of prompts. It runs them sequentially through the chosen LLM, each time prepending the previous step's output so the model builds on — and critiques — its own prior reasoning.

```
prompt[0]                                          → output[0]
"Previous analysis:\n{output[0]}\n\n{prompt[1]}"  → output[1]
"Previous analysis:\n{output[1]}\n\n{prompt[2]}"  → output[2]
...
```

Every invocation uses the same system persona:

> *"You are a rigorous critic and devil's advocate. Your role is to challenge assumptions, expose logical flaws, identify unstated risks, and argue the strongest counterposition to any claim. Be direct, do not hedge."*

The response includes both the final output and all intermediate steps, so callers can inspect the full reasoning chain.

---

## User Guide

### Prerequisites

- Docker and Docker Compose (for container deployment)
- API key(s) for at least one supported LLM provider

### Configuration

Copy `.env.example` to `.env` and populate the keys for whichever providers you intend to use. Keys for unused providers can be left blank.

```bash
cp .env.example .env
```

```dotenv
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
PORT=3000
```

`PORT` defaults to `3000` if unset. The host-side port can also be overridden at `make build` time via the `PORT` shell variable (see below).

### Running with Docker

```bash
# Build image and start the container (first run or after code changes)
make build

# Start a previously built container
make start

# Stop the running container
make stop

# Full rebuild from scratch — clears the Docker layer cache
make rebuild
```

The container is configured with `restart: unless-stopped`, so it survives host reboots automatically once started.

To override the host port without editing `.env`:

```bash
PORT=8080 make build
```

Verify the service is up:

```bash
curl http://localhost:3000/
# Expected: 404 (GET / is not a registered route — POST / is the endpoint)
```

---

### API Reference

#### `POST /`

Run a critic chain directly over HTTP.

**Request**

```
Content-Type: application/json
```

```jsonc
{
  "model": "claude-opus-4-6",   // required — see Supported Models
  "prompts": [                  // required — at least one string
    "Is microservices always better than a monolith?",
    "Now steelman the monolith position and identify the three biggest risks in the previous critique."
  ]
}
```

**Response `200 OK`**

```jsonc
{
  "final": "...",        // output of the last prompt step
  "steps": [            // output of every step, in order
    "...",
    "..."
  ]
}
```

**Error responses**

| Status | Cause |
|--------|-------|
| `400`  | Missing or malformed `model` / `prompts` field, or invalid JSON |
| `500`  | LLM invocation failed (invalid API key, upstream error, etc.) |

**Single-prompt example**

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "prompts": ["Is microservices always better than monoliths?"]
  }'
```

**Multi-step example**

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "prompts": [
      "Evaluate the claim: daily standups improve team productivity.",
      "What assumptions in the previous critique are themselves unexamined?",
      "Synthesize a final position that accounts for all identified weaknesses."
    ]
  }'
```

---

### MCP Reference

Critic exposes a [Model Context Protocol](https://modelcontextprotocol.io) endpoint using the Streamable HTTP transport (stateless mode). Any MCP-compatible client or orchestrator can discover and call the `critique` tool at `POST http://localhost:3000/mcp`.

#### Tool: `critique`

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | LLM model ID — e.g. `claude-opus-4-6`, `gpt-4o`, `gemini-2.0-flash` |
| `prompts` | `string[]` | Ordered list of prompts. Minimum 1. |

**MCP JSON-RPC example**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "critique",
      "arguments": {
        "model": "claude-opus-4-6",
        "prompts": ["Should every startup pursue venture capital funding?"]
      }
    }
  }'
```

The MCP response contains `result.content[0].text` with the final step's output.

The endpoint also handles `GET /mcp` (SSE stream for server-initiated messages) and `DELETE /mcp` (session teardown), as required by the MCP Streamable HTTP spec.

---

### Supported Models

Model routing is determined by the ID prefix:

| Prefix | Provider | Example IDs |
|--------|----------|-------------|
| `claude-` | Anthropic | `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` |
| `gpt-` | OpenAI | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` |
| `gemini-` | Google | `gemini-2.0-flash`, `gemini-1.5-pro` |

Passing an unsupported prefix returns HTTP `500` with the message `Unknown model prefix: "..."`.

---

## Developer Guide

### Project Structure

```
critic/
├── src/
│   ├── chain.ts           # Core chain logic and model routing
│   ├── server.ts          # Hono app: POST / and MCP /mcp routes
│   ├── index.ts           # Entry point — starts the Node HTTP server
│   └── __tests__/
│       └── chain.test.ts  # Jest unit tests for chain.ts
├── dist/                  # Compiled output (generated by tsc, git-ignored)
├── Dockerfile             # Multi-stage build (builder → production)
├── docker-compose.yml
├── Makefile
├── tsconfig.json
├── jest.config.js
├── biome.json
├── .env.example
└── package.json
```

### Local Development

**Install dependencies**

```bash
npm install
```

**Start the dev server with hot reload**

```bash
# Requires a populated .env file
npm run dev

# Or, pass the env file explicitly (Node 20+ native, no dotenv needed)
tsx --env-file=.env watch src/index.ts
```

`tsx watch` uses esbuild under the hood — restarts are near-instant with no TypeScript compilation step.

---

### Architecture

```
┌─────────────────────────────────────────┐
│  src/index.ts                           │
│  @hono/node-server  →  createApp()      │
└────────────────┬────────────────────────┘
                 │
        ┌────────▼────────┐
        │  src/server.ts  │
        │  Hono app       │
        │                 │
        │  POST /         │  ← direct HTTP
        │  ALL  /mcp      │  ← MCP Streamable HTTP (stateless)
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  src/chain.ts   │
        │                 │
        │  resolveModel() │  ← routes prefix → LangChain class
        │  runChain()     │  ← sequential prompt loop
        └─────────────────┘
```

**Key design decisions:**

- **No growing message history.** Each LLM call receives exactly two messages: the fixed system prompt and a single `HumanMessage`. The previous step's output is injected as plain text at the top of the next human turn. This keeps token usage predictable and avoids context-window blowout across long chains.

- **Stateless MCP transport.** `WebStandardStreamableHTTPServerTransport` is used with `sessionIdGenerator: undefined`. Every request is self-contained — no server-side session state. This is the correct mode for containerized, horizontally scalable deployments.

- **`createApp()` never calls `serve()`.** The Hono app factory is decoupled from the HTTP server so it can be imported and tested without binding a port.

- **CommonJS output.** `tsconfig.json` targets `"module": "CommonJS"` to avoid the `ts-jest` + ESM friction present in Jest 30. The runtime is Node 20 which handles CJS cleanly.

- **Web Standard MCP transport.** The MCP endpoint uses `WebStandardStreamableHTTPServerTransport` rather than the Node.js `StreamableHTTPServerTransport`. The Web Standard variant's `handleRequest()` accepts a Fetch API `Request` and returns a `Response`, which integrates natively with Hono's `c.req.raw` / `return response` model with no adapter glue.

---

### Testing

Tests live in `src/__tests__/` and use Jest + ts-jest. All LLM calls are mocked — no API keys are required to run the test suite.

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

**Test coverage**

| Test | What it validates |
|------|-------------------|
| `resolveModel("claude-*")` | Returns a `ChatAnthropic` instance |
| `resolveModel("gpt-*")` | Returns a `ChatOpenAI` instance |
| `resolveModel("gemini-*")` | Returns a `ChatGoogleGenerativeAI` instance |
| `resolveModel("unknown-*")` | Throws with the unknown prefix |
| Single-prompt chain | Returns `{ final, steps }` with one entry |
| Two-prompt chain | Second LLM call includes first output in its message |
| Empty prompts | Throws `"prompts must not be empty"` |

**Adding tests**

Place new test files under `src/__tests__/` with the `.test.ts` extension. The Jest config picks them up automatically. Mock LLM constructors by setting properties on `this` inside `mockImplementation` so that `instanceof` checks pass correctly:

```typescript
jest.mock("@langchain/anthropic", () => ({
  ChatAnthropic: jest.fn().mockImplementation(function (this: { invoke: jest.Mock }) {
    this.invoke = mockInvoke;
  }),
}));
```

---

### Linting and Formatting

[Biome](https://biomejs.dev) handles both linting and formatting. It is configured in `biome.json`.

```bash
# Lint — report issues without fixing
npm run lint

# Format — write fixes in place
npm run format

# Check — lint + format check combined (useful in CI)
npm run check
```

Biome is Rust-based and requires no separate ESLint or Prettier config. Import organization is enabled via the `assist` action.

---

### Building for Production

**Compile TypeScript to `dist/`:**

```bash
npm run build
```

**Run the compiled output directly:**

```bash
npm start
```

The `dist/` directory is excluded from version control. The Docker production image performs the build inside the builder stage and copies only the compiled output into the final image — dev dependencies are not included.

---

### Adding a New LLM Provider

1. Install the LangChain provider package:

   ```bash
   npm install @langchain/mistralai   # example
   ```

2. Add a routing branch in `src/chain.ts` (`src/chain.ts:17`):

   ```typescript
   import { ChatMistralAI } from "@langchain/mistralai";

   // inside resolveModel():
   if (model.startsWith("mistral-")) {
     return new ChatMistralAI({ model });
   }
   ```

3. Add the API key to `.env.example` and the `environment` block in `docker-compose.yml`.

4. Add a test case to `src/__tests__/chain.test.ts` following the existing mock pattern.

---

## License

MIT
