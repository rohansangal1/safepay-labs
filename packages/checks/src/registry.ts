// Check registry. Each check has a stable ID, a version, the control it evidences, the layer
// it observes and the oracle that decides it. Bump a check's version whenever its behavior
// changes, so results from different versions are never compared as if they were the same.
import crypto from 'node:crypto';
import type { EventType, NeutralEvent, PaymentRef, SubjectAdapter } from './adapter.ts';

/** Where the check looks. Kept separate so browser-only profiles never mix with full evidence. */
export type Layer = 'http-api' | 'backend-and-provider';
/** What decides the outcome: the subject's fulfillment records or its HTTP responses. */
export type Oracle = 'fulfillment-records' | 'http-response';

export interface Check {
  id: string;
  version: number;
  control: string;
  layer: Layer;
  oracle: Oracle;
  description: string;
  /** Passes only when observed equals expected exactly. */
  run(subject: SubjectAdapter): Promise<{ expected: unknown; observed: unknown }>;
}

/** Bumped whenever a check is added, removed or re-versioned. */
export const REGISTRY_VERSION = '2';

const event = (payment: PaymentRef, type: EventType = 'payment.succeeded', overrides: Partial<NeutralEvent> = {}): NeutralEvent => ({
  id: 'evt_' + crypto.randomUUID(),
  type,
  payment: payment.id,
  order: payment.order,
  amount: payment.amount,
  currency: payment.currency,
  ...overrides,
});

async function order(s: SubjectAdapter, customer = 'alice', product = s.products.standard) {
  const reply = await s.createOrder(customer, [{ sku: product.sku, qty: 1 }]);
  if (reply.status !== 201) throw new Error(`createOrder returned ${reply.status}`);
  return reply.body;
}

async function pay(s: SubjectAdapter, orderId: string, customer = 'alice') {
  const reply = await s.startPayment(customer, orderId);
  if (reply.status !== 200 && reply.status !== 201) throw new Error(`startPayment returned ${reply.status}`);
  return reply.body;
}

async function orderAndPay(s: SubjectAdapter) {
  const o = await order(s);
  return { order: o, payment: await pay(s, o.id) };
}

function faults(s: SubjectAdapter) {
  if (!s.faults) throw new Error('subject offers no fault injection');
  return s.faults;
}

const backend = { layer: 'backend-and-provider', oracle: 'fulfillment-records' } as const;
const api = { layer: 'http-api', oracle: 'http-response' } as const;

