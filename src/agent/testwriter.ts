import { readdirSync, readFileSync } from 'node:fs';
import type { AgentEnv } from './env.js';
import { chat } from './model.js';

const MAX_BYTES = 20 * 1024;
const MAX_TESTS = 8;

export type TestPing = { kind: 'test'; issue: number; reply: string; files: Record<string, string> };
export type TestReply = { path: string; test: string; red: string };

// The instructions are the course's file, on this host: docs/agents/test-writer.md.
function instructions(): string {
  return readFileSync('docs/agents/test-writer.md', 'utf8');
}

// The tests that already exist beside the code under test.
function existingTests(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const name of readdirSync('test').filter((f) => f.endsWith('.test.ts')).slice(0, MAX_TESTS)) {
      out[`test/${name}`] = readFileSync(`test/${name}`, 'utf8');
    }
    return out;
  } catch {
    return {};
  }
}

function parse(text: string): TestReply | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(text.slice(start, end + 1)) as Partial<TestReply>;
    if (typeof j.path !== 'string' || typeof j.test !== 'string' || typeof j.red !== 'string') return null;
    if (!/^test\/[\w-]+\.test\.ts$/.test(j.path)) return null;
    if (!j.test.trim() || !j.red.trim()) return null;
    if (Buffer.byteLength(j.test) + Buffer.byteLength(j.red) > MAX_BYTES) return null;
    return { path: j.path, test: j.test, red: j.red };
  } catch {
    return null;
  }
}

// Plan §5 + ADR 0006: the test writer sends one new test file and nothing else.
export async function writeTest(env: AgentEnv, ping: TestPing): Promise<TestReply | null> {
  if (!Number.isInteger(ping.issue) || !ping.files || typeof ping.files !== 'object') return null;

  const user = [
    `Issue: #${ping.issue}`,
    '',
    'The files that issue is about, as they are now (the base):',
    ...Object.entries(ping.files)
      .filter(([path]) => path.startsWith('src/'))
      .map(([path, text]) => `\n--- ${path}\n${text}`),
    '',
    'Tests that already exist in this repo:',
    ...Object.entries(existingTests()).map(([path, text]) => `\n--- ${path}\n${text}`),
    '',
    'Reply with JSON only, no prose, no code fence:',
    '{"path":"test/<name>.test.ts","test":"<full source of one new test file>","red":"<how it failed on the base, one line>"}',
  ].join('\n');

  try {
    // One ping, one model call: the test file is the whole answer, so it gets the bigger budget.
    const reply = parse(await chat(env, instructions(), user, 2000));
    if (!reply) console.error('test-writer: model reply did not parse');
    return reply;
  } catch (err) {
    console.error(`test-writer: ${(err as Error).message}`);
    return null;
  }
}
