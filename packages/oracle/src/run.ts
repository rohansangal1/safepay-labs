// Runs harm scenarios against a subject and reads the outcome. One fresh subject per scenario.
import crypto from 'node:crypto';
import type { EventType, NeutralEvent, OpenSubject, OrderRef, PaymentRef, Signing, SubjectAdapter } from '@pias/checks';
import { HARM_TYPES, orderHarms, type Harm, type HarmType } from './harm.ts';
import { SCENARIOS_VERSION, type Scenario } from './scenarios.ts';

/** What a scenario can do. Every action is something a buyer, the provider, an attacker or an outage does. */
export interface World {
  /** Orders one standard product. `clientPrice` is a price the buyer sends that the subject should ignore. */
  order(customer: string, options?: { clientPrice?: number }): Promise<OrderRef>;
  pay(order: OrderRef): Promise<PaymentRef>;
  /**
   * Money moves at the provider, which then reports it. `amount` captures less than the payment;
   * `silent` drops the event. Returns the event that was (or would have been) delivered.
   */
  capture(payment: PaymentRef, options?: { amount?: number; silent?: boolean }): Promise<NeutralEvent>;
  /** A full refund at the provider, which then reports it. */
  refund(payment: PaymentRef): Promise<void>;
  /** Delivers an event without moving money: a provider notice, or a forgery when not validly signed. */
  send(payment: PaymentRef, type: EventType, overrides?: Partial<NeutralEvent>, signing?: Signing): Promise<void>;
  resend(event: NeutralEvent): Promise<void>;
  /** Runs `during` with the subject's fulfillment side effect failing. */
  outage(during: () => Promise<unknown>): Promise<void>;
  /** Another customer tries to read and to pay for the order. */
  intrude(customer: string, order: OrderRef): Promise<void>;
}

/** Thrown when the subject lacks something the scenario needs. The scenario is then not run, never "no harm". */
class Unsupported extends Error {}

export interface ScenarioResult {
  id: string;
  description: string;
  /** 'errored': the subject broke mid-scenario; harms are still read from the state it left. */
  status: 'ran' | 'errored' | 'not-run';
  harms: Harm[];
}

export interface HarmReport {
  scenarios_version: string;
  subject_id: string | null;
  /** Null when no harm was seen but a scenario did not run cleanly: unknown is never "no harm". */
  any_harm: boolean | null;
  counts: Record<HarmType, number>;
  scenarios: ScenarioResult[];
}

async function runScenario(scenario: Scenario, s: SubjectAdapter): Promise<ScenarioResult> {
  const orders: { ref: OrderRef; value: number }[] = [];
  const intrusions: Harm[] = [];
  const ledger = () => {
    if (!s.ledger) throw new Unsupported('subject exposes no provider ledger');
    return s.ledger;
  };
  const event = (payment: PaymentRef, type: EventType, overrides: Partial<NeutralEvent> = {}): NeutralEvent => ({
    id: 'evt_' + crypto.randomUUID(), type, payment: payment.id, order: payment.order,
    amount: payment.amount, currency: payment.currency, ...overrides,
  });

  const world: World = {
    async order(customer, { clientPrice } = {}) {
      const { sku, price } = s.products.standard;
      const reply = await s.createOrder(customer, [{ sku, qty: 1, ...(clientPrice === undefined ? {} : { price: clientPrice }) }]);
      if (reply.status !== 201) throw new Error(`createOrder returned ${reply.status}`);
      orders.push({ ref: reply.body, value: price });
      return reply.body;
    },
    async pay(order) {
      const reply = await s.startPayment('alice', order.id);
      if (reply.status !== 200 && reply.status !== 201) throw new Error(`startPayment returned ${reply.status}`);
      return reply.body;
    },
    async capture(payment, { amount = payment.amount, silent = false } = {}) {
      await ledger().capture(payment, amount);
      const e = event(payment, 'payment.succeeded', { amount });
      if (!silent) await s.deliver(e);
      return e;
    },
    async refund(payment) {
      await ledger().refund(payment);
      await s.deliver(event(payment, 'payment.refunded'));
    },
    async send(payment, type, overrides, signing) { await s.deliver(event(payment, type, overrides), signing); },
    async resend(e) { await s.deliver(e); },
    async outage(during) {
      if (!s.faults) throw new Unsupported('subject offers no fault injection');
      await s.faults.breakFulfillment();
      try { await during(); } finally { await s.faults.restoreFulfillment(); }
    },
    async intrude(customer, order) {
      const attempts = [await s.readOrder(customer, order.id), await s.startPayment(customer, order.id)];
      for (const reply of attempts) {
        if (reply.status < 400) intrusions.push({ type: 'cross-account', scenario: scenario.id, order: order.id, amount: null });
      }
    },
  };

  let status: ScenarioResult['status'] = 'ran';
  try {
    ledger();
    await scenario.run(world);
  } catch (err) {
    if (err instanceof Unsupported) return { id: scenario.id, description: scenario.description, status: 'not-run', harms: [] };
    status = 'errored';
  }

  // The recovery window: whatever the subject does to heal itself gets two chances first. A
  // recovery job that crashes leaves the state it could not repair, which is what gets judged.
  for (let i = 0; i < 2; i++) {
    try { await s.faults?.recover(); } catch { status = 'errored'; }
  }

  const entries = await ledger().entries();
  const harms: Harm[] = [...intrusions];
  for (const { ref, value } of orders) {
    const mine = entries.filter(e => e.order === ref.id);
    const outcome = {
      value,
      captured: mine.reduce((sum, e) => sum + e.captured, 0),
      refunded: mine.reduce((sum, e) => sum + e.refunded, 0),
      active: await s.activeFulfillments(ref.id),
    };
    for (const h of orderHarms(outcome)) harms.push({ ...h, scenario: scenario.id, order: ref.id });
  }
  return { id: scenario.id, description: scenario.description, status, harms };
}

/** Never throws for a subject's failure: a scenario that could not run is reported as such. */
export async function runOracle(scenarios: readonly Scenario[], open: OpenSubject): Promise<HarmReport> {
  const results: ScenarioResult[] = [];
  let subjectId: string | null = null;
  for (const scenario of scenarios) {
    const subject = await open();
    subjectId = subject.id;
    try {
      results.push(await runScenario(scenario, subject));
    } finally {
      await subject.close();
    }
  }
  const harms = results.flatMap(r => r.harms);
  const counts = Object.fromEntries(HARM_TYPES.map(t => [t, harms.filter(h => h.type === t).length])) as Record<HarmType, number>;
  const clean = results.every(r => r.status === 'ran');
  return {
    scenarios_version: SCENARIOS_VERSION,
    subject_id: subjectId,
    any_harm: harms.length ? true : clean ? false : null,
    counts,
    scenarios: results,
  };
}
