# Flippen Lekka Scan Station (FLSS)

FLSS is a Node + Express operations platform for order capture, dispatch workflows, shipping bookings, label printing, inventory actions, pricing tiers, templates, commissions, payment allocation, and traceability.

- **Backend API base:** `/api/v1`
- **Primary SPA shell:** `http://localhost:3000`
- **WebSocket endpoint:** `/ws/controller`
- **Static utility pages:** served from `public/*.html`

## App scope (current)

### Internal SPA routes (single shell)

- `/` — **Orders / Scan Station**
- `/ops` — **Dispatch Board**
- `/docs` — **Docs browser** (renders `README.md` + `docs/*.md`)
- `/flowcharts` — **Dispatch/packing flow guidance**
- `/flocs` — **Order Capture (FLOCS)**
- `/stock` — **Stock tools**
- `/price-manager` — **Price Manager**
- `/dispatch-settings` — **Dispatch settings panel** (admin-unlocked)
- `/logs` — **Ops logs panel** (admin-unlocked)
- `/admin` and `/changelog` — internal utility views

### Standalone pages and tools

- `/shipping-matrix.html` — ParcelPerfect quote matrix simulator
- `/order-capture-custom.html` — password-gated custom order capture page
- `/customer-accounts.html` — customer self-service demo flows
- `/purchase-orders.html` — tagged purchase-order draft order flow
- `/liquid-templates.html` — template CRUD + preview
- `/notification-templates.html` — notification template CRUD + preview
- `/traceability.html` — batch traceability report generator
- `/pos.html` — POS/order capture utility
- `/station-controller.html` — station/controller control + monitoring
- `/agent-commissions.html` — commission rules, dashboard, payment logging
- `/order-payments.html` — bank payment matching/allocation workflow

## Living docs

The in-app docs route (`/docs`) loads markdown from this repository.

Core docs to keep current:

- `docs/operator-manual.md` — operating workflows
- `docs/button-action-map.md` — control-to-action map
- `docs/architecture.md` — architecture and integration boundaries
- `docs/data-model.md` — source-of-truth and entity model
- `docs/api-reference.md` — complete route surface

## Architecture snapshot

For full details, see `docs/architecture.md`.

```mermaid
flowchart LR
  subgraph Client
    SPA[SPA shell]
    Tools[Standalone pages]
    Controller[Remote controller clients]
  end

  subgraph Server[Express + WebSocket]
    API[/api/v1 routes]
    WS[/ws/controller]
    Static[public/ static assets]
    Docs[Docs loader]
  end

  subgraph Integrations
    Shopify[(Shopify)]
    ParcelPerfect[(ParcelPerfect)]
    PrintNode[(PrintNode)]
    SMTP[(SMTP)]
  end

  SPA --> API
  Tools --> API
  Controller --> API
  Controller --> WS
  Server --> Static
  Server --> Docs
  API --> Shopify
  API --> ParcelPerfect
  API --> PrintNode
  API --> SMTP
```

## API modules (complete)

All routes below are mounted at `/api/v1`.

### Core runtime

- `GET /healthz` — liveness
- `GET /statusz` — integration and runtime status summary
- `GET /config` — frontend/runtime config projection

### Controller and dispatch runtime

- `GET /controller/status`
- `GET /controller/events`
- `GET /dispatch/state`
- `POST /dispatch/state`
- `GET /dispatch/environment`
- `POST /dispatch/environment`
- `POST /dispatch/remote/heartbeat`
- `GET /dispatch/remote/status`
- `POST /dispatch/remote/action`
- `GET /dispatch/events`
- `POST /dispatch/next`
- `POST /dispatch/prev`
- `POST /dispatch/confirm`
- `POST /dispatch/print`
- `POST /dispatch/fulfill`

### Environment telemetry

- `POST /environment/ingest`
- `GET /environment`

### Documentation

- `GET /docs`
- `GET /docs/:slug`

### ParcelPerfect

- `POST /pp` — booking/quote proxy
- `GET /pp/place?q=...` — place lookup
- `POST /pp/matrix` — shipping matrix simulation

### PrintNode

- `POST /printnode/print`
- `POST /printnode/print-delivery-note`
- `POST /printnode/print-url`

### Alerts

- `POST /alerts/book-truck` — truck booking email

### Customer accounts demo

- `POST /customer-accounts/register`
- `POST /customer-accounts/login`
- `POST /customer-accounts/logout`
- `GET /customer-accounts/me`
- `PUT /customer-accounts/me`
- `GET /customer-accounts/catalog`
- `GET /customer-accounts/orders`
- `POST /customer-accounts/orders`

### Template management

Liquid templates:

- `GET /liquid-templates`
- `POST /liquid-templates`
- `DELETE /liquid-templates/:id`

Notification templates:

- `GET /notification-templates`
- `POST /notification-templates`
- `DELETE /notification-templates/:id`

