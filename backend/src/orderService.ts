import { AppError } from './errors';
import type { OrderStore } from './store';
import type { Order, OrderInput, PaymentEvent } from './types';

export type PaymentResult = { result: 'created' | 'duplicate'; order: Order };

const now = () => new Date().toISOString();

// Items are compared in the order supplied.
function sameOrderData(existing: Order, incoming: OrderInput): boolean {
  return (
    existing.venueId === incoming.venueId &&
    existing.currency === incoming.currency &&
    existing.total === incoming.total &&
    existing.items.length === incoming.items.length &&
    existing.items.every(
      (item, i) =>
        item.productId === incoming.items[i].productId &&
        item.quantity === incoming.items[i].quantity &&
        item.price === incoming.items[i].price,
    )
  );
}

export class OrderService {
  constructor(private store: OrderStore) {}

  getOrder(id: string): Order {
    const order = this.store.get(id);
    if (!order) throw new AppError(404, 'order_not_found', `Order ${id} not found`);
    return order;
  }

  // Idempotent on order ID: a second event for the same order (same or
  // different event ID) never creates a second order.
  receivePayment(event: PaymentEvent): PaymentResult {
    const existing = this.store.get(event.order.id);

    if (existing) {
      if (!sameOrderData(existing, event.order)) {
        throw new AppError(409, 'order_conflict', `Order ${existing.id} already exists with different data`);
      }
      if (!existing.eventIds.includes(event.eventId)) {
        existing.eventIds.push(event.eventId);
        existing.updatedAt = now();
      }
      return { result: 'duplicate', order: existing };
    }

    const order: Order = {
      ...event.order,
      eventIds: [event.eventId],
      payment: { status: 'paid' },
      pos: { status: 'pending', attempts: 0, reference: null, lastError: null },
      createdAt: now(),
      updatedAt: now(),
    };
    this.store.insert(order);
    return { result: 'created', order };
  }
}
