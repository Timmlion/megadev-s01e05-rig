import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadAgentEnv, type AgentEnv } from '../src/agent/env.js';
import { sign, verifyPing } from '../src/agent/webhook.js';

const KEY = `whsec_${Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')}`;
const env: AgentEnv = {
  pingKeys: [KEY],
  owner: 'own-test',
  modelKey: 'unused',
  modelBase: 'https://example.invalid/v1',
  model: 'm',
  course: 'https://hq.mega.dev',
};
const config = { adapter: 'shim', installed: '2026-10-30T00:00:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

function ping(body: string, opts: { id?: string; at?: number; key?: string } = {}) {
  const id = opts.id ?? 'msg_1';
  const timestamp = String(opts.at ?? Math.floor(Date.now() / 1000));
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${sign(id, timestamp, body, opts.key ?? KEY)}`,
    },
  };
}

describe('webhook signatures', () => {
  const body = '{"kind":"pulse"}';
  const now = 1_700_000_000_000;

  it('accepts a signature made with the ping key', () => {
    const id = 'msg_a';
    const ts = String(now / 1000);
    expect(verifyPing({ id, timestamp: ts, signature: `v1,${sign(id, ts, body, KEY)}` }, body, [KEY], now)).toEqual({
      ok: true,
    });
  });

  it('rejects a body the signature does not cover', () => {
    const id = 'msg_b';
    const ts = String(now / 1000);
    const verdict = verifyPing({ id, timestamp: ts, signature: `v1,${sign(id, ts, body, KEY)}` }, `${body} `, [KEY], now);
    expect(verdict.ok).toBe(false);
  });

  it('rejects a copy older than five minutes', () => {
    const id = 'msg_c';
    const ts = String(now / 1000 - 301);
    const verdict = verifyPing({ id, timestamp: ts, signature: `v1,${sign(id, ts, body, KEY)}` }, body, [KEY], now);
    expect(verdict).toEqual({ ok: false, reason: 'timestamp too old' });
  });

  it('accepts either key during a rotation', () => {
    const old = `whsec_${Buffer.from('ffffffffffffffffffffffffffffffff').toString('base64')}`;
    const id = 'msg_d';
    const ts = String(now / 1000);
    const signature = `v1,${sign(id, ts, body, old)} v1,${sign(id, ts, body, KEY)}`;
    expect(verifyPing({ id, timestamp: ts, signature }, body, [KEY, old], now)).toEqual({ ok: true });
  });
});

describe('the agent host', () => {
  const seen: string[] = [];
  const app = () =>
    createApp(config, {
      env,
      deps: { handle: async (_env, pin) => void seen.push(pin.kind) },
    });

  it('answers a health check', async () => {
    const res = await app().request('/healthz');
    expect(res.status).toBe(200);
  });

  it('publishes its agent file with the owner code, minimal rights', async () => {
    const file = await (await app().request('/.well-known/mega-pulse.json')).json();
    expect(file).toEqual({
      owner: 'own-test',
      agents: {
        pulse: { wakes: 'pulse', may: ['answer'] },
        'test-writer': { wakes: 'test', may: ['test'] },
      },
    });
  });

  it('refuses a ping that is not signed by the course', async () => {
    const { body, headers } = ping('{"kind":"pulse","reply":"https://hq.mega.dev/x"}', { key: `whsec_${Buffer.from('deadbeefdeadbeefdeadbeefdeadbeef').toString('base64')}` });
    expect((await app().request('/ping', { method: 'POST', headers, body })).status).toBe(401);
  });

  it('takes a ping on the bare address as well as on /ping', async () => {
    for (const path of ['/', '/ping']) {
      const { body, headers } = ping('{"kind":"pulse","reply":"https://hq.mega.dev/x","phrase":"pulse? hi"}', {
        id: `msg_${path}`,
      });
      expect((await app().request(path, { method: 'POST', headers, body })).status).toBe(202);
    }
  });

  it('answers one ping once, even when the course retries it', async () => {
    const one = app();
    const { body, headers } = ping('{"kind":"pulse","reply":"https://hq.mega.dev/x","phrase":"pulse? hi"}');
    const first = await one.request('/ping', { method: 'POST', headers, body });
    const again = await one.request('/ping', { method: 'POST', headers, body });
    expect(first.status).toBe(202);
    expect(again.status).toBe(409);
  });
});

describe('env', () => {
  it('stops when a required value is missing', () => {
    expect(() => loadAgentEnv({ MEGA_OWNER: 'own-test' })).toThrow(/missing env: MEGA_PING_KEY, MODEL_API_KEY/);
  });
});
