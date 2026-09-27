'use strict';
// Webhook signing for the lab provider: HMAC-SHA256 over "<timestamp>.<raw body>".
// Modeled on common provider schemes; not compatible with any real provider.
const crypto = require('node:crypto');

const TOLERANCE_SECONDS = 300;

function sign(body, secret, timestamp) {
  const mac = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

function verify(body, header, secret, nowSeconds) {
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

module.exports = { sign, verify, TOLERANCE_SECONDS };
