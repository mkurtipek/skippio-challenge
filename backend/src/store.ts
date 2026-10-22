import type { Order } from './types';

// In-memory storage for one backend process. A Map keyed by order ID is the
// "unique constraint": there can only ever be one record per order.
export class OrderStore {
  private orders = new Map<string, Order>();

  get(id: string): Order | undefined {
    return this.orders.get(id);
  }

  insert(order: Order): void {
    this.orders.set(order.id, order);
  }

  list(): Order[] {
    return [...this.orders.values()];
  }
}
