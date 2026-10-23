import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { eurosToCents, formatCents } from '../format';
import type { Order, PaymentEvent } from '../types';
import { FeedbackMessage, type Feedback } from './Feedback';

type ItemRow = { productId: string; quantity: string; price: string }; // price typed in euros

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function PaymentForm({ onOrder }: { onOrder: (order: Order) => void }) {
  const [eventId, setEventId] = useState('evt_001');
  const [orderId, setOrderId] = useState('ord_001');
  const [venueId, setVenueId] = useState('venue_001');
  const [items, setItems] = useState<ItemRow[]>([
    { productId: 'burger', quantity: '2', price: '12.00' },
    { productId: 'water', quantity: '1', price: '2.50' },
  ]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // The API payload is built from form values; money is converted to cents here.
  const payloadItems = items.map((row) => ({
    productId: row.productId.trim(),
    quantity: Number(row.quantity),
    price: eurosToCents(row.price),
  }));
  const total = payloadItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const updateItem = (index: number, field: keyof ItemRow, value: string) =>
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const event: PaymentEvent = {
      eventId: eventId.trim(),
      type: 'payment.succeeded',
      order: { id: orderId.trim(), venueId: venueId.trim(), currency: 'EUR', items: payloadItems, total },
    };

    setLoading(true);
    setFeedback(null);
    try {
      const { data } = await api.sendPaymentEvent(event);
      const { id, pos } = data.order;
      if (data.result === 'duplicate') {
        setFeedback({ kind: 'success', text: `Duplicate event. Order ${id} already exists, nothing new was created.` });
      } else if (pos.status === 'synced') {
        setFeedback({ kind: 'success', text: `Payment recorded and POS synced (${pos.reference}).` });
      } else {
        // Payment and POS outcomes are separate: the payment is safe even if the POS failed.
        setFeedback({ kind: 'warning', text: `Payment recorded, but POS sync failed: ${pos.lastError}. Retry from the order panel.` });
      }
      onOrder(data.order);
    } catch (err) {
      setFeedback({ kind: 'error', text: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    // noValidate: the backend is the single source of validation errors, shown below the form.
    <form className="card" onSubmit={submit} noValidate>
      <h2>Payment event</h2>

      <div className="fields">
        <div className="field">
          <label htmlFor="eventId">Event ID</label>
          <span className="inline">
            <input id="eventId" value={eventId} onChange={(e) => setEventId(e.target.value)} />
            <button type="button" aria-label="New event ID" onClick={() => setEventId(newId('evt'))}>
              New
            </button>
          </span>
        </div>
        <label>
          Event type
          <input value="payment.succeeded" readOnly />
        </label>
        <div className="field">
          <label htmlFor="orderId">Order ID</label>
          <span className="inline">
            <input id="orderId" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            <button
              type="button"
              aria-label="New order ID"
              onClick={() => {
                setOrderId(newId('ord'));
                setEventId(newId('evt'));
              }}
            >
              New
            </button>
          </span>
        </div>
        <label>
          Venue ID
          <input value={venueId} onChange={(e) => setVenueId(e.target.value)} />
        </label>
        <label>
          Currency
          <input value="EUR" readOnly />
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product ID</th>
            <th>Quantity</th>
            <th>Unit price (EUR)</th>
            <th className="num">Line total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((row, i) => {
            const line = payloadItems[i].quantity * payloadItems[i].price;
            return (
              <tr key={i}>
                <td>
                  <input
                    aria-label={`Item ${i + 1} product ID`}
                    value={row.productId}
                    onChange={(e) => updateItem(i, 'productId', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Item ${i + 1} quantity`}
                    type="number"
                    min="1"
                    step="1"
                    value={row.quantity}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Item ${i + 1} unit price in euros`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.price}
                    onChange={(e) => updateItem(i, 'price', e.target.value)}
                  />
                </td>
                <td className="num">{Number.isFinite(line) ? formatCents(line) : '—'}</td>
                <td>
                  <button
                    type="button"
                    disabled={items.length === 1}
                    onClick={() => setItems((rows) => rows.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>
              <button
                type="button"
                onClick={() => setItems((rows) => [...rows, { productId: '', quantity: '1', price: '0.00' }])}
              >
                Add item
              </button>
            </td>
            <td className="num">
              <strong>{Number.isFinite(total) ? formatCents(total) : '—'}</strong>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      <div className="actions">
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Sending…' : 'Send payment event'}
        </button>
        <span className="hint">Send again to test duplicates. The simulated POS fails each order's first attempt.</span>
      </div>

      <FeedbackMessage feedback={feedback} />
    </form>
  );
}
