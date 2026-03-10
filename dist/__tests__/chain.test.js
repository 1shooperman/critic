"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chain_1 = require("../chain");
const anthropic_1 = require("@langchain/anthropic");
const openai_1 = require("@langchain/openai");
const google_genai_1 = require("@langchain/google-genai");
// --- mocks ---
const mockInvoke = jest.fn();
jest.mock("@langchain/anthropic", () => ({
    ChatAnthropic: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));
jest.mock("@langchain/openai", () => ({
    ChatOpenAI: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));
jest.mock("@langchain/google-genai", () => ({
    ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => ({ invoke: mockInvoke })),
}));
// --- tests ---
beforeEach(() => {
    mockInvoke.mockReset();
});
describe("resolveModel", () => {
    it("returns ChatAnthropic for claude-* models", () => {
        const model = (0, chain_1.resolveModel)("claude-opus-4-6");
        expect(model).toBeInstanceOf(anthropic_1.ChatAnthropic);
    });
    it("returns ChatOpenAI for gpt-* models", () => {
        const model = (0, chain_1.resolveModel)("gpt-4o");
        expect(model).toBeInstanceOf(openai_1.ChatOpenAI);
    });
    it("returns ChatGoogleGenerativeAI for gemini-* models", () => {
        const model = (0, chain_1.resolveModel)("gemini-2.0-flash");
        expect(model).toBeInstanceOf(google_genai_1.ChatGoogleGenerativeAI);
    });
    it("throws for unknown model prefix", () => {
        expect(() => (0, chain_1.resolveModel)("unknown-model")).toThrow("Unknown model prefix");
    });
});
describe("runChain", () => {
    it("returns final and steps for a single prompt", async () => {
        mockInvoke.mockResolvedValueOnce({ content: "mocked" });
        const result = await (0, chain_1.runChain)({ model: "claude-opus-4-6", prompts: ["Test prompt"] });
        expect(result).toEqual({ final: "mocked", steps: ["mocked"] });
        expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
    it("injects previous output into the second prompt", async () => {
        mockInvoke
            .mockResolvedValueOnce({ content: "first output" })
            .mockResolvedValueOnce({ content: "second output" });
        await (0, chain_1.runChain)({ model: "claude-opus-4-6", prompts: ["Prompt 1", "Prompt 2"] });
        expect(mockInvoke).toHaveBeenCalledTimes(2);
        const secondCallMessages = mockInvoke.mock.calls[1][0];
        const humanMessage = secondCallMessages[1];
        expect(humanMessage.content).toContain("first output");
        expect(humanMessage.content).toContain("Prompt 2");
    });
    it("throws when prompts is empty", async () => {
        await expect((0, chain_1.runChain)({ model: "claude-opus-4-6", prompts: [] })).rejects.toThrow("prompts must not be empty");
    });
});
//# sourceMappingURL=chain.test.js.map