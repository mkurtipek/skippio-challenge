# AI usage

I used Claude (Anthropic) as a pair programmer throughout.

## How I used it

- Read the brief with me and plan the work in four steps: backend and UI without the POS, simulated POS with sync and retry, refund, review and documentation.
- Generate the code and tests for each step. I reviewed each step, ran it, and committed it myself before moving on.
- Discuss design choices: order ID as the idempotency key, the POS status as the lock, 409 for overlapping retries, refund only after a POS sync.
- Review the finished code against the brief in a separate session that had not seen it being written. I fixed what it found: whitespace in IDs creating a second order, body errors (oversized, bad charset) returning 500 instead of 4xx, euro amounts being rounded silently in the UI, and an inaccurate claim in an earlier draft of these docs.
- Draft the README and this file, which I edited.

## How I verified the output

- Ran the backend tests (24) and the TypeScript typecheck for both apps at every step.
- Clicked through the UI flows in the manual checklist in the README: submission, validation, duplicates, conflict, lookup, failure and retry, plus the refund flow with curl.
- Checked that the concurrency tests catch real bugs by breaking the code on purpose and confirming the tests fail, then restoring it:
  - removing the `syncing` lock let two overlapping retries both reach the POS (two transactions);
  - inserting the order after the POS call instead of before let two overlapping payment events both create the order;
  - removing the "already refunded" check let a second refund through.
- Read every file, and made sure I can explain and change each part: validation, duplicate and conflict handling, the sync lock, the fake POS, refunds and the UI state.
