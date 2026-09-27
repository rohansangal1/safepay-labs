// Runs invariant checks against the owned reference checkout and maps them to PIAS controls.
// The oracle is the checkout's own fulfillment records, not the HTTP responses.
// Phase 1 moves these checks into packages/checks behind a SubjectAdapter interface.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { score, controls, METRIC_VERSION, type Results } from '@pias/core';
import { createCheckout, DEFECTS, type Defect } from './app.ts';
import { paymentEvent, signedDelivery, type PaymentEvent } from '../../emulator/provider.ts';

const OUTPUT = path.join(import.meta.dirname, '..', '..', '..', 'data', 'runs', 'lab-reference.json');

interface Call { status: number; body: any }

async function startLab(defects: string[]) {
  const secret = crypto.randomBytes(32).toString('hex');
  const checkout = createCheckout({ secret, defects });
  const server = http.createServer(checkout.handle);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, route: string, { customer, body, headers = {} }: { customer?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Call> {
    const res = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...(customer ? { 'x-lab-customer': customer } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  const deliverRaw = (body: string, signature: string | null) =>
    call('POST', '/webhooks/payments', { body, headers: signature ? { 'x-lab-signature': signature } : {} });

  return {
    secret,
    call,
    order: async (customer: string, items: object[] = [{ sku: 'lab-tee', qty: 1 }]) => (await call('POST', '/orders', { customer, body: { items } })).body,
    pay: async (customer: string, order: { id: string }) => (await call('POST', `/orders/${order.id}/payment`, { customer })).body,
    deliverRaw,
    deliver(event: PaymentEvent, { secret: key = secret, timestamp }: { secret?: string; timestamp?: number } = {}) {
      const { body, signature } = signedDelivery(event, key, timestamp);
      return deliverRaw(body, signature);
    },
    fulfillments: (orderId?: string) => checkout.state.fulfillments.filter(f => orderId === undefined || f.order === orderId).length,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

type Lab = Awaited<ReturnType<typeof startLab>>;
type Check = [id: string, description: string, run: (lab: Lab) => Promise<{ expected: unknown; observed: unknown }>];

// Each check returns { expected, observed }. A check passes only when they match exactly.
export const CHECKS: Record<string, Check[]> = {
  amount: [
    ['client-price-ignored', 'Order total comes from the catalog, not a client-sent price', async lab => {
      const order = await lab.order('alice', [{ sku: 'lab-tee', qty: 2, price: 1 }]);
      return { expected: 5000, observed: order.amount };
    }],
    ['underpaid-event-rejected', 'A success event for less than the order total does not fulfill', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent({ ...payment, amount: 1 }));
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
    ['currency-mismatch-rejected', 'A success event in another currency does not fulfill', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent({ ...payment, currency: 'EUR' }));
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
  ],
  binding: [
    ['cross-order-event-rejected', 'Paying for a cheap order cannot fulfill an expensive one', async lab => {
      const cheap = await lab.order('alice', [{ sku: 'lab-sticker', qty: 1 }]);
      const expensive = await lab.order('alice', [{ sku: 'lab-tee', qty: 1 }]);
      const payment = await lab.pay('alice', cheap);
      await lab.deliver(paymentEvent({ ...payment, order: expensive.id, amount: expensive.amount }));
      return { expected: 0, observed: lab.fulfillments(expensive.id) };
    }],
    ['unknown-order-rejected', 'An event naming a nonexistent order fulfills nothing', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      const before = lab.fulfillments();
      await lab.deliver(paymentEvent({ ...payment, order: 'ord_9999' }));
      return { expected: 0, observed: lab.fulfillments() - before };
    }],
  ],
  authenticity: [
    ['unsigned-rejected', 'An unsigned event does not fulfill', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliverRaw(JSON.stringify(paymentEvent(payment)), null);
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
    ['wrong-secret-rejected', 'An event signed with another key does not fulfill', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent(payment), { secret: crypto.randomBytes(32).toString('hex') });
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
    ['stale-timestamp-rejected', 'A correctly signed event from an hour ago does not fulfill', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent(payment), { timestamp: Math.floor(Date.now() / 1000) - 3600 });
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
    ['tampered-body-rejected', 'Changing a signed body invalidates it', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      const event = paymentEvent(payment);
      const { signature } = signedDelivery(event, lab.secret);
      await lab.deliverRaw(JSON.stringify({ ...event, id: event.id + '-edited' }), signature);
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
  ],
  fulfillment: [
    ['verified-success-fulfills', 'A valid signed success event fulfills the order exactly once', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent(payment));
      return { expected: 1, observed: lab.fulfillments(order.id) };
    }],
    ['failed-payment-not-fulfilled', 'A payment.failed event does not fulfill', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent(payment, 'payment.failed'));
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
    ['pending-payment-not-fulfilled', 'A payment.processing event does not fulfill', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent(payment, 'payment.processing'));
      return { expected: 0, observed: lab.fulfillments(order.id) };
    }],
    ['unknown-payment-ignored', 'An event for a payment the merchant never created fulfills nothing', async lab => {
      const order = await lab.order('alice');
      const before = lab.fulfillments();
      await lab.deliver(paymentEvent({ id: 'pay_9999', order: order.id, amount: order.amount, currency: order.currency }));
      return { expected: 0, observed: lab.fulfillments() - before };
    }],
  ],
  authorization: [
    ['other-customer-cannot-read', "Another customer cannot read the order", async lab => {
      const order = await lab.order('alice');
      return { expected: 404, observed: (await lab.call('GET', `/orders/${order.id}`, { customer: 'bob' })).status };
    }],
    ['other-customer-cannot-pay', "Another customer cannot start payment for the order", async lab => {
      const order = await lab.order('alice');
      return { expected: 404, observed: (await lab.call('POST', `/orders/${order.id}/payment`, { customer: 'bob' })).status };
    }],
    ['anonymous-cannot-read', 'A request with no customer cannot read the order', async lab => {
      const order = await lab.order('alice');
      return { expected: 404, observed: (await lab.call('GET', `/orders/${order.id}`)).status };
    }],
  ],
  idempotency: [
    ['duplicate-delivery', 'The same event delivered twice fulfills once', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      const event = paymentEvent(payment);
      await lab.deliver(event);
      await lab.deliver(event);
      return { expected: 1, observed: lab.fulfillments(order.id) };
    }],
    ['distinct-events-same-payment', 'Two success events for one payment fulfill once', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      await lab.deliver(paymentEvent(payment));
      await lab.deliver(paymentEvent(payment));
      return { expected: 1, observed: lab.fulfillments(order.id) };
    }],
    ['concurrent-delivery', 'Five concurrent deliveries of one event fulfill once', async lab => {
      const order = await lab.order('alice');
      const payment = await lab.pay('alice', order);
      const event = paymentEvent(payment);
      await Promise.all(Array.from({ length: 5 }, () => lab.deliver(event)));
      return { expected: 1, observed: lab.fulfillments(order.id) };
    }],
  ],
};

