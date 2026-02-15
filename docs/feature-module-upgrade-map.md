# FLSS Feature / Module Inventory + Upgrade Opportunities

This document lists the current app capabilities across **core modules** and **add-on modules**, then proposes practical next upgrades for each.

## 1) Core product modules (operator-critical)

### 1. Dashboard (`/`)
**Current features**
- KPI overview and module launch tiles.
- Shared operational checklist and daily workflow prompts.

**Possible next upgrades**
- Team-level dashboards (warehouse lead vs picker vs admin presets).
- Real-time KPI streaming (WebSocket/SSE) instead of timed polling.
- SLA breach heatmap by order age and lane.

### 2. Dispatch Console (`/scan`)
**Current features**
- Scan-session based order handling with parcel accumulation.
- Booking flow progression (quote/service/book/print/notify).
- Auto/manual mode behavior for booking workflows.

**Possible next upgrades**
- Offline-first scan queue with automatic replay on reconnect.
- AI-assisted anomaly detection (duplicate labels, unusual parcel count, late scan).
- Guided exception resolution panel (address mismatch, quote failure, stock shortfall).

### 3. Order Operations Board (`/ops`)
**Current features**
- Open-order lane board and dispatch progress rendering.
- Selection panel for batch actions and shipment context.

**Possible next upgrades**
- Dynamic priority scoring (margin, SLA, customer tier, courier congestion).
- Multi-user conflict awareness (record locks / live cursor hints).
- Scenario simulation mode before committing batch operations.

### 4. Fulfillment Timeline (`/fulfillment-history`)
**Current features**
- Streams for shipped/delivered/pickup/collected records.
- Search + status filtering + paginated sections.

**Possible next upgrades**
- Courier milestone enrichment (in transit, exception, depot hold).
- Exportable audit packs per date range/customer/order tag.
- Delay root-cause analytics and auto-alerting for overdue milestones.

### 5. Customer Directory (`/contacts`)
**Current features**
- Shopify customer listing with search and location/tier filters.

**Possible next upgrades**
- Customer 360 card (LTV, recent issues, preferred delivery profile).
- Bulk actions for tier/tag updates with approval workflow.
- Risk flags for frequent failed deliveries / address changes.

### 6. Sales Order Workbench (`/flocs`)
**Current features**
- Customer/product lookup and order/draft-order creation.
- Quote-assisted shipping line integration.

**Possible next upgrades**
- Smart quote fallback matrix (preferred courier, weight brackets, geo zones).
- Assisted up-sell suggestions based on account history.
- Template-driven recurring order creation for B2B clients.

### 7. Inventory Control (`/stock`)
**Current features**
- Inventory level lookups and adjustment operations through Shopify endpoints.

**Possible next upgrades**
- Cycle-count workflow with discrepancy approval chain.
- Predictive replenishment based on velocity and seasonality.
- Transfer planning between locations with SLA-aware recommendations.

### 8. Pricing Control Center (`/price-manager`)
**Current features**
- Pricing lists/rules management and pricing resolution endpoints.
- Price tier sync/fetch support for Shopify variants.

**Possible next upgrades**
- Effective-dating and rollback for pricing changes.
- Margin floor guardrails with warning/override workflow.
- Rule conflict simulator before publishing changes.

### 9. Traceability (`/traceability`)
**Current features**
- Open PO and invoice capture, document capture, COA registration.
- Inspection lifecycle and finished batch lookup/audit chain endpoints.

**Possible next upgrades**
- End-to-end lot genealogy graph (raw input → finished SKU → shipment).
- One-click recall report generation with impacted customer lists.
- Evidence bundle signing + immutable audit storage integration.

## 2) Add-on functional modules (adjacent capabilities)

### 10. Distribution Network / Stockists (`/stockists`)
**Current features**
- Agent-focused stockist directory with retailer records.
- Public locator endpoints + admin CRUD + Shopify agent sync.
- Geocode cache and mutation audit logging.

**Possible next upgrades**
- Radius search and map clustering for public locator UX.
- SLA/coverage scoring per agent with automated gaps detection.
- Distributor performance dashboard (sell-through proxy + service quality notes).

### 11. Year Planner (`/year-planner`)
**Current features**
- Month-by-month income/budget/actual planning.
- Local persistence and CSV export per year.

**Possible next upgrades**
- Shared cloud persistence + role-based collaboration.
- Version snapshots and variance commentary workflows.
- Scenario plans (best/base/worst case) with side-by-side comparison.

### 12. Knowledge Hub (`/docs`) + Process Blueprints (`/flowcharts`)
**Current features**
- In-app access to operator/admin/dev docs and process guidance.

**Possible next upgrades**
- Contextual docs drawer that opens relevant SOPs from any module.
- Search with semantic answers over internal docs.
- SOP acknowledgment tracking and periodic re-certification prompts.

## 3) Core platform modules (backend + integrations)

### API and app core
**Current features**
- Express app composition with security headers, CORS, logging, rate-limiting in production.
- Central API router mounted at `/api/v1`.

**Possible next upgrades**
- OpenAPI spec + contract testing on every route group.
- Structured audit middleware with correlation IDs across requests.
- Background jobs/queue layer for long-running external calls.

### Shopify integration domain
**Current features**
- Route groups for customers, products, orders, fulfillment, inventory, notifications.
- Supports draft orders, open orders, fulfillment history bundles, parcel count operations.

**Possible next upgrades**
- Resilient retry policy and circuit-breaker around Shopify throttling.
- Webhook-driven sync for near real-time status updates.
- Per-endpoint caching and request coalescing for expensive list operations.

### Courier + print + alert services
**Current features**
- ParcelPerfect quote/booking + place lookup proxy.
- PrintNode print and print-url routes.
- Truck booking alert endpoint via SMTP service.

**Possible next upgrades**
- Multi-courier abstraction (fallback carrier when primary quote fails).
- Print job observability (queued/printed/error lifecycle tracking).
- Escalation policy engine for failed truck-booking notifications.

## 4) Edge/physical add-ons (Raspberry Pi station)

### Dispatch console hardware script
**Current features**
- GPIO button workflows for truck booking, status refresh, ready-for-collection.
- LED/buzzer health feedback and optional rotary workflow.

**Possible next upgrades**
- Small display integration (active order + current step + warnings).
- Signed device identity and secure API token rotation.
- Fleet device management for multiple stations.

### Pick-to-light assistant
**Current features**
- Poll open orders and guide pick/fulfill stages via LEDs + confirmation input.

**Possible next upgrades**
- Bin-level lighting orchestration for multi-line orders.
- Computer-vision assisted pick verification.
- Worker productivity analytics by stage transitions.

### Camera guard / document capture automation
**Current features**
- Motion/camera-assisted station concept documented for operational events and capture.

**Possible next upgrades**
- Automatic OCR extraction of invoice/PO metadata.
- Tamper detection and event signing for compliance trails.
- Edge inference for incident classification (false positive reduction).

## 5) Suggested phased roadmap

1. **Stabilize core operations:** dispatch exception handling, fulfillment observability, traceability recall tooling.
2. **Lift integration resilience:** webhook-first events, retries/circuit breakers, async job queue.
3. **Scale planning and partner network:** stockist analytics, shared year planner, pricing governance.
4. **Operational intelligence:** forecasting, anomaly alerts, AI-assisted SOP retrieval.
5. **Physical automation maturity:** managed Pi fleet, smarter pick-to-light, OCR-backed capture flows.
