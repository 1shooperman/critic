# Critic

An LLM-powered devil's advocate agent delivered as an HTTP/MCP server. Critic chains prompts sequentially — injecting each step's output into the next — to produce rigorous, multi-stage critical analysis of any claim or plan.

Designed to run as a Docker container inside a multi-agent platform. Other agents call it at `http://critic:3000`.

---

## Table of Contents

- [How It Works](#how-it-works)
- [User Guide](#user-guide)
  - [Prerequisites](#prerequisites)
  - [Configuration](#configuration)
  - [Prompt Repository](#prompt-repository)
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

Critic accepts a model name and a named **prompt set** — a YAML file stored in a private GitHub repository. At startup the server fetches all prompt files, parses them, and caches them in memory. Callers reference a set by name and supply template variable values; the server interpolates the steps and runs them sequentially through the chosen LLM, each time prepending the previous step's output so the model builds on — and critiques — its own prior reasoning.

```
step[0] (rendered)                                          → output[0]
"Previous analysis:\n{output[0]}\n\n{step[1]} (rendered)"  → output[1]
"Previous analysis:\n{output[1]}\n\n{step[2]} (rendered)"  → output[2]
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
GITHUB_TOKEN=ghp_...
PROMPTS_REPO_URL=https://github.com/owner/private-prompts-repo
PROMPTS_REPO_PATH=prompts/
PROMPTS_BRANCH=main
```

`PORT` defaults to `3000` if unset. The host-side port can also be overridden at `make build` time via the `PORT` shell variable (see below).

`GITHUB_TOKEN` must be a fine-grained PAT with `contents: read` on the prompts repository. If either `GITHUB_TOKEN` or `PROMPTS_REPO_URL` is absent the server starts with an empty prompt cache and logs a warning — useful for local development without access to the private repo.

### Prompt Repository

Prompts are stored as YAML files in a private GitHub repository, fetched at startup via the GitHub Contents API. This separates prompt authorship from server code — prompts can be updated by editing the private repo and restarting the container, with no changes to this codebase.

**File format** — one file per named chain, identified by its basename without extension:

```yaml
# prompts/my-chain.yaml
description: Optional human-readable description
variables:        # declared variables — validated at call time
  - context
  - team_size
steps:
  - |
    Critique the following: {{context}}
  - |
    Given a team of {{team_size}}, what did the previous analysis miss?
```

- `variables` lists every `{{token}}` name used across all steps. The server throws at call time if any declared variable is absent from the request.
- Template substitution uses `{{variable_name}}` double-brace syntax.
- Files must have a `.yaml` extension. At startup, all files under `PROMPTS_REPO_PATH` are fetched and parsed; file names without the extension become the prompt set names.

**Adding or updating a prompt chain:** edit the YAML file in the private repo and restart the container. No server code changes required.

---

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
  "promptSet": "my-chain",      // required — YAML filename without extension
  "variables": {                // required — values for all declared template variables
    "context": "Is microservices always better than a monolith?",
    "team_size": "8"
  }
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
| `400`  | Missing or malformed `model` / `promptSet` / `variables` field, or invalid JSON |
| `500`  | Unknown prompt set, missing variable, or LLM invocation failure |

**Example**

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "promptSet": "my-chain",
    "variables": {
      "context": "Is microservices always better than a monolith?",
      "team_size": "8"
    }
  }'
```

---

### MCP Reference

Critic exposes a [Model Context Protocol](https://modelcontextprotocol.io) endpoint using the Streamable HTTP transport (stateless mode). Any MCP-compatible client or orchestrator can discover and call the `critique` tool at `POST http://localhost:3000/mcp`.

#### Tool: `critique`

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | LLM model ID — e.g. `claude-opus-4-6`, `gpt-4o`, `gemini-2.0-flash` |
| `promptSet` | `string` | Name of the prompt chain (YAML filename without extension) |
| `variables` | `Record<string, string>` | Template variable values. Defaults to `{}`. |

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
        "promptSet": "my-chain",
        "variables": {
          "context": "Should every startup pursue venture capital funding?"
        }
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
│   ├── prompts.ts         # GitHub fetch, YAML parse, template rendering
│   ├── chain.ts           # Core chain logic and model routing
│   ├── server.ts          # Hono app: POST / and MCP /mcp routes
│   ├── index.ts           # Entry point — loadPrompts() then serve()
│   └── __tests__/
│       ├── chain.test.ts  # Jest unit tests for chain.ts
│       └── prompts.test.ts # Jest unit tests for prompts.ts
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
│  loadPrompts() → @hono/node-server      │
└────────────────┬────────────────────────┘
                 │
        ┌────────▼────────┐      ┌──────────────────────┐
        │  src/server.ts  │      │  src/prompts.ts       │
        │  Hono app       │      │                       │
        │                 │      │  loadPrompts()        │  ← GitHub Contents API
        │  POST /         │  ←   │  getPromptSet()       │  ← in-memory cache
        │  ALL  /mcp      │      │  renderStep()         │  ← {{variable}} substitution
        └────────┬────────┘      └──────────────────────┘
                 │
        ┌────────▼────────┐
        │  src/chain.ts   │
        │                 │
        │  resolveModel() │  ← routes prefix → LangChain class
        │  runChain()     │  ← validates variables, renders steps, sequential loop
        └─────────────────┘
```

**Key design decisions:**

- **Prompts fetched at startup, not per-request.** `loadPrompts()` runs once before the server accepts connections. All prompt files are cached in memory. This keeps request latency low and avoids GitHub API rate limits during normal operation. To pick up prompt changes, restart the container.

- **Prompt authorship decoupled from server code.** YAML files live in a private GitHub repository. Updating a prompt chain requires only a file edit in that repo plus a container restart — no changes to this codebase.

- **`{{variable}}` substitution, no template engine.** Double-brace tokens are replaced with a single regex pass. Declared variables are validated before the chain runs; a missing variable throws immediately rather than silently producing a malformed prompt.

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

`chain.test.ts`

| Test | What it validates |
|------|-------------------|
| `resolveModel("claude-*")` | Returns a `ChatAnthropic` instance |
| `resolveModel("gpt-*")` | Returns a `ChatOpenAI` instance |
| `resolveModel("gemini-*")` | Returns a `ChatGoogleGenerativeAI` instance |
| `resolveModel("unknown-*")` | Throws with the unknown prefix |
| Single-step chain | Returns `{ final, steps }` with one entry |
| Two-step chain | Second LLM call includes first output in its message |
| Missing declared variable | Throws before any LLM call |

`prompts.test.ts`

| Test | What it validates |
|------|-------------------|
| `renderStep` — all variables present | Correct substitution |
| `renderStep` — missing variable | Throws with the variable name |
| `renderStep` — no tokens | Returns template unchanged |
| `getPromptSet` — unknown name | Throws with the set name |
| `loadPrompts` — env vars absent | Logs warning, returns cleanly |
| `loadPrompts` — mocked fetch | Cache populated with parsed YAML |

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
