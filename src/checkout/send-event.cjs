'use strict';
// Sends a signed fake-provider event for an order to the local checkout.
// Usage: LAB_WEBHOOK_SECRET=<secret> node src/checkout/send-event.cjs <order_id> <customer> [event_type]
const { paymentEvent, signedDelivery } = require('./provider.cjs');

async function main() {
  const [orderId, customer, type = 'payment.succeeded'] = process.argv.slice(2);
  const secret = process.env.LAB_WEBHOOK_SECRET;
  const base = `http://127.0.0.1:${process.env.PORT || 4280}`;
  if (!orderId || !customer || !secret) {
    console.error('Usage: LAB_WEBHOOK_SECRET=<secret> npm run checkout:event -- <order_id> <customer> [event_type]');
    process.exit(1);
  }
  const res = await fetch(`${base}/orders/${orderId}/payment`, { method: 'POST', headers: { 'x-lab-customer': customer } });
  const payment = await res.json();
  if (!res.ok) throw new Error(`Could not get payment: ${JSON.stringify(payment)}`);

  const { body, signature } = signedDelivery(paymentEvent(payment, type), secret);
  const delivery = await fetch(`${base}/webhooks/payments`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-lab-signature': signature }, body });
  console.log(delivery.status, await delivery.text());
}

main().catch(err => { console.error(err.message); process.exit(1); });
