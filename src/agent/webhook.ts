import { createHmac, timingSafeEqual } from 'node:crypto';

// Standard Webhooks: HMAC-SHA256 over `<id>.<timestamp>.<raw body>`, key = base64 of the part
// after `whsec_`. A ping older than 5 minutes is not from the course.
const TOLERANCE_SECONDS = 300;

export type PingHeaders = { id: string; timestamp: string; signature: string };
export type Verdict = { ok: true } | { ok: false; reason: string };

function keyBytes(key: string): Buffer {
  return Buffer.from(key.replace(/^whsec_/, ''), 'base64');
}

export function sign(id: string, timestamp: string, body: string, key: string): string {
  return createHmac('sha256', keyBytes(key)).update(`${id}.${timestamp}.${body}`).digest('base64');
}

export function verifyPing(
  headers: Partial<PingHeaders>,
  body: string,
  keys: string[],
  nowMs = Date.now(),
): Verdict {
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: 'no webhook headers' };
  const sentAt = Number(headers.timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: 'bad timestamp' };
  if (Math.abs(nowMs / 1000 - sentAt) > TOLERANCE_SECONDS) return { ok: false, reason: 'timestamp too old' };

  // After a key rotation a ping carries one signature per key, space separated.
  const sent = headers.signature
    .split(' ')
    .map((s) => s.trim().replace(/^v1,/, ''))
    .filter(Boolean)
    .map((s) => Buffer.from(s, 'base64'));

  for (const key of keys) {
    const want = Buffer.from(sign(headers.id, headers.timestamp, body, key), 'base64');
    for (const got of sent) {
      if (got.length === want.length && timingSafeEqual(got, want)) return { ok: true };
    }
  }
  return { ok: false, reason: 'bad signature' };
}
