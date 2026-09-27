'use strict';
// Fake payment provider: builds and signs payment events for the local checkout.
// Stands in for a real sandbox until the Stripe/Square adapters exist (milestones 4–5).
const crypto = require('node:crypto');
const { sign } = require('./signature.cjs');

function paymentEvent(payment, type = 'payment.succeeded', id = 'evt_' + crypto.randomUUID()) {
  return {
    id,
    type,
    data: { payment_id: payment.id, order_id: payment.order, amount: payment.amount, currency: payment.currency },
  };
}

function signedDelivery(event, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const body = JSON.stringify(event);
  return { body, signature: sign(body, secret, timestamp) };
}

module.exports = { paymentEvent, signedDelivery };
