// Fake payment provider: builds and signs payment events for local subjects.
// Stands in for a real sandbox until the Stripe/Square emulators exist (Phase 2).
import crypto from 'node:crypto';
import { sign } from './signature.ts';

/** Recorded on evidence. Bump apiVersion when the event shape or signature scheme changes. */
export const PROVIDER = { name: 'lab-provider', apiVersion: '1' } as const;

export interface PaymentRef {
  id: string;
  order: string;
  amount: number;
  currency: string;
}

export interface PaymentEvent {
  id: string;
  type: string;
  data: {
    payment_id: string; order_id: string; amount: number; currency: string;
    /** Synthetic billing details. A merchant needs none of them to fulfill. */
    billing?: { email: string; card_number: string };
  };
}

export function paymentEvent(payment: PaymentRef, type = 'payment.succeeded', id = 'evt_' + crypto.randomUUID()): PaymentEvent {
  return {
    id,
    type,
    data: { payment_id: payment.id, order_id: payment.order, amount: payment.amount, currency: payment.currency },
  };
}

export function signedDelivery(event: PaymentEvent, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(event);
  return { body, signature: sign(body, secret, timestamp) };
}

/**
 * The provider's own record of captured payments, which a merchant can query server-to-server.
 * Lets the lab model a webhook that was dropped: the money moved, but no event arrived.
 */
export function createLedger() {
  const payments = new Map<string, { order: string; captured: number; refunded: number; currency: string }>();
  return {
    capture(payment: PaymentRef, amount = payment.amount) {
      payments.set(payment.id, { order: payment.order, captured: amount, refunded: 0, currency: payment.currency });
    },
    /** A full refund of whatever was captured. */
    refund(payment: PaymentRef) {
      const p = payments.get(payment.id);
      if (p) p.refunded = p.captured;
    },
    /** What a merchant sees when it asks about one payment. */
    lookup(paymentId: string) {
      const p = payments.get(paymentId);
      if (!p) return null;
      return { status: p.refunded ? 'refunded' : 'succeeded', amount: p.captured, currency: p.currency };
    },
    entries: () => [...payments].map(([payment, p]) => ({ payment, ...p })),
  };
}
