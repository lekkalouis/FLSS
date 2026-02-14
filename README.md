# Flippen Lekka Scan Station (FLSS)

## Overview

FLSS is an operations web app for warehouse dispatch, Shopify fulfillment, pricing support, stock control, and traceability workflows.

- **Backend:** Node.js + Express (`server.js`, `src/`)
- **Frontend:** single-page app served from `public/index.html` + `public/app.js`
- **API base path:** `/api/v1`

The repository has been trimmed to the current product scope. Legacy standalone page entrypoints (`/pos.html`, `/stock.html`, `/price-manager.html`) have been removed in favor of SPA routes only.

---

## Current application scope

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

- Shopify API helper + token strategy
- ParcelPerfect helper
- SMTP email helper
- Pricing store/domain support

---

## API overview

Default local base URL: `http://localhost:3000/api/v1`

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
PRINTNODE_API_KEY=...
PRINTNODE_PRINTER_ID=...

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

Open `http://localhost:3000` and navigate modules via the sidebar.

---

## Repository structure

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
