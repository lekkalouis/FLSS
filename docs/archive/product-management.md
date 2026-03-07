# Product Management Module (Offline-First)

## Overview

The Product Management module introduces an offline-first SQLite data model for:

- Products and SKU mapping
- Ingredients, suppliers, and ingredient price history
- BOM recipes (versioned/effective-dated)
- Packaging items/profiles
- Compliance fields (ingredients text/allergens)
- Price tiers and product prices
- Monthly cost inputs
- Explainable true-cost breakdowns
- Sync queue / audit trail

## Data model

SQLite database path: `data/flss-products.sqlite` (configurable with `LOCAL_DB_PATH`).

Migrations live under `db/migrations` and are applied at startup through `runMigrations()`.

## Costing flow

`computeTrueCost(product_id, as_of_date, tier_id)` resolves:

1. Effective recipe (`bom_recipes.effective_from <= as_of_date`)
2. Effective ingredient prices per ingredient
3. Effective packaging profile
4. Effective product price for selected tier
5. Period cost allocations (`YYYY-MM` from `as_of_date`)

It returns a fully explainable breakdown object for UI display and auditability.

## API surface

All endpoints are under `/api/v1/product-management/*`:

- Core CRUD: products, ingredients, suppliers, ingredient-prices, recipes, packaging-items, packaging-profiles
- Costing/alerts: `GET /cost/:productId`, `GET /dashboard`
- Pricing/cost inputs: price-tiers, product-prices, cost-inputs
- Sync: `GET /sync/status`, `POST /sync/now`
- Backups: `POST /backups/snapshot`, `POST /backups/restore`
- Audit: `GET /audit-log`


## Existing Functions Reused (Repo discovery)

- `src/routes/index.js`: Reused central API router registration pattern.
- `src/services/shopify.js` `shopifyFetch(...)`: Reused existing Shopify authenticated client + throttle/backoff behavior for sync pushes.
- `src/config.js`: Reused env/config pattern and extended with `LOCAL_DB_PATH`, `ASSETS_PATH`, `BACKUPS_PATH`, `SYNC_ENABLED`.
- `src/app.js` + static hosting model: Reused static page/module style for `public/product-management.html`.
- `public/app.js` module launcher: Reused module-card integration point to expose Product Management in existing UI shell.
- Existing local-first patterns in services such as `src/services/dispatchController.js` informed durable local writes + lightweight in-process queue semantics.

## Architecture notes

- Local SQLite is source of truth for product-management entities.
- Every write creates `change_log` entries (outbox) and `audit_log` records.
- Sync worker processes pending queue entries and pushes FLSS-owned compliance metafields to Shopify.
- Conflict and failure visibility is exposed in sync status API and UI tab.
