import type { AgentEnv } from './env.js';

// One model call. Any vendor with an OpenAI-compatible endpoint works; the base URL and the
// model names come from env.
export async function chat(env: AgentEnv, model: string, system: string, user: string): Promise<string> {
  const res = await fetch(`${env.modelBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.modelKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
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
