export function makeEvent(overrides: { eventId?: string; order?: Record<string, unknown> } = {}) {
  return {
    eventId: overrides.eventId ?? 'evt_001',
    type: 'payment.succeeded',
    order: {
      id: 'ord_001',
      venueId: 'venue_001',
      currency: 'EUR',
      items: [
        { productId: 'burger', quantity: 2, price: 1200 },
        { productId: 'water', quantity: 1, price: 250 },
      ],
      total: 2650,
      ...overrides.order,
    },
  };
}
