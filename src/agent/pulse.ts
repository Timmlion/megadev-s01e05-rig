import { readFileSync } from 'node:fs';
import type { AgentEnv } from './env.js';
import { chat, courseUrl } from './model.js';

const MAX_TEXT = 2000;

export type TrackerIssue = { number: number; title: string; state: string; by?: string; body?: string };

export type PulsePing = { kind: 'pulse'; text?: string; phrase?: string; reply: string; tracker: string };

export const stopped = (what: string) => `pulse stopped: ${what}`;

const SYSTEM = [
  'You are the pulse of the rig lane: a service that answers Rook, who wants to know where the plan stands.',
  'Answer in at most 120 words, plain technical English, no lists, no headings.',
  'First line: Rook\'s phrase, quoted exactly.',
  'Then name exactly one open issue as `#N`, chosen from the open issues you are given.',
  'Then one recommendation tied to that issue, one sentence.',
  'Never call an open issue shipped or done. Use only issue numbers from the list you are given.',
].join(' ');

function planText(): string {
  try {
    return readFileSync('plan.md', 'utf8');
  } catch {
    return '';
  }
}

// Plan §4: a check fails, one line goes back, not silence and not a guess.
async function openIssues(env: AgentEnv, trackerRaw: string): Promise<TrackerIssue[] | null> {
  const tracker = courseUrl(env, trackerRaw);
  if (!tracker) return null;
  try {
    const res = await fetch(tracker, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as { issues?: TrackerIssue[] };
    return Array.isArray(body.issues) ? body.issues : null;
  } catch {
    return null;
  }
}

// The one that matters: an issue Rook opened, else the lowest number. Never one a stranger filed.
export function pick(open: TrackerIssue[]): TrackerIssue {
  return [...open].sort(
    (a, b) => Number(b.by === 'rook') - Number(a.by === 'rook') || a.number - b.number,
  )[0];
}

function fallback(phrase: string, issue: TrackerIssue): string {
  return `"${phrase}" — #${issue.number} ${issue.title}. Recommendation: fix it in src/ this week, then let the test writer pin it with a test that fails on the base.`;
}

export async function answerPulse(env: AgentEnv, ping: PulsePing): Promise<string> {
  const phrase = ping.phrase?.trim();
  if (!phrase) return stopped('no phrase');

  const issues = await openIssues(env, ping.tracker);
  if (!issues) return stopped('tracker');
  const open = issues.filter((i) => i.state === 'open');
  if (!open.length) return stopped('nothing open');

  const issue = pick(open);
  const user = [
    `Rook's phrase: ${phrase}`,
    '',
    'The plan:',
    planText() || '(no plan.md on this host)',
    '',
    'Open issues on the course tracker:',
    ...open.map((i) => `#${i.number} ${i.title}${i.body ? ` — ${i.body}` : ''}`),
    '',
    `The issue that matters now: #${issue.number}`,
  ].join('\n');

  let text: string;
  try {
    // One ping, one model call: a short answer, a small output budget.
    text = (await chat(env, SYSTEM, user, 400)).slice(0, MAX_TEXT);
  } catch (err) {
    console.error(`pulse: ${(err as Error).message}`);
    return fallback(phrase, issue);
  }

  // The model may not invent an issue number, and may not drop Rook's phrase.
  const named = [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  const known = new Set(open.map((i) => i.number));
  const sound =
    text.toLowerCase().includes(phrase.toLowerCase()) &&
    named.includes(issue.number) &&
    named.every((n) => known.has(n));
  return sound ? text : fallback(phrase, issue);
}
