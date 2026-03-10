import { getPromptSet, loadPrompts, renderStep, stepLabel, stepText } from "../prompts";

// --- stepText ---

describe("stepText", () => {
  it("returns the string directly for a plain string step", () => {
    expect(stepText("hello {{name}}")).toBe("hello {{name}}");
  });

  it("returns the prompt field for an object step", () => {
    expect(stepText({ label: "greet", prompt: "hello {{name}}" })).toBe("hello {{name}}");
  });

  it("returns the prompt field when label is absent", () => {
    expect(stepText({ prompt: "hello" })).toBe("hello");
  });
});

// --- stepLabel ---

describe("stepLabel", () => {
  it("returns the label for a labelled object step", () => {
    expect(stepLabel({ label: "critique", prompt: "..." }, 0)).toBe("critique");
  });

  it("returns a 1-based fallback for a plain string step", () => {
    expect(stepLabel("...", 0)).toBe("step 1");
    expect(stepLabel("...", 2)).toBe("step 3");
  });

  it("returns a 1-based fallback for an object step with no label", () => {
    expect(stepLabel({ prompt: "..." }, 1)).toBe("step 2");
  });
});

// --- renderStep ---

describe("renderStep", () => {
  it("substitutes all variables", () => {
    const result = renderStep("Hello {{name}}, you have {{count}} messages.", {
      name: "Alice",
      count: "5",
    });
    expect(result).toBe("Hello Alice, you have 5 messages.");
  });

  it("substitutes variables with surrounding spaces", () => {
    const result = renderStep("Hello {{ name }}, you have {{ count }} messages.", {
      name: "Alice",
      count: "5",
    });
    expect(result).toBe("Hello Alice, you have 5 messages.");
  });

  it("throws when a variable is missing", () => {
    expect(() => renderStep("Hello {{name}}", {})).toThrow('Missing variable: "name"');
  });

  it("throws when a spaced variable is missing", () => {
    expect(() => renderStep("Hello {{ name }}", {})).toThrow('Missing variable: "name"');
  });

  it("leaves text with no tokens unchanged", () => {
    expect(renderStep("No tokens here.", {})).toBe("No tokens here.");
  });
});

// --- getPromptSet ---

describe("getPromptSet", () => {
  it("throws for an unknown prompt set name", () => {
    expect(() => getPromptSet("does-not-exist")).toThrow('Unknown prompt set: "does-not-exist"');
  });
});

// --- loadPrompts ---

describe("loadPrompts", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("returns without fetching when GITHUB_TOKEN is absent", async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.PROMPTS_REPO_URL;
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});

    await loadPrompts();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("GITHUB_TOKEN"));
  });

  it("populates cache from mocked GitHub API response with plain string steps", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    process.env.PROMPTS_REPO_URL = "https://github.com/owner/repo";
    process.env.PROMPTS_REPO_PATH = "prompts/";
    process.env.PROMPTS_BRANCH = "main";

    const yamlContent = `steps:\n  - "Critique: {{context}}"\nvariables:\n  - context\n`;

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "test-chain.yaml", type: "file", download_url: "https://raw.example.com/test-chain.yaml" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => yamlContent,
      });

    global.fetch = mockFetch as unknown as typeof fetch;

    await loadPrompts();

    const promptFile = getPromptSet("test-chain");
    expect(promptFile.steps).toEqual(["Critique: {{context}}"]);
    expect(promptFile.variables).toEqual(["context"]);
  });

  it("populates cache from mocked GitHub API response with labelled object steps", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    process.env.PROMPTS_REPO_URL = "https://github.com/owner/repo";
    process.env.PROMPTS_REPO_PATH = "prompts/";
    process.env.PROMPTS_BRANCH = "main";

    const yamlContent = [
      "variables:",
      "  - subject",
      "steps:",
      "  - label: critique",
      "    prompt: |",
      "      Critique: {{subject}}",
      "  - label: synthesize",
      "    prompt: |",
      "      Synthesize.",
    ].join("\n");

    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ name: "labelled.yaml", type: "file", download_url: "https://raw.example.com/labelled.yaml" }],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => yamlContent,
      });

    global.fetch = mockFetch as unknown as typeof fetch;

    await loadPrompts();

    const promptFile = getPromptSet("labelled");
    expect(stepText(promptFile.steps[0])).toBe("Critique: {{subject}}\n");
    expect(stepLabel(promptFile.steps[0], 0)).toBe("critique");
    expect(stepLabel(promptFile.steps[1], 1)).toBe("synthesize");
  });
});
