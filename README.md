# Flippen Lekka Scan Station (FLSS)

## Overview

FLSS is an operations web app for warehouse dispatch, order fulfillment, printing, customer communication, pricing, stock control, and traceability workflows.

- **Backend:** Node.js + Express (`server.js`, `src/`)
- **Frontend:** single-page app served from `public/index.html` + `public/app.js`
- **Primary API base path:** `/api/v1`
- **Additional public/admin stockist aliases:** `/api/locator/*`, `/api/admin/*`

The product now runs as a unified SPA with route-based modules and shared API services.

---

## Current application scope

### SPA modules

- **Dashboard (`/`)**
  - Operations KPIs, module launch cards, and checklist visibility.
- **Dispatch Console (`/scan`)**
  - Barcode parsing, order lookup, parcel accumulation, booking triggers, and label/fulfillment actions.
- **Order Operations Board (`/ops`)**
  - Open-order triage, combined dispatch handling, document actions, and shipment workflows.
- **Fulfillment Timeline (`/fulfillment-history`)**
  - Recently shipped, delivered, pickup-ready, and collected order streams.
- **Customer Directory (`/contacts`)**
  - Shopify customer listing and filter/search workflows.
- **Knowledge Hub (`/docs`)**
  - In-app documentation links by persona.
- **Process Blueprints (`/flowcharts`)**
  - Visual process guidance for dispatch and escalation.
- **Sales Order Workbench (`/flocs`)**
  - Customer/product lookup, draft order creation, and direct order placement.
- **Inventory Control (`/stock`)**
  - Inventory level lookup plus set/transfer adjustments.
- **Pricing Control Center (`/price-manager`)**
  - Pricing list/rule management and Shopify tier-price tools.
- **Print Station (`/print-station`)**
  - Template lifecycle, print settings, print history, and reprint workflows.
- **Traceability (`/traceability`)**
  - Open PO/invoice capture, inspection lifecycle, COA registration, and finished-batch lookup.
- **Distribution Network (`/stockists`)**
  - Agent/retailer directory and SKU-range management.
- **Year Planner (`/year-planner`)**
  - Planning board for annual operational scheduling.

---

## Documentation structure

- `docs/README.md` — index of all available docs.
- `docs/operator-docs.md` — operator runbooks.
- `docs/admin-docs.md` — platform governance and admin controls.
- `docs/dev-docs.md` — engineering architecture and implementation notes.
- `docs/database-and-remote-access.md` — PostgreSQL schema, deployment, and remote tunnel setup.
- `docs/stockists-module.md` — stockist and agent-network domain reference.
- `docs/raspberry-pi-physical-station.md` — physical station integration notes.

---

## Backend responsibilities

### App bootstrap and middleware

`src/app.js` composes the application with:

- Helmet security headers + production rate limiting
- JSON body parsing
- CORS policy with private-network allowance in non-production
- Morgan request logging
- Admin-token guard for privileged routes (`/flocs`, `/simulate`, Shopify/admin APIs)
- API router mounting under `/api/v1`
- Additional `/api` mounting for stockist public/admin aliases
- Static hosting of `public/` and SPA catch-all routing

### Routers (`src/routes`)

- `status.js`: health and integration status (`/healthz`, `/statusz`)
- `config.js`: frontend runtime config (`/config`)
- `parcelperfect.js`: courier quote/booking and place lookup proxy endpoints
- `shopify.js` (+ nested files): customers, products, draft/orders, fulfillments, inventory, notifications, fulfillment history
- `pricing.js`: pricing list/rule storage and price resolution
- `printnode.js`: PrintNode print + print-url handoff
- `alerts.js`: dispatch alert notifications
- `traceability.js`: traceability datastore and audit chain endpoints
- `stockists/public.js`: locator endpoints
- `stockists/admin.js`: stockist administration endpoints
- `wholesale.js`: print station + discount profile APIs
- `customer-docs.js`: customer PDF lookup/email/print helpers

### Services (`src/services`)

- Shopify API helper + token strategy
- ParcelPerfect helper
- SMTP email helper
- Pricing store/domain support
- Customer-doc retrieval service
- Wholesale template + print orchestration services
- Stockist locator/store/audit services

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
  - `POST /printnode/print-url`
- **Wholesale automation + print station**
  - `/wholesale/templates*`
  - `/wholesale/print-settings`
  - `/wholesale/print-history`
  - `/wholesale/discount-profiles*`
- **Customer docs + mail**
  - `GET /customer-docs?email=&name=&orderNo=`
  - `POST /customer-docs/email`
  - `POST /customer-docs/print`
- **Shopify (selected groups)**
  - customers, products, orders, draft orders, fulfillments, inventory, notifications, fulfillment history
- **Alerts**
  - `POST /alerts/book-truck`
- **Traceability**
  - state snapshots, POs, invoices, captures, COAs, inspections, finished-batch mapping, lookup
- **Stockists/locator**
  - `/locator/agents`, `/locator/retailers`
  - `/admin/agents/*`, `/admin/stockists/sync/shopify-agents`

---

## Configuration

Use `.env.example` as baseline. Common variables:

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
FRONTEND_ORIGIN=*

SHOPIFY_STORE=...
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...

PP_BASE_URL=...
PRINTNODE_API_KEY=...
PRINTNODE_PRINTER_ID=...

SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...

CUSTOMER_DOCS_DIR=...
ADMIN_TOKEN=...
DATABASE_URL=...
DB_SSL=true
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
- `public/index.html` — SPA shell + module views
- `public/app.js` — SPA orchestration and route/state logic
- `public/views/` — modular frontend feature logic/styles
- `data/` — local JSON stores (pricing, stockists, wholesale, traceability)
- `docs/` — audience-based docs plus deep dives
- `pi_station/` — Raspberry Pi helper scripts
