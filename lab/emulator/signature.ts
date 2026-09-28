// Webhook signing for the lab provider: HMAC-SHA256 over "<timestamp>.<raw body>".
// Modeled on common provider schemes; not compatible with any real provider yet
// (Phase 2 adds Stripe- and Square-conformant emulators).
import crypto from 'node:crypto';

export const TOLERANCE_SECONDS = 300;

export function sign(body: string, secret: string, timestamp: number): string {
  const mac = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

export function verify(body: string, header: unknown, secret: string, nowSeconds: number): boolean {
  if (typeof header !== 'string') return false;
  const parts = Object.fromEntries(header.split(',').map(p => {
    const i = p.indexOf('=');
    return [p.slice(0, i), p.slice(i + 1)];
  }));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !/^[0-9a-f]{64}$/.test(parts.v1 || '')) return false;
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(sign(body, secret, timestamp).split('v1=')[1], 'hex');
  return crypto.timingSafeEqual(Buffer.from(parts.v1, 'hex'), expected);
}
