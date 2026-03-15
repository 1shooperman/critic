# Critic

An LLM-powered devil's advocate agent delivered as an HTTP/MCP server. Critic runs prompt chains sequentially — injecting each step's output into the next — to produce rigorous, multi-stage critical analysis of any claim or plan. Chains can be a single named prompt set or an ordered pipeline of multiple sets wired together.

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

Critic supports two modes:

**Prompt set** — a single named YAML file containing an ordered list of steps. Steps run sequentially through the chosen LLM; each step receives the **immediately previous** step's output prepended as context. Later steps do not see earlier steps (e.g. step 3 sees only step 2's output, not step 1's). This keeps token usage bounded and encourages summarization; when authoring multi-step prompts, design each step to build on the previous one or to pass along the needed context.

```
step[0] (rendered)                                          → output[0]
"Previous analysis:\n{output[0]}\n\n{step[1]} (rendered)"  → output[1]
"Previous analysis:\n{output[1]}\n\n{step[2]} (rendered)"  → output[2]
...
```

**Pipeline** — an ordered sequence of prompt sets defined in a separate YAML file. Each set runs to completion; its final output is automatically wired as an input variable to subsequent sets. The caller supplies only the top-level inputs; the server handles all inter-stage plumbing.

```
stage[0] (prompt set A) → final output A
stage[1] (prompt set B, receives output A) → final output B
stage[2] (prompt set C, receives output B) → final output C
...
```

Every LLM invocation uses the same system persona:

> *"You are a rigorous critic and devil's advocate. Your role is to challenge assumptions, expose logical flaws, identify unstated risks, and argue the strongest counterposition to any claim. Be direct, do not hedge."*

The response always includes both the `final` output and all intermediate `steps`, so callers can inspect the full reasoning chain.

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
GOOGLE_API_KEY=AI...
PORT=3000
GITHUB_TOKEN=ghp_...
PROMPTS_REPO_URL=https://github.com/owner/private-prompts-repo
PROMPTS_REPO_PATH=prompts/
PROMPTS_BRANCH=main
```

`PORT` defaults to `3000` if unset. The host-side port can also be overridden at `make build` time via the `PORT` shell variable (see below).

`GITHUB_TOKEN` must be a fine-grained PAT with `contents: read` on the prompts repository. If either `GITHUB_TOKEN` or `PROMPTS_REPO_URL` is absent the server starts with an empty prompt cache and logs a warning — useful for local development without access to the private repo.

### Security and deployment

This service has **no built-in authentication**. HTTP and MCP endpoints are unauthenticated by design. It is intended for trusted or internal use only (e.g. inside a multi-agent platform or mesh). When deploying, use network controls (e.g. network policy, API gateway, mTLS) or run the service in a segment that is not exposed to untrusted callers. For vulnerability reporting and API key handling, see [SECURITY.md](SECURITY.md).

### Prompt Repository

Prompts and pipelines are stored as YAML files in a private GitHub repository, fetched at startup via the GitHub Contents API. This separates prompt authorship from server code — prompts and pipelines can be updated by editing the private repo and restarting the container, with no changes to this codebase.

All files under `PROMPTS_REPO_PATH` are loaded in a single pass. The file type is detected automatically:

- Files with a `steps` key → **prompt set**
- Files with a `stages` key → **pipeline**

File names without the `.yaml` extension become the names callers reference.

---

#### Prompt set format

```yaml
# my-chain.yaml
description: Optional human-readable description
variables:        # declared variables — validated at call time
  - input
  - context
steps:
  - label: first_step
    prompt: |
      Critique the following: {{ input }}
  - label: second_step
    prompt: |
      Given this context — {{ context }} — what did the previous critique miss?
