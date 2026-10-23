import { AppError } from './errors';
import { toPosPayload, type FakePos } from './pos';
import type { OrderStore } from './store';
import type { Order, OrderInput, PaymentEvent } from './types';

export type PaymentResult = { result: 'created' | 'duplicate'; order: Order };
export type SyncResult = { result: 'synced' | 'already_synced'; order: Order };

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
  constructor(
    private store: OrderStore,
    private pos: FakePos,
  ) {}

  getOrder(id: string): Order {
    const order = this.store.get(id);
    if (!order) throw new AppError(404, 'order_not_found', `Order ${id} not found`);
    return order;
  }

  // Idempotent on order ID: a second event for the same order (same or
  // different event ID) never creates a second order or POS transaction.
  async receivePayment(event: PaymentEvent): Promise<PaymentResult> {
    const existing = this.store.get(event.order.id);

    if (existing) {
      if (!sameOrderData(existing, event.order)) {
        throw new AppError(409, 'order_conflict', `Order ${existing.id} already exists with different data`);
      }
      if (!existing.eventIds.includes(event.eventId)) {
        existing.eventIds.push(event.eventId);
        existing.updatedAt = now();
      }
      // Duplicates never call the POS. A failed sync is retried via POST /orders/:id/sync.
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
    this.store.insert(order); // the payment is recorded before the POS is tried
    await this.attemptPosSync(order); // a POS failure is stored on the order, not thrown
    return { result: 'created', order };
  }

  async syncOrder(id: string): Promise<SyncResult> {
    const order = this.getOrder(id);

    if (order.pos.status === 'synced') return { result: 'already_synced', order };
    if (order.pos.status === 'syncing') {
      throw new AppError(409, 'sync_in_progress', `A POS sync for order ${id} is already running`, { order });
    }

    const synced = await this.attemptPosSync(order);
    if (!synced) {
      throw new AppError(502, 'pos_sync_failed', `POS sync failed: ${order.pos.lastError}`, { order });
    }
    return { result: 'synced', order };
  }

  // The only place the POS is called. Returns true if the order is synced.
  // The status is the lock: checking it and setting 'syncing' happen with no
  // await in between, so Node runs them as one step and no other request can
  // claim the same order while a POS call is in flight.
  private async attemptPosSync(order: Order): Promise<boolean> {
    if (order.pos.status !== 'pending' && order.pos.status !== 'failed') {
      return order.pos.status === 'synced';
    }
    order.pos.status = 'syncing';
    order.pos.attempts += 1;
    order.updatedAt = now();

    try {
      order.pos.reference = await this.pos.createTransaction(toPosPayload(order));
      order.pos.status = 'synced';
      order.pos.lastError = null;
      return true;
    } catch (err) {
      order.pos.status = 'failed';
      order.pos.lastError = err instanceof Error ? err.message : 'Unknown POS error';
      return false;
    } finally {
      order.updatedAt = now();
    }
  }
}
