// The interface every subject implements so the same checks run against any integration:
// the reference checkout, an architecture variant or an open-source platform.
// Checks speak in provider-neutral terms; the adapter turns them into the subject's HTTP
// routes and its provider's event format and signature scheme.

export interface Product {
  sku: string;
  /** Server-authoritative unit price in minor units. */
  price: number;
}

export interface OrderRef {
  id: string;
  amount: number;
  currency: string;
}

export interface PaymentRef {
  id: string;
  /** The order this payment was created for. */
  order: string;
  amount: number;
  currency: string;
}

export interface Reply<T = unknown> {
  status: number;
  body: T;
}

/** 'payment.refunded' is a full refund of the payment's amount. */
export type EventType = 'payment.succeeded' | 'payment.failed' | 'payment.processing' | 'payment.refunded';

/** A provider-neutral payment event. The adapter renders it in the provider's format. */
export interface NeutralEvent {
  id: string;
  type: EventType;
  payment: string;
  order: string;
  amount: number;
  currency: string;
  /**
   * Synthetic billing details the provider attaches to the event. The subject needs none of it
   * to fulfill, so none of it should outlive the request. No real provider sends a full card
   * number in an event; it is here as a canary for the data-minimization checks.
   */
  billing?: { email: string; cardNumber: string };
}

/** What the provider holds for one payment. */
export interface LedgerEntry {
  payment: string;
  /** The order the payment was created for. */
  order: string;
  captured: number;
  refunded: number;
  currency: string;
}

/** Provider-neutral names for what an audit trail records. The adapter maps the subject's own. */
export type AuditAction = 'paid' | 'fulfilled' | 'refunded' | 'payment-failed' | 'event-rejected';

export interface AuditEntry {
  action: AuditAction;
  /** Null when the subject could not tie the entry to an order, as for a forged event. */
  order: string | null;
}

/**
 * How a delivery is signed. Everything except 'valid' is an attack the subject must reject.
 * - unsigned: no signature header
 * - wrong-key: signed with a key the merchant doesn't hold
 * - stale: correctly signed, but timestamped an hour ago
 * - tampered: signed, then the body is changed
 */
export type Signing = 'valid' | 'unsigned' | 'wrong-key' | 'stale' | 'tampered';

export interface LineItem {
  sku: string;
  qty: number;
  /** A client-sent price the subject should ignore. */
  price?: number;
}

export interface SubjectAdapter {
  /** Stable subject identifier, used as the evidence prefix. */
  readonly id: string;
  /** The payment provider the subject integrates and the API version it speaks, when known. */
  readonly provider?: { readonly name: string; readonly apiVersion: string };
  /** Two products with different prices, so checks don't hardcode a catalog. */
  readonly products: { readonly standard: Product; readonly cheap: Product };

  createOrder(customer: string, items: LineItem[]): Promise<Reply<OrderRef>>;
  startPayment(customer: string | null, orderId: string): Promise<Reply<PaymentRef>>;
  readOrder(customer: string | null, orderId: string): Promise<Reply>;
  deliver(event: NeutralEvent, signing?: Signing): Promise<Reply>;

  /**
   * Harm-relevant ground truth read from the subject's own state (its fulfillment records),
   * never from HTTP responses. Counts fulfillments for one order, or all when omitted.
   */
  fulfillments(orderId?: string): Promise<number>;
  /** Fulfillments for one order that are still in force: not reversed by a refund or cancellation. */
  activeFulfillments(orderId: string): Promise<number>;

  /**
   * Fault injection and recovery, for subjects the harness can control that far. Checks that
   * need it are unknown, never pass, on a subject that doesn't offer it.
   */
  readonly faults?: {
    /** Makes the fulfillment side effect fail (a crashed worker or downstream outage) until restored. */
    breakFulfillment(): Promise<void>;
    restoreFulfillment(): Promise<void>;
    /** Captures the payment at the provider without delivering any event (a dropped webhook). */
    captureWithoutEvent(payment: PaymentRef): Promise<void>;
    /** Runs whatever the subject does to recover: worker retries, reconciliation jobs. */
    recover(): Promise<void>;
  };

  /**
   * The provider's own record of money moved, for subjects whose provider the harness plays or
   * can query. The harm oracle reads it as ground truth; the subject may query the same record
   * server-to-server when it reconciles.
   */
  readonly ledger?: {
    /** Captures `amount` (the payment's full amount when omitted) without delivering any event. */
    capture(payment: PaymentRef, amount?: number): Promise<void>;
    /** Refunds everything captured for the payment, without delivering any event. */
    refund(payment: PaymentRef): Promise<void>;
    entries(): Promise<LedgerEntry[]>;
  };

  /**
   * What the subject leaves behind, for subjects whose internals the harness can read. Raw
   * artifacts stay inside the check: a check reports a count, never the text it searched.
   * Checks that need this are unknown, never pass, on a subject that doesn't offer it.
   */
  readonly artifacts?: {
    /** Secret values the harness gave the subject (webhook signing secret, API keys), to search for. */
    secrets(): Promise<string[]>;
    /** Every HTTP response the subject has sent the harness so far: status, headers and body as text. */
    responses(): Promise<string[]>;
    /** Application log lines written so far. */
    logs(): Promise<string[]>;
    /** Every row the subject has stored, one serialized row per entry. */
    stored(): Promise<string[]>;
    /** The subject's audit trail, oldest first. Empty when it keeps none. */
    audit(): Promise<AuditEntry[]>;
  };

  close(): Promise<void>;
}

/** Opens a fresh, isolated subject. The runner opens one per control. */
export type OpenSubject = () => Promise<SubjectAdapter>;
