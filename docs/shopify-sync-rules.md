# Shopify Sync Rules

This note documents the remaining Shopify ownership and sync rules in the current workspace.

> Compatibility / legacy: the `product-management` sync endpoints are still present, but the primary operational surface is now the unified `Stock / Buy / Make` workflow. Treat this file as a maintenance reference, not as the main architecture guide.

## 1. Source-of-truth boundaries

Shopify remains authoritative for:

- customers
- storefront products and variants
- draft orders and orders
- fulfillments
- Shopify inventory levels
- customer-facing metafields that are written directly by Shopify flows

FLSS local storage remains authoritative for:

- material master data
- supplier preferences
- BOM definitions
- stock movements and batches
- stocktakes
- purchase order orchestration state
- manufacturing orchestration state
- system settings and print history

## 2. Current push scope

Legacy product-management sync currently uses:

- `GET /api/v1/product-management/sync/status`
- `POST /api/v1/product-management/sync/now`

That flow pushes FLSS-owned compliance metafields when a `shopify_variant_id` is mapped.

Known fields:

- `flss.ingredients_text`
- `flss.allergens`

## 3. Queue model

The legacy sync path records local writes into a `change_log` queue with status transitions:

- `pending`
- `processing`
- `synced`
- `failed`

Failures retain `last_error` and increment `attempts`. Audit rows are written for both success and failure cases.

## 4. Unified operations inventory sync

The current `Stock / Buy / Make` flow also syncs inventory to Shopify when mappings are present, but it does so inside the unified operations services rather than through the old `product-management` queue.

Examples:

- mapped stocktakes can update Shopify inventory
- manufacturing completion can decrement material inventory and increment finished goods

## 5. Practical rules

- Keep Shopify variant and inventory item mappings current before relying on automatic sync.
- Do not assume every local entity is mirrored to Shopify.
- Use FLSS as the source of truth for material, BOM, and batch history even when Shopify inventory quantities are synchronized.
