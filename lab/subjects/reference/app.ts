// Owned reference checkout. Local only: no real provider, money, card data or outbound
// network calls. Customers are synthetic identities sent in a header. State lives in node:sqlite;
// fulfillment runs from a transactional outbox so a verified payment is never lost, and every
// state change is written to an audit table.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { verify } from '../../emulator/signature.ts';

export const CURRENCY = 'USD';
export const CATALOG: Record<string, { name: string; price: number }> = {
  'lab-mug': { name: 'Lab mug', price: 1800 },
  'lab-tee': { name: 'Lab T-shirt', price: 2500 },
  'lab-sticker': { name: 'Sticker pack', price: 400 },
};

// Seeded defects. Each one removes exactly one safeguard so the assessment can
// show that its checks detect the missing control.
export const DEFECTS = {
  trustClientAmount: 'Uses the price sent by the client instead of the catalog',
  skipAmountMatch: 'Fulfills without comparing event amount and currency to the order',
  skipOrderMatch: 'Trusts the order ID in the event instead of the payment it belongs to',
  skipSignature: 'Accepts webhooks without verifying the signature',
  fulfillOnAnyStatus: 'Fulfills on any payment event, not only a success',
  skipOwnership: 'Lets any customer read or pay any order',
  noIdempotency: 'Processes duplicate events and fulfills an order more than once',
  ignoreRefunds: 'Ignores refund events, so a refunded order stays fulfilled',
  lastEventWins: 'Lets a late failure event cancel an order that was already paid and fulfilled',
  dropFailedJobs: 'Gives up on a fulfillment job after its first failure',
  noReconciliation: 'Never asks the provider about payments whose event was dropped',
  leakSecretInErrors: 'Returns debug details, including the webhook secret, when a signature fails',
  logSecret: 'Logs the webhook secret when a signature fails',
  logRawEvents: 'Logs the full webhook payload, billing details included',
  storeRawEvents: 'Stores the full webhook payload, billing details included, with each processed event',
  skipAudit: 'Changes payment and order state without writing audit entries',
  silentRejections: 'Rejects forged webhooks without recording the attempt',
} as const;

export type Defect = keyof typeof DEFECTS;

interface Line { sku: string; qty: number; price: number }
interface Order { id: string; customer: string; lines: Line[]; amount: number; currency: string; status: 'awaiting_payment' | 'paid' | 'fulfilled' | 'refunded'; payment: string | null }
interface Payment { id: string; order: string; amount: number; currency: string; status: 'requires_payment' | 'succeeded' | 'failed' | 'refunded' }
/** What the provider says about a payment when asked directly, as opposed to told by webhook. */
export interface ProviderPayment { status: string; amount: number; currency: string }
export interface OutboxJob { id: number; order: string; payment: string; event: string; attempts: number }
export type AuditAction = 'paid' | 'fulfilled' | 'refunded' | 'payment-failed' | 'event-rejected';
export interface AuditEntry { action: AuditAction; at: number; order: string | null; payment: string | null; event: string | null }
type Reply = [status: number, body: unknown];

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'body too large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export interface CheckoutOptions {
  secret: string;
  defects?: string[];
  now?: () => number;
  // SQLite file for a checkout that survives restarts; in-memory by default.
  database?: string;
  // Side effect of fulfilling an order (shipping, access grant). Runs from the outbox and may
  // throw: the job then stays pending and is retried on the next drain.
  onFulfill?: (job: OutboxJob) => void;
  // Server-to-provider lookup used by reconcile() to recover payments whose event never arrived.
  lookupPayment?: (paymentId: string) => ProviderPayment | null;
  // Receives each application log line. Lines carry IDs and outcomes only: no payloads, no secrets.
  log?: (line: string) => void;
}

