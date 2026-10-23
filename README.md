# Skippio POS sync

Receives payment confirmations, records paid orders, registers them with a simulated POS, and provides a small UI to inspect and retry the flow.

- `backend/`: Node.js, Express, TypeScript. In-memory storage, one process.
- `frontend/`: React, Vite, TypeScript. Talks to the backend over HTTP only.

## Run

Requires Node 22.12+.

```bash
npm install
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:5173 (Vite proxies /api/* to the backend)
npm test               # backend tests (24)
npm run typecheck      # both apps
```

Restarting the backend clears all data.

## API

| Endpoint | Responses |
|---|---|
| `POST /payment-events` | `201 created`, `200 duplicate`, `400 validation_failed` / `invalid_json`, `409 order_conflict` |
| `GET /orders/:orderId` | `200` order, `404 order_not_found` |
| `POST /orders/:orderId/sync` | `200 synced` / `already_synced`, `404`, `409 sync_in_progress`, `502 pos_sync_failed` |
| `POST /orders/:orderId/refund` | `200 refunded` / `already_refunded`, `404`, `409 refund_not_allowed` |
| `GET /debug/storage` | Dev-only view of orders, refunds and POS records (used by the Storage page) |

`POST /payment-events` returns 201/200 even when the POS call fails: the payment is recorded either way. The POS outcome is in `order.pos`. `sync_in_progress`, `pos_sync_failed` and `refund_not_allowed` responses include the current `order`. All errors are JSON (`{ error, message }`), including unknown routes and body errors such as an oversized request (413).

## Demo

### Failure and retry (UI)

1. Open http://localhost:5173 and click **Send payment event** with the default values.
2. The form shows "Payment recorded, but POS sync failed". The order panel shows payment `paid`, POS `failed`, 1 attempt. The simulated POS fails the first attempt for every order.
3. Click **Retry POS sync**. POS becomes `synced` with reference `pos_txn_0001`, 2 attempts. The button disables.
4. Click **Send payment event** again, then click **New** next to Event ID and send again. Both are reported as duplicates.
5. Open **Storage**: 1 order, 1 POS transaction, 2 POS calls (one failed, one accepted).

### Refund (curl; no refund UI by design)

On a freshly started backend:

```bash
curl -X POST localhost:3001/payment-events -H 'Content-Type: application/json' -d '{
  "eventId": "evt_001", "type": "payment.succeeded",
  "order": { "id": "ord_001", "venueId": "venue_001", "currency": "EUR",
    "items": [ { "productId": "burger", "quantity": 2, "price": 1200 },
               { "productId": "water", "quantity": 1, "price": 250 } ],
    "total": 2650 } }'                                # 201, pos.status "failed"
curl -X POST localhost:3001/orders/ord_001/refund   # 409 refund_not_allowed (POS not synced)
curl -X POST localhost:3001/orders/ord_001/sync     # 200 synced
curl -X POST localhost:3001/orders/ord_001/refund   # 200 refunded, refund.amount 2650
curl -X POST localhost:3001/orders/ord_001/refund   # 200 already_refunded, nothing changes
curl localhost:3001/orders/ord_001                  # payment.status "refunded", refund.amount 2650
```

Sending the payment event again after the refund returns `200 duplicate` and the order stays refunded. After a refund, **Look up** in the UI shows the refunded amount, and the Storage page lists it.

## Manual UI checklist

- [ ] Submission: default event → success message, order shown with formatted items and €26.50 total
- [ ] Validation: set a quantity to 0 or clear a product ID → error listing the problem, no order created
- [ ] Duplicate: send the same event again → "Duplicate event"; **New** event ID and send → duplicate, both event IDs listed
- [ ] Conflict: change a quantity for the same order ID → "already exists with different data", order unchanged
- [ ] Lookup: look up `ord_001` → details shown; look up `nope` → "Order nope not found"
- [ ] Failure: new order (**New** next to Order ID) → POS `failed`, attempts 1, Retry enabled
- [ ] Retry: click Retry → `synced`, reference shown, Retry disabled
- [ ] Storage: one POS transaction per synced order; failed calls listed separately

## Key decisions

**Order ID is the idempotency key.** Orders live in a `Map` keyed by order ID, so there is one record per order regardless of event ID. A repeat with identical data (items compared in supplied order) is a `duplicate`: the event ID is added to `eventIds`, nothing else changes, and the POS is not called. Different data is a `409 conflict` and nothing is touched. IDs are trimmed, so `"ord_001 "` is the same order.

**Payment and POS are separate states.**

```
payment:  paid ──refund──▶ refunded
pos:      pending ──▶ syncing ──▶ synced
                         │
                         └──▶ failed ──retry──▶ syncing
```

The payment is recorded before the POS is called. A POS failure is stored on the order (`failed`, `lastError`) and never loses the payment.

**Duplicate prevention for the POS.** Node runs code between two `await`s without interruption, and two points rely on that:

