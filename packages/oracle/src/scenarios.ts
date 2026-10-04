// End-to-end harm scenarios. Each one is a story with a buyer, a provider and sometimes an
// attacker or an outage. A scenario only acts; the oracle decides harm afterwards from the
// provider ledger and the subject's fulfillment records. Bump SCENARIOS_VERSION on any change:
// the set is frozen before the main study.
import type { World } from './run.ts';

export const SCENARIOS_VERSION = '1';

export interface Scenario {
  id: string;
  description: string;
  run(w: World): Promise<void>;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 'honest-purchase',
    description: 'A buyer orders, pays in full and the provider reports it',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.capture(payment);
    } },
  { id: 'price-tamper',
    description: 'A buyer sends their own price with the order, then pays whatever the shop asks',
    async run(w) {
      const payment = await w.pay(await w.order('alice', { clientPrice: 1 }));
      await w.capture(payment);
    } },
  { id: 'partial-capture',
    description: 'The provider captures less than the order total and reports the smaller amount',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.capture(payment, { amount: 1 });
    } },
  { id: 'one-payment-two-orders',
    description: 'A buyer pays for one order, then a second event for that payment names their other order',
    async run(w) {
      const first = await w.order('alice');
      const second = await w.order('alice');
      const payment = await w.pay(first);
      await w.capture(payment);
      await w.send(payment, 'payment.succeeded', { order: second.id });
    } },
  { id: 'forged-success',
    description: 'An attacker posts an unsigned success event; no money moves',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.send(payment, 'payment.succeeded', {}, 'unsigned');
    } },
  { id: 'failed-payment',
    description: 'The card is declined and the provider reports the failure',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.send(payment, 'payment.failed');
    } },
  { id: 'webhook-retry-storm',
    description: 'The provider retries one event, sends a second event for the same payment and delivers concurrently',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      const event = await w.capture(payment);
      await w.resend(event);
      await w.send(payment, 'payment.succeeded');
      await Promise.all([w.resend(event), w.resend(event), w.resend(event)]);
    } },
  { id: 'refund-after-delivery',
    description: 'A fulfilled order is refunded in full',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.capture(payment);
      await w.refund(payment);
    } },
  { id: 'late-failure',
    description: 'A failure event from an earlier declined attempt arrives after the payment succeeded',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.capture(payment);
      await w.send(payment, 'payment.failed');
    } },
  { id: 'worker-outage',
    description: 'Fulfillment is down when the payment succeeds, then comes back',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.outage(() => w.capture(payment));
    } },
  { id: 'dropped-webhook',
    description: 'The payment is captured but its event never arrives',
    async run(w) {
      const payment = await w.pay(await w.order('alice'));
      await w.capture(payment, { silent: true });
    } },
  { id: 'curious-neighbour',
    description: "Another customer tries to read and to pay for the buyer's order",
    async run(w) {
      const order = await w.order('alice');
      await w.intrude('bob', order);
    } },
];
