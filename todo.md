# FLSS TODO

## Priority 1 — Security & Safety
- [ ] Add API authentication for `/api/v1` (API key or JWT).
- [ ] Add role-based authorization for sensitive actions (inventory changes, fulfillments, pricing updates).
- [ ] Lock down production CORS to explicit origins (no wildcard default).
- [ ] Add request validation (e.g. Zod/Joi) on all mutating endpoints.

## Priority 2 — Reliability & Observability
- [ ] Add structured logging with request IDs and order IDs.
- [ ] Add standardized upstream timeout/retry policy with safe guards for idempotent calls.
- [ ] Add idempotency keys for critical write endpoints.
- [ ] Expand `/statusz` checks to include latency/error indicators.

## Priority 3 — Codebase Maintainability
- [ ] Split `src/routes/shopify.js` into domain routers:
  - [ ] customers
  - [ ] products
  - [ ] orders
  - [ ] fulfillment
  - [ ] inventory
  - [ ] notifications
- [ ] Continue decomposing `public/app.js` into route/view modules under `public/views`.
- [ ] Add shared API error/response helpers to reduce duplicated route handling.

## Priority 4 — Testing & CI
- [ ] Add scripts in `package.json` for `test`, `lint`, and `format`.
- [ ] Add integration tests for highest-risk flows:
  - [ ] booking + label print
  - [ ] order fulfill flow
  - [ ] inventory set/transfer
  - [ ] variant price tier updates
- [ ] Add CI pipeline gates for lint + tests before merge.

## Priority 5 — Product Features
- [ ] Add role-aware UI controls (hide/disable actions by permission level).
- [ ] Build an operations retry center for failed Shopify/PP/PrintNode operations.
- [ ] Create unified order event timeline (scan → book → print → fulfill → notify).
- [ ] Add inventory reconciliation report with CSV export.
- [ ] Add pricing simulation mode before syncing public prices.

## Priority 6 — Data & Audit Trail
- [ ] Move stock activity/MRP history from `localStorage` to server-side persistence.
- [ ] Add operator attribution (who changed what and when).
- [ ] Add immutable audit records for inventory and fulfillment operations.

## Nice-to-have
- [ ] Add webhook ingestion + background job queue for event-driven updates.
- [ ] Add multi-warehouse/branch support for stock and dispatch.
- [ ] Add configurable dispatch/booking rule engine for ops-managed logic.
