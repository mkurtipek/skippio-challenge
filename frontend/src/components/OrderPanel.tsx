import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, errorMessage } from '../api';
import { formatCents } from '../format';
import type { Order } from '../types';
import { FeedbackMessage, type Feedback } from './Feedback';

export const Badge = ({ status }: { status: string }) => <span className={`badge ${status}`}>{status}</span>;

export function OrderPanel({ order, onOrder }: { order: Order | null; onOrder: (order: Order | null) => void }) {
  const [lookupId, setLookupId] = useState('ord_001');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'sync' | 'refund' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // When a different order is shown (e.g. after a submit), sync the field and clear old messages.
  useEffect(() => {
    if (order) {
      setLookupId(order.id);
      setFeedback(null);
    }
  }, [order?.id]);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const { data } = await api.getOrder(lookupId.trim());
      onOrder(data);
    } catch (err) {
      setFeedback({ kind: 'error', text: errorMessage(err) });
      onOrder(null);
    } finally {
      setLoading(false);
    }
  }

  async function retrySync() {
    if (!order) return;
    setBusy('sync');
    setFeedback(null);
    try {
      const { data } = await api.syncOrder(order.id);
      onOrder(data.order);
      setFeedback({
        kind: 'success',
        text:
          data.result === 'synced'
            ? `POS accepted the order (${data.order.pos.reference}).`
            : 'Already synced. No new POS transaction was created.',
      });
    } catch (err) {
      // 409 / 502 responses carry the current order, so the panel stays accurate.
      if (err instanceof ApiError && err.body?.order) onOrder(err.body.order);
      setFeedback({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  // Test helper: the brief puts a refund UI out of scope. The button is always
  // enabled so the backend's answers (refunded, already refunded, not allowed) can all be seen.
  async function refund() {
    if (!order) return;
    setBusy('refund');
    setFeedback(null);
    try {
      const { data } = await api.refundOrder(order.id);
      onOrder(data.order);
      setFeedback({
        kind: 'success',
        text:
          data.result === 'refunded'
            ? `Refunded ${formatCents(data.order.payment.refund!.amount)}.`
            : 'Already refunded. Nothing changed.',
      });
    } catch (err) {
      if (err instanceof ApiError && err.body?.order) onOrder(err.body.order);
      setFeedback({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const canRetry = order !== null && (order.pos.status === 'failed' || order.pos.status === 'pending');

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
            {order.payment.refund && (
              <>
                <dt>Refunded</dt>
                <dd>
                  {formatCents(order.payment.refund.amount)} at {new Date(order.payment.refund.refundedAt).toLocaleString()}
                </dd>
              </>
            )}
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

          <div className="actions">
            <button type="button" className="primary" onClick={retrySync} disabled={!canRetry || busy !== null}>
              {busy === 'sync' ? 'Retrying…' : 'Retry POS sync'}
            </button>
            <button type="button" onClick={refund} disabled={busy !== null}>
              {busy === 'refund' ? 'Refunding…' : 'Refund (test)'}
            </button>
          </div>
          <p className="hint">
            Retry is available when the POS sync has failed. Refund (test) always calls the API, so you can also see
            its rejections.
          </p>
        </>
      )}

      <FeedbackMessage feedback={feedback} />

      {order && (
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
      )}
    </section>
  );
}
