import type { Order, Refund } from './types';

export type RefundRecord = Refund & { orderId: string };

// In-memory storage for one backend process. A Map keyed by order ID is the
// "unique constraint": there can only ever be one record per order.
export class OrderStore {
  private orders = new Map<string, Order>();
  // Every refund issued. Kept as a log so a double refund would be visible.
  private refunds: RefundRecord[] = [];

  get(id: string): Order | undefined {
    return this.orders.get(id);
  }

  insert(order: Order): void {
    this.orders.set(order.id, order);
  }

  list(): Order[] {
    return [...this.orders.values()];
  }

  recordRefund(refund: RefundRecord): void {
    this.refunds.push(refund);
  }

  listRefunds(): RefundRecord[] {
    return [...this.refunds];
  }
}
