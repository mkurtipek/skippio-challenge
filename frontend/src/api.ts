import type { Order, PaymentEvent, PaymentResult, Storage, SyncResult } from './types';

// body is kept so the UI can use extra fields, e.g. the current order on a 409/502.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: { order?: Order } | null,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const details = Array.isArray(data?.details) ? `: ${data.details.join('; ')}` : '';
    throw new ApiError(res.status, `${data?.message ?? `Request failed (${res.status})`}${details}`, data);
  }
  return { status: res.status, data: data as T };
}

export const api = {
  sendPaymentEvent: (event: PaymentEvent) => request<PaymentResult>('POST', '/payment-events', event),
  getOrder: (id: string) => request<Order>('GET', `/orders/${encodeURIComponent(id)}`),
  syncOrder: (id: string) => request<SyncResult>('POST', `/orders/${encodeURIComponent(id)}/sync`),
  getStorage: () => request<Storage>('GET', '/debug/storage'),
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Unexpected error');
