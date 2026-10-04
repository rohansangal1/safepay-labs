import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LedgerEntry, SubjectAdapter } from '@pias/checks';
import { HARM_TYPES, SCENARIOS, SCENARIOS_VERSION, orderHarms, runOracle, type Scenario } from '../src/index.ts';

test('orderHarms: each harm is decided from money moved and fulfillments in force', () => {
  const types = (o: Parameters<typeof orderHarms>[0]) => orderHarms(o).map(h => h.type);
  assert.deepEqual(types({ value: 100, captured: 100, refunded: 0, active: 1 }), [], 'paid and fulfilled');
  assert.deepEqual(types({ value: 100, captured: 0, refunded: 0, active: 0 }), [], 'never paid, never fulfilled');
  assert.deepEqual(types({ value: 100, captured: 100, refunded: 100, active: 0 }), [], 'refunded and revoked');
  assert.deepEqual(types({ value: 100, captured: 1, refunded: 0, active: 0 }), [], 'a short capture that was not fulfilled');

  assert.deepEqual(orderHarms({ value: 100, captured: 1, refunded: 0, active: 1 }), [{ type: 'underpayment', amount: 99 }]);
  assert.deepEqual(orderHarms({ value: 100, captured: 100, refunded: 0, active: 3 }), [{ type: 'double-fulfillment', amount: 200 }]);
  assert.deepEqual(orderHarms({ value: 100, captured: 100, refunded: 100, active: 1 }), [{ type: 'inconsistent-refund', amount: 100 }]);
  assert.deepEqual(orderHarms({ value: 100, captured: 100, refunded: 0, active: 0 }), [{ type: 'lost-order', amount: 100 }]);
});

test('scenarios: IDs are unique and described; the set is versioned', () => {
  const ids = SCENARIOS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SCENARIOS) assert.ok(s.description, s.id);
  assert.match(SCENARIOS_VERSION, /^\d+$/);
});

// An in-memory shop that fulfills on every event it is sent, with or without a ledger.
function naiveShop(options: { ledger: boolean; log: string[] }): SubjectAdapter {
  const entries: LedgerEntry[] = [];
  const fulfilled = new Map<string, number>();
  let orders = 0;
  return {
    id: 'naive',
    products: { standard: { sku: 's', price: 500 }, cheap: { sku: 'c', price: 100 } },
    createOrder: async () => ({ status: 201, body: { id: `o${++orders}`, amount: 500, currency: 'USD' } }),
    startPayment: async (_customer, order) => ({ status: 201, body: { id: `p-${order}`, order, amount: 500, currency: 'USD' } }),
    readOrder: async () => ({ status: 200, body: {} }),
    deliver: async e => { fulfilled.set(e.order, (fulfilled.get(e.order) ?? 0) + 1); return { status: 200, body: {} }; },
    fulfillments: async order => (order ? fulfilled.get(order) ?? 0 : 0),
    activeFulfillments: async order => fulfilled.get(order) ?? 0,
    ...(options.ledger ? { ledger: {
      capture: async (p, amount = p.amount) => { entries.push({ payment: p.id, order: p.order, captured: amount, refunded: 0, currency: p.currency }); },
      refund: async p => { for (const e of entries) if (e.payment === p.id) e.refunded = e.captured; },
      entries: async () => entries,
    } } : {}),
    close: async () => { options.log.push('close'); },
  };
}

test('oracle: reads harm from the ledger and fulfillments, one fresh subject per scenario', async () => {
  const log: string[] = [];
  const report = await runOracle(SCENARIOS, async () => naiveShop({ ledger: true, log }));
  assert.equal(log.length, SCENARIOS.length);
  assert.equal(report.subject_id, 'naive');
  assert.equal(report.scenarios_version, SCENARIOS_VERSION);
  assert.equal(report.any_harm, true);
  assert.deepEqual(Object.keys(report.counts), [...HARM_TYPES]);

  const harms = (id: string) => report.scenarios.find(s => s.id === id)?.harms.map(h => [h.type, h.amount]);
  assert.deepEqual(harms('honest-purchase'), []);
  assert.deepEqual(harms('forged-success'), [['underpayment', 500]]);
  assert.deepEqual(harms('partial-capture'), [['underpayment', 499]]);
  assert.deepEqual(harms('refund-after-delivery'), [['double-fulfillment', 500], ['inconsistent-refund', 500]]);
  assert.deepEqual(harms('dropped-webhook'), [['lost-order', 500]]);
  assert.deepEqual(harms('curious-neighbour'), [['cross-account', null], ['cross-account', null]]);
  assert.equal(report.scenarios.find(s => s.id === 'worker-outage')?.status, 'not-run', 'no fault injection offered');
});

test('oracle: a subject without a ledger is unknown, never "no harm"', async () => {
  const report = await runOracle(SCENARIOS, async () => naiveShop({ ledger: false, log: [] }));
  assert.ok(report.scenarios.every(s => s.status === 'not-run' && !s.harms.length));
  assert.equal(report.any_harm, null);
});

test('oracle: a subject that breaks mid-scenario is still judged on the state it left', async () => {
  const crash: Scenario = { id: 'crash', description: 'pays, then the subject breaks', async run(w) {
    await w.capture(await w.pay(await w.order('alice')), { silent: true });
    throw new Error('subject crashed');
  } };
  const quiet: Scenario = { id: 'quiet', description: 'breaks before anything happens', async run() { throw new Error('subject crashed'); } };
  const open = async () => naiveShop({ ledger: true, log: [] });

  const lost = await runOracle([crash], open);
  assert.equal(lost.scenarios[0].status, 'errored');
  assert.deepEqual(lost.scenarios[0].harms.map(h => h.type), ['lost-order']);
  assert.equal((await runOracle([quiet], open)).any_harm, null, 'no harm seen, but the scenario did not run cleanly');
});
