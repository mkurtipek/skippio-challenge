import express, { type NextFunction, type Request, type Response } from 'express';
import { AppError } from './errors';
import { OrderService } from './orderService';
import { FakePos, type PosOptions } from './pos';
import { OrderStore } from './store';
import { validatePaymentEvent } from './validation';

export function createApp(options: { pos?: PosOptions } = {}) {
  const store = new OrderStore();
  const pos = new FakePos(options.pos);
  const orders = new OrderService(store, pos);
  const app = express();
  app.use(express.json());

  // 201 created / 200 duplicate. The POS outcome is in order.pos; a POS failure
  // does not fail this request because the payment itself was recorded.
  app.post('/payment-events', async (req, res) => {
    const validation = validatePaymentEvent(req.body);
    if (!validation.ok) {
      throw new AppError(400, 'validation_failed', 'Invalid payment event', { details: validation.errors });
    }
    const result = await orders.receivePayment(validation.event);
    res.status(result.result === 'created' ? 201 : 200).json(result);
  });

  app.get('/orders/:orderId', (req, res) => {
    res.json(orders.getOrder(req.params.orderId));
  });

  // 200 synced / already_synced, 404 unknown, 409 sync in progress, 502 POS failed.
  app.post('/orders/:orderId/sync', async (req, res) => {
    res.json(await orders.syncOrder(req.params.orderId));
  });

  // 200 refunded / already_refunded, 404 unknown, 409 not eligible (POS not synced).
  app.post('/orders/:orderId/refund', (req, res) => {
    res.json(orders.refundOrder(req.params.orderId));
  });

  // Read-only view of the in-memory storage for the UI "Storage" page.
  app.get('/debug/storage', (_req, res) => {
    res.json({
      orders: store.list(),
      refunds: store.listRefunds(),
      pos: { calls: pos.calls, transactions: pos.transactions },
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Route not found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
      return;
    }
    // Errors from express.json(): malformed JSON (400), body too large (413), unsupported charset (415).
    const status = (err as { status?: unknown })?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const invalidJson = status === 400;
      res.status(status).json({
        error: invalidJson ? 'invalid_json' : 'invalid_request',
        message: invalidJson ? 'Request body is not valid JSON' : (err as Error).message,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Unexpected error' });
  });

  return { app, store, pos };
}
