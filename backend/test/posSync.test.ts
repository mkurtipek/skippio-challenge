import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { PosOptions } from '../src/pos';
import { makeEvent } from './helpers';

const setup = (pos: PosOptions = {}) => createApp({ pos: { latencyMs: 20, ...pos } });

describe('POS sync', () => {
  it('1. valid event -> paid order and one POS transaction', async () => {
    const { app, pos } = setup({ failuresBeforeSuccess: 0 });

    const res = await request(app).post('/payment-events').send(makeEvent());

    expect(res.status).toBe(201);
    expect(res.body.order.payment.status).toBe('paid');
    expect(res.body.order.pos).toMatchObject({ status: 'synced', attempts: 1, reference: 'pos_txn_0001' });
    expect(pos.transactions).toHaveLength(1);
    expect(pos.transactions[0].payload).toEqual({
      venueId: 'venue_001',
      orderReference: 'ord_001',
      currency: 'EUR',
      items: [
        { productId: 'burger', quantity: 2, unitPrice: 1200 },
        { productId: 'water', quantity: 1, unitPrice: 250 },
      ],
      total: 2650,
    });
  });

  it('2. duplicate delivery, including a different event ID -> no duplicate transaction', async () => {
    const { app, pos } = setup({ failuresBeforeSuccess: 0 });

    await request(app).post('/payment-events').send(makeEvent());
    const same = await request(app).post('/payment-events').send(makeEvent());
    const otherId = await request(app).post('/payment-events').send(makeEvent({ eventId: 'evt_002' }));

    expect(same.body.result).toBe('duplicate');
    expect(otherId.body.result).toBe('duplicate');
    expect(pos.calls).toHaveLength(1);
    expect(pos.transactions).toHaveLength(1);
  });

  it('3a. overlapping payment events -> one POS call, and the calls really overlap', async () => {
    const { app, pos } = setup({ failuresBeforeSuccess: 0, latencyMs: 100 });

    const responses = await Promise.all([
      request(app).post('/payment-events').send(makeEvent()),
      request(app).post('/payment-events').send(makeEvent({ eventId: 'evt_002' })),
    ]);

    const created = responses.find((r) => r.status === 201)!;
    const duplicate = responses.find((r) => r.status === 200)!;
    expect(created.body.order.pos.status).toBe('synced');
    // Proof of overlap: the duplicate was answered while the first POS call was still in flight.
    expect(duplicate.body.order.pos.status).toBe('syncing');
    expect(pos.calls).toHaveLength(1);
    expect(pos.transactions).toHaveLength(1);
  });

  it('3b. overlapping retries -> one POS call, the other gets 409', async () => {
    const { app, pos } = setup({ latencyMs: 100 }); // first attempt fails
    await request(app).post('/payment-events').send(makeEvent());

    const responses = await Promise.all([
      request(app).post('/orders/ord_001/sync'),
      request(app).post('/orders/ord_001/sync'),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const inProgress = responses.find((r) => r.status === 409)!;
    expect(inProgress.body.error).toBe('sync_in_progress');
    expect(inProgress.body.order.pos.status).toBe('syncing');
    expect(pos.transactions).toHaveLength(1);
    expect(pos.calls).toHaveLength(2); // the failed first attempt + one retry
  });

  it('4. failed POS attempt -> payment kept; retry succeeds; retry after success adds nothing', async () => {
    const { app, pos } = setup(); // deterministic first-attempt failure

    const created = await request(app).post('/payment-events').send(makeEvent());
    expect(created.status).toBe(201);
    expect(created.body.order.payment.status).toBe('paid');
    expect(created.body.order.pos).toMatchObject({ status: 'failed', attempts: 1, reference: null });
    expect(created.body.order.pos.lastError).toMatch(/POS unavailable/);
    expect(pos.transactions).toHaveLength(0);

    const lookup = await request(app).get('/orders/ord_001');
    expect(lookup.body.payment.status).toBe('paid');
    expect(lookup.body.pos.status).toBe('failed');

    const retry = await request(app).post('/orders/ord_001/sync');
    expect(retry.status).toBe(200);
    expect(retry.body.result).toBe('synced');
    expect(retry.body.order.pos).toMatchObject({ status: 'synced', attempts: 2, reference: 'pos_txn_0001', lastError: null });

    const again = await request(app).post('/orders/ord_001/sync');
    expect(again.status).toBe(200);
    expect(again.body.result).toBe('already_synced');
    expect(again.body.order.pos.attempts).toBe(2);
    expect(pos.calls).toHaveLength(2);
    expect(pos.transactions).toHaveLength(1);
  });

  it('a retry that fails again returns 502 and keeps the order paid', async () => {
    const { app, pos } = setup({ failuresBeforeSuccess: 2 });
    await request(app).post('/payment-events').send(makeEvent());

    const retry = await request(app).post('/orders/ord_001/sync');

    expect(retry.status).toBe(502);
    expect(retry.body.error).toBe('pos_sync_failed');
    expect(retry.body.order.payment.status).toBe('paid');
    expect(retry.body.order.pos).toMatchObject({ status: 'failed', attempts: 2 });
    expect(pos.transactions).toHaveLength(0);
  });

  it('5. conflicting data for a synced order -> rejected, order and POS records unchanged', async () => {
    const { app, store, pos } = setup({ failuresBeforeSuccess: 0 });
    await request(app).post('/payment-events').send(makeEvent());
    const before = structuredClone(store.get('ord_001'));

    const res = await request(app)
      .post('/payment-events')
      .send(makeEvent({ eventId: 'evt_002', order: { items: [{ productId: 'burger', quantity: 1, price: 1200 }], total: 1200 } }));

    expect(res.status).toBe(409);
    expect(store.get('ord_001')).toEqual(before);
    expect(pos.calls).toHaveLength(1);
    expect(pos.transactions).toHaveLength(1);
  });

  it('sync of an unknown order -> 404', async () => {
    const { app, pos } = setup();
    const res = await request(app).post('/orders/nope/sync');
    expect(res.status).toBe(404);
    expect(pos.calls).toHaveLength(0);
  });
});
