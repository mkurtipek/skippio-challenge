// The subset of the backend's response shapes the UI uses (see backend/src/types.ts and pos.ts).
// Money is integer cents.

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface PaymentEvent {
  eventId: string;
  type: 'payment.succeeded';
  order: {
    id: string;
    venueId: string;
    currency: 'EUR';
    items: OrderItem[];
    total: number;
  };
}

export type PosStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface Order {
  id: string;
  venueId: string;
  currency: 'EUR';
  items: OrderItem[];
  total: number;
  eventIds: string[];
  payment: { status: 'paid' | 'refunded'; refund: { amount: number; refundedAt: string } | null };
  pos: { status: PosStatus; attempts: number; reference: string | null; lastError: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface PaymentResult {
  result: 'created' | 'duplicate';
  order: Order;
}

export interface SyncResult {
  result: 'synced' | 'already_synced';
  order: Order;
}

export interface RefundResult {
  result: 'refunded' | 'already_refunded';
  order: Order;
}

export interface PosCall {
  orderReference: string;
  attempt: number;
  outcome: 'accepted' | 'failed';
  reference: string | null;
  at: string;
}

export interface PosTransaction {
  reference: string;
  payload: { venueId: string; orderReference: string; total: number };
  createdAt: string;
}

export interface RefundRecord {
  orderId: string;
  amount: number;
  refundedAt: string;
}

export interface Storage {
  orders: Order[];
  refunds: RefundRecord[];
  pos: { calls: PosCall[]; transactions: PosTransaction[] };
}
