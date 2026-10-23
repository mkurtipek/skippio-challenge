import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { PosOptions } from '../src/pos';
import { makeEvent } from './helpers';

const setup = (pos: PosOptions = {}) => createApp({ pos: { latencyMs: 0, ...pos } });

// An order that is paid and synced with the POS, ready to refund.
async function syncedOrder() {
  const ctx = setup({ failuresBeforeSuccess: 0 });
  await request(ctx.app).post('/payment-events').send(makeEvent());
  return ctx;
}

describe('POST /orders/:orderId/refund', () => {
  it('6a. refunds the full amount and shows it in order lookup', async () => {
    const { app, store } = await syncedOrder();

    const res = await request(app).post('/orders/ord_001/refund');

    expect(res.status).toBe(200);
    expect(res.body.result).toBe('refunded');
    expect(res.body.order.payment.status).toBe('refunded');
    expect(res.body.order.payment.refund.amount).toBe(2650);

    const lookup = await request(app).get('/orders/ord_001');
    expect(lookup.body.payment).toMatchObject({ status: 'refunded', refund: { amount: 2650 } });
    expect(store.listRefunds()).toHaveLength(1);
  });

  it('6b. a repeated refund request does not refund twice', async () => {
    const { app, store } = await syncedOrder();
    const first = await request(app).post('/orders/ord_001/refund');

    const second = await request(app).post('/orders/ord_001/refund');

    expect(second.status).toBe(200);
    expect(second.body.result).toBe('already_refunded');
    expect(second.body.order.payment.refund).toEqual(first.body.order.payment.refund);
    expect(store.listRefunds()).toHaveLength(1);
  });

  it('6c. concurrent refund requests do not refund twice', async () => {
    const { app, store } = await syncedOrder();

    const responses = await Promise.all([
      request(app).post('/orders/ord_001/refund'),
      request(app).post('/orders/ord_001/refund'),
    ]);

    expect(responses.map((r) => r.body.result).sort()).toEqual(['already_refunded', 'refunded']);
    expect(store.listRefunds()).toHaveLength(1);
  });

  it('6d. repeated payment events keep the refunded status', async () => {
    const { app, pos } = await syncedOrder();
    await request(app).post('/orders/ord_001/refund');

    const same = await request(app).post('/payment-events').send(makeEvent());
    const otherId = await request(app).post('/payment-events').send(makeEvent({ eventId: 'evt_002' }));

    expect(same.body.result).toBe('duplicate');
    expect(otherId.body.result).toBe('duplicate');
    const lookup = await request(app).get('/orders/ord_001');
    expect(lookup.body.payment).toMatchObject({ status: 'refunded', refund: { amount: 2650 } });
    expect(pos.transactions).toHaveLength(1);
  });

  it('6e. rejects an unknown order', async () => {
    const { app } = setup();
    const res = await request(app).post('/orders/nope/refund');
    expect(res.status).toBe(404);
  });

  it('6f. rejects an order whose POS sync has not succeeded', async () => {
    const { app, store } = setup(); // first POS attempt fails
    await request(app).post('/payment-events').send(makeEvent());

    const res = await request(app).post('/orders/ord_001/refund');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('refund_not_allowed');
    expect(res.body.order.payment).toEqual({ status: 'paid', refund: null });
    expect(store.listRefunds()).toHaveLength(0);
  });
});
