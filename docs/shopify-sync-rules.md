# Shopify sync rules

## Ownership model
- Shopify-owned fields:
  - product title/status/images and canonical SKU/variant mapping.
- FLSS-owned fields:
  - BOM/recipes, packaging, costing inputs, compliance text/allergens, local tier pricing.

## Queue model
- Every write in Product Management adds `change_log` entry with `pending` status.
- Worker flow:
  1. Pull product basics from Shopify into local cache.
  2. Push FLSS-owned compliance metafields (`flss.ingredients_text`, `flss.allergens`).
  3. Mark changes as `synced`, or `failed` with retry count/error.

## Conflict handling
- If remote pushes disagree with FLSS-owned fields, record a conflict in `sync_conflicts` and audit entry in `audit_log`.
- Conflicts are surfaced via `GET /api/v1/product-management/sync/status`.

## Safety
- `SYNC_ENABLED=false` disables background sync worker and manual sync endpoint.
