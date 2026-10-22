import type { OrderItem, PaymentEvent } from './types';

type Result = { ok: true; event: PaymentEvent } | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isPositiveInt = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const isNonNegativeInt = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

export function validatePaymentEvent(body: unknown): Result {
  if (!isObject(body)) return { ok: false, errors: ['body must be a JSON object'] };
  const errors: string[] = [];

  if (!isNonEmptyString(body.eventId)) errors.push('eventId is required');
  if (body.type !== 'payment.succeeded') errors.push('type must be "payment.succeeded"');

  const order = body.order;
  if (!isObject(order)) return { ok: false, errors: [...errors, 'order is required'] };

  if (!isNonEmptyString(order.id)) errors.push('order.id is required');
  if (!isNonEmptyString(order.venueId)) errors.push('order.venueId is required');
  if (order.currency !== 'EUR') errors.push('order.currency must be "EUR"');
  if (!isNonNegativeInt(order.total)) errors.push('order.total must be a non-negative integer (cents)');

  if (!Array.isArray(order.items) || order.items.length === 0) {
    errors.push('order.items must contain at least one item');
  } else {
    order.items.forEach((item: unknown, i: number) => {
      if (!isObject(item)) {
        errors.push(`order.items[${i}] must be an object`);
        return;
      }
      if (!isNonEmptyString(item.productId)) errors.push(`order.items[${i}].productId is required`);
      if (!isPositiveInt(item.quantity)) errors.push(`order.items[${i}].quantity must be a positive integer`);
      if (!isNonNegativeInt(item.price)) errors.push(`order.items[${i}].price must be a non-negative integer (cents)`);
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  // Copy only known fields so unexpected input is never stored.
  const items: OrderItem[] = (order.items as OrderItem[]).map(({ productId, quantity, price }) => ({
    productId,
    quantity,
    price,
  }));
  const calculated = items.reduce((sum, i) => sum + i.quantity * i.price, 0);
  if (calculated !== order.total) {
    return { ok: false, errors: [`order.total ${order.total} does not match calculated total ${calculated}`] };
  }

  return {
    ok: true,
    event: {
      eventId: body.eventId as string,
      type: 'payment.succeeded',
      order: {
        id: order.id as string,
        venueId: order.venueId as string,
        currency: 'EUR',
        items,
        total: calculated,
      },
    },
  };
}
