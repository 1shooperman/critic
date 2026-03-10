import { getPromptSet, loadPrompts, renderStep } from "../prompts";

// --- renderStep ---

describe("renderStep", () => {
  it("substitutes all variables", () => {
    const result = renderStep("Hello {{name}}, you have {{count}} messages.", {
      name: "Alice",
      count: "5",
    });
    expect(result).toBe("Hello Alice, you have 5 messages.");
  });

  it("throws when a variable is missing", () => {
    expect(() => renderStep("Hello {{name}}", {})).toThrow('Missing variable: "name"');
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

  it("populates cache from mocked GitHub API response", async () => {
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
});
