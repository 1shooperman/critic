import { type ChainOutput, runChain } from "./chain";
import type { RunLogger } from "./runLogger";
import { getPipeline, getPromptSet, renderStep, stepText } from "./prompts";

function resolveStageVars(
  stageVars: Record<string, string>,
  userVars: Record<string, string>,
  stageOutputs: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(stageVars).map(([k, v]) => [
      k,
      v.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
        if (key in stageOutputs) return stageOutputs[key];
        if (key in userVars) return userVars[key];
        throw new Error(`Unresolved pipeline variable: "${key}"`);
      }),
    ])
  );
}

export async function runPipeline({
  model,
  pipelineName,
  variables,
  runLogger,
}: {
  model: string;
  pipelineName: string;
  variables: Record<string, string>;
  runLogger?: RunLogger;
}): Promise<ChainOutput> {
  const pipeline = getPipeline(pipelineName);
  const systemStages = pipeline.stages.filter((s) => s.role === "system");
  if (systemStages.length !== 1) {
    throw new Error(
      `Pipeline "${pipelineName}" must mark exactly one stage with role: "system" (found ${systemStages.length})`
    );
  }
  const systemStage = systemStages[0];

  if (pipeline.inputs) {
    for (const input of pipeline.inputs) {
      if (!(input in variables)) {
        throw new Error(`Missing required pipeline input: "${input}"`);
      }
    }
  }

  const stageOutputs: Record<string, string> = {};
  const stageResults: string[] = [];
  const total = pipeline.stages.length;
  const runStartedAt = new Date();

  for (let i = 0; i < pipeline.stages.length; i++) {
    const stage = pipeline.stages[i];
    console.log(`[pipeline] Stage ${i + 1}/${total}: ${stage.set}`);

    const resolvedVars = resolveStageVars(stage.variables, variables, stageOutputs);
    runLogger?.appendStage(stage.set, resolvedVars);
    if (stage.set === systemStage.set) {
      // System stage does not invoke the LLM. It renders the named prompt set into a single system string.
      const promptFile = getPromptSet(stage.set);
      const renderedSteps = promptFile.steps.map((s) => renderStep(stepText(s), resolvedVars));
      const system = renderedSteps.join("\n\n");
      stageOutputs[stage.set] = system;
      stageResults.push(system);
      continue;
    }

    const systemFromStage = stageOutputs[systemStage.set];
    if (!systemFromStage) {
      throw new Error(
        `Pipeline "${pipelineName}" system stage "${systemStage.set}" must run before "${stage.set}"`
      );
    }

    const result = await runChain({
      model,
      promptSet: stage.set,
      system: systemFromStage,
      runStartedAt,
      variables: resolvedVars,
      runLogger,
      stageName: stage.set,
    });

    stageOutputs[stage.set] = result.final;
    stageResults.push(result.final);
  }

  return { final: stageResults[stageResults.length - 1], steps: stageResults };
}
