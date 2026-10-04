// Harm oracle (ADR 002). Measures outcomes in money and state, not controls: what the provider's
// ledger says was captured and refunded, against what the subject fulfilled. It shares the
// SubjectAdapter with the checks but nothing else, and its results never feed the PIAS score.

export type HarmType = 'underpayment' | 'double-fulfillment' | 'cross-account' | 'lost-order' | 'inconsistent-refund';

export const HARM_TYPES: readonly HarmType[] = ['underpayment', 'double-fulfillment', 'cross-account', 'lost-order', 'inconsistent-refund'];

export interface Harm {
  type: HarmType;
  scenario: string;
  order: string;
  /** Money at stake in minor units; null where the harm is access, not money. */
  amount: number | null;
}

/** One order's ground truth after the recovery window. */
export interface OrderOutcome {
  /** What the goods cost at catalog prices, whatever the subject's own order record says. */
  value: number;
  /** Captured at the provider for payments created for this order. */
  captured: number;
  /** Refunded at the provider for those payments. */
  refunded: number;
  /** Fulfillments still in force. */
  active: number;
}

/**
 * The money harms one order's outcome shows. Refunded money is judged as a refund, not as
 * underpayment, so a refunded order that stays fulfilled is one harm, not two.
 */
export function orderHarms({ value, captured, refunded, active }: OrderOutcome): { type: HarmType; amount: number }[] {
  const harms: { type: HarmType; amount: number }[] = [];
  if (active >= 1 && captured < value) harms.push({ type: 'underpayment', amount: value - captured });
  if (active > 1) harms.push({ type: 'double-fulfillment', amount: (active - 1) * value });
  if (active >= 1 && refunded > 0) harms.push({ type: 'inconsistent-refund', amount: refunded });
  if (active === 0 && captured - refunded >= value) harms.push({ type: 'lost-order', amount: captured - refunded });
  return harms;
}