// Unique indexes that deduplicate by business action, not only by event ID. Seeding
// noIdempotency drops them along with the event-ID check.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
  INSERT OR IGNORE INTO counters VALUES ('id', 0);
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, customer TEXT NOT NULL, lines TEXT NOT NULL, amount INTEGER NOT NULL,
    currency TEXT NOT NULL, status TEXT NOT NULL, payment TEXT);
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), amount INTEGER NOT NULL,
    currency TEXT NOT NULL, status TEXT NOT NULL);
  -- payload stays NULL: the event ID is all deduplication needs (seeding storeRawEvents fills it).
  CREATE TABLE IF NOT EXISTS processed_events (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL, payload TEXT);
  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY, order_id TEXT NOT NULL, payment_id TEXT NOT NULL, event_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT);
  CREATE TABLE IF NOT EXISTS fulfillments (
    id INTEGER PRIMARY KEY, order_id TEXT NOT NULL, payment_id TEXT NOT NULL, event_id TEXT NOT NULL,
    revoked_at INTEGER);
  -- Append-only: one row per payment or order state change and per rejected webhook.
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, action TEXT NOT NULL, order_id TEXT, payment_id TEXT,
    event_id TEXT);
`;
const DEDUPE = `
  CREATE UNIQUE INDEX IF NOT EXISTS outbox_one_per_order ON outbox(order_id);
  CREATE UNIQUE INDEX IF NOT EXISTS fulfillments_one_per_order ON fulfillments(order_id);
