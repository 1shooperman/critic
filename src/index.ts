import { serve } from "@hono/node-server";

import { createApp } from "./server";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

serve({ fetch: createApp().fetch, port: PORT }, () =>
  console.log(`Critic listening on :${PORT}`)
);
