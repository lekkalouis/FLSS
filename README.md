# Flippen Lekka Scan Station (FLSS)

## Overview

FLSS is an operations web app for warehouse dispatch, Shopify fulfillment, pricing support, stock control, and traceability workflows.

- **Backend:** Node.js + Express (`server.js`, `src/`)
- **Frontend:** single-page app served from `public/index.html` + `public/app.js`
- **API base path:** `/api/v1`

The repository has been trimmed to the current product scope. Legacy standalone page entrypoints (`/pos.html`, `/stock.html`, `/price-manager.html`) have been removed in favor of SPA routes only.

---

<<<<<<< HEAD
## Current application scope
=======

## Quick project guide

- **Build & run guide**: see `docs/build-guide.md`.
- **Core features, add-ons, and data model**: see `docs/data-model.md`.
- **System mind map + process flow chart**: see `docs/system-mind-map-and-process-flow.md`.
- **Professional frontend/backend user manual**: see `docs/full-user-manual-front-and-backend.md`.
- **Automated tests**: run `npm test`.
- **Expose local app on your Cloudflare domain**: see `docs/cloudflare-tunnel.md`.

---

## Architecture
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51

### SPA modules

- **Dashboard (`/`)**
  - Operations KPIs, module launch tiles, and checklist visibility.
- **Dispatch Console (`/scan`)**
  - Barcode parsing, order lookup, parcel accumulation, booking triggers, and label/fulfillment actions.
- **Order Operations Board (`/ops`)**
  - Open order triage, combined dispatch handling, document actions, and shipment-focused workflows.
- **Fulfillment Timeline (`/fulfillment-history`)**
  - Recently shipped/delivered/collected order streams.
- **Customer Directory (`/contacts`)**
  - Shopify customer listing and filter/search workflow.
- **Knowledge Hub (`/docs`)**
  - In-app documentation with links to operator/admin/developer bundles.
- **Process Blueprints (`/flowcharts`)**
  - Visual process guidance for operations.
- **Sales Order Workbench (`/flocs`)**
  - Customer + product lookup, draft order / order creation, and quote-assisted shipping lines.
- **Inventory Control (`/stock`)**
  - Inventory level lookup and stock adjustment workflows.
- **Pricing Control Center (`/price-manager`)**
  - Tier pricing read/write and optional public price synchronization.
- **Traceability (`/traceability`)**
  - Open PO/invoice capture, inspection lifecycle, COA registration, and finished-batch audit lookup.

---


## Documentation structure

- `docs/operator-docs.md` — operator runbooks.
- `docs/admin-docs.md` — platform governance and admin controls.
- `docs/dev-docs.md` — engineering architecture and implementation notes.
- `docs/database-and-remote-access.md` — PostgreSQL schema, deployment, and remote tunnel setup.
- `docs/README.md` — index of all docs.

---

## Backend responsibilities

### App bootstrap and middleware

`src/app.js` composes the application with:

- Helmet security headers
- JSON parsing
- CORS origin policy
- Global request rate limiting
- Morgan request logging
- API router mounting under `/api/v1`
- Static hosting of `public/` and SPA catch-all routing

### Routers (`src/routes`)

- `status.js`: health and integration status
- `config.js`: frontend runtime config
- `parcelperfect.js`: courier quote/booking and place lookup proxy endpoints
- `shopify.js` (+ nested files): customers, products, orders, fulfillments, inventory, notifications
- `pricing.js`: pricing storage/domain endpoints
- `printnode.js`: PDF print handoff
- `alerts.js`: dispatch alert notifications
- `traceability.js`: traceability datastore and audit chain endpoints

### Services (`src/services`)

<<<<<<< HEAD
- Shopify API helper + token strategy
- ParcelPerfect helper
- SMTP email helper
- Pricing store/domain support
=======
- `/api/v1/pp` sends booking/quote requests as form-encoded payloads.
- `/api/v1/pp/place` performs place lookups by name or postcode.
- `/api/v1/pp/matrix` builds a shipping cost matrix for provided weights and destination major/regional centres (or defaults to built-in South African major/regional centres).

### PrintNode proxy

- `/api/v1/printnode/print` submits base64-encoded PDF labels to PrintNode.

### Email alerts

- `/api/v1/alerts/book-truck` sends “book a truck” emails via SMTP when parcel thresholds are hit.
- `/api/v1/shopify/notify-collection` emails customers when a courier collection is ready.
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51

---

## API overview

Default local base URL: `http://localhost:3000/api/v1`

<<<<<<< HEAD
- **Status/config**
  - `GET /healthz`
  - `GET /statusz`
  - `GET /config`
- **ParcelPerfect**
  - `POST /pp`
  - `GET /pp/place?q=...`
- **PrintNode**
  - `POST /printnode/print`
- **Shopify (selected groups)**
  - customers, products, orders, draft orders, fulfillments, inventory, notifications
- **Alerts**
  - `POST /alerts/book-truck`
- **Traceability**
  - state snapshots, POs, invoices, captures, COAs, inspections, finished-batch mapping, lookup
=======
- Parses barcode scans into `{ orderNo, parcelSeq }`.
- Fetches order details from Shopify and optionally resolves ParcelPerfect place codes.
- Auto-books on `parcel_count` metafields or after a configurable idle timer.
- Prints labels and fulfills orders via Shopify once booking succeeds.

### Dispatch Board

- Polls open orders and recent shipments to keep the board current.
- Allows “Book Now” workflows and delivery note printing.
- Tracks daily parcel counts and triggers truck booking email alerts.

### FLOCS / Order Capture

