# FLSS Operator Manual (Current App Workflows)

This manual documents the end-to-end operating flows in the current app: what each module is for, when to use it, and what happens after each major action.

## 1) App navigation map

### Main SPA routes (inside `public/index.html` shell)

- `/` — **Orders / Scan Station**
- `/ops` — **Dispatch board**
- `/flocs` — **Order capture (FLOCS)**
- `/stock` — **Stock tools**
- `/price-manager` — **Price manager**
- `/docs` — **In-app documentation viewer**
- `/flowcharts` — **Flow diagrams view**
- `/dispatch-settings` — **Dispatch settings** (admin unlock)
- `/logs` — **Operational logs** (admin unlock)
- `/admin` and `/changelog` — utility/admin screens

### Standalone tools (separate pages)

- `/shipping-matrix.html`
- `/order-capture-custom.html`
- `/customer-accounts.html`
- `/purchase-orders.html`
- `/liquid-templates.html`
- `/notification-templates.html`
- `/traceability.html`
- `/pos.html`

## 2) Shift startup checklist

1. Open the app and confirm the Orders view loads.
2. Confirm `GET /api/v1/healthz` and `GET /api/v1/statusz` are healthy.
3. Verify scanner input focus and a test code path in Orders/POS.
4. Verify label printer readiness (PrintNode) and ParcelPerfect credentials.
5. If dispatch hardware is used, confirm remote heartbeat data is updating.

## 3) Core operating flows

## 3.1 Orders / Scan Station flow

1. Scan or enter order barcode/code.
2. App resolves order and parcel context via Shopify endpoints.
3. Operator confirms shipping context (service/place/parcel counts).
4. Booking runs automatically after countdown, or manually with **Book now**.
5. On successful booking:
   - booking reference/tracking is attached,
   - print action is triggered/available,
   - fulfillment flow can proceed.
6. If delivery QR flow is enabled, delivery completion can be confirmed from QR code route.

Failure handling:

- Booking/API failure shows status message and preserves actionable context.
- Printing failure can be retried independently.
- Fulfillment failure leaves order visible in open/dispatch lists.

## 3.2 Dispatch board flow

1. Dispatch board loads open orders + recent shipment context.
2. Operator sets priorities and selects orders.
3. Use **Prepare deliveries** to apply batch preparation logic.
4. Optionally create multi/combined shipment groups.
5. Use shipment modal/order modal actions for print, fulfill, ready-for-pickup, tag updates.
6. If parcel threshold is exceeded, book truck alert can be sent.

## 3.3 FLOCS order capture flow

1. Search customer (quick search, filters, recents) or create new customer.
2. Choose delivery method and addresses.
3. Add line quantities by SKU/flavour matrix.
4. Optionally calculate shipping quote.
5. Create draft order or direct order.
6. Optional conversion path: complete draft to order.

## 3.4 Stock flow

1. Pick location.
2. Choose mode:
   - Read only
   - Stock take (set absolute qty)
   - Stock received (transfer/add flow)
3. Search/filter SKU rows.
4. Adjust row qty with quick controls, then **Set**/**Apply**.
5. Review local activity log and open PO receiving table when receiving mode is used.

## 3.5 Price manager flow

1. Search products/variants.
2. Edit tier prices per row.
3. Save tier set to variant metafield `custom.price_tiers`.
4. Optional sync/update base price where required.

## 3.6 Traceability flow

1. Open traceability page.
2. Enter batch + flavour.
3. Optional: upload PO workbook and COA/COC workbook.
4. Run report.
5. Review sales and purchase/inspection projections.
6. Export/use generated output for QA and audit workflows.

## 4) Admin and support operations

- **Admin unlock:** `Shift + Alt + A` toggles admin-only nav sections.
- **Dispatch notes:** saved locally and surfaced in admin logs panel.
- **Environment telemetry:** available through `/api/v1/environment` endpoints and dispatch environment views.
- **Docs browser:** `/docs` loads markdown topics served by `/api/v1/docs`.

## 5) End-of-shift routine

1. Confirm no stuck bookings, print jobs, or pending dispatch actions.
2. Validate truck booking state if threshold workflow was triggered.
3. Export or note traceability/stock actions completed during shift.
4. Lock workstation and clear any local-only sensitive notes if required by policy.
