"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_server_1 = require("@hono/node-server");
const server_1 = require("./server");
const PORT = parseInt(process.env.PORT ?? "3000", 10);
(0, node_server_1.serve)({ fetch: (0, server_1.createApp)().fetch, port: PORT }, () => console.log(`Critic listening on :${PORT}`));
//# sourceMappingURL=index.js.map