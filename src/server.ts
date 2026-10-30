import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadAgentEnv, type AgentEnv } from './agent/env.js';
import { loadConfig } from './config.js';
import { startBeating } from './heartbeat.js';
import { lane } from './lane.js';

const config = loadConfig();
const port = Number(process.env.PORT ?? 8787);

// Fail fast: a host that runs alone must not come up without its key or its owner code.
let agent: AgentEnv;
try {
  agent = loadAgentEnv();
} catch (err) {
  console.error(`rig: ${(err as Error).message}`);
  process.exit(1);
}

startBeating(lane().id, config.beatEverySeconds);
serve({ fetch: createApp(config, { env: agent }).fetch, port }, () => {
  console.log(`rig · ${lane().id} · http://localhost:${port}`);
});
