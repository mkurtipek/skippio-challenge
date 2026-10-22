import express, { type NextFunction, type Request, type Response } from 'express';
import { AppError } from './errors';
import { OrderService } from './orderService';
import { OrderStore } from './store';
import { validatePaymentEvent } from './validation';

export function createApp() {
  const store = new OrderStore();
  const orders = new OrderService(store);
  const app = express();
  app.use(express.json());

  app.post('/payment-events', (req, res) => {
    const validation = validatePaymentEvent(req.body);
    if (!validation.ok) {
      throw new AppError(400, 'validation_failed', 'Invalid payment event', validation.errors);
    }
    const result = orders.receivePayment(validation.event);
    res.status(result.result === 'created' ? 201 : 200).json(result);
  });

  app.get('/orders/:orderId', (req, res) => {
    res.json(orders.getOrder(req.params.orderId));
  });

  // Read-only view of the in-memory storage for the UI "Storage" page.
  app.get('/debug/storage', (_req, res) => {
    res.json({ orders: store.list() });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Unexpected error' });
  });

  return { app, store };
}
