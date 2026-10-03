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
  data: { payment_id: string; order_id: string; amount: number; currency: string };
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
