# FLSS Operator Manual (Comprehensive)

This manual is written for day-to-day operators and supervisors running FLSS in production.

## 1) Navigation and access

### Main operational views

- **Orders** (`/`) for scan-based dispatch flow.
- **Dispatch Board** (`/ops`) for open-order triage and grouped processing.
- **Order Capture** (`/flocs`) for customer + product order creation.
- **Stock Take** (`/stock`) for inventory checks and adjustments.

### Footer menu views

- **Documentation** (`/docs`) for in-app docs topics.
- **Admin** (`/admin`) for utility links and management shortcuts.
- **Changelog** (`/changelog`) for recent app update notes.

### Standalone tools

- `/traceability.html`
- `/shipping-matrix.html`
- `/purchase-orders.html`
- `/liquid-templates.html`
- `/notification-templates.html`

## 2) Startup checklist (shift start)

1. Confirm app opens at `http://localhost:3000`.
2. Open **Documentation** in footer and check status guidance.
3. Verify `/api/v1/healthz` responds and `/api/v1/statusz` integrations are healthy.
4. Test scanner input focus in Orders view.
5. Confirm printer availability if labels are required for shift.

## 3) Orders / Scan Station runbook

1. Scan parcel barcode into the scan input.
2. Verify order identity and parcel sequence context.
3. Confirm destination place and courier service (override only when needed).
4. Trigger booking manually with **Book Now** or wait for auto-book timer.
5. Monitor progress states for quote/book/print/fulfillment.
6. Confirm final status and tracking artifacts.

### Exceptions

- **Lookup mismatch:** re-scan, then fetch order by name/number route where available.
- **Quote failure:** validate place code and service override.
- **Print failure:** retry print route, then inspect PrintNode credentials/printer.

## 4) Dispatch Board runbook

1. Open `/ops` and allow open-order and shipment snapshots to load.
2. Select orders requiring dispatch preparation.
3. Use **Prepare deliveries** for grouped flow.
4. Optionally create combined shipment groups where policy allows.
5. Book truck alert when parcel threshold is hit and approved.

## 5) FLOCS / Order Capture runbook

1. Search existing customer or create new customer.
2. Confirm customer tier, delivery method, and payment metadata.
3. Add products and quantities.
4. Calculate shipping (when shipping applies).
5. Create draft order for approval or create immediate order.
6. Convert draft to order when downstream workflow requires it.

## 6) Stock operations runbook

1. Pick Shopify location.
2. Search/filter inventory rows.
3. Choose mode: read-only, stock take (set), or stock received (adjust).
4. Apply focused changes using quick controls.
5. Review local activity log before ending session.

## 7) Pricing operations runbook

1. Open price manager and load products/variants.
2. Edit tier values for required variants.
3. Save tier metafields (`custom.price_tiers`).
4. Use public price sync only when global storefront change is intended.

## 8) Traceability runbook

1. Open `/traceability.html`.
2. Enter batch and flavor.
3. Upload purchase and COA/COC sheets (optional but recommended).
4. Generate report and review sales + supplier/inspection sections.
5. Use template download if file format correction is needed.

## 9) Incident response quick guide

- **Shopify degraded:** continue local-only prep steps and queue Shopify-dependent actions.
- **ParcelPerfect degraded:** avoid booking attempts; capture exceptions for later replay.
- **PrintNode degraded:** pause print-dependent workflows and switch to backup print process.
- **SMTP degraded:** continue operations; defer notification actions and log outstanding notices.

## 10) End-of-shift closeout

1. Ensure no active bookings remain in uncertain state.
2. Export or record key dispatch/traceability outcomes.
3. Confirm stock adjustments are complete.
4. Verify outstanding incidents are logged with timestamps and owner.
