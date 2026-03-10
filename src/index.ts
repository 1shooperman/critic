import { serve } from "@hono/node-server";

import { loadPrompts } from "./prompts";
import { createApp } from "./server";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

async function main() {
  await loadPrompts();
  serve({ fetch: createApp().fetch, port: PORT }, () =>
    console.log(`Critic listening on :${PORT}`)
  );
}

main().catch(console.error);
