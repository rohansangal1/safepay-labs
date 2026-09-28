// The interface every subject implements so the same checks run against any integration:
// the reference checkout, an agent-built starter shop or an open-source platform.
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

export type EventType = 'payment.succeeded' | 'payment.failed' | 'payment.processing';

/** A provider-neutral payment event. The adapter renders it in the provider's format. */
export interface NeutralEvent {
  id: string;
  type: EventType;
  payment: string;
  order: string;
  amount: number;
  currency: string;
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

  close(): Promise<void>;
}

/** Opens a fresh, isolated subject. The runner opens one per control. */
export type OpenSubject = () => Promise<SubjectAdapter>;
