# Product Management Module

## Scope
FLSS now includes an offline-first Product Management module backed by local SQLite (`data/flss-products.sqlite`).

## Key capabilities
- Products/SKU registry with Shopify mapping fields.
- Ingredients, suppliers, and effective-dated ingredient price history.
- BOM recipes with versioning (`version`, `effective_from`, `yield_pct`, `waste_pct`).
- Packaging items and effective-dated packaging profiles.
- Compliance pack generation from latest BOM (ingredients text sorted by grams desc + allergens roll-up).
- Price tiers and effective-dated product prices.
- True-cost computation with explainable layer breakdown.
- Offline change queue (`change_log`) and audit trail (`audit_log`).

## API summary
Base: `/api/v1/product-management`
- `GET /dashboard?as_of_date=YYYY-MM-DD&tier=public`
- `GET/POST /products`
- `GET/POST /:table` for module tables
- `GET /products/:id/cost?as_of_date=YYYY-MM-DD&tier=public`
- `POST /products/:id/compliance/generate`
- `GET /sync/status`
- `POST /sync/now`
- `POST /backups/daily`
- `POST /backups/export`

## Costing formulas
- ingredient_cost = Σ((grams_used / 1000) × latest_price_per_kg_as_of_date)
- packaging_cost = Σ(qty × unit_cost)
- direct_cost = ingredient_cost + packaging_cost
- labour_per_unit = labour_total / units_produced
- overhead_per_unit = overhead_total / units_produced
- dispatch_per_unit = dispatch_materials_total / units_shipped
- shipping_per_unit = shipping_total / units_shipped
- fees = selling_price × (commission_pct + gateway_pct)
- true_cost = direct_cost + labour_per_unit + overhead_per_unit + dispatch_per_unit + shipping_per_unit + fees
