import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { formatCents } from '../format';
import type { Order } from '../types';

export const Badge = ({ status }: { status: string }) => <span className={`badge ${status}`}>{status}</span>;

export function OrderPanel({ order, onOrder }: { order: Order | null; onOrder: (order: Order | null) => void }) {
  const [lookupId, setLookupId] = useState('ord_001');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the lookup field in sync with the order shown (e.g. after a submit).
  useEffect(() => {
    if (order) setLookupId(order.id);
  }, [order?.id]);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.getOrder(lookupId.trim());
      onOrder(data);
    } catch (err) {
      setError(errorMessage(err));
      onOrder(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h2>Order</h2>

      <form className="inline" onSubmit={lookup}>
        <label>
          Order ID
          <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
        </label>
        <button type="submit" disabled={loading || !lookupId.trim()}>
          {loading ? 'Loading…' : 'Look up'}
        </button>
      </form>

      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}

      {order && (
        <>
          <dl>
            <dt>Order</dt>
            <dd>{order.id}</dd>
            <dt>Venue</dt>
            <dd>{order.venueId}</dd>
            <dt>Payment</dt>
            <dd>
              <Badge status={order.payment.status} />
            </dd>
            <dt>POS</dt>
            <dd>
              <Badge status={order.pos.status} />
            </dd>
            <dt>POS attempts</dt>
            <dd>{order.pos.attempts}</dd>
            <dt>POS reference</dt>
            <dd>{order.pos.reference ?? '—'}</dd>
            {order.pos.lastError && (
              <>
                <dt>Last POS error</dt>
                <dd>{order.pos.lastError}</dd>
              </>
            )}
            <dt>Event IDs</dt>
            <dd>{order.eventIds.join(', ')}</dd>
          </dl>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Qty</th>
                <th className="num">Unit price</th>
                <th className="num">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={i}>
                  <td>{item.productId}</td>
                  <td className="num">{item.quantity}</td>
                  <td className="num">{formatCents(item.price)}</td>
                  <td className="num">{formatCents(item.quantity * item.price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num">
                  <strong>{formatCents(order.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </section>
  );
}
