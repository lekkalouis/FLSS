# FLSS Pricing Replacement Module (WSH → FLSS)

## 1) Requirements

### Primary behavior

- Each customer is resolved to one active pricing tier.
- FLSS must resolve an exact net unit price per SKU/variant for that tier.
- Draft Orders created or edited in Shopify Admin must display the correct net price immediately with no manual “Apply wholesale pricing” action.
- Price correctness must be automatic and self-healing via webhook reconciliation.

### Rule hierarchy (source of truth)

1. Customer-specific override price (if configured)
2. Fixed tier price (`custom.price_tiers`)
3. Discount fallback off retail (optional, rare)
4. Retail/base price

### Non-goals

- No reliance on third-party discount app “apply” actions.
- No UI refresh loops to force pricing consistency.

---

## 2) Data model

### 2.1 Customer tier identity

- **Primary read**: customer metafield `custom.tier` (string)
- **Secondary source**: customer tags (for backfill/human admin visibility)
- **Tag namespace format**: `tier:<name>`
  - Example: `tier:public`, `tier:agent`, `tier:retailer`, `tier:export`, `tier:private`, `tier:fkb`

#### Tier resolution policy

- Exactly one active tier is expected.
- If multiple tier tags exist:
  - Either enforce priority ordering, or
  - Fail safe to `public`/`retail` and flag in logs.

### 2.2 Variant fixed tier prices (Phase 1)

- Variant metafield: `custom.price_tiers` (JSON)
- Shape example:

```json
{
  "public": 45,
  "agent": 22.5,
  "retailer": 28.5,
  "export": 25,
  "private": 36,
  "fkb": 28
}
```

### 2.3 Optional discount fallback model

- `tier_discounts` map (percentage values) for fallback or promotions.
- Example:

```json
{
  "agent": 0,
  "export": 10
}
```

### 2.4 FLSS local cache

Maintain a product snapshot table/store with:

- `sku`
- `variant_id`
- `title`
- `weight`
- parsed `price_tiers`
- `updated_at`

Sync strategy:

- Nightly full sync
- On-demand fetch for cache misses/stale variants

---

## 3) Shopify objects and metafields

## Required now

- `customer.metafields.custom.tier` (single string)
- `productVariant.metafields.custom.price_tiers` (JSON)

## Optional future governance (Phase 2)

- Metaobject: `tier_price`
  - `variant_id`
  - `tier`
  - `price`
  - `currency`
  - `effective_from` (optional)

Use when audit/versioning/search requirements outgrow JSON metafields.

---

## 4) FLSS API surface

### Existing endpoints to use/extend

- `POST /api/v1/shopify/draft-orders`
- `POST /api/v1/shopify/variants/price-tiers`
- `POST /api/v1/shopify/variants/price-tiers/fetch`

### Recommended additions

- `POST /api/v1/pricing/resolve`
  - Input: customer id/tier + variant ids + quantities
  - Output: per-line resolved source, retail, tier price, discount fallback usage

- `POST /api/v1/pricing/reconcile-draft-order`
  - Input: draft order id
  - Output: correction summary + pricing hash

- `GET /api/v1/pricing/status/:draftOrderId`
  - Output: tier, hash, last corrected timestamp, mismatch flags

---

## 5) Draft order pricing enforcement

### 5.1 Creation path (authoritative)

When FLSS creates a draft order, every line item must be posted with the resolved net unit price from the hierarchy above.

For each line item:

- set `variant_id`
- set `quantity`
- set `price` to resolved net unit price
- set `applied_discount` only when fallback/promo logic is used

After create:

1. Re-fetch draft order
2. Recompute expected pricing
3. Assert parity (or schedule correction if mismatch)

### 5.2 Update/reconciliation path (webhook-driven)

Subscribe to:

- `draft_orders/create`
- `draft_orders/update`

Webhook handler flow:

1. Fetch full draft order payload from Shopify Admin API
2. Resolve customer tier (`custom.tier` first)
3. Recompute expected line pricing
4. Compare expected vs actual
5. If mismatch:
   - update line prices and/or applied discounts
   - re-fetch and verify
6. Log correction result

### 5.3 Idempotency guard

Store and compare deterministic hash in draft order note attribute:

- `flss_pricing_hash`

Behavior:

- If incoming draft hash matches computed hash, no-op.
- If hash differs, reconcile and write new hash.

---

## 6) Reconciliation algorithm (deterministic)

Per line item:

1. Resolve `retail_price`
2. Resolve `tier_price` from `custom.price_tiers[tier]`
3. If missing, try `discount_fallback` using retail price
4. If still missing, use retail
5. Normalize decimal/rounding to store currency precision
6. Build canonical line signature:
   - `variant_id`
   - `quantity`
   - `resolved_unit_price`
   - `source` (`override | fixed_tier | discount_fallback | retail`)
7. Hash all signatures + tier + currency into `flss_pricing_hash`

Comparison keys:

- unit price
- applied discount payload
- source classification (for observability)

---

## 7) UI requirements (FLSS workbench)

Replace “Apply wholesale pricing” button with pricing state visibility:

- Tier badge near customer info
- Pricing status indicator:
  - `Pricing: OK`
  - `Corrected at HH:MM`
- Per-line source badge:
  - `Fixed tier`
  - `Discount fallback`
  - `Override`
  - `Retail`

Optional later:

- Shopify Admin UI extension showing “FLSS Pricing OK”.

---

## 8) Rollout plan and risk controls

1. Freeze reliance on WSH apply behavior for new flows.
2. Populate `custom.price_tiers` for all variants.
3. Backfill customer `custom.tier` from existing tags.
4. Enable webhook reconciler in monitor-only mode (detect + log mismatches).
5. Switch to enforce mode (auto-correct mismatches).
6. Remove WSH from operator workflow and uninstall once stable.

Operational safeguards:

- Feature flag for enforce mode
- Structured logging for mismatches/corrections
- Alert threshold if correction rate spikes

---

## 9) Open decisions to lock before implementation

1. **Canonical tier names**
   - Proposed: `public`, `agent`, `retailer`, `export`, `private`, `fkb`
2. **Tax model**
   - Are stored/resolved prices VAT-inclusive or VAT-exclusive?
3. **Multi-tier conflict policy**
   - Priority order vs hard-fail/block
4. **Manual draft overrides**
   - Preserve operator override vs always enforce FLSS pricing
5. **Rounding behavior**
   - Decimal precision and midpoint strategy for discount fallback cases

---

## 10) Suggested implementation touchpoints in this repo

- Frontend tier and per-line display logic:
  - `public/views/flocs.js`
- Shared tier/unit resolver:
  - `src/services/pricingResolver.js`
- Shopify draft order create/update route handlers:
  - `src/routes/shopify*.js` (current Shopify endpoint modules)
- Price tier management UI:
  - `public/views/price-manager.js`

This module spec intentionally keeps fixed tier pricing as the primary pricing engine and constrains discount logic to fallback/promo use only.
