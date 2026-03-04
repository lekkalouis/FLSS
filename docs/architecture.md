# FLSS Architecture (Current)

This document describes the **current runtime architecture** of FLSS, including frontend surfaces, backend services, integrations, and where state/data lives.

## 1) System overview

FLSS is a Node.js + Express operations platform with:

- one primary SPA shell (`public/index.html` + `public/app.js`),
- multiple standalone HTML tools in `public/*.html`,
- an API layer under `/api/v1`,
- a websocket channel for station-controller events (`/ws/controller`),
- external integrations (Shopify, ParcelPerfect, PrintNode, SMTP),
- local JSON/file-backed stores for selected operational modules.

```mermaid
flowchart LR
  subgraph Clients
    SPA[Main SPA / public/index.html]
    Tools[Standalone tools / public/*.html]
    Pi[Pi/Controller clients]
  end

  subgraph Server[Node + Express + WS]
    API[/REST API /api/v1/]
    WS[/WebSocket /ws/controller]
    Static[Static file hosting]
    Docs[Docs loader /api/v1/docs]
  end

  subgraph Internal
    Services[Domain services /src/services]
    LocalState[(JSON + in-memory state)]
  end

  subgraph External
    Shopify[(Shopify Admin API)]
    ParcelPerfect[(ParcelPerfect API)]
    PrintNode[(PrintNode API)]
    SMTP[(SMTP server)]
  end

  SPA --> API
  Tools --> API
  Pi --> API
  Pi --> WS

  API --> Services
  WS --> Services
  Services --> LocalState
  Services --> Shopify
  Services --> ParcelPerfect
  Services --> PrintNode
  Services --> SMTP
  Docs --> Static
```

## 2) Frontend surfaces

### 2.1 SPA routes (inside `public/index.html`)

- `/` (scan station / orders)
- `/ops` (dispatch board)
- `/docs` (in-app markdown docs browser)
- `/flowcharts`
- `/flocs` (order capture)
- `/stock`
- `/price-manager`
- `/dispatch-settings` (admin unlock)
- `/logs` (admin unlock)
- `/admin`
- `/changelog`

### 2.2 Standalone pages (`public/*.html`)

- `/shipping-matrix.html`
- `/order-capture-custom.html`
- `/customer-accounts.html`
- `/purchase-orders.html`
- `/liquid-templates.html`
- `/notification-templates.html`
- `/traceability.html`
- `/pos.html`
- `/station-controller.html`
- `/agent-commissions.html`
- `/order-payments.html`

## 3) Backend composition

### 3.1 App server

- Security + middleware: `helmet`, `cors`, global rate-limit, JSON body parsing, `morgan`.
- API routers are mounted as a single set under `/api/v1`.
- Static assets are served from `public/` and OneUI assets from `/vendor/oneui`.
- Non-API routes fall back to `public/index.html` for SPA routing.

### 3.2 WebSocket server

- WebSocket endpoint: `/ws/controller`.
- Used by station-controller clients for bi-directional controller events/status.
- Connected clients can send controller events; server broadcasts status + events.

### 3.3 Router domains

- Status/health/config
- Shopify orchestration
- ParcelPerfect proxy and matrix quoting
- PrintNode print orchestration
- Alerts (truck booking email)
- Dispatch controller + remote station state
- Environment telemetry ingest/read
- Controller event/status feeds
- Customer accounts demo
- Liquid/notification templates
- Agent commissions
- Order payments allocation dashboard
- Traceability report generation
- Docs index/topic serving

## 4) Service and integration boundaries

## 4.1 Shopify (authoritative business records)

Shopify is primary for:

- customers + customer metadata,
- products/variants + tier pricing metafields,
- draft orders and orders,
- fulfillment progress,
- inventory levels/locations,
- tagging/state markers used by dispatch workflows.

## 4.2 ParcelPerfect (shipping quote + booking)

ParcelPerfect handles address place lookup, quotes, and booking outcomes consumed by scan/dispatch flows.

## 4.3 PrintNode (printing side effects)

PrintNode is used for shipment labels, delivery notes, and print-from-URL operations.

## 4.4 SMTP (notifications)

SMTP is used for truck booking notifications and template-driven comms workflows.

## 4.5 Local app state / files

FLSS persists some operational data outside Shopify in local files or in-memory service state (for example dispatch/environment/controller state and module stores such as templates, commissions, and payment allocations).

## 5) Runtime and deployment model

- App starts from `server.js`.
- HTTP and websocket share the same Node server.
- A secured webhook endpoint (`/__git_update`) can trigger deployment script execution for a target branch.
- Environment variables control integrations, UI tuning, and cross-origin behavior.

## 6) High-level request flows

### 6.1 Scan + dispatch fulfillment

1. Operator scans order.
2. FLSS fetches order context from Shopify.
3. FLSS requests quote/booking from ParcelPerfect.
4. FLSS triggers PrintNode printing.
5. FLSS updates Shopify order/fulfillment state.

### 6.2 Controller/remote station telemetry

1. Controller client sends events over `/ws/controller` and/or dispatch endpoints.
2. FLSS normalizes/ingests status.
3. SPA/ops views poll or subscribe to reflect near-real-time status.

### 6.3 Documentation runtime

1. Docs UI loads topic index via `/api/v1/docs`.
2. Server reads markdown from `README.md` and `docs/*.md`.
3. Topic content is rendered in-app without separate deployment.
