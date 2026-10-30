import type { Hono } from 'hono';
import type { AgentEnv } from './env.js';
import { answerPulse, stopped, type PulsePing } from './pulse.js';
import { courseUrl } from './model.js';
import { writeTest, type TestPing } from './testwriter.js';
import { verifyPing } from './webhook.js';

// What the course reads to know what these agents may do (docs/course-api.md). Kept minimal:
// answering and testing, nothing that writes to the tracker.
export function agentsFile(env: AgentEnv) {
  return {
    owner: env.owner,
    agents: {
      pulse: { wakes: 'pulse', may: ['answer'] },
      'test-writer': { wakes: 'test', may: ['test'] },
    },
  };
}

async function post(env: AgentEnv, replyRaw: string, body: unknown): Promise<void> {
  const reply = courseUrl(env, replyRaw);
  if (!reply) {
    console.error('reply: address is not the course');
    return;
  }
  try {
    const res = await fetch(reply, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(`reply ${res.status}`);
  } catch (err) {
    console.error(`reply: ${(err as Error).message}`);
  }
}

async function handle(env: AgentEnv, ping: PulsePing | TestPing): Promise<void> {
  if (ping.kind === 'pulse') {
    const text = await answerPulse(env, ping);
    console.log(`pulse: ${text.slice(0, 60)}`);
    await post(env, ping.reply, { text });
    return;
  }
  const reply = await writeTest(env, ping);
  if (!reply) return console.error('test-writer: no test to send');
  await post(env, ping.reply, reply);
}

export type AgentDeps = { handle?: (env: AgentEnv, ping: PulsePing | TestPing) => Promise<void> };

export function agentRoutes(app: Hono, env: AgentEnv, deps: AgentDeps = {}): void {
  const run = deps.handle ?? handle;
  // webhook-id is stable across the course's retries: one answer per ping.
  const seen = new Map<string, 'running' | 'done'>();

  app.get('/.well-known/mega-pulse.json', (c) => c.json(agentsFile(env)));

  app.post('/ping', async (c) => {
    const raw = await c.req.text();
    const verdict = verifyPing(
      {
        id: c.req.header('webhook-id'),
        timestamp: c.req.header('webhook-timestamp'),
        signature: c.req.header('webhook-signature'),
      },
      raw,
      env.pingKeys,
    );
    if (!verdict.ok) return c.json({ error: verdict.reason }, 401);

    const id = c.req.header('webhook-id')!;
    if (seen.has(id)) return c.json({ error: 'already answered' }, 409);
    seen.set(id, 'running');
    if (seen.size > 1000) seen.clear();

    let ping: PulsePing | TestPing;
    try {
      ping = JSON.parse(raw) as PulsePing | TestPing;
    } catch {
      return c.json({ error: 'body is not JSON' }, 400);
    }
    if (!ping || typeof ping.reply !== 'string') return c.json({ error: 'no reply address' }, 400);

    // Answer 202 now and work after: the course retries anything it reads as a failure.
    void run(env, ping)
      .catch((err: Error) => console.error(`ping: ${err.message}`))
      .finally(() => seen.set(id, 'done'));
    return c.json({ ok: true }, 202);
  });
}

export { stopped };
