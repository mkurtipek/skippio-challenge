// Mirrors backend/src/types.ts (response shapes only). Money is integer cents.

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

export interface Order {
  id: string;
  venueId: string;
  currency: 'EUR';
  items: OrderItem[];
  total: number;
  eventIds: string[];
  payment: { status: string };
  pos: { status: string; attempts: number; reference: string | null; lastError: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface PaymentResult {
  result: 'created' | 'duplicate';
  order: Order;
}

export interface Storage {
  orders: Order[];
}
