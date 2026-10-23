import type { Order } from './types';

// The shape the POS expects. Separate from our Order type: the adapter maps between them.
export interface PosPayload {
  venueId: string;
  orderReference: string;
  currency: 'EUR';
  items: { productId: string; quantity: number; unitPrice: number }[];
  total: number;
}

export interface PosTransaction {
  reference: string;
  payload: PosPayload;
  createdAt: string;
}

// Every call the POS received, accepted or not.
export interface PosCall {
  orderReference: string;
  attempt: number;
  outcome: 'accepted' | 'failed';
  reference: string | null;
  at: string;
}

export interface PosOptions {
  latencyMs?: number; // simulated network/processing time
  failuresBeforeSuccess?: number; // per order; 1 = first attempt fails, retry succeeds
}

export function toPosPayload(order: Order): PosPayload {
  return {
    venueId: order.venueId,
    orderReference: order.id,
    currency: order.currency,
    items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.price })),
    total: order.total,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simulated POS. It keeps its own records, separate from our orders, and it does
// NOT deduplicate: every accepted call creates a new transaction. That way a
// duplicate caused by our code shows up here instead of being hidden.
export class FakePos {
  readonly calls: PosCall[] = [];
  readonly transactions: PosTransaction[] = [];
  private attemptsPerOrder = new Map<string, number>();
  private latencyMs: number;
  private failuresBeforeSuccess: number;

  constructor(options: PosOptions = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.failuresBeforeSuccess = options.failuresBeforeSuccess ?? 1;
  }

  async createTransaction(payload: PosPayload): Promise<string> {
    const attempt = (this.attemptsPerOrder.get(payload.orderReference) ?? 0) + 1;
    this.attemptsPerOrder.set(payload.orderReference, attempt);

    await sleep(this.latencyMs);
    const at = new Date().toISOString();

    if (attempt <= this.failuresBeforeSuccess) {
      this.calls.push({ orderReference: payload.orderReference, attempt, outcome: 'failed', reference: null, at });
      throw new Error('POS unavailable (simulated failure)');
    }

    const reference = `pos_txn_${String(this.transactions.length + 1).padStart(4, '0')}`;
    this.transactions.push({ reference, payload, createdAt: at });
    this.calls.push({ orderReference: payload.orderReference, attempt, outcome: 'accepted', reference, at });
    return reference;
  }
}
