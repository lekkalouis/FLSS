# FLSS Data Model

FLSS uses both external systems and local persistence. The local SQLite database is a real operational source of truth for stock, purchasing, manufacturing, print history, and runtime settings.

## 1. Source-of-truth boundaries

### Shopify is authoritative for

- customers and account-facing customer metadata
- storefront products and variants
- draft orders, orders, and fulfillments
- Shopify inventory levels and locations
- signed delivery code payload resolution targets

### FLSS local persistence is authoritative for

- material master data and supplier preferences
- bill-of-material definitions
- inventory movements and traceable batches
- stocktakes
- purchase-order orchestration state
- manufacturing-order orchestration state
- system settings
- print history
- audit records for local operations

### Other external systems

- ParcelPerfect: quotes, bookings, place lookups, and shipping metadata
- PrintNode: printer inventory and print job execution
- SMTP provider: notification send acceptance and delivery attempts
- Shopify customer account provider: portal session identity

## 2. Primary local entities

The current local SQLite store at `LOCAL_DB_PATH` contains entities such as the following.

### Materials and suppliers

- materials
- suppliers
- supplier-material preference and pricing relationships

Purpose:

- reorder planning
- Shopify inventory mapping
- BOM resolution
- purchase-order grouping by supplier

### BOMs and manufacturing requirements

- BOM headers
- BOM material lines
- manufacturing material requirements

Purpose:

- requirements calculation
- shortage detection
- manufacturing reservation tracking

### Inventory and traceability

- stock movements
- batches
- stocktakes

Purpose:

- raw-material and finished-goods traceability
- on-hand and reserved inventory calculations
- finished batch creation on manufacturing completion

### Purchase-order orchestration

- purchase orders
- purchase-order lines
- purchase-order dispatch attempts

Purpose:

- supplier grouping
- generated PDF and email state
- Shopify draft-order linkage
- retryable downstream dispatch status

### Manufacturing orchestration

- manufacturing orders
- manufacturing order lines
- manufacturing material requirements

Purpose:

- planned output tracking
- material reservation and shortage visibility
- finished-goods batch creation
- Shopify inventory adjustments when mappings exist

### Runtime operations

- system settings
- print history
- app audit records

Purpose:

- normalized operator configuration
- printer routing and diagnostics
- operational audit trail across buy, make, stock, and notifications

## 3. File-backed local records

Not every local record lives in SQLite.

Current file-backed persistence includes:

- `data/liquid-templates.json`
- `data/notification-templates.json`
- generated artifacts under `ASSETS_PATH/generated`

These files are still part of the local operational state even though they are not database tables.

## 4. Shopify-facing entities

### Customers

Common fields used by FLSS:

- `id`
- `first_name`, `last_name`, `email`, `phone`
- company and tax metadata
- shipping and billing addresses
- tags and tier markers
- custom metafields such as delivery notes, access code, and payment terms

### Variants and inventory

Common fields used by FLSS:

- `id`
- `sku`
- `inventory_item_id`
- `price`
- `inventoryQuantity`
- `custom.price_tiers`

### Draft orders and orders

Common fields used by FLSS:

- `id`, `name`
- `customer`
- `line_items`
- `shipping_line`
- `note`, `tags`
- delivery and fulfillment metadata

## 5. Browser-only state

Local browser state still exists, but it is convenience state rather than the primary record system.

Examples:

- nav collapse state
- selected dispatch orders
- temporary FLOCS form state
- UI-only filters and search inputs

If browser state is cleared, the operational records above still remain in SQLite, Shopify, or file-backed storage.

## 6. Relationship map

1. Customers and tier markers influence order capture and pricing.
2. Materials and BOMs drive stock, purchasing, and manufacturing requirements.
3. Stock movements and batches provide traceability and on-hand counts.
4. Purchase orders connect materials, suppliers, PDFs, emails, and Shopify draft orders.
5. Manufacturing orders consume materials, create finished output, and can sync inventory to Shopify.
6. Print history and system settings support the operator runtime without changing Shopify data.

## 7. Operational guidance

- Treat local SQLite as the primary source for raw materials, batches, stocktakes, purchase orders, manufacturing orders, print history, and system settings.
- Treat Shopify as the primary source for customers, customer-facing orders, fulfillments, and live Shopify inventory levels.
- When mappings exist, FLSS may synchronize state to Shopify, but that does not make Shopify the source of truth for FLSS-native entities.
