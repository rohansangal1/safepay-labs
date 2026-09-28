import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { assess } from '../assess.ts';
import { DEFECTS, createCheckout, type CheckoutOptions, type Defect } from '../app.ts';
import { sign, verify } from '../../../emulator/signature.ts';
import { paymentEvent, signedDelivery, type PaymentEvent } from '../../../emulator/provider.ts';

// Which control each seeded defect must break. Every other assessed control must still pass.
const target: Record<Defect, string> = {
  trustClientAmount: 'amount',
  skipAmountMatch: 'amount',
  skipOrderMatch: 'binding',
  skipSignature: 'authenticity',
  fulfillOnAnyStatus: 'fulfillment',
  skipOwnership: 'authorization',
  noIdempotency: 'idempotency',
};

const failed = (r: Awaited<ReturnType<typeof assess>>) =>
  Object.keys(r.results).filter(c => r.results[c].status === 'fail');

test('every seeded defect has an expected control', () => {
  assert.deepEqual(Object.keys(target).sort(), Object.keys(DEFECTS).sort());
});

test('baseline checkout passes every assessed control', async () => {
  const r = await assess([]);
  assert.deepEqual(failed(r), []);
  assert.equal(r.score.criticalFailures.length, 0);
  assert.equal(r.score.gate, 'insufficient-evidence');
});

for (const [defect, control] of Object.entries(target)) {
  test(`seeded ${defect} is detected only by ${control}`, async () => {
    assert.deepEqual(failed(await assess([defect])), [control]);
  });
}

test('signature rejects edits, other keys and stale timestamps', () => {
  const s = sign('{}', 'k', 1000);
  assert.equal(verify('{}', s, 'k', 1000), true);
  assert.equal(verify('{ }', s, 'k', 1000), false);
  assert.equal(verify('{}', s, 'other', 1000), false);
  assert.equal(verify('{}', s, 'k', 1000 + 301), false);
  assert.equal(verify('{}', 't=1000,v1=zz', 'k', 1000), false);
  assert.equal(verify('{}', undefined, 'k', 1000), false);
});

test('checkout requires a secret and rejects unknown defects', () => {
  assert.throws(() => createCheckout({ secret: '' }));
  assert.throws(() => createCheckout({ secret: 'x', defects: ['typo'] }));
});

async function serve(options: Omit<CheckoutOptions, 'secret'>) {
  const secret = 'test-secret';
  const checkout = createCheckout({ secret, ...options });
  const server = http.createServer(checkout.handle);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (route: string, body?: string, headers: Record<string, string> = {}) =>
    (await fetch(base + route, { method: 'POST', headers: { 'x-lab-customer': 'alice', ...headers }, body })).json() as Promise<any>;
  return {
    checkout,
    order: () => post('/orders', JSON.stringify({ items: [{ sku: 'lab-mug', qty: 1 }] })),
    pay: (orderId: string) => post(`/orders/${orderId}/payment`),
    deliver: (event: PaymentEvent) => {
      const { body, signature } = signedDelivery(event, secret);
      return post('/webhooks/payments', body, { 'x-lab-signature': signature });
    },
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => { checkout.close(); resolve(); }); }),
  };
}

test('a failed fulfillment stays queued and is retried exactly once', async () => {
  let failures = 1;
  const lab = await serve({ onFulfill: () => { if (failures-- > 0) throw new Error('warehouse down'); } });
  try {
    const order = await lab.order();
    const reply = await lab.deliver(paymentEvent(await lab.pay(order.id)));
    assert.deepEqual(reply, { received: true, queued: order.id });
    assert.equal(lab.checkout.fulfillments(order.id), 0);

    assert.deepEqual(lab.checkout.drainOutbox(), { done: 1, failed: 0 });
    assert.deepEqual(lab.checkout.drainOutbox(), { done: 0, failed: 0 });
    assert.equal(lab.checkout.fulfillments(order.id), 1);
  } finally {
    await lab.close();
  }
});

test('a restart finishes queued fulfillment and still rejects the replayed event', async () => {
  const database = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pias-lab-')), 'checkout.db');
  try {
    const before = await serve({ database, onFulfill: () => { throw new Error('crash'); } });
    const order = await before.order();
    const event = paymentEvent(await before.pay(order.id));
    await before.deliver(event);
    assert.equal(before.checkout.fulfillments(order.id), 0);
    await before.close();

    const after = await serve({ database });
    try {
      assert.equal(after.checkout.fulfillments(order.id), 1);
      assert.deepEqual(await after.deliver(event), { received: true, duplicate: true });
      assert.deepEqual(await after.deliver(paymentEvent(await after.pay(order.id))), { received: true, duplicate: true });
      assert.equal(after.checkout.fulfillments(order.id), 1);
    } finally {
      await after.close();
    }
  } finally {
    fs.rmSync(path.dirname(database), { recursive: true, force: true });
  }
});
