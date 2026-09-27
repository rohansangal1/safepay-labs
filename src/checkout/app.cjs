'use strict';
// Owned reference checkout (milestone 3). Local only: no real provider, money, card data
// or outbound network calls. Customers are synthetic identities sent in a header.
const { verify } = require('./signature.cjs');

const CURRENCY = 'USD';
const CATALOG = {
  'lab-mug': { name: 'Lab mug', price: 1800 },
  'lab-tee': { name: 'Lab T-shirt', price: 2500 },
  'lab-sticker': { name: 'Sticker pack', price: 400 },
};

// Seeded defects. Each one removes exactly one safeguard so the assessment can
// show that its checks detect the missing control.
const DEFECTS = {
  trustClientAmount: 'Uses the price sent by the client instead of the catalog',
  skipAmountMatch: 'Fulfills without comparing event amount and currency to the order',
  skipOrderMatch: 'Trusts the order ID in the event instead of the payment it belongs to',
  skipSignature: 'Accepts webhooks without verifying the signature',
  fulfillOnAnyStatus: 'Fulfills on any payment event, not only a success',
  skipOwnership: 'Lets any customer read or pay any order',
  noIdempotency: 'Processes duplicate events and fulfills an order more than once',
};

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(httpError(413, 'body too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createCheckout({ secret, defects = [], now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!secret) throw new Error('Webhook secret required');
  for (const d of defects) if (!DEFECTS[d]) throw new Error('Unknown defect: ' + d);
  const has = d => defects.includes(d);

  // In-memory stand-in for the order/payment/fulfillment database.
  const state = { orders: new Map(), payments: new Map(), processedEvents: new Set(), fulfillments: [], seq: 0 };
  const nextId = prefix => `${prefix}_${String(++state.seq).padStart(4, '0')}`;
  const view = o => ({ id: o.id, lines: o.lines, amount: o.amount, currency: o.currency, status: o.status, payment: o.payment });

  function ownedOrder(customer, orderId) {
    const order = state.orders.get(orderId);
    if (!order) return null;
    if (!has('skipOwnership') && order.customer !== customer) return null;
    return order;
  }

  function createOrder(customer, body) {
    if (!customer) return [401, { error: 'missing customer' }];
    const items = body && body.items;
    if (!Array.isArray(items) || !items.length || items.length > 20) return [400, { error: 'items required' }];
    let amount = 0;
    const lines = [];
    for (const item of items) {
      const product = CATALOG[item && item.sku];
      if (!product || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) return [400, { error: 'invalid item' }];
      const price = has('trustClientAmount') && Number.isInteger(item.price) ? item.price : product.price;
      amount += price * item.qty;
      lines.push({ sku: item.sku, qty: item.qty, price });
    }
    const order = { id: nextId('ord'), customer, lines, amount, currency: CURRENCY, status: 'awaiting_payment', payment: null };
    state.orders.set(order.id, order);
    return [201, view(order)];
  }

  function createPayment(customer, orderId) {
    const order = ownedOrder(customer, orderId);
    if (!order) return [404, { error: 'order not found' }];
    if (order.payment) return [200, state.payments.get(order.payment)];
    if (order.status !== 'awaiting_payment') return [409, { error: 'order not payable' }];
    const payment = { id: nextId('pay'), order: order.id, amount: order.amount, currency: order.currency, status: 'requires_payment' };
    state.payments.set(payment.id, payment);
    order.payment = payment.id;
    return [201, payment];
  }

  function handleWebhook(rawBody, signature) {
    if (!has('skipSignature') && !verify(rawBody, signature, secret, now())) return [400, { error: 'invalid signature' }];
    let event;
    try { event = JSON.parse(rawBody); } catch { return [400, { error: 'invalid json' }]; }
    if (!event || typeof event.id !== 'string' || !event.data || typeof event.data !== 'object') return [400, { error: 'invalid event' }];

    if (!has('noIdempotency') && state.processedEvents.has(event.id)) return [200, { received: true, duplicate: true }];
    state.processedEvents.add(event.id);

    const { payment_id, order_id, amount, currency } = event.data;
    const payment = state.payments.get(payment_id);
    if (!payment) return [200, { received: true, ignored: 'unknown payment' }];

    // Binding: the order is the one this payment was created for, never an ID taken from the event.
    const order = state.orders.get(has('skipOrderMatch') ? order_id : payment.order);
    if (!order) return [200, { received: true, ignored: 'unknown order' }];
    if (!has('skipOrderMatch') && (order_id !== order.id || payment.amount !== order.amount)) {
      return [200, { received: true, ignored: 'order mismatch' }];
    }
    if (!has('skipAmountMatch') && (amount !== order.amount || currency !== order.currency)) {
      return [200, { received: true, ignored: 'amount mismatch' }];
    }

    const succeeded = event.type === 'payment.succeeded' || has('fulfillOnAnyStatus');
    if (!succeeded) {
      if (event.type === 'payment.failed') payment.status = 'failed';
      return [200, { received: true, ignored: 'not a success event' }];
    }
    payment.status = 'succeeded';
    if (!has('noIdempotency') && order.status === 'fulfilled') return [200, { received: true, duplicate: true }];
    order.status = 'fulfilled';
    state.fulfillments.push({ order: order.id, payment: payment.id, event: event.id });
    return [200, { received: true, fulfilled: order.id }];
  }

  async function handle(req, res) {
    const send = ([status, body]) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);
      const customer = req.headers['x-lab-customer'] || null;
      const raw = await readBody(req);
      const json = () => { try { return JSON.parse(raw); } catch { throw httpError(400, 'invalid json'); } };

      if (req.method === 'GET' && url.pathname === '/catalog') return send([200, CATALOG]);
      if (req.method === 'POST' && url.pathname === '/orders') return send(createOrder(customer, json()));
      if (req.method === 'GET' && parts[0] === 'orders' && parts.length === 2) {
        const order = ownedOrder(customer, parts[1]);
        return send(order ? [200, view(order)] : [404, { error: 'order not found' }]);
      }
      if (req.method === 'POST' && parts[0] === 'orders' && parts[2] === 'payment' && parts.length === 3) {
        return send(createPayment(customer, parts[1]));
      }
      if (req.method === 'POST' && url.pathname === '/webhooks/payments') {
        return send(handleWebhook(raw, req.headers['x-lab-signature']));
      }
      send([404, { error: 'not found' }]);
    } catch (err) {
      send(err.status ? [err.status, { error: err.message }] : [500, { error: 'internal error' }]);
    }
  }

  return { handle, state };
}

module.exports = { createCheckout, CATALOG, CURRENCY, DEFECTS };
