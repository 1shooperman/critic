import { parse } from "yaml";

export type PromptStep = string | { label?: string; prompt: string };

interface PromptFile {
  description?: string;
  variables?: string[];
  steps: PromptStep[];
}

export interface PipelineStage {
  set: string;
  variables: Record<string, string>;
}

export interface Pipeline {
  description?: string;
  inputs?: string[];
  stages: PipelineStage[];
}

const cache = new Map<string, PromptFile>();
const pipelineCache = new Map<string, Pipeline>();

export function stepText(step: PromptStep): string {
  return typeof step === "string" ? step : step.prompt;
}

export function stepLabel(step: PromptStep, index: number): string {
  if (typeof step === "object" && step.label) return step.label;
  return `step ${index + 1}`;
}

export async function loadPrompts(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repoUrl = process.env.PROMPTS_REPO_URL;

  if (!token || !repoUrl) {
    console.warn(
      "[prompts] GITHUB_TOKEN or PROMPTS_REPO_URL not set — starting with empty prompt cache"
    );
    return;
  }

  const repoPath = process.env.PROMPTS_REPO_PATH ?? "prompts/";
  const branch = process.env.PROMPTS_BRANCH ?? "main";

  const url = new URL(repoUrl);
  const [, owner, repo] = url.pathname.split("/");

  const cleanPath = repoPath.replace(/\/$/, "");
  const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${branch}`;

  const listRes = await fetch(contentsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!listRes.ok) {
    console.warn(`[prompts] Failed to list prompt files (${listRes.status}) — empty cache`);
    return;
  }

  const entries = (await listRes.json()) as Array<{
    name: string;
    download_url: string;
    type: string;
  }>;

  const yamlFiles = entries.filter((e) => e.type === "file" && e.name.endsWith(".yaml"));

  for (const entry of yamlFiles) {
    const fileRes = await fetch(entry.download_url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!fileRes.ok) {
      console.warn(`[prompts] Failed to fetch ${entry.name} (${fileRes.status}) — skipping`);
      continue;
    }

    const raw = await fileRes.text();
    const parsed = parse(raw) as unknown;

    const name = entry.name.replace(/\.yaml$/, "");

    if (
      parsed &&
      typeof parsed === "object" &&
      "stages" in parsed &&
      Array.isArray((parsed as { stages: unknown }).stages)
    ) {
      pipelineCache.set(name, parsed as Pipeline);
      console.log(`[prompts] Loaded pipeline "${name}"`);
      continue;
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("steps" in parsed) ||
      !Array.isArray((parsed as { steps: unknown }).steps)
    ) {
      console.warn(`[prompts] ${entry.name} has neither "steps" nor "stages" — skipping`);
      continue;
    }

    cache.set(name, parsed as PromptFile);
    console.log(`[prompts] Loaded prompt set "${name}"`);
  }
}

export function getPromptSet(name: string): PromptFile {
  const promptFile = cache.get(name);
  if (!promptFile) {
    throw new Error(`Unknown prompt set: "${name}"`);
  }
  return promptFile;
}

export function getPipeline(name: string): Pipeline {
  const pipeline = pipelineCache.get(name);
  if (!pipeline) {
    throw new Error(`Unknown pipeline: "${name}"`);
  }
  return pipeline;
}

export function renderStep(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
    if (!(key in variables)) {
      throw new Error(`Missing variable: "${key}"`);
    }
    return variables[key];
  });
}