```

- `variables` lists every `{{ token }}` used across all steps. The server throws at call time if any declared variable is absent from the request.
- Steps are executed in array order. Each step can optionally carry a `label` for logging; without one the server logs it as `step N`.
- Template substitution uses `{{ variable_name }}` double-brace syntax (spaces around the name are optional).
- Plain string steps (no `label`/`prompt` keys) are also supported for simpler chains.

---

#### Pipeline format

```yaml
# my-pipeline.yaml
description: Optional human-readable description
inputs:           # top-level variables the caller must supply
  - var_a
  - var_b
stages:
  - set: some-chain
    variables:
      input: "{{ var_a }}"
  - set: another-chain
    variables:
      context: "{{ some-chain }}"   # {{ STAGE_SET_NAME }} resolves to that stage's final output
      extra: "{{ var_b }}"
      literal_value: hardcoded      # values with no {{ }} tokens are passed as-is
```

- `inputs` declares the variables the caller must supply. The server throws if any are missing.
- Each stage names a prompt set (`set`) and maps its required variables. Values can reference top-level inputs or the final output of any previously completed stage using `{{ SET_NAME }}`.
- Stage outputs take precedence over user inputs when resolving a variable name.

**Adding or updating a prompt set or pipeline:** edit the YAML file in the private repo and restart the container. No server code changes required.

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

The container is started with `--restart unless-stopped`, so it survives host reboots automatically once started. Environment variables are passed from `.env` via `--env-file`.

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

Run a prompt set or pipeline directly over HTTP. Exactly one of `promptSet` or `pipeline` must be provided.

**Request**

```
Content-Type: application/json
```

```jsonc
// Prompt set
{
  "model": "claude-opus-4-6",
  "promptSet": "my-chain",
  "variables": { "input": "...", "context": "..." }
}

// Pipeline
{
  "model": "claude-opus-4-6",
  "pipeline": "my-pipeline",
  "variables": { "var_a": "...", "var_b": "..." }
}
```

**Response `200 OK`**

```jsonc
{
  "final": "...",   // output of the last step (prompt set) or last stage (pipeline)
  "steps": [        // prompt set: output of every step; pipeline: final output of each stage
    "...",
    "..."
  ]
}
```

**Error responses**

| Status | Cause |
|--------|-------|
| `400`  | Invalid JSON, missing `model`, neither or both of `promptSet`/`pipeline` provided |
| `500`  | Unknown prompt set or pipeline, missing variable, or LLM invocation failure |

**Prompt set example**

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "promptSet": "my-chain",
    "variables": { "input": "Is microservices always better than a monolith?" }
  }'
```

**Pipeline example**

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-6",
    "pipeline": "my-pipeline",
    "variables": { "var_a": "...", "var_b": "..." }
  }'
```

---

### MCP Reference

Critic exposes a [Model Context Protocol](https://modelcontextprotocol.io) endpoint using the Streamable HTTP transport (stateless mode). Any MCP-compatible client or orchestrator can discover and call the tools at `POST http://localhost:3000/mcp`.

#### Tool: `critique`

Runs a single named prompt set.

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | LLM model ID — e.g. `claude-opus-4-6`, `gpt-4o`, `gemini-2.0-flash` |
| `promptSet` | `string` | Name of the prompt set (YAML filename without extension) |
| `variables` | `Record<string, string>` | Template variable values. Defaults to `{}`. |

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
        "variables": { "input": "Should every startup pursue venture capital?" }
      }
    }
  }'
```

#### Tool: `critique_pipeline`

Runs an ordered pipeline of prompt sets, wiring stage outputs automatically.

| Field | Type | Description |
|-------|------|-------------|
| `model` | `string` | LLM model ID |
| `pipeline` | `string` | Name of the pipeline (YAML filename without extension) |
| `variables` | `Record<string, string>` | Top-level input variable values. Defaults to `{}`. |

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "critique_pipeline",
      "arguments": {
        "model": "claude-opus-4-6",
        "pipeline": "my-pipeline",
        "variables": { "var_a": "...", "var_b": "..." }
      }
    }
  }'
```