`;

export function createCheckout({ secret, defects = [], now = () => Math.floor(Date.now() / 1000), database = ':memory:', onFulfill, lookupPayment, log = () => {} }: CheckoutOptions) {
  if (!secret) throw new Error('Webhook secret required');
  for (const d of defects) if (!(d in DEFECTS)) throw new Error('Unknown defect: ' + d);
  const has = (d: Defect) => defects.includes(d);

  const db = new DatabaseSync(database);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  if (!has('noIdempotency')) db.exec(DEDUPE);

  function transaction<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const sql = {
    nextId: db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'id' RETURNING value"),
    order: db.prepare('SELECT * FROM orders WHERE id = ?'),
    insertOrder: db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, NULL)'),
    orderPayment: db.prepare('UPDATE orders SET payment = ? WHERE id = ?'),
    orderStatus: db.prepare('UPDATE orders SET status = ? WHERE id = ?'),
    payment: db.prepare('SELECT id, order_id AS "order", amount, currency, status FROM payments WHERE id = ?'),
    insertPayment: db.prepare('INSERT INTO payments VALUES (?, ?, ?, ?, ?)'),
    paymentStatus: db.prepare('UPDATE payments SET status = ? WHERE id = ?'),
    seenEvent: db.prepare('SELECT 1 FROM processed_events WHERE id = ?'),
    recordEvent: db.prepare('INSERT OR IGNORE INTO processed_events VALUES (?, ?, ?)'),
    enqueue: db.prepare('INSERT INTO outbox (order_id, payment_id, event_id) VALUES (?, ?, ?)'),
    pending: db.prepare(`SELECT id, order_id AS "order", payment_id AS payment, event_id AS event, attempts
                         FROM outbox WHERE status = 'pending' ORDER BY id`),
    jobDone: db.prepare("UPDATE outbox SET status = 'done', attempts = attempts + 1, last_error = NULL WHERE id = ?"),
    jobFailed: db.prepare('UPDATE outbox SET attempts = attempts + 1, last_error = ?, status = ? WHERE id = ?'),
    cancelJobs: db.prepare("UPDATE outbox SET status = 'cancelled' WHERE order_id = ? AND status = 'pending'"),
    revoke: db.prepare('UPDATE fulfillments SET revoked_at = ? WHERE order_id = ? AND revoked_at IS NULL'),
    unpaid: db.prepare("SELECT id FROM orders WHERE status = 'awaiting_payment' AND payment IS NOT NULL ORDER BY id"),
    jobStatus: db.prepare('SELECT status FROM outbox WHERE event_id = ? ORDER BY id DESC LIMIT 1'),
    fulfill: db.prepare('INSERT OR IGNORE INTO fulfillments (order_id, payment_id, event_id) VALUES (?, ?, ?)'),
    countAll: db.prepare('SELECT count(*) AS n FROM fulfillments'),
    countOrder: db.prepare('SELECT count(*) AS n FROM fulfillments WHERE order_id = ?'),
    countActive: db.prepare('SELECT count(*) AS n FROM fulfillments WHERE order_id = ? AND revoked_at IS NULL'),
    audit: db.prepare('INSERT INTO audit (at, action, order_id, payment_id, event_id) VALUES (?, ?, ?, ?, ?)'),
    auditTrail: db.prepare('SELECT action, at, order_id AS "order", payment_id AS payment, event_id AS event FROM audit ORDER BY id'),
  };

  // Called inside the transaction that makes the change, so a state change and its entry commit together.
  function audit(action: AuditAction, ids: { order?: string; payment?: string; event?: string } = {}) {
    if (has('skipAudit')) return;
    sql.audit.run(now(), action, ids.order ?? null, ids.payment ?? null, ids.event ?? null);
  }

  const nextId = (prefix: string) => `${prefix}_${String((sql.nextId.get() as { value: number }).value).padStart(4, '0')}`;
  const getOrder = (id: unknown): Order | null => {
    const row = typeof id === 'string' ? sql.order.get(id) as (Omit<Order, 'lines'> & { lines: string }) | undefined : undefined;
    return row ? { ...row, lines: JSON.parse(row.lines) } : null;
  };
  const getPayment = (id: unknown) => (typeof id === 'string' ? sql.payment.get(id) as Payment | undefined : undefined) ?? null;
  const view = (o: Order) => ({ id: o.id, lines: o.lines, amount: o.amount, currency: o.currency, status: o.status, payment: o.payment });

  function ownedOrder(customer: string | null, orderId: string): Order | null {
    const order = getOrder(orderId);
    if (!order) return null;
    if (!has('skipOwnership') && order.customer !== customer) return null;
    return order;
  }

  function createOrder(customer: string | null, body: any): Reply {
    if (!customer) return [401, { error: 'missing customer' }];
    const items = body && body.items;
    if (!Array.isArray(items) || !items.length || items.length > 20) return [400, { error: 'items required' }];
    let amount = 0;
    const lines: Line[] = [];
    for (const item of items) {
      const product = CATALOG[item && item.sku];
      if (!product || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) return [400, { error: 'invalid item' }];
      const price = has('trustClientAmount') && Number.isInteger(item.price) ? item.price : product.price;
      amount += price * item.qty;
      lines.push({ sku: item.sku, qty: item.qty, price });
    }
    const order: Order = { id: nextId('ord'), customer, lines, amount, currency: CURRENCY, status: 'awaiting_payment', payment: null };
    sql.insertOrder.run(order.id, customer, JSON.stringify(lines), amount, CURRENCY, order.status);
    log(`order.created order=${order.id} amount=${amount}`);
    return [201, view(order)];
  }

  function createPayment(customer: string | null, orderId: string): Reply {
    return transaction(() => {
      const order = ownedOrder(customer, orderId);
      if (!order) return [404, { error: 'order not found' }];
      if (order.payment) return [200, getPayment(order.payment)];
      if (order.status !== 'awaiting_payment') return [409, { error: 'order not payable' }];
      const payment: Payment = { id: nextId('pay'), order: order.id, amount: order.amount, currency: order.currency, status: 'requires_payment' };
      sql.insertPayment.run(payment.id, payment.order, payment.amount, payment.currency, payment.status);
      sql.orderPayment.run(payment.id, order.id);
      return [201, payment];
    });
  }

  // Records the verified event and, for a matching success, the payment and a fulfillment job,
  // all in one transaction. The job runs afterwards, so a crash in fulfillment loses nothing.
  function acceptEvent(event: any, rawBody: string): Reply {
    if (!has('noIdempotency') && sql.seenEvent.get(event.id)) return [200, { received: true, duplicate: true }];
    sql.recordEvent.run(event.id, now(), has('storeRawEvents') ? rawBody : null);

    const { payment_id, order_id, amount, currency } = event.data;
    const payment = getPayment(payment_id);
    if (!payment) return [200, { received: true, ignored: 'unknown payment' }];

    // Binding: the order is the one this payment was created for, never an ID taken from the event.
    const order = getOrder(has('skipOrderMatch') ? order_id : payment.order);
    if (!order) return [200, { received: true, ignored: 'unknown order' }];
    if (!has('skipOrderMatch') && (order_id !== order.id || payment.amount !== order.amount)) {
      return [200, { received: true, ignored: 'order mismatch' }];
    }
    if (!has('skipAmountMatch') && (amount !== order.amount || currency !== order.currency)) {
      return [200, { received: true, ignored: 'amount mismatch' }];
    }

    // Lifecycle: a refund is final. It reverses the fulfillment and blocks a success that arrives late.
    if (event.type === 'payment.refunded' && !has('ignoreRefunds')) {
      sql.paymentStatus.run('refunded', payment.id);
      sql.cancelJobs.run(order.id);
      sql.revoke.run(now(), order.id);
      sql.orderStatus.run('refunded', order.id);
      audit('refunded', { order: order.id, payment: payment.id, event: event.id });
      return [200, { received: true, refunded: order.id }];
    }

    const succeeded = event.type === 'payment.succeeded' || (has('fulfillOnAnyStatus') && event.type !== 'payment.refunded');
    if (!succeeded) {
      if (event.type === 'payment.failed') {
        // A failure only settles a payment that is still open; events can arrive out of order.
        if (payment.status === 'requires_payment') {
          sql.paymentStatus.run('failed', payment.id);
          audit('payment-failed', { order: order.id, payment: payment.id, event: event.id });
        } else if (has('lastEventWins') && payment.status === 'succeeded') {
          sql.paymentStatus.run('failed', payment.id);
          sql.cancelJobs.run(order.id);
          sql.revoke.run(now(), order.id);
          sql.orderStatus.run('awaiting_payment', order.id);
          audit('payment-failed', { order: order.id, payment: payment.id, event: event.id });
        }
      }
      return [200, { received: true, ignored: 'not a success event' }];
    }
    if (payment.status === 'refunded') return [200, { received: true, ignored: 'payment refunded' }];
    return markPaid(order, payment, event.id);
  }

  function markPaid(order: Order, payment: Payment, eventId: string): Reply {
    sql.paymentStatus.run('succeeded', payment.id);
    if (!has('noIdempotency') && order.status !== 'awaiting_payment') return [200, { received: true, duplicate: true }];
    sql.orderStatus.run('paid', order.id);
    sql.enqueue.run(order.id, payment.id, eventId);
    audit('paid', { order: order.id, payment: payment.id, event: eventId });
    return [200, { received: true, queued: order.id }];
  }

  // Runs pending fulfillment jobs. Each job's record and completion commit together; the
  // unique index makes a retried job a no-op if an earlier attempt already recorded it.
  function drainOutbox(): { done: number; failed: number } {
    let done = 0;
    let failed = 0;
    for (const job of sql.pending.all() as unknown as OutboxJob[]) {
      try {
        onFulfill?.(job);
        transaction(() => {
          sql.fulfill.run(job.order, job.payment, job.event);
          sql.orderStatus.run('fulfilled', job.order);
          sql.jobDone.run(job.id);
          audit('fulfilled', { order: job.order, payment: job.payment, event: job.event });
        });
        log(`fulfillment.done order=${job.order}`);
        done++;
      } catch (err) {
        sql.jobFailed.run(String((err as Error)?.message ?? err), has('dropFailedJobs') ? 'failed' : 'pending', job.id);
        log(`fulfillment.failed order=${job.order} attempt=${job.attempts + 1}`);
        failed++;
      }
    }
    return { done, failed };
  }

  // Recovery for dropped events: asks the provider about every order still waiting on a payment
  // and applies the same amount and currency match a webhook would get. Safe to run repeatedly.
  function reconcile(): { recovered: number } {
    if (!lookupPayment || has('noReconciliation')) return { recovered: 0 };
    let recovered = 0;
    for (const { id } of sql.unpaid.all() as { id: string }[]) {
      recovered += transaction(() => {
        const order = getOrder(id);
        const payment = order && getPayment(order.payment);
        if (!order || !payment || order.status !== 'awaiting_payment') return 0;
        const remote = lookupPayment(payment.id);
        if (!remote || remote.status !== 'succeeded') return 0;
        if (remote.amount !== order.amount || remote.currency !== order.currency) return 0;
        markPaid(order, payment, `reconcile:${payment.id}`);
        return 1;
      });
    }
    drainOutbox();
    return { recovered };
  }

  function handleWebhook(rawBody: string, signature: unknown): Reply {
    if (has('logRawEvents')) log(`webhook.payload ${rawBody}`);
    if (!has('skipSignature') && !verify(rawBody, signature, secret, now())) {
      // Nothing in an unverified body is trusted, so the entry names no order.
      if (!has('silentRejections')) audit('event-rejected');
      log('webhook.rejected reason=invalid-signature' + (has('logSecret') ? ` secret=${secret}` : ''));
      return [400, has('leakSecretInErrors') ? { error: 'invalid signature', debug: { secret } } : { error: 'invalid signature' }];
    }
    let event: any;
    try { event = JSON.parse(rawBody); } catch { return [400, { error: 'invalid json' }]; }
    if (!event || typeof event.id !== 'string' || !event.data || typeof event.data !== 'object') return [400, { error: 'invalid event' }];

    const reply = transaction(() => acceptEvent(event, rawBody));
    const { queued, refunded, duplicate } = reply[1] as { queued?: string; refunded?: string; duplicate?: boolean };
    // The event ID is logged as JSON so a crafted ID can't forge a second log line.
    log(`webhook.accepted event=${JSON.stringify(event.id)} outcome=${queued ? 'queued' : refunded ? 'refunded' : duplicate ? 'duplicate' : 'ignored'}`);
    if (!queued) return reply;
    drainOutbox();
    const job = sql.jobStatus.get(event.id) as { status: string } | undefined;
    return [200, job?.status === 'done' ? { received: true, fulfilled: queued } : { received: true, queued }];
  }

  const fulfillments = (orderId?: string) =>
    ((orderId === undefined ? sql.countAll.get() : sql.countOrder.get(orderId)) as { n: number }).n;
  // Fulfillments still in force: not reversed by a refund.
  const activeFulfillments = (orderId: string) => (sql.countActive.get(orderId) as { n: number }).n;
  const auditTrail = () => sql.auditTrail.all() as unknown as AuditEntry[];
  // Every stored row as text, for inspecting what the checkout retains.
  function dump(): string[] {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
    return tables.flatMap(({ name }) => db.prepare(`SELECT * FROM "${name}"`).all().map(row => `${name} ${JSON.stringify(row)}`));
  }

  // Jobs left pending by a crash or failed side effect are picked up on start.
  drainOutbox();

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const send = ([status, body]: Reply) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);
      const header = req.headers['x-lab-customer'];
      const customer = typeof header === 'string' && header ? header : null;
      const raw = await readBody(req);
      const json = () => { try { return JSON.parse(raw); } catch { throw new HttpError(400, 'invalid json'); } };

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
      send(err instanceof HttpError ? [err.status, { error: err.message }] : [500, { error: 'internal error' }]);
    }
  }

  return { handle, drainOutbox, reconcile, fulfillments, activeFulfillments, auditTrail, dump, close: () => db.close() };
}
