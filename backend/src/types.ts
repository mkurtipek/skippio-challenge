// All money values are integer cents (1200 = EUR 12.00).

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number; // per item
}

export interface OrderInput {
  id: string;
  venueId: string;
  currency: 'EUR';
  items: OrderItem[];
  total: number;
}

export interface PaymentEvent {
  eventId: string;
  type: 'payment.succeeded';
  order: OrderInput;
}

export type PaymentStatus = 'paid';

// pending: paid, POS not tried yet
// syncing: a POS call is in flight (also acts as the lock)
// synced:  POS accepted, reference stored
// failed:  last POS call failed, retry allowed
export type PosStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface Order extends OrderInput {
  eventIds: string[];
  payment: { status: PaymentStatus };
  pos: {
    status: PosStatus;
    attempts: number;
    reference: string | null;
    lastError: string | null;
  };
  createdAt: string;
  updatedAt: string;
}
