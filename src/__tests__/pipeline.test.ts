import { runPipeline } from "../pipeline";

jest.mock("../chain", () => ({
  runChain: jest.fn(),
}));

jest.mock("../prompts", () => ({
  getPipeline: jest.fn(),
  getPromptSet: jest.fn(),
  renderStep: jest.requireActual("../prompts").renderStep,
  stepText: jest.requireActual("../prompts").stepText,
}));

import { runChain } from "../chain";
import { getPipeline, getPromptSet } from "../prompts";

const mockRunChain = runChain as jest.MockedFunction<typeof runChain>;
const mockGetPipeline = getPipeline as jest.MockedFunction<typeof getPipeline>;
const mockGetPromptSet = getPromptSet as jest.MockedFunction<typeof getPromptSet>;

beforeEach(() => {
  mockRunChain.mockReset();
  mockGetPipeline.mockReset();
  mockGetPromptSet.mockReset();
});

describe("runPipeline", () => {
  it("runs stages in order and wires outputs to subsequent stages", async () => {
    mockGetPipeline.mockReturnValue({
      stages: [
        { set: "PERSONA", role: "system", variables: { tech_stack: "{{ tech_stack }}" } },
        { set: "INGEST", variables: { persona: "{{ PERSONA }}", raw_input: "{{ user_ask }}" } },
        { set: "CRITIC", variables: { subject: "{{ INGEST }}" } },
      ],
    });
    mockGetPromptSet.mockReturnValue({ steps: ["Persona for {{ tech_stack }}"] });

    mockRunChain
      .mockResolvedValueOnce({ final: "ingest output", steps: ["ingest output"] })
      .mockResolvedValueOnce({ final: "critic output", steps: ["critic output"] });

    const result = await runPipeline({
      model: "claude-opus-4-6",
      pipelineName: "test-pipeline",
      variables: { tech_stack: "TypeScript", user_ask: "review my plan" },
    });

    expect(mockRunChain).toHaveBeenCalledTimes(2);

    // Stage 2: PERSONA output wired in
    expect(mockRunChain).toHaveBeenNthCalledWith(1, expect.objectContaining({
      model: "claude-opus-4-6",
      promptSet: "INGEST",
      system: expect.any(String),
      variables: { persona: expect.any(String), raw_input: "review my plan" },
      runLogger: undefined,
      stageName: "INGEST",
    }));

    // Stage 3: INGEST output wired in
    expect(mockRunChain).toHaveBeenNthCalledWith(2, expect.objectContaining({
      model: "claude-opus-4-6",
      promptSet: "CRITIC",
      system: expect.any(String),
      variables: { subject: "ingest output" },
      runLogger: undefined,
      stageName: "CRITIC",
    }));

    expect(result.final).toBe("critic output");
    expect(result.steps).toEqual(["Persona for TypeScript", "ingest output", "critic output"]);

    const runStartedAt0 = mockRunChain.mock.calls[0][0].runStartedAt;
    expect(runStartedAt0).toBeInstanceOf(Date);
    for (let i = 1; i < 2; i++) {
      expect(mockRunChain.mock.calls[i][0].runStartedAt).toBe(runStartedAt0);
    }
  });

  it("passes literal variable values unchanged", async () => {
    mockGetPipeline.mockReturnValue({
      stages: [
        { set: "PERSONA", role: "system", variables: { tech_stack: "{{ tech_stack }}" } },
        { set: "INGEST", variables: { source: "cursor", raw_input: "{{ user_ask }}" } },
      ],
    });
    mockGetPromptSet.mockReturnValue({ steps: ["Persona for {{ tech_stack }}"] });
    mockRunChain.mockResolvedValueOnce({ final: "done", steps: ["done"] });

    await runPipeline({
      model: "claude-opus-4-6",
      pipelineName: "test",
      variables: { tech_stack: "TS", user_ask: "my ask" },
    });

    expect(mockRunChain).toHaveBeenCalledWith(expect.objectContaining({
      model: "claude-opus-4-6",
      promptSet: "INGEST",
      system: expect.any(String),
      variables: { source: "cursor", raw_input: "my ask" },
      runLogger: undefined,
      stageName: "INGEST",
    }));
  });

  it("throws when a declared input is missing", async () => {
    mockGetPipeline.mockReturnValue({
      inputs: ["tech_stack", "plan"],
      stages: [{ set: "PERSONA", role: "system", variables: { tech_stack: "{{ tech_stack }}" } }],
    });
    mockGetPromptSet.mockReturnValue({ steps: ["Persona for {{ tech_stack }}"] });

    await expect(
      runPipeline({ model: "claude-opus-4-6", pipelineName: "test", variables: { tech_stack: "TS" } })
    ).rejects.toThrow('Missing required pipeline input: "plan"');
  });

  it("throws when a stage variable references an unresolvable key", async () => {
    mockGetPipeline.mockReturnValue({
      stages: [
        { set: "PERSONA", role: "system", variables: { tech_stack: "{{ tech_stack }}" } },
        { set: "CRITIC", variables: { subject: "{{ NONEXISTENT }}" } },
      ],
    });
    mockGetPromptSet.mockReturnValue({ steps: ["Persona for {{ tech_stack }}"] });

    await expect(
      runPipeline({ model: "claude-opus-4-6", pipelineName: "test", variables: { tech_stack: "TS" } })
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
        { set: "PERSONA", role: "system", variables: { tech_stack: "{{ tech_stack }}" } },
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
    mockGetPromptSet.mockReturnValue({ steps: ["Persona for {{ tech_stack }}"] });

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

    expect(mockRunChain).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
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
