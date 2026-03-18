import { serve } from "@hono/node-server";
import path from "node:path";

import { loadPrompts } from "./prompts";
import { createApp } from "./server";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

function parsePromptsArg(argv: string[]): string | undefined {
  const idx = argv.indexOf("--prompts");
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (!value || value.startsWith("-")) {
    throw new Error('Missing value for "--prompts"');
  }
  return value;
}

async function main() {
  const promptsArg = parsePromptsArg(process.argv.slice(2));
  const localDir = promptsArg ? path.resolve(process.cwd(), promptsArg) : undefined;
  await loadPrompts(localDir ? { localDir } : undefined);
  serve({ fetch: createApp().fetch, port: PORT }, () =>
    console.log(`Critic listening on :${PORT}`)
  );
}

main().catch(console.error);
