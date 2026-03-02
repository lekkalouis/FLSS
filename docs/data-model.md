# FLSS Data Model (Current)

FLSS is an orchestration layer. Most business records live in Shopify (plus ParcelPerfect/PrintNode/SMTP for fulfillment side effects). This document describes the practical data model used by the app.

## 1) Source-of-truth boundaries

- **Shopify (authoritative):** customers, products/variants, draft orders, orders, fulfillments, inventory, variant metafields.
- **ParcelPerfect:** quote, booking, waybill/tracking and place lookup responses.
- **PrintNode:** printer inventory and print job execution status.
- **SMTP provider:** outgoing alert/notification acceptance and delivery lifecycle.
- **FLSS local browser state:** UI preferences, selections, short-lived draft context, stock logs, admin unlock flags.

## 2) Core entities

## 2.1 Customer

Primary fields used by FLSS:

- `id`
- `first_name`, `last_name`, `email`, `phone`
- `company`, VAT/tax metadata
- shipping + billing addresses
- tags / segments / tier
- custom metafields (delivery notes, access code, payment terms)

Used in flows:

- customer search/create,
- customer account lookup by access code,
- order capture population and pricing tier resolution.

## 2.2 Product and Variant

Primary fields:

- product: `id`, `title`, `handle`, `productType`, `tags`
- variant: `id`, `sku`, `barcode`, `price`, `inventoryItemId`, `inventoryQuantity`
- tier metafield: `custom.price_tiers` (JSON object keyed by tier)

Used in flows:

- scan lookup,
- FLOCS quantity matrix,
- POS scanning,
- price manager writes,
- stock and transfer actions.

## 2.3 DraftOrder

Typical fields referenced:

- `id`, `name`
- `customer`
- `line_items`
- `shipping_line`
- `note`, `tags`
- pricing/reconciliation status from `/pricing/status/:draftOrderId`

Lifecycle:

1. Created from FLOCS or PO tools.
2. Optionally reconciled/price-resolved.
3. Completed into final order.

## 2.4 Order

Operational fields:

- `id`, `name`, `orderNumber`
- `financialStatus`, `fulfillmentStatus`
- `lineItems`, `shippingAddress`, `shippingLine`
- `tags` (dispatch and operational flags)
- parcel metadata (`parcelCount`, booking references)

Lifecycle in FLSS:

1. Created directly or from draft conversion.
2. Appears in open order/dispatch lists.
3. Booking/label/fulfillment actions applied.
4. Optional pickup or delivery completion actions.

## 2.5 Shipment booking record (ParcelPerfect response envelope)

Key runtime fields consumed by UI/workflows:

- booking reference / waybill
- service code and display label
- origin/destination place IDs
- quote/booking cost
- tracking URL/code where provided

These are attached to order context and used for label + downstream status updates.

## 2.6 Inventory level

Fields:

- `inventoryItemId`
- `locationId`
- `available` (qty)

Mutation paths:

- set absolute quantity (`/shopify/inventory-levels/set`)
- transfer between locations (`/shopify/inventory-levels/transfer`)

## 2.7 Traceability report structures

### Input model

- `batchNumber`
- `flavour`
- optional workbook files (PO and COA/COC)

### Output model (composed)

- batch/week metadata
- matched Shopify sales lines
- normalized purchase rows
- COA/COC enriched fields
- incoming vehicle inspection checklist projections

## 3) FLSS internal state model

Local keys/state used by frontend modules include:

- navigation collapse preference,
- admin unlock flag,
- dispatch notes and selected dispatch groups,
- daily parcel counters and truck-booking marker,
- stock activity rows in localStorage,
- per-view temporary form state (FLOCS quantities, selected customer, etc.).

This local state is convenience state and must not be treated as canonical records.

## 4) Cross-flow relationship map

1. **Customer + Variant tier** drive pricing context in FLOCS.
2. **FLOCS/POS line items** create draft or direct orders.
3. **Orders** feed Dispatch + Scan Station booking/fulfillment workflows.
4. **Shipment booking** augments orders with operational logistics metadata.
5. **Inventory levels** are adjusted from Stock tools and indirectly affected by order fulfillment.
6. **Traceability** joins order/sales data with external QA workbook inputs.

## 5) Data quality and validation notes

- UI validates required fields before API submission where possible.
- Server validates payload shape and required values before upstream API calls.
- Integrations can return partial data; UI fallbacks prefer rendering with warnings over hard-fail where safe.
- Route-level errors are surfaced in toasts/status panels and should be monitored in logs for repeated patterns.
