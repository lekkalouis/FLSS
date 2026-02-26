# FLSS Feature and Data Model Reference

FLSS is an integration-driven operations app. It stores minimal local state and relies on external systems as source-of-truth.

## 1) Feature domains

### Orders / Scan Station

- Barcode parsing to derive order and parcel sequence.
- Order lookup and booking orchestration.
- Auto-book timer + explicit “Book now” flow.
- Label print dispatch and fulfillment actions.

### Dispatch Board

- Open-order triage and shipment context.
- Selection-based delivery prep.
- Combined shipment and truck-book alert workflows.

### FLOCS / Order Capture

- Customer search/create and metafield enrichment.
- Product search/collection-based line assembly.
- Draft or immediate order creation.
- Shipping quote lookup for shipping line population.

### Stock tools

- Inventory level reads by location.
- Set and transfer adjustment operations.
- Local activity trail in browser localStorage.

### Price manager

- Read/write variant `custom.price_tiers` metafield JSON.
- Optional sync from tier-resolved values into variant base price.

### Traceability

- Batch report generation from:
  - Shopify sales lines in matching period/flavor
  - uploaded purchase-order workbook rows
  - uploaded COA/COC workbook rows
- Downloadable sample workbook template endpoint.

## 2) External system ownership

- **Shopify:** customers, products, draft orders, orders, fulfillments, inventory, variant price data/metafields.
- **ParcelPerfect:** quote/place/booking workflows.
- **PrintNode:** print job queue and printer execution.
- **SMTP provider:** email dispatch and provider-side delivery records.

## 3) Logical entities

- **Customer** — profile/contact + custom metafields (delivery/payment metadata).
- **Order** — open/completed sales record with lines, tags, and fulfillment status.
- **DraftOrder** — pre-order workflow for approval/conversion.
- **Shipment Booking** — booking payload/response with service/place/cost/tracking output.
- **Variant Price Tiers** — tier map persisted in `custom.price_tiers` metafield.
- **Inventory Level** — item quantities scoped by Shopify location.
- **Traceability Report Row** — normalized sales/purchase/coa inspection projection.

## 4) Local-only state

FLSS keeps some browser-local state for UX/ops convenience, including:

- dispatch notes and UI preferences,
- admin unlock toggle,
- selected dispatch priorities,
- stock activity logs,
- some page-specific security/access convenience state.

This local state should not be treated as source-of-truth for core business records.