export const CHECKS: readonly Check[] = [
  // amount
  { id: 'client-price-ignored', version: 1, control: 'amount', ...api,
    description: 'Order total comes from the catalog, not a client-sent price',
    async run(s) {
      const { sku, price } = s.products.standard;
      const reply = await s.createOrder('alice', [{ sku, qty: 2, price: 1 }]);
      return { expected: 2 * price, observed: reply.body?.amount };
    } },
  { id: 'underpaid-event-rejected', version: 1, control: 'amount', ...backend,
    description: 'A success event for less than the order total does not fulfill',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment, 'payment.succeeded', { amount: 1 }));
      return { expected: 0, observed: await s.fulfillments(o.id) };
    } },
  { id: 'currency-mismatch-rejected', version: 1, control: 'amount', ...backend,
    description: 'A success event in another currency does not fulfill',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment, 'payment.succeeded', { currency: payment.currency === 'EUR' ? 'USD' : 'EUR' }));
      return { expected: 0, observed: await s.fulfillments(o.id) };
    } },

  // binding
  { id: 'cross-order-event-rejected', version: 1, control: 'binding', ...backend,
    description: 'Paying for a cheap order cannot fulfill an expensive one',
    async run(s) {
      const cheap = await order(s, 'alice', s.products.cheap);
      const expensive = await order(s, 'alice', s.products.standard);
      const payment = await pay(s, cheap.id);
      await s.deliver(event(payment, 'payment.succeeded', { order: expensive.id, amount: expensive.amount }));
      return { expected: 0, observed: await s.fulfillments(expensive.id) };
    } },
  { id: 'unknown-order-rejected', version: 1, control: 'binding', ...backend,
    description: 'An event naming a nonexistent order fulfills nothing',
    async run(s) {
      const { payment } = await orderAndPay(s);
      const before = await s.fulfillments();
      await s.deliver(event(payment, 'payment.succeeded', { order: 'ord_does_not_exist' }));
      return { expected: 0, observed: (await s.fulfillments()) - before };
    } },

  // authenticity
  ...([
    ['unsigned-rejected', 'unsigned', 'An unsigned event does not fulfill'],
    ['wrong-secret-rejected', 'wrong-key', 'An event signed with another key does not fulfill'],
    ['stale-timestamp-rejected', 'stale', 'A correctly signed event from an hour ago does not fulfill'],
    ['tampered-body-rejected', 'tampered', 'Changing a signed body invalidates it'],
  ] as const).map(([id, signing, description]): Check => ({
    id, version: 1, control: 'authenticity', ...backend, description,
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment), signing);
      return { expected: 0, observed: await s.fulfillments(o.id) };
    },
  })),

  // fulfillment
  { id: 'verified-success-fulfills', version: 1, control: 'fulfillment', ...backend,
    description: 'A valid signed success event fulfills the order exactly once',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment));
      return { expected: 1, observed: await s.fulfillments(o.id) };
    } },
  { id: 'failed-payment-not-fulfilled', version: 1, control: 'fulfillment', ...backend,
    description: 'A payment.failed event does not fulfill',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment, 'payment.failed'));
      return { expected: 0, observed: await s.fulfillments(o.id) };
    } },
  { id: 'pending-payment-not-fulfilled', version: 1, control: 'fulfillment', ...backend,
    description: 'A payment.processing event does not fulfill',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment, 'payment.processing'));
      return { expected: 0, observed: await s.fulfillments(o.id) };
    } },
  { id: 'unknown-payment-ignored', version: 1, control: 'fulfillment', ...backend,
    description: 'An event for a payment the merchant never created fulfills nothing',
    async run(s) {
      const o = await order(s);
      const before = await s.fulfillments();
      await s.deliver(event({ id: 'pay_does_not_exist', order: o.id, amount: o.amount, currency: o.currency }));
      return { expected: 0, observed: (await s.fulfillments()) - before };
    } },

  // authorization
  { id: 'other-customer-cannot-read', version: 1, control: 'authorization', ...api,
    description: 'Another customer cannot read the order',
    async run(s) {
      const o = await order(s);
      return { expected: 404, observed: (await s.readOrder('bob', o.id)).status };
    } },
  { id: 'other-customer-cannot-pay', version: 1, control: 'authorization', ...api,
    description: 'Another customer cannot start payment for the order',
    async run(s) {
      const o = await order(s);
      return { expected: 404, observed: (await s.startPayment('bob', o.id)).status };
    } },
  { id: 'anonymous-cannot-read', version: 1, control: 'authorization', ...api,
    description: 'A request with no customer cannot read the order',
    async run(s) {
      const o = await order(s);
      return { expected: 404, observed: (await s.readOrder(null, o.id)).status };
    } },

  // idempotency
  { id: 'duplicate-delivery', version: 1, control: 'idempotency', ...backend,
    description: 'The same event delivered twice fulfills once',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      const e = event(payment);
      await s.deliver(e);
      await s.deliver(e);
      return { expected: 1, observed: await s.fulfillments(o.id) };
    } },
  { id: 'distinct-events-same-payment', version: 1, control: 'idempotency', ...backend,
    description: 'Two success events for one payment fulfill once',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment));
      await s.deliver(event(payment));
      return { expected: 1, observed: await s.fulfillments(o.id) };
    } },
  { id: 'concurrent-delivery', version: 1, control: 'idempotency', ...backend,
    description: 'Five concurrent deliveries of one event fulfill once',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      const e = event(payment);
      await Promise.all(Array.from({ length: 5 }, () => s.deliver(e)));
      return { expected: 1, observed: await s.fulfillments(o.id) };
    } },

  // lifecycle
  { id: 'refund-revokes-fulfillment', version: 1, control: 'lifecycle', ...backend,
    description: 'A refund after fulfillment leaves no fulfillment in force',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment));
      await s.deliver(event(payment, 'payment.refunded'));
      return { expected: 0, observed: await s.activeFulfillments(o.id) };
    } },
  { id: 'refund-before-success-not-fulfilled', version: 1, control: 'lifecycle', ...backend,
    description: 'A success event that arrives after the refund does not fulfill',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment, 'payment.refunded'));
      await s.deliver(event(payment));
      return { expected: 0, observed: await s.activeFulfillments(o.id) };
    } },
  { id: 'late-failure-keeps-fulfillment', version: 1, control: 'lifecycle', ...backend,
    description: 'A failure event that arrives after the success does not cancel a paid order',
    async run(s) {
      const { order: o, payment } = await orderAndPay(s);
      await s.deliver(event(payment));
      await s.deliver(event(payment, 'payment.failed'));
      return { expected: 1, observed: await s.activeFulfillments(o.id) };
    } },

  // recovery
  { id: 'worker-failure-recovers', version: 1, control: 'recovery', ...backend,
    description: 'A paid order whose fulfillment failed is fulfilled exactly once after recovery',
    async run(s) {
      const f = faults(s);
      const { order: o, payment } = await orderAndPay(s);
      await f.breakFulfillment();
      await s.deliver(event(payment));
      await f.restoreFulfillment();
      await f.recover();
      await f.recover();
      return { expected: 1, observed: await s.fulfillments(o.id) };
    } },
  { id: 'dropped-event-reconciled', version: 1, control: 'recovery', ...backend,
    description: 'A captured payment whose event never arrived is fulfilled after reconciliation',
    async run(s) {
      const f = faults(s);
      const { order: o, payment } = await orderAndPay(s);
      await f.captureWithoutEvent(payment);
      await f.recover();
      await f.recover();
      return { expected: 1, observed: await s.fulfillments(o.id) };
    } },
];