export async function assess(defects: string[] = []) {
  const results: Results = {};
  for (const [control, checks] of Object.entries(CHECKS)) {
    const lab = await startLab(defects); // fresh state per control keeps checks independent
    try {
      const outcomes: { id: string; description: string; expected: unknown; observed: unknown; pass: boolean }[] = [];
      for (const [id, description, run] of checks) {
        const { expected, observed } = await run(lab);
        outcomes.push({ id, description, expected, observed, pass: observed === expected });
      }
      const passed = outcomes.filter(o => o.pass).length;
      results[control] = {
        status: passed === outcomes.length ? 'pass' : 'fail',
        evidence: `lab:owned-checkout:${control}:${passed}/${outcomes.length}-checks-passed`,
        checks: outcomes,
      };
    } finally {
      await lab.close();
    }
  }
  return { results, score: score(controls, results) };
}

async function main() {
  const baseline = { id: 'LAB-0', label: 'Baseline', defects: [] as string[] };
  const seeded = (Object.keys(DEFECTS) as Defect[]).map((d, i) => ({ id: `LAB-${i + 1}`, label: `Seeded: ${d}`, defects: [d], description: DEFECTS[d] }));
  const runs = [];
  for (const v of [baseline, ...seeded]) runs.push({ ...v, ...(await assess(v.defects)) });

  const output = {
    kind: 'lab-run',
    target: 'owned reference checkout (local, fake provider)',
    metric_version: METRIC_VERSION,
    note: 'Controls without checks are left unknown. These are lab fixtures, not merchant assessments.',
    runs,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');

  for (const r of runs) {
    const failed = Object.entries(r.results).filter(([, x]) => x.status === 'fail').map(([c]) => c);
    console.log(`${r.id.padEnd(6)} ${r.label.padEnd(30)} range ${Math.round(r.score.lower ?? 0)}–${Math.round(r.score.upper ?? 0)}  ${r.score.gate}${failed.length ? '  failed: ' + failed.join(', ') : ''}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT)}`);
}

if (process.argv[1] === import.meta.filename) {
  main().catch(err => { console.error(err); process.exit(1); });
}