1. **New orders.** `receivePayment()` inserts the order before its first `await`. A second event for the same order, even one arriving while the POS call is in flight, always finds the record and takes the duplicate path, which never calls the POS.
2. **Retries.** `attemptPosSync()` in `orderService.ts` is the only place the POS is called. It checks that the status is `pending` or `failed` and sets `syncing` before its first `await`, so the status acts as a lock. An overlapping retry gets `409 sync_in_progress`, and a `synced` order is never sent again.

**Overlapping sync requests get 409 rather than waiting.** The caller can look the order up for the final result. This keeps the lock a plain status field, which maps directly onto a database conditional update later.

**Duplicate payment events do not retry a failed sync.** Retries are explicit (`POST /orders/:id/sync`), so a duplicate webhook never has side effects.

**Simulated POS (`pos.ts`).** `toPosPayload()` maps venue, order reference, items, currency and total. `FakePos` waits 300 ms, fails each order's first attempt, then returns `pos_txn_000N`. It records every call and every accepted transaction separately from orders, and it deliberately does not deduplicate, so a duplicate caused by our code would be visible in tests and on the Storage page.

**Refund.** Full refund only, only after a successful POS sync. It has no `await`, so check and update run as one step and concurrent requests cannot both refund. A repeat returns `200 already_refunded`. Each refund is also written to a refund log so a double refund would be visible. Duplicate payment events never touch payment status, so a refund is preserved. If a real provider call is added, it needs the same claim pattern as the POS (a `refunding` status set before the call).

**Money** is integer cents everywhere. The UI converts euros to cents when building the payload (amounts with more than two decimals are rejected, never rounded) and formats cents as EUR only for display.

**Validation** is hand-written (no schema library), collects all errors, and copies only known fields into the stored order. The UI form skips browser validation so every error comes from the backend.

## Assumptions

- The brief asks for a deterministic first-attempt failure (3.2) and also for "valid event → one POS transaction" (test 1). The failure is configurable: `failuresBeforeSuccess` defaults to 1 (UI demo, most tests); test 1 uses 0, and the 502 test uses 2.
- An order is refundable only when payment is `paid` and POS is `synced`; anything else is `409 refund_not_allowed`.
- Event IDs are recorded per order but not checked across orders: reusing an event ID for a different order is accepted.
- `pending` is the initial POS state. Because the POS is called inline and the order is claimed synchronously, no request ever observes it; it would matter with a queue.

## Behaviour under load

Sizing assumption (mine, not from the brief): 10–20 orders per second at peak.

One Node process handles this comfortably. Each request is a few microseconds of CPU plus an `await` on the POS; while one order waits for the POS, the event loop serves others. At 20 orders/s with a 300 ms POS, about 6 POS calls are in flight at once, which needs no tuning.

Correctness under concurrency does not depend on load: the guards above are synchronous steps per order, so concurrent requests for the same order cannot both call the POS, and different orders never block each other.

What has to change to run more than one backend process:

- **Database instead of memory**: a unique constraint on order ID (insert, and on conflict compare with the existing row).
- **Lock as a conditional update**: `UPDATE orders SET pos_status = 'syncing' WHERE id = $1 AND pos_status IN ('pending','failed')`; whoever updates one row owns the POS call. Same for refunds (`WHERE payment_status = 'paid'`).
- **Queue for POS calls**: acknowledge the webhook immediately, and let workers call the POS with retries and backoff (outbox pattern so the order and the job are written together).
- **POS idempotency key**: send the order ID so the POS rejects a repeat. This also covers the out-of-scope case of a timeout after the POS accepted.
- **Stuck `syncing`**: give the claim a lease (`syncing_since`) so a crashed worker's order can be retried.

## Unfinished and not verified

- No automated frontend tests; the UI was checked manually against the checklist above.
- The overlapping-request tests rely on a 100 ms simulated POS latency to create the overlap. They assert that the overlap happened (the second request sees `syncing`), so they fail rather than pass falsely, but a very slow machine could make them flaky. A controllable gate in `FakePos` would make them fully deterministic.
- Timeouts after POS acceptance are out of scope and not handled (see the idempotency-key note above).
- No refund UI (out of scope).

## What I would improve before production

- Persistent storage and the multi-process changes listed above.
- Verify the payment provider's webhook signature.
- Use a schema library (e.g. zod) shared between frontend and backend instead of duplicated types.
- Structured logging, metrics and alerts for orders stuck in `failed` or `syncing`.
- Remove or protect `/debug/storage`.

## Git workflow

Worked on `main` in small steps, each tested (`npm test`, typecheck, manual UI check) before committing and pushing: (1) backend and UI without the POS, (2) simulated POS, sync and retry, (3) refund, (4) review fixes and docs. Steps 2 to 4 are split into backend, frontend and docs commits. For a team I would use short-lived feature branches and pull requests with CI running tests and typecheck.

## Time spent

TODO: fill in.
