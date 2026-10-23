import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { makeEvent } from './helpers';

let ctx: ReturnType<typeof createApp>;

beforeEach(() => {
  ctx = createApp({ pos: { latencyMs: 0 } });
});

describe('POST /payment-events', () => {
  it('records a valid event as a paid order', async () => {
    const res = await request(ctx.app).post('/payment-events').send(makeEvent());

    expect(res.status).toBe(201);
    expect(res.body.result).toBe('created');
    expect(res.body.order.payment.status).toBe('paid');
    expect(ctx.store.list()).toHaveLength(1);
  });

  it('treats the same event and a different event ID for the same order as duplicates', async () => {
    await request(ctx.app).post('/payment-events').send(makeEvent());
    const same = await request(ctx.app).post('/payment-events').send(makeEvent());
    const otherId = await request(ctx.app).post('/payment-events').send(makeEvent({ eventId: 'evt_002' }));

    expect(same.status).toBe(200);
    expect(same.body.result).toBe('duplicate');
    expect(otherId.status).toBe(200);
    expect(otherId.body.order.eventIds).toEqual(['evt_001', 'evt_002']);
    expect(ctx.store.list()).toHaveLength(1);
  });

  it('trims IDs, so whitespace does not create a second order', async () => {
    await request(ctx.app).post('/payment-events').send(makeEvent());
    const res = await request(ctx.app)
      .post('/payment-events')
      .send(makeEvent({ eventId: ' evt_002 ', order: { id: ' ord_001 ' } }));

    expect(res.status).toBe(200);
    expect(res.body.order.eventIds).toEqual(['evt_001', 'evt_002']);
    expect(ctx.store.list()).toHaveLength(1);
    expect(ctx.pos.calls).toHaveLength(1);
  });

  it('rejects an invalid total for an existing order without changing it or its POS record', async () => {
    await request(ctx.app).post('/payment-events').send(makeEvent());
    const before = structuredClone(ctx.store.get('ord_001'));

    const res = await request(ctx.app)
      .post('/payment-events')
      .send(makeEvent({ eventId: 'evt_002', order: { total: 9999 } }));

    expect(res.status).toBe(400);
    expect(ctx.store.get('ord_001')).toEqual(before);
    expect(ctx.pos.calls).toHaveLength(1);
  });

  it('rejects an invalid total without creating an order', async () => {
    const res = await request(ctx.app).post('/payment-events').send(makeEvent({ order: { total: 9999 } }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
    expect(ctx.store.list()).toHaveLength(0);
  });

  it('rejects bad field values', async () => {
    const res = await request(ctx.app)
      .post('/payment-events')
      .send(makeEvent({ order: { venueId: ' ', currency: 'USD', items: [{ productId: 'x', quantity: 1.5, price: -1 }] } }));

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([
      'order.venueId is required',
      'order.currency must be "EUR"',
      'order.items[0].quantity must be a positive integer',
      'order.items[0].price must be a non-negative integer (cents)',
    ]);
  });

  it('rejects conflicting data for an existing order without changing it', async () => {
    await request(ctx.app).post('/payment-events').send(makeEvent());
    const before = structuredClone(ctx.store.get('ord_001'));

    const res = await request(ctx.app)
      .post('/payment-events')
      .send(
        makeEvent({
          eventId: 'evt_002',
          order: { items: [{ productId: 'burger', quantity: 1, price: 1200 }], total: 1200 },
        }),
      );

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('order_conflict');
    expect(ctx.store.get('ord_001')).toEqual(before);
  });
});

describe('request errors', () => {
  it('returns JSON errors for malformed JSON, an oversized body and unknown routes', async () => {
    const malformed = await request(ctx.app).post('/payment-events').set('Content-Type', 'application/json').send('{oops');
    const tooLarge = await request(ctx.app)
      .post('/payment-events')
      .send({ ...makeEvent(), padding: 'x'.repeat(200_000) });
    const unknown = await request(ctx.app).get('/nope');

    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('invalid_json');
    expect(tooLarge.status).toBe(413);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('not_found');
  });
});

describe('GET /orders/:orderId', () => {
  it('returns the order', async () => {
    await request(ctx.app).post('/payment-events').send(makeEvent());
    const res = await request(ctx.app).get('/orders/ord_001');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2650);
  });

  it('returns 404 for an unknown order', async () => {
    const res = await request(ctx.app).get('/orders/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('order_not_found');
  });
});