Both tools return `result.content[0].text` with the final output.

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
│   ├── prompts.ts          # GitHub fetch, YAML parse, prompt set + pipeline caches
│   ├── pipeline.ts         # Pipeline runner — stage orchestration and variable wiring
│   ├── chain.ts            # Prompt set runner and model routing
│   ├── server.ts           # Hono app: POST / and MCP /mcp routes
│   ├── index.ts            # Entry point — loadPrompts() then serve()
│   └── __tests__/
│       ├── chain.test.ts   # Jest unit tests for chain.ts
│       ├── prompts.test.ts # Jest unit tests for prompts.ts
│       └── pipeline.test.ts # Jest unit tests for pipeline.ts
├── dist/                   # Compiled output (generated by tsc, git-ignored)
├── Dockerfile              # Multi-stage build (builder → production)
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
        ┌────────▼────────┐      ┌──────────────────────────┐
        │  src/server.ts  │      │  src/prompts.ts           │
        │  Hono app       │      │                           │
        │                 │      │  loadPrompts()            │  ← GitHub Contents API
        │  POST /         │  ←   │  getPromptSet()           │  ← prompt set cache
        │  ALL  /mcp      │      │  getPipeline()            │  ← pipeline cache
        └────┬───┬────────┘      │  renderStep()             │  ← {{ }} substitution
             │   │               └──────────────────────────┘
             │   │
             │   │         ┌──────────────────────────┐
             │   └────────►│  src/pipeline.ts          │
             │             │                           │
             │             │  runPipeline()            │  ← stage loop, var wiring
             │             └────────────┬──────────────┘
             │                          │
             │             ┌────────────▼──────────────┐
             └────────────►│  src/chain.ts             │
                           │                           │
                           │  resolveModel()           │  ← prefix → LangChain class
                           │  runChain()               │  ← step loop
                           └───────────────────────────┘
```

**Key design decisions:**

- **Prompts and pipelines fetched at startup, not per-request.** `loadPrompts()` runs once before the server accepts connections. All files are cached in memory. To pick up changes, restart the container.

- **Single fetch pass for both file types.** The loader detects prompt sets (`steps`) and pipelines (`stages`) from the same directory in one GitHub API call.

- **Pipeline variable resolution order.** Stage outputs take precedence over user-supplied inputs when names collide. Literal values (no `{{ }}` tokens) pass through unchanged.

- **`{{variable}}` substitution, no template engine.** Double-brace tokens are replaced with a single regex pass. Spaces around the variable name are optional. Declared variables are validated before execution; a missing variable throws immediately.

- **No growing message history.** Each LLM call receives exactly two messages: the fixed system prompt and a single `HumanMessage`. Only the immediately previous step's output is injected as plain text at the top of the next human turn (earlier steps are not accumulated). This keeps token usage predictable and avoids context-window blowout across long chains.

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
| `stepText` — plain string step | Returns the string directly |
| `stepText` — object step | Returns the `prompt` field |
| `stepLabel` — labelled step | Returns the label |
| `stepLabel` — unlabelled step | Returns `"step N"` (1-based) |
| `renderStep` — all variables present | Correct substitution |
| `renderStep` — spaced `{{ var }}` tokens | Correct substitution |
| `renderStep` — missing variable | Throws with the variable name |
| `renderStep` — no tokens | Returns template unchanged |
| `getPromptSet` — unknown name | Throws with the set name |
| `loadPrompts` — env vars absent | Logs warning, returns cleanly |
| `loadPrompts` — string steps | Cache populated correctly |
| `loadPrompts` — labelled object steps | Cache populated, labels accessible |

`pipeline.test.ts`

| Test | What it validates |
|------|-------------------|
| Stage ordering and output wiring | Each stage receives the previous stage's final output |
| Literal variable values | Passed through unchanged |
| Missing declared input | Throws before any stage runs |
| Unresolvable stage variable | Throws with the variable name |

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

2. Add a routing branch in `src/chain.ts` (`src/chain.ts:19`):

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
