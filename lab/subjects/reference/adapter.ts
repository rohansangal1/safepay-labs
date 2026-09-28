// SubjectAdapter for the owned reference checkout: starts it on a random local port and
// renders neutral events in the lab provider's format and signature scheme.
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { NeutralEvent, Reply, Signing, SubjectAdapter } from '@pias/checks';
import { createCheckout, CATALOG } from './app.ts';
import { sign } from '../../emulator/signature.ts';
import type { PaymentEvent } from '../../emulator/provider.ts';

export const SUBJECT_ID = 'lab:owned-checkout';

const toProvider = (e: NeutralEvent): PaymentEvent => ({
  id: e.id,
  type: e.type,
  data: { payment_id: e.payment, order_id: e.order, amount: e.amount, currency: e.currency },
});

export async function openReference(defects: string[] = []): Promise<SubjectAdapter> {
  const secret = crypto.randomBytes(32).toString('hex');
  const checkout = createCheckout({ secret, defects });
  const server = http.createServer(checkout.handle);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, route: string, customer: string | null, body?: string, headers: Record<string, string> = {}): Promise<Reply<any>> {
    const res = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...(customer ? { 'x-lab-customer': customer } : {}), ...headers },
      body,
    });
    return { status: res.status, body: await res.json() };
  }

  return {
    id: SUBJECT_ID,
    products: {
      standard: { sku: 'lab-tee', price: CATALOG['lab-tee'].price },
      cheap: { sku: 'lab-sticker', price: CATALOG['lab-sticker'].price },
    },
    createOrder: (customer, items) => call('POST', '/orders', customer, JSON.stringify({ items })),
    startPayment: (customer, orderId) => call('POST', `/orders/${encodeURIComponent(orderId)}/payment`, customer),
    readOrder: (customer, orderId) => call('GET', `/orders/${encodeURIComponent(orderId)}`, customer),

    deliver(event: NeutralEvent, signing: Signing = 'valid') {
      const body = JSON.stringify(toProvider(event));
      const now = Math.floor(Date.now() / 1000);
      let sent = body;
      let signature: string | null;
      switch (signing) {
        case 'valid': signature = sign(body, secret, now); break;
        case 'unsigned': signature = null; break;
        case 'wrong-key': signature = sign(body, crypto.randomBytes(32).toString('hex'), now); break;
        case 'stale': signature = sign(body, secret, now - 3600); break;
        case 'tampered':
          signature = sign(body, secret, now);
          sent = JSON.stringify(toProvider({ ...event, id: event.id + '-edited' }));
          break;
      }
      return call('POST', '/webhooks/payments', null, sent, signature ? { 'x-lab-signature': signature } : {});
    },

    fulfillments: async orderId => checkout.fulfillments(orderId),

    close: () => new Promise<void>(resolve => {
      server.closeAllConnections();
      server.close(() => { checkout.close(); resolve(); });
    }),
  };
}
