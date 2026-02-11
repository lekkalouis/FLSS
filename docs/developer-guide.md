# FLSS Developer Guide

This guide is for engineers who build, test, and deploy FLSS.

## 1) Technical stack

- **Runtime**: Node.js (ESM modules).
- **Server**: Express with `helmet`, `cors`, `morgan`, and `express-rate-limit`.
- **Frontend**: Static SPA assets served from `public/`.
- **External integrations**:
  - Shopify Admin API (OAuth client credentials + token cache)
  - ParcelPerfect API
  - PrintNode API
  - SMTP for alert/notification emails

## 2) Project structure

- `server.js` — process entrypoint.
- `src/app.js` — Express middleware, API router mounting, static hosting.
- `src/config.js` — environment-driven app configuration.
- `src/routes/` — route modules for status/config/shopify/parcelperfect/printnode/alerts.
- `src/services/` — upstream integration helpers (Shopify auth, email transport, etc).
- `src/utils/` — shared HTTP/status helpers.
- `public/` — SPA and route entrypoint pages.
- `docs/` — repository documentation.

## 3) Local development

### Prerequisites

- Node.js 18+ (recommended)
- npm 9+

### Install and run

```bash
npm install
npm run dev
```

App defaults to `http://localhost:3000`.

## 4) Environment configuration

All configuration is loaded from environment variables in `src/config.js`.

### Core server

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
```

### Shopify

```bash
SHOPIFY_STORE=your-store-subdomain
SHOPIFY_CLIENT_ID=your-client-id
SHOPIFY_CLIENT_SECRET=your-client-secret
SHOPIFY_API_VERSION=2025-10
SHOPIFY_FLOW_TAG=dispatch_flow
```

### ParcelPerfect

```bash
PP_BASE_URL=https://adpdemo.pperfect.com/ecomService/v10/Json/
PP_REQUIRE_TOKEN=true
PP_TOKEN=your-token
PP_ACCNUM=your-account
PP_PLACE_ID=4663
```

### PrintNode

```bash
PRINTNODE_API_KEY=your-api-key
PRINTNODE_PRINTER_ID=123456
```

### SMTP / email alerts

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_SECURE=false
SMTP_FROM=ops@example.com
TRUCK_EMAIL_TO=dispatch@example.com
```

### UI tuning and feature flags

```bash
UI_COST_ALERT_THRESHOLD=250
UI_BOOKING_IDLE_MS=6000
UI_TRUCK_ALERT_THRESHOLD=25
UI_FEATURE_MULTI_SHIP=true
```

Optional origin and box defaults (used by booking flows):

```bash
UI_BOX_DIM_1=40
UI_BOX_DIM_2=40
UI_BOX_DIM_3=30
UI_BOX_MASS_KG=5

UI_ORIGIN_PERSON="Flippen Lekka Holdings (Pty) Ltd"
UI_ORIGIN_ADDR1="7 Papawer Street"
UI_ORIGIN_ADDR2="Blomtuin, Bellville"
UI_ORIGIN_ADDR3="Cape Town, Western Cape"
UI_ORIGIN_ADDR4="ZA"
UI_ORIGIN_POSTCODE=7530
UI_ORIGIN_TOWN="Cape Town"
UI_ORIGIN_PLACE_ID=4663
UI_ORIGIN_CONTACT=Louis
UI_ORIGIN_PHONE=0730451885
UI_ORIGIN_CELL=0730451885
UI_ORIGIN_NOTIFY=1
UI_ORIGIN_EMAIL=admin@flippenlekkaspices.co.za
UI_ORIGIN_NOTES="Louis 0730451885 / Michael 0783556277"
```

## 5) API surface (high-level)

Base path: `/api/v1`

- `GET /healthz` — liveness probe.
- `GET /statusz` — integration health with diagnostics.
- `GET /config` — runtime UI config.
- ParcelPerfect:
  - `POST /pp`
  - `GET /pp/place?q=...`
- PrintNode:
  - `POST /printnode/print`
- Shopify:
  - customer, product, draft order/order, fulfillment, inventory, tier pricing, and notification routes.
- Alerts:
  - `POST /alerts/book-truck`

## 6) Operational checks for developers

### Smoke checks after startup

```bash
curl -sS http://localhost:3000/api/v1/healthz
curl -sS http://localhost:3000/api/v1/statusz
curl -sS http://localhost:3000/api/v1/config
```

Interpretation:

- `healthz.ok = true` means app process is up.
- `statusz.ok = true` means all required integrations are configured and healthy.
- `statusz.services.*.message` identifies missing credentials quickly.

## 7) Security and reliability notes

- Keep all credentials in environment variables (never hardcode secrets).
- Restrict CORS using `FRONTEND_ORIGIN` outside local development.
- Keep `NODE_ENV=production` in production deployments.
- Rotate Shopify, ParcelPerfect, PrintNode, and SMTP credentials periodically.
- Place FLSS behind a reverse proxy/TLS terminator.

## 8) Deployment checklist

Before deploying:

1. Set all production secrets and origins.
2. Run local smoke checks (`healthz`, `statusz`, `config`).
3. Validate one end-to-end booking in a non-production environment.
4. Confirm printer and email paths from `statusz`.

After deploying:

1. Verify `/api/v1/healthz` returns 200.
2. Verify `/api/v1/statusz` is green.
3. Perform a controlled label-print + fulfillment test.

## 9) Troubleshooting quick reference

- **`statusz.services.shopify.ok=false`**: check Shopify store, client ID/secret, outbound connectivity.
- **`parcelPerfect` not configured**: ensure `PP_BASE_URL` is set and token present when required.
- **`printNode` not configured**: verify both `PRINTNODE_API_KEY` and `PRINTNODE_PRINTER_ID`.
- **Email failures**: validate `SMTP_HOST` + `SMTP_FROM`, then auth settings.
- **CORS errors in browser**: set `FRONTEND_ORIGIN` to the exact SPA host.
