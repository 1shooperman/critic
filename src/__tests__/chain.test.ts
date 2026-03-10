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

// --- tests ---

beforeEach(() => {
  mockInvoke.mockReset();
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
  it("returns final and steps for a single prompt", async () => {
    mockInvoke.mockResolvedValueOnce({ content: "mocked" });

    const result = await runChain({ model: "claude-opus-4-6", prompts: ["Test prompt"] });

    expect(result).toEqual({ final: "mocked", steps: ["mocked"] });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("injects previous output into the second prompt", async () => {
    mockInvoke
      .mockResolvedValueOnce({ content: "first output" })
      .mockResolvedValueOnce({ content: "second output" });

    await runChain({ model: "claude-opus-4-6", prompts: ["Prompt 1", "Prompt 2"] });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    const secondCallMessages = mockInvoke.mock.calls[1][0];
    const humanMessage = secondCallMessages[1];
    expect(humanMessage.content).toContain("first output");
    expect(humanMessage.content).toContain("Prompt 2");
  });

  it("throws when prompts is empty", async () => {
    await expect(runChain({ model: "claude-opus-4-6", prompts: [] })).rejects.toThrow(
      "prompts must not be empty"
    );
  });
});
