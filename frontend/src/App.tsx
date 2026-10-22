import { useState } from 'react';
import { OrderPanel } from './components/OrderPanel';
import { PaymentForm } from './components/PaymentForm';
import { StoragePage } from './components/StoragePage';
import type { Order } from './types';

type Tab = 'payments' | 'storage';

export function App() {
  const [tab, setTab] = useState<Tab>('payments');
  const [order, setOrder] = useState<Order | null>(null);

  return (
    <main>
      <header>
        <h1>Skippio POS sync</h1>
        <nav>
          <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
            Payments
          </button>
          <button className={tab === 'storage' ? 'active' : ''} onClick={() => setTab('storage')}>
            Storage
          </button>
        </nav>
      </header>

      {tab === 'payments' ? (
        <div className="grid">
          <PaymentForm onOrder={setOrder} />
          <OrderPanel order={order} onOrder={setOrder} />
        </div>
      ) : (
        <StoragePage />
      )}
    </main>
  );
}
