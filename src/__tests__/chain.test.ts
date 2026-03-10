import { resolveModel, runChain } from "../chain";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// --- mocks ---

const mockInvoke = jest.fn();

jest.mock("@langchain/anthropic", () => ({
  ChatAnthropic: jest.fn().mockImplementation(function (this: { invoke: typeof mockInvoke }) {
    this.invoke = mockInvoke;
  }),
}));

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: jest.fn().mockImplementation(function (this: { invoke: typeof mockInvoke }) {
    this.invoke = mockInvoke;
  }),
}));

jest.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: jest
    .fn()
    .mockImplementation(function (this: { invoke: typeof mockInvoke }) {
      this.invoke = mockInvoke;
    }),
}));

jest.mock("../prompts", () => ({
  getPromptSet: jest.fn(),
  renderStep: jest.requireActual("../prompts").renderStep,
}));

import { getPromptSet } from "../prompts";

const mockGetPromptSet = getPromptSet as jest.MockedFunction<typeof getPromptSet>;

// --- tests ---

beforeEach(() => {
  mockInvoke.mockReset();
  mockGetPromptSet.mockReset();
});

describe("resolveModel", () => {
  it("returns ChatAnthropic for claude-* models", () => {
    const model = resolveModel("claude-opus-4-6");
    expect(model).toBeInstanceOf(ChatAnthropic);
  });

  it("returns ChatOpenAI for gpt-* models", () => {
    const model = resolveModel("gpt-4o");
    expect(model).toBeInstanceOf(ChatOpenAI);
  });

  it("returns ChatGoogleGenerativeAI for gemini-* models", () => {
    const model = resolveModel("gemini-2.0-flash");
    expect(model).toBeInstanceOf(ChatGoogleGenerativeAI);
  });

  it("throws for unknown model prefix", () => {
    expect(() => resolveModel("unknown-model")).toThrow("Unknown model prefix");
  });
});

describe("runChain", () => {
  it("returns final and steps for a single-step prompt set", async () => {
    mockGetPromptSet.mockReturnValue({ steps: ["Critique this: {{context}}"] });
    mockInvoke.mockResolvedValueOnce({ content: "mocked" });

    const result = await runChain({
      model: "claude-opus-4-6",
      promptSet: "my-chain",
      variables: { context: "some input" },
    });

    expect(result).toEqual({ final: "mocked", steps: ["mocked"] });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("injects previous output into the second step", async () => {
    mockGetPromptSet.mockReturnValue({ steps: ["Step 1: {{context}}", "Step 2: {{question}}"] });
    mockInvoke
      .mockResolvedValueOnce({ content: "first output" })
      .mockResolvedValueOnce({ content: "second output" });

    await runChain({
      model: "claude-opus-4-6",
      promptSet: "my-chain",
      variables: { context: "ctx", question: "q" },
    });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    const secondCallMessages = mockInvoke.mock.calls[1][0];
    const humanMessage = secondCallMessages[1];
    expect(humanMessage.content).toContain("first output");
    expect(humanMessage.content).toContain("Step 2: q");
  });

  it("throws when a declared variable is missing", async () => {
    mockGetPromptSet.mockReturnValue({
      variables: ["context"],
      steps: ["Critique: {{context}}"],
    });

    await expect(
      runChain({ model: "claude-opus-4-6", promptSet: "my-chain", variables: {} })
    ).rejects.toThrow('Missing required variable: "context"');
  });
});
