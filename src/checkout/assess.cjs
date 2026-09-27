'use strict';
// Runs invariant checks against the owned reference checkout and maps them to PIAS controls.
// The oracle is the checkout's own fulfillment records, not the HTTP responses.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createCheckout, DEFECTS } = require('./app.cjs');
const { paymentEvent, signedDelivery } = require('./provider.cjs');
const { score } = require('../../site/score.js');
const controls = require('../../site/data/controls.json');

const OUTPUT = path.join(__dirname, '..', '..', 'site', 'data', 'assessments.json');

async function startLab(defects) {
  const secret = crypto.randomBytes(32).toString('hex');
  const checkout = createCheckout({ secret, defects });
  const server = http.createServer(checkout.handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, route, { customer, body, headers = {} } = {}) {
    const res = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...(customer ? { 'x-lab-customer': customer } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  return {
    secret,
    call,
    order: async (customer, items = [{ sku: 'lab-tee', qty: 1 }]) => (await call('POST', '/orders', { customer, body: { items } })).body,
    pay: async (customer, order) => (await call('POST', `/orders/${order.id}/payment`, { customer })).body,
    deliverRaw: (body, signature) => call('POST', '/webhooks/payments', { body, headers: signature ? { 'x-lab-signature': signature } : {} }),
    deliver(event, { secret: key = secret, timestamp } = {}) {
      const { body, signature } = signedDelivery(event, key, timestamp);
      return this.deliverRaw(body, signature);
    },
    fulfillments: orderId => checkout.state.fulfillments.filter(f => orderId === undefined || f.order === orderId).length,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}

// Each check returns { expected, observed }. A check passes only when they match exactly.
const CHECKS = {
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

async function assess(defects = []) {
  const results = {};
  for (const [control, checks] of Object.entries(CHECKS)) {
    const lab = await startLab(defects); // fresh state per control keeps checks independent
    try {
      const outcomes = [];
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
  const variants = [{ id: 'LAB-0', label: 'Baseline', defects: [] }]
    .concat(Object.keys(DEFECTS).map((d, i) => ({ id: `LAB-${i + 1}`, label: `Seeded: ${d}`, defects: [d], description: DEFECTS[d] })));
  const runs = [];
  for (const v of variants) runs.push({ ...v, ...(await assess(v.defects)) });

  const output = {
    kind: 'lab-run',
    target: 'owned reference checkout (local, fake provider)',
    metric_version: '0.1',
    note: 'Controls without checks are left unknown. These are lab fixtures, not merchant assessments.',
    runs,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');

  for (const r of runs) {
    const failed = Object.entries(r.results).filter(([, x]) => x.status === 'fail').map(([c]) => c);
    console.log(`${r.id.padEnd(6)} ${r.label.padEnd(30)} range ${Math.round(r.score.lower)}–${Math.round(r.score.upper)}  ${r.score.gate}${failed.length ? '  failed: ' + failed.join(', ') : ''}`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT)}`);
}

module.exports = { assess, CHECKS };
if (require.main === module) main().catch(err => { console.error(err); process.exit(1); });
