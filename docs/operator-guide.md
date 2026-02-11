# FLSS Operator Guide

This guide is for warehouse, dispatch, and support operators using FLSS day-to-day.

## 1) What FLSS does

FLSS combines shipping, fulfillment, and order operations into one web console with these modules:

- **Scan Station** (`/`) — scan parcels, book shipments, print labels, fulfill Shopify orders.
- **Dispatch Board** (`/ops`) — monitor and process open dispatch work.
- **FLOCS / Order Capture** (`/flocs`) — create customer orders and capture sales.
- **Stock Take** (`/stock`) — count stock and post inventory updates.
- **Price Manager** (`/price-manager`) — maintain tier pricing metadata.
- **Docs** (`/docs`) — internal documentation page in the app.

## 2) Accessing the system

1. Open your FLSS URL in a modern browser.
2. Confirm the page loads and module navigation appears.
3. If unavailable, contact support and include screenshot + timestamp.

## 3) Pre-shift startup checklist

Before processing orders:

1. Confirm printer is online.
2. Confirm internet connectivity.
3. Ask support to verify `/api/v1/statusz` if system health is uncertain.
4. Process one test scan/order if this is first run after maintenance.

## 4) Scan Station workflow (parcel booking + label + fulfillment)

Typical flow:

1. Scan parcel barcode in Scan Station.
2. Verify order and customer details are correct.
3. Confirm parcel count when prompted.
4. Allow auto-booking (or trigger manual booking if needed).
5. Print label when booking succeeds.
6. Confirm fulfillment action completes.

### Operator tips

- Keep scanner focus in the active scan input.
- Reprint label only when necessary to avoid duplicates.
- If booking fails, do not repeatedly retry without reading the error reason.

## 5) Dispatch Board workflow

Use Dispatch Board to manage open workload:

1. Review open orders and shipment queue.
2. Trigger **Book Now** for urgent/manual cases.
3. Print delivery notes as required.
4. Watch parcel totals and truck threshold alerts.

When truck alert threshold is reached, ensure the dispatch lead confirms truck booking communication.

## 6) FLOCS / Order Capture workflow

1. Search existing customer or create a new customer.
2. Add products by search or collection selection.
3. Choose shipping option (quote if required).
4. Create draft order or final order.
5. Confirm order number and hand off to dispatch pipeline.

## 7) Stock Take workflow

Two operating modes:

- **Stock take (set)**: sets exact inventory for counted quantities.
- **Stock received (adjust)**: increments inventory for newly received stock.

Good practice:

- Verify location before updating.
- Complete one SKU at a time to reduce input mistakes.
- Keep notes of discrepancies for supervisor review.

## 8) Price Manager workflow

1. Find product variant.
2. Review tier fields (`default`, `agent`, `retailer`, etc.).
3. Save tier data to metafields.
4. Use **Sync public price** only when global storefront price change is intended.

## 9) Incident handling playbook

### Booking failure

- Recheck scanned barcode/order number.
- Confirm all required address/contact data is present.
- Retry once.
- Escalate with error text and order number.

### Label print failure

- Confirm printer power/network.
- Retry print once.
- Escalate if repeated failure across orders.

### Fulfillment failure

- Do not duplicate fulfillments manually without supervisor instruction.
- Escalate with order number and timestamp.

### Email/notification failure

- Continue critical dispatch work.
- Log affected order numbers.
- Escalate to support for mail system check.

## 10) Escalation checklist

When escalating to technical support, always include:

- Order number(s)
- Module used (Scan Station/Dispatch/FLOCS/Stock/Price Manager)
- Exact error message (copy/paste)
- Time of incident
- Whether issue is single-order or widespread
- Screenshot if possible

## 11) End-of-shift checklist

1. Confirm all scanned parcels are either fulfilled or clearly flagged.
2. Confirm outstanding manual exceptions are handed over.
3. Save/report any unresolved incidents.
4. Ensure workstation is logged out/secured according to local policy.
