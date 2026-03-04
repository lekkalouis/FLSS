# FLSS Data Model (Current)

FLSS is an orchestration layer. Canonical order/commercial records mostly live in Shopify, while FLSS also keeps local operational state for dispatch/controller, templates, commissions, and payment allocation workflows.

## 1) Source-of-truth boundaries

## 1.1 Shopify (primary authority)

Authoritative entities:

- Customers and customer metadata
- Products, variants, and variant metafields (including price tiers)
- Draft orders and orders
- Fulfillment and shipment-adjacent order state
- Inventory levels and locations

## 1.2 FLSS local persistence and runtime state

Locally managed records/state include:

- Dispatch controller state + event history (app operational state)
- Environment telemetry samples and latest aggregate values
- Agent commission rules and recorded commission payments
- Order payment allocation records and bank payment matching data
- Liquid and notification templates used by app tooling
- UI/localStorage convenience state (operator preferences, temporary form state)

## 1.3 External side-effect systems

- **ParcelPerfect:** quote + booking envelopes used during shipping workflows
- **PrintNode:** print job requests/results
- **SMTP:** outbound notification actions

These systems are operational dependencies, not canonical order databases.

## 2) Core entity models

## 2.1 Customer

Primary fields used by FLSS:

- `id`, `first_name`, `last_name`, `email`, `phone`
- default address fields
- tags and selected metafields (for tier/access behavior)

Ownership: Shopify.

## 2.2 Product / Variant

Primary fields:

- product identity and title/type
- variant identity, SKU, barcode, option values
- price fields and tier metafield payload (`custom.price_tiers`)

Ownership: Shopify.

## 2.3 Draft Order and Order

Commonly used fields:

- `id`, `name`, timestamps
- `line_items[]` (variant, qty, pricing context)
- customer reference
- shipping/delivery method context
- tags/note attributes (dispatch and workflow markers)
- payment/financial status fields

Ownership: Shopify.

## 2.4 Fulfillment and dispatch state projection

FLSS consumes and mutates order-adjacent state used by dispatch/scan flows:

- fulfillment events/recent shipments
- ready-for-pickup and delivery-complete transitions
- parcel count tags/attributes
- dispatch progression steps and operator actions

Canonical order state remains Shopify; FLSS tracks runtime progress locally for UI/workflow continuity.

## 2.5 Shipment booking envelope (ParcelPerfect)

Important fields consumed by FLSS:

- booking reference / waybill
- service code + service label
- origin and destination place IDs
- shipping cost/quote values
- tracking URL/code where available

Used for label generation, status display, and downstream fulfillment actions.

## 2.6 Inventory level

Fields:

- `inventoryItemId`
- `locationId`
- `available`

Mutation paths:

- absolute set (`/shopify/inventory-levels/set`)
- transfer (`/shopify/inventory-levels/transfer`)

Ownership: Shopify.

## 2.7 Template records (local)

### Liquid template record

Typical attributes:

- local `id`
- `name`
- `content`
- timestamps/metadata where applicable

### Notification template record

Typical attributes:

- local `id`
- template key/name
- subject/body content
- timestamps/metadata where applicable

Ownership: FLSS local store.

## 2.8 Agent commission records (local + Shopify-derived inputs)

### Commission rule

Typical fields:

- `id`
- agent identifier / matching rules
- commission type/rate and constraints

### Commission payment

Typical fields:

- payment `id`
- agent reference
- amount/date/reference
- notes or provenance metadata

Dashboard outputs combine Shopify order-derived totals with local rules/payments.

## 2.9 Order payments allocation model

Operational entities:

- bank payment transaction rows
- candidate Shopify orders to allocate against
- allocation actions/results (partial/full/unmatched)

Canonical payment status remains in Shopify/order systems; FLSS stores allocation workflow artifacts for operator tooling.

## 2.10 Environment + controller state

Environment sample fields generally include:

- `temperatureC`
- `humidityPct`
- sample timestamp / last updated timestamp
- status/freshness markers

Controller state includes:

- current stage/step
- remote source heartbeat metadata
- event feed entries for audit/visibility in ops UI

Ownership: FLSS runtime/local state.

## 2.11 Traceability report structures

### Input model

- `batchNumber`
- `flavor`
- optional workbook payloads (PO and COA/COC)

### Output model (composed view)

- batch/week metadata
- matched Shopify sales lines
- normalized purchase rows
- COA/COC enriched fields
- incoming vehicle inspection checklist projections

Output is generated reporting data and should be treated as derived artifacts.

## 3) Relationship map across flows

1. **Customer + variant pricing metadata** determine order pricing context.
2. **FLOCS/POS/Order Capture** create draft or direct orders in Shopify.
3. **Orders** feed scan station and dispatch workflows.
4. **ParcelPerfect booking envelopes** augment order operations for shipping/labels.
5. **PrintNode actions** consume booking/order context to produce physical documents.
6. **Inventory operations** adjust Shopify stock positions.
7. **Commissions and payment allocation** consume Shopify order/payment context and store local workflow state.
8. **Traceability** joins Shopify sales with uploaded QA workbook data.
9. **Environment/controller telemetry** provides operational context for dispatch/station views.

## 4) Data quality and validation

- UI performs required-field validation before API calls where possible.
- API routes validate payload shape and required fields before upstream calls.
- Local modules return explicit errors for malformed records (rules/payments/templates/allocations).
- Integrations can degrade independently; status endpoints and dashboard warnings surface degraded mode.
- Local convenience state (browser localStorage/UI cache) is non-canonical and can be reset without affecting authoritative records.
