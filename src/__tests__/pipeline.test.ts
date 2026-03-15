import { runPipeline } from "../pipeline";

jest.mock("../chain", () => ({
  runChain: jest.fn(),
}));

jest.mock("../prompts", () => ({
  getPipeline: jest.fn(),
}));

import { runChain } from "../chain";
import { getPipeline } from "../prompts";

const mockRunChain = runChain as jest.MockedFunction<typeof runChain>;
const mockGetPipeline = getPipeline as jest.MockedFunction<typeof getPipeline>;

beforeEach(() => {
  mockRunChain.mockReset();
  mockGetPipeline.mockReset();
});

describe("runPipeline", () => {
  it("runs stages in order and wires outputs to subsequent stages", async () => {
    mockGetPipeline.mockReturnValue({
      stages: [
        { set: "PERSONA", variables: { tech_stack: "{{ tech_stack }}" } },
        { set: "INGEST", variables: { persona: "{{ PERSONA }}", raw_input: "{{ user_ask }}" } },
        { set: "CRITIC", variables: { subject: "{{ INGEST }}" } },
      ],
    });

    mockRunChain
      .mockResolvedValueOnce({ final: "persona output", steps: ["persona output"] })
      .mockResolvedValueOnce({ final: "ingest output", steps: ["ingest output"] })
      .mockResolvedValueOnce({ final: "critic output", steps: ["critic output"] });

    const result = await runPipeline({
      model: "claude-opus-4-6",
      pipelineName: "test-pipeline",
      variables: { tech_stack: "TypeScript", user_ask: "review my plan" },
    });

    expect(mockRunChain).toHaveBeenCalledTimes(3);

    // Stage 1: user var resolved
    expect(mockRunChain).toHaveBeenNthCalledWith(1, {
      model: "claude-opus-4-6",
      promptSet: "PERSONA",
      variables: { tech_stack: "TypeScript" },
    });

    // Stage 2: PERSONA output wired in
    expect(mockRunChain).toHaveBeenNthCalledWith(2, {
      model: "claude-opus-4-6",
      promptSet: "INGEST",
      variables: { persona: "persona output", raw_input: "review my plan" },
    });

    // Stage 3: INGEST output wired in
    expect(mockRunChain).toHaveBeenNthCalledWith(3, {
      model: "claude-opus-4-6",
      promptSet: "CRITIC",
      variables: { subject: "ingest output" },
    });

    expect(result.final).toBe("critic output");
    expect(result.steps).toEqual(["persona output", "ingest output", "critic output"]);
  });

  it("passes literal variable values unchanged", async () => {
    mockGetPipeline.mockReturnValue({
      stages: [{ set: "INGEST", variables: { source: "cursor", raw_input: "{{ user_ask }}" } }],
    });
    mockRunChain.mockResolvedValueOnce({ final: "done", steps: ["done"] });

    await runPipeline({
      model: "claude-opus-4-6",
      pipelineName: "test",
      variables: { user_ask: "my ask" },
    });

    expect(mockRunChain).toHaveBeenCalledWith({
      model: "claude-opus-4-6",
      promptSet: "INGEST",
      variables: { source: "cursor", raw_input: "my ask" },
    });
  });

  it("throws when a declared input is missing", async () => {
    mockGetPipeline.mockReturnValue({
      inputs: ["tech_stack", "plan"],
      stages: [{ set: "PERSONA", variables: { tech_stack: "{{ tech_stack }}" } }],
    });

    await expect(
      runPipeline({ model: "claude-opus-4-6", pipelineName: "test", variables: { tech_stack: "TS" } })
    ).rejects.toThrow('Missing required pipeline input: "plan"');
  });

  it("throws when a stage variable references an unresolvable key", async () => {
    mockGetPipeline.mockReturnValue({
      stages: [{ set: "CRITIC", variables: { subject: "{{ NONEXISTENT }}" } }],
    });

    await expect(
      runPipeline({ model: "claude-opus-4-6", pipelineName: "test", variables: {} })
    ).rejects.toThrow('Unresolved pipeline variable: "NONEXISTENT"');
  });

  it("satisfies each stage required variables when pipeline mirrors engineering-review", async () => {
    // Pipeline and variable mapping mirror critic-prompts engineering-review.yaml.
    // Each stage's prompt set declares specific variables; resolveStageVars must supply them.
    const requiredBySet: Record<string, string[]> = {
      PERSONA: ["tech_stack"],
      INGEST: ["raw_input", "source", "persona", "plan_input"],
      CRITIC: ["subject"],
      UNKNOWNS: ["plan", "verdict"],
    };

    mockGetPipeline.mockReturnValue({
      inputs: ["tech_stack", "user_ask", "plan"],
      stages: [
        { set: "PERSONA", variables: { tech_stack: "{{ tech_stack }}" } },
        {
          set: "INGEST",
          variables: {
            persona: "{{ PERSONA }}",
            raw_input: "{{ user_ask }}",
            source: "cursor",
            plan_input: "{{ plan }}",
          },
        },
        { set: "CRITIC", variables: { subject: "{{ INGEST }}" } },
        {
          set: "UNKNOWNS",
          variables: { plan: "{{ plan }}", verdict: "{{ CRITIC }}" },
        },
      ],
    });

    mockRunChain
      .mockResolvedValueOnce({ final: "persona out", steps: ["persona out"] })
      .mockResolvedValueOnce({ final: "ingest out", steps: ["ingest out"] })
      .mockResolvedValueOnce({ final: "critic out", steps: ["critic out"] })
      .mockResolvedValueOnce({ final: "unknowns out", steps: ["unknowns out"] });

    await runPipeline({
      model: "gemini-2.5-flash",
      pipelineName: "engineering-review",
      variables: {
        tech_stack: "Vue, Laravel",
        user_ask: "review my plan",
        plan: "Step 1. Do X.",
      },
    });

    expect(mockRunChain).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 4; i++) {
      const call = mockRunChain.mock.calls[i];
      const promptSet = call[0].promptSet;
      const variables = call[0].variables;
      const required = requiredBySet[promptSet];
      for (const key of required) {
        expect(variables).toHaveProperty(key);
        expect(typeof variables[key]).toBe("string");
      }
    }
  });
});
