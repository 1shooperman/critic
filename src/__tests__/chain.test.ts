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

jest.mock("../prompts", () => {
  const actual = jest.requireActual("../prompts");
  return {
    getPromptSet: jest.fn(),
    renderStep: actual.renderStep,
    stepText: actual.stepText,
    stepLabel: actual.stepLabel,
  };
});

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
    mockGetPromptSet.mockReturnValue({ system: "SYSTEM", steps: ["Critique this: {{context}}"] });
    mockInvoke.mockResolvedValueOnce({ content: "mocked" });

    const result = await runChain({
      model: "claude-opus-4-6",
      promptSet: "my-chain",
      system: "SYSTEM",
      runStartedAt: new Date("2026-03-18T00:00:00.000Z"),
      variables: { context: "some input" },
    });

    expect(result).toEqual({ final: "mocked", steps: ["mocked"] });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("injects previous output into the second step", async () => {
    mockGetPromptSet.mockReturnValue({
      system: "SYSTEM",
      steps: ["Step 1: {{context}}", "Step 2: {{question}}"],
    });
    mockInvoke
      .mockResolvedValueOnce({ content: "first output" })
      .mockResolvedValueOnce({ content: "second output" });

    await runChain({
      model: "claude-opus-4-6",
      promptSet: "my-chain",
      system: "SYSTEM",
      runStartedAt: new Date("2026-03-18T00:00:00.000Z"),
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
      system: "SYSTEM",
      variables: ["context"],
      steps: ["Critique: {{context}}"],
    });

    await expect(
      runChain({
        model: "claude-opus-4-6",
        promptSet: "my-chain",
        system: "SYSTEM",
        runStartedAt: new Date("2026-03-18T00:00:00.000Z"),
        variables: {},
      })
    ).rejects.toThrow('Missing required variable: "context"');
  });

  it("prepends current system time to the SystemMessage", async () => {
    mockGetPromptSet.mockReturnValue({ system: "PERSONA", steps: ["Step 1: {{context}}"] });
    mockInvoke.mockResolvedValueOnce({ content: "mocked" });

    const runStartedAt = new Date("2026-03-18T12:34:56.000Z");
    await runChain({
      model: "claude-opus-4-6",
      promptSet: "my-chain",
      system: "PERSONA",
      runStartedAt,
      variables: { context: "ctx" },
    });

    const firstCallMessages = mockInvoke.mock.calls[0][0];
    const systemMessage = firstCallMessages[0];
    expect(systemMessage.content).toContain("Current system time: 2026-03-18T12:34:56.000Z");
    expect(systemMessage.content).toContain("PERSONA");
  });
});
