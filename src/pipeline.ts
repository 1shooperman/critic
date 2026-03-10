import { type ChainOutput, runChain } from "./chain";
import { getPipeline } from "./prompts";

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
}: {
  model: string;
  pipelineName: string;
  variables: Record<string, string>;
}): Promise<ChainOutput> {
  const pipeline = getPipeline(pipelineName);

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

  for (let i = 0; i < pipeline.stages.length; i++) {
    const stage = pipeline.stages[i];
    console.log(`[pipeline] Stage ${i + 1}/${total}: ${stage.set}`);

    const resolvedVars = resolveStageVars(stage.variables, variables, stageOutputs);
    const result = await runChain({ model, promptSet: stage.set, variables: resolvedVars });

    stageOutputs[stage.set] = result.final;
    stageResults.push(result.final);
  }

  return { final: stageResults[stageResults.length - 1], steps: stageResults };
}