### Agent commissions

- `GET /agent-commissions/rules`
- `POST /agent-commissions/rules`
- `DELETE /agent-commissions/rules/:id`
- `GET /agent-commissions/payments`
- `POST /agent-commissions/payments`
- `GET /agent-commissions/dashboard`

### Order payments

- `GET /order-payments/dashboard`
- `GET /order-payments/bank-payments`
- `POST /order-payments/allocate`

### Traceability

- `GET /traceability/template.xlsx` — sample workbook template
- `POST /traceability/report` — batch traceability report generation

### Shopify proxy groups

Customers and metadata:

- `GET /shopify/customers/search`
- `GET /shopify/customers/recent`
- `GET /shopify/customers/:id/metafields`
- `GET /shopify/payment-terms/options`
- `GET /shopify/customers/by-access-code`
- `POST /shopify/customers`

Products and pricing tiers:

- `GET /shopify/products/search`
- `GET /shopify/products/collection`
- `POST /shopify/variants/price-tiers`
- `POST /shopify/variants/price-tiers/fetch`

Draft orders, purchase-order helpers, and pricing resolution:

- `POST /shopify/draft-orders`
- `POST /shopify/draft-orders/complete`
- `POST /shopify/draft-orders/purchase-order`
- `POST /draft-orders/purchase-order`
- `POST /shopify/purchase-orders`
- `GET /shopify/purchase-orders/open`
- `GET /shopify/purchase-orders/raw-materials`
- `POST /pricing/resolve`
- `POST /pricing/reconcile-draft-order`
- `GET /pricing/status/:draftOrderId`

Orders and dispatch flows:

- `POST /shopify/orders`
- `POST /shopify/orders/cash`
- `GET /shopify/orders/by-name/:name`
- `POST /shopify/orders/parcel-count`
- `GET /shopify/orders/open`
- `GET /shopify/orders/list`
- `POST /shopify/orders/run-flow`
- `POST /shopify/orders/tag`
- `POST /shopify/orders/delivery-qr-payload`

Shipments and fulfillments:

- `GET /shopify/shipments/recent`
- `GET /shopify/orders/fulfilled/recent`
- `GET /shopify/fulfillment-events`
- `POST /shopify/fulfill`
- `POST /shopify/ready-for-pickup`
- `POST /shopify/collection/fulfill-from-code`
- `POST /shopify/delivery/complete-from-code`

Inventory:

- `GET /shopify/inventory-levels`
- `GET /shopify/locations`
- `POST /shopify/inventory-levels/set`
- `POST /shopify/inventory-levels/transfer`

Notifications:

- `POST /shopify/notify-collection`

## Environment configuration

Create `.env` in project root.

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000

# ParcelPerfect
PP_BASE_URL=
PP_TOKEN=
PP_REQUIRE_TOKEN=true
PP_ACCNUM=
PP_PLACE_ID=
PP_TIMEOUT_MS=10000

# Shopify
SHOPIFY_STORE=
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_API_VERSION=2025-10
SHOPIFY_FLOW_TAG=dispatch_flow
SHOPIFY_TIMEOUT_MS=10000
SHOPIFY_THROTTLE_MAX_CONCURRENCY=4
SHOPIFY_THROTTLE_BASE_DELAY_MS=250
SHOPIFY_THROTTLE_MAX_DELAY_MS=5000
SHOPIFY_THROTTLE_CALL_LIMIT_RATIO=0.85

# PrintNode
PRINTNODE_API_KEY=
PRINTNODE_PRINTER_ID=
PRINTNODE_DELIVERY_NOTE_PRINTER_ID=
PRINTNODE_DELIVERY_NOTE_PRINTER_IDS=
PRINTNODE_TIMEOUT_MS=10000

# SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
SMTP_FROM=
TRUCK_EMAIL_TO=

# UI tuning
UI_BOOKING_IDLE_MS=6000
UI_COST_ALERT_THRESHOLD=250
UI_TRUCK_ALERT_THRESHOLD=25
UI_BOX_DIM_1=40x30x20
UI_BOX_DIM_2=45x35x25
UI_BOX_DIM_3=50x40x30
UI_BOX_MASS_KG=1
UI_ORIGIN_PERSON=
UI_ORIGIN_ADDR1=
UI_ORIGIN_ADDR2=
UI_ORIGIN_ADDR3=
UI_ORIGIN_ADDR4=
UI_ORIGIN_POSTCODE=
UI_ORIGIN_TOWN=
UI_ORIGIN_PLACE_ID=
UI_ORIGIN_CONTACT=
UI_ORIGIN_PHONE=
UI_ORIGIN_CELL=
UI_ORIGIN_NOTIFY=
UI_ORIGIN_EMAIL=
UI_ORIGIN_NOTES=
UI_FEATURE_MULTI_SHIP=true
```
