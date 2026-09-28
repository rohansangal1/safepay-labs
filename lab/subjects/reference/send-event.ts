// Sends a signed fake-provider event for an order to the local checkout.
// Usage: LAB_WEBHOOK_SECRET=<secret> npm run checkout:event -- <order_id> <customer> [event_type]
import { paymentEvent, signedDelivery, type PaymentRef } from '../../emulator/provider.ts';

const [orderId, customer, type = 'payment.succeeded'] = process.argv.slice(2);
const secret = process.env.LAB_WEBHOOK_SECRET;
const base = `http://127.0.0.1:${process.env.PORT || 4280}`;

if (!orderId || !customer || !secret) {
  console.error('Usage: LAB_WEBHOOK_SECRET=<secret> npm run checkout:event -- <order_id> <customer> [event_type]');
  process.exit(1);
}

try {
  const res = await fetch(`${base}/orders/${orderId}/payment`, { method: 'POST', headers: { 'x-lab-customer': customer } });
  const payment = (await res.json()) as PaymentRef;
  if (!res.ok) throw new Error(`Could not get payment: ${JSON.stringify(payment)}`);

  const { body, signature } = signedDelivery(paymentEvent(payment, type), secret);
  const delivery = await fetch(`${base}/webhooks/payments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-lab-signature': signature },
    body,
  });
  console.log(delivery.status, await delivery.text());
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
