import { parse } from "yaml";

interface PromptFile {
  description?: string;
  variables?: string[];
  steps: string[];
}

const cache = new Map<string, PromptFile>();

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

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("steps" in parsed) ||
      !Array.isArray((parsed as { steps: unknown }).steps)
    ) {
      console.warn(`[prompts] ${entry.name} is missing required "steps" array — skipping`);
      continue;
    }

    const name = entry.name.replace(/\.yaml$/, "");
    cache.set(name, parsed as PromptFile);
    console.log(`[prompts] Loaded "${name}"`);
  }
}

export function getPromptSet(name: string): PromptFile {
  const promptFile = cache.get(name);
  if (!promptFile) {
    throw new Error(`Unknown prompt set: "${name}"`);
  }
  return promptFile;
}

export function renderStep(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    if (!(key in variables)) {
      throw new Error(`Missing variable: "${key}"`);
    }
    return variables[key];
  });
}