- Search and create customers (including delivery method metafields).
- Search products or load collections, then build draft orders/orders.
- Request ParcelPerfect quotes to populate shipping lines.
- Includes `/order-capture-custom.html` for local-password-protected custom normal order entry (PBKDF2 hash stored in localStorage).

### Stock Take

- Loads Shopify inventory levels per variant and location.
- Supports stock take (set) and stock received (adjust) modes.
- Persists activity logs in `localStorage` for audit visibility.

### Price Manager

- Reads and writes `custom.price_tiers` variant metafields.
- Optionally syncs pricing tiers into the Shopify variant `price` field.

---

## API reference (server)

All endpoints are available under `http://localhost:3000/api/v1` by default.

### Status & config

- `GET /healthz` — basic health check.
- `GET /statusz` — full integration status (Shopify, ParcelPerfect, PrintNode, SMTP).
- `GET /config` — UI configuration (box dims, booking timeout, origin details, feature flags).

### ParcelPerfect

- `POST /pp` — booking/quote proxy.
- `GET /pp/place?q=...` — place lookup.
- `POST /pp/matrix` — simulate quote matrix by weight and destination place (`centreType`: `all|major|regional`, defaults to `all`).

### PrintNode

- `POST /printnode/print` — submit base64 PDF labels.

### Shopify (selected endpoints)

- Customers: `GET /shopify/customers/search`, `POST /shopify/customers`
- Products: `GET /shopify/products/search`, `GET /shopify/products/collection`
- Price tiers: `POST /shopify/variants/price-tiers`, `POST /shopify/variants/price-tiers/fetch`
- Draft orders: `POST /shopify/draft-orders`, `POST /shopify/draft-orders/complete`
- Orders: `POST /shopify/orders`, `POST /shopify/orders/cash`, `GET /shopify/orders/by-name/:name`, `GET /shopify/orders/open`, `GET /shopify/orders/list`
- Parcel counts: `POST /shopify/orders/parcel-count`
- Flow triggers: `POST /shopify/orders/run-flow`
- Fulfillment: `POST /shopify/fulfill`, `POST /shopify/ready-for-pickup`, `GET /shopify/fulfillment-events`, `GET /shopify/shipments/recent`
- Inventory: `GET /shopify/inventory-levels`, `POST /shopify/inventory-levels/set`, `POST /shopify/inventory-levels/transfer`, `GET /shopify/locations`
- Email notifications: `POST /shopify/notify-collection`

### Alerts

- `POST /alerts/book-truck` — send truck booking email when parcel thresholds are reached.
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51

---

## Configuration

Key environment variables:

```bash
PORT=3000
HOST=0.0.0.0
FRONTEND_ORIGIN=http://localhost:3000

# ParcelPerfect
PP_BASE_URL=...
PP_REQUIRE_TOKEN=true
PP_TOKEN=...
PP_ACCNUM=...
PP_PLACE_ID=...

# Shopify
SHOPIFY_STORE=...
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_API_VERSION=2025-10
SHOPIFY_FLOW_TAG=dispatch_flow

# PrintNode
<<<<<<< HEAD
PRINTNODE_API_KEY=...
PRINTNODE_PRINTER_ID=...
=======
PRINTNODE_API_KEY=your-printnode-api-key
PRINTNODE_PRINTER_ID=123456
# Optional delivery note override(s):
PRINTNODE_DELIVERY_NOTE_PRINTER_ID=223344
PRINTNODE_DELIVERY_NOTE_PRINTER_IDS=223344,223345,223346,223347
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51

# SMTP
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=ops@example.com
TRUCK_EMAIL_TO=dispatch@example.com

# UI tuning
UI_BOOKING_IDLE_MS=6000
UI_COST_ALERT_THRESHOLD=250
UI_TRUCK_ALERT_THRESHOLD=25
UI_FEATURE_MULTI_SHIP=true
```

---

## Run locally

```bash
npm install
npm run dev
```

<<<<<<< HEAD
Open `http://localhost:3000` and navigate modules via the sidebar.
=======
Open `http://localhost:3000` for the Scan Station/Dispatch/Docs SPA, `http://localhost:3000/flocs` for order capture, `http://localhost:3000/shipping-matrix.html` for shipping matrix simulation, `http://localhost:3000/order-capture-custom.html` for password-protected custom normal order capture, `http://localhost:3000/stock` for stock take, and `http://localhost:3000/price-manager` for price tier management.

---

## Testing

```bash
npm test
```

The test suite includes utility unit tests and API smoke tests for core health/config routes.
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51

---

## Repository structure

<<<<<<< HEAD
- `server.js` — startup entrypoint
- `src/app.js` — middleware + API mounting + static hosting
- `src/config.js` — env-driven config
- `src/routes/` — API routers
- `src/services/` — integration services
- `public/index.html` — SPA shell + views
- `public/app.js` — SPA orchestration and route/state logic
- `public/views/` — modular frontend feature logic/styles
- `data/` — local JSON stores for pricing + traceability
- `docs/` — audience-based documentation (operator/admin/dev) plus deep dives
- `pi_station/` — Raspberry Pi helper scripts
=======
- `server.js` — entrypoint that boots the Express app.
- `src/app.js` — middleware orchestration + static hosting bootstrap (uses route manifest).
- `src/config.js` — environment configuration.
- `src/routes/index.js` — centralized API router manifest (single place to add/remove backend route modules).
- `src/routes/` — ParcelPerfect, Shopify, PrintNode, alerts, config, status route modules.
- `src/services/` — Shopify token handling + SMTP helpers.
- `public/` — SPA UI (HTML/CSS/JS), route entrypoints, and assets.
```
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51
