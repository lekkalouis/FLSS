# Shopify Sync Rules

## Ownership rules

- Shopify-owned fields: title/status/images/product metadata in Shopify.
- FLSS-owned fields: BOM, costing structures, compliance output, local pricing model.

## Current push scope

`POST /api/v1/product-management/sync/now` pushes FLSS compliance metafields when `shopify_variant_id` is mapped:

- `flss.ingredients_text`
- `flss.allergens`

## Queue model

All local writes create `change_log` entries with status lifecycle:

- `pending` -> `processing` -> `synced` / `failed`

Failures store `last_error` and increment `attempts`. Sync status screen exposes queue counts and failures.

## Conflict handling

Conflicts can be logged to `conflicts` and surfaced in sync status. Audit trail is written to `audit_log` for push successes/failures and restore events.
