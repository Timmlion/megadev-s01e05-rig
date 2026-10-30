import type { AgentEnv } from './env.js';

// The model key is shared with a person's own harness: every call has a timeout, a small output
// budget, and the process stops calling after a handful in a minute.
const TIMEOUT_MS = 30_000;
const PER_MINUTE = 10;
const calls: number[] = [];

function spend(): void {
  const now = Date.now();
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= PER_MINUTE) throw new Error('model call budget spent for this minute');
  calls.push(now);
}

// One model call. Any vendor with an OpenAI-compatible endpoint works; the base URL, the model
// name and the key come from env.
export async function chat(
  env: AgentEnv,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  spend();
  const res = await fetch(`${env.modelBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.modelKey}` },
    body: JSON.stringify({
      model: env.model,
      temperature: 0.2,
      max_tokens: maxTokens,
      // Z.AI: without this the answer is all reasoning and `content` comes back empty.
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`model ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('model returned nothing');
  return text;
}

// `reply`, `tracker` and anything else in a ping come from outside: only the course may be
// called with our key in hand.
export function courseUrl(env: AgentEnv, raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.host !== new URL(env.course).host) return null;
    return url.toString();
  } catch {
    return null;
  }
}
