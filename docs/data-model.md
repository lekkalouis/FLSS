# FLSS Core Features, Add-ons, and Data Model

## Core features

1. **Scan Station**
   - Barcode scan parsing into order + parcel sequence.
   - ParcelPerfect booking orchestration.
   - PrintNode label print dispatch.
   - Shopify fulfillment completion.

2. **Dispatch Board**
   - Open order visibility.
   - Parcel count monitoring and dispatch workflows.
   - Delivery note printing and booking shortcuts.

3. **FLOCS / Order Capture**
   - Customer search + creation.
   - Product and collection assisted order assembly.
   - Draft order creation and completion.

4. **Stock Take**
   - Shopify inventory-level readouts.
   - Stock set and transfer adjustments.

5. **Price Manager**
   - Variant tiered pricing metadata (`custom.price_tiers`).
   - Optional sync from tiers into Shopify variant price.

## Add-ons (integration capabilities)

- **Shopify Admin API add-on**: customer/order/product/draft-order/inventory/fulfillment workflows.
- **ParcelPerfect add-on**: quote, place lookup, and booking request proxy.
- **PrintNode add-on**: network printer handoff for label PDFs.
- **SMTP notification add-on**: truck booking and customer collection notifications.

All add-ons are optional at runtime but specific UI actions will be unavailable when related credentials are missing.

## Logical data model (app-level)

FLSS is integration-driven and keeps most source-of-truth data in Shopify/ParcelPerfect.

### Main entities

- **Customer**
  - Source: Shopify customer records.
  - Important attributes: id, names, email, phone, addresses, delivery method metafields.

- **Order**
  - Source: Shopify order or draft order records.
  - Important attributes: order number/name, line items, shipping method, fulfillment status, tags.

- **Parcel Booking**
  - Source: ParcelPerfect booking response and order metafields.
  - Important attributes: parcel count, label payload, waybill/tracking references, costs.

- **Inventory Level**
  - Source: Shopify inventory levels per location.
  - Important attributes: inventory_item_id, location_id, available quantity.

- **Price Tier Set**
  - Source: Shopify variant metafield (`custom.price_tiers`).
  - Important attributes: thresholds/breakpoints and tier prices.

- **Alert Event**
  - Source: SMTP request payloads and server-side status responses.
  - Important attributes: alert type (truck/collection), recipients, message metadata.

### Relationship summary

- A **Customer** can have many **Orders**.
- An **Order** can map to one or many **Parcel Bookings** (multi-ship flow).
- An **Order** contains many line items that reference inventory-bearing variants.
- A **Variant** can have one **Price Tier Set** metafield payload.
- **Alert Events** can be emitted from order/dispatch thresholds.

### Persistence boundaries

- **Server-side persistence in FLSS**: none (stateless Express API layer).
- **Client-side local persistence**: selected UI settings and stock activity history in browser `localStorage`.
- **System-of-record persistence**:
  - Shopify (orders, customers, inventory, variant metafields)
  - ParcelPerfect (bookings/quotes/place codes)
  - PrintNode (print jobs)
  - SMTP provider (email delivery logs)
