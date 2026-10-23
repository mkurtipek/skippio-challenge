import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { formatCents } from '../format';
import type { Storage } from '../types';
import { Badge } from './OrderPanel';

// Live view of the backend's in-memory storage, polled every second.
export function StoragePage() {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.getStorage();
        if (!active) return;
        setStorage(data);
        setError(null);
        setUpdatedAt(new Date().toLocaleTimeString());
      } catch (err) {
        if (active) setError(errorMessage(err));
      }
    };
    load();
    const timer = setInterval(load, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="card">
      <h2>Backend storage</h2>
      <p className="hint">{updatedAt ? `Refreshes every second. Last update ${updatedAt}.` : 'Loading…'}</p>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}

      {storage && (
        <>
          <h3>Orders ({storage.orders.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Venue</th>
                <th className="num">Total</th>
                <th>Payment</th>
                <th>POS</th>
                <th className="num">Attempts</th>
                <th>POS reference</th>
                <th>Event IDs</th>
              </tr>
            </thead>
            <tbody>
              {storage.orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.venueId}</td>
                  <td className="num">{formatCents(o.total)}</td>
                  <td>
                    <Badge status={o.payment.status} />
                  </td>
                  <td>
                    <Badge status={o.pos.status} />
                  </td>
                  <td className="num">{o.pos.attempts}</td>
                  <td>{o.pos.reference ?? '—'}</td>
                  <td>{o.eventIds.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Refunds ({storage.refunds.length})</h3>
          <p className="hint">Every refund issued. One per order means no double refunds.</p>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th className="num">Amount</th>
                <th>Refunded at</th>
              </tr>
            </thead>
            <tbody>
              {storage.refunds.map((r, i) => (
                <tr key={i}>
                  <td>{r.orderId}</td>
                  <td className="num">{formatCents(r.amount)}</td>
                  <td>{new Date(r.refundedAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>POS transactions ({storage.pos.transactions.length})</h3>
          <p className="hint">Accepted sales in the simulated POS. One per order means no duplicates.</p>
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Order</th>
                <th>Venue</th>
                <th className="num">Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {storage.pos.transactions.map((t) => (
                <tr key={t.reference}>
                  <td>{t.reference}</td>
                  <td>{t.payload.orderReference}</td>
                  <td>{t.payload.venueId}</td>
                  <td className="num">{formatCents(t.payload.total)}</td>
                  <td>{new Date(t.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>POS calls ({storage.pos.calls.length})</h3>
          <p className="hint">Every call the POS received, including failures.</p>
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th className="num">Attempt</th>
                <th>Outcome</th>
                <th>Reference</th>
                <th>At</th>
              </tr>
            </thead>
            <tbody>
              {storage.pos.calls.map((c, i) => (
                <tr key={i}>
                  <td>{c.orderReference}</td>
                  <td className="num">{c.attempt}</td>
                  <td>
                    <Badge status={c.outcome} />
                  </td>
                  <td>{c.reference ?? '—'}</td>
                  <td>{new Date(c.at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <details>
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(storage, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
