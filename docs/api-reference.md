# FLSS API and Interface Reference

Base API path: `/api/v1`

This file inventories the current route surface and the root-level runtime interfaces that sit outside `/api/v1`.

## Access legend

- Public: available without a customer portal session
- Customer portal protected: requires a valid Shopify customer portal session
- Bearer or local controller access: accepts a configured bearer token or local-network fallback depending on route configuration
- Compatibility only: retained for older flows, not the preferred surface

## 1. Public bootstrap, docs, and portal auth

Access: Public

```text
GET /healthz
GET /statusz
GET /config
GET /docs
GET /docs/:slug
GET /auth/session
GET /auth/login
GET /auth/callback
GET /auth/logout
POST /auth/logout
GET /environment
POST /shopify/collection/fulfill-from-code
POST /shopify/delivery/complete-from-code
```

Special note:

- `/auth/*` drives Shopify Customer Account login for the dedicated `/portal` route.
- `POST /environment/ingest` remains public for telemetry ingestion.

## 2. Controller status stream

Access: Public

```text
GET /controller/status
GET /controller/events
```

## 3. Dispatch state, actions, remote, and telemetry

### View access routes

Access: Public

```text
GET /dispatch/state
POST /dispatch/state
GET /dispatch/environment
GET /dispatch/events
```

### Rotary action routes

Access: Bearer or local controller access

```text
POST /dispatch/next
POST /dispatch/prev
POST /dispatch/confirm
POST /dispatch/back
POST /dispatch/print
POST /dispatch/fulfill
```

Notes:

- If `ROTARY_TOKEN` is configured, these routes require that bearer token.
- If `ROTARY_TOKEN` is not configured, private-network callers are accepted.

### Remote and environment write routes

Access: Bearer or local controller access

```text
POST /dispatch/environment
POST /dispatch/remote/heartbeat
POST /dispatch/remote/action
```

Notes:

- If `REMOTE_TOKEN` is configured, these routes require that bearer token.
- If `REMOTE_TOKEN` is not configured, they fall back to the rotary authorization rules.

### Remote status route

Access: Public

```text
GET /dispatch/remote/status
```

### Telemetry ingest route

Access: Public

```text
POST /environment/ingest
```

## 4. System settings, templates, printers, and print history

Access: Public

```text
GET /system/settings
PUT /system/settings
POST /system/settings/notifications/test
POST /system/printers/:printerId/reboot
GET /notification-templates
POST /notification-templates
DELETE /notification-templates/:id
GET /liquid-templates
POST /liquid-templates
DELETE /liquid-templates/:id
GET /print-history
GET /printnode/printers
POST /printnode/print-raw
POST /printnode/print-best-before-stickers
POST /printnode/print-gbox-barcodes
POST /printnode/print
POST /printnode/print-delivery-note
POST /printnode/print-url
```

## 5. ParcelPerfect

Access: Public

```text
POST /pp
GET /pp/place
POST /pp/matrix
```

## 6. Shopify proxy and dispatch flows

Access: Public unless otherwise noted above

### Customers and account metadata

```text
GET /shopify/customers/search
GET /shopify/customers/recent
GET /shopify/customers/:id/metafields
GET /shopify/payment-terms/options
GET /shopify/customers/by-access-code
POST /shopify/customers
```

### Products and price tiers

```text
GET /shopify/products/search
GET /shopify/products/collection
POST /shopify/variants/price-tiers
POST /shopify/variants/price-tiers/fetch
```

### Draft orders, pricing, and purchase-order helpers

```text
POST /shopify/draft-orders
POST /shopify/draft-orders/purchase-order
POST /draft-orders/purchase-order
POST /shopify/purchase-orders
GET /shopify/purchase-orders/open
GET /shopify/purchase-orders/raw-materials
POST /pricing/resolve
POST /pricing/reconcile-draft-order
GET /pricing/status/:draftOrderId
POST /shopify/draft-orders/complete
```

### Orders, shipments, and fulfillment

```text
POST /shopify/orders
POST /shopify/orders/cash
GET /shopify/orders/by-name/:name
POST /shopify/orders/parcel-count
GET /shopify/orders/open
GET /shopify/orders/list
POST /shopify/orders/run-flow
GET /shopify/shipments/recent
GET /shopify/orders/fulfilled/recent
GET /shopify/fulfillment-events
POST /shopify/fulfill
POST /shopify/ready-for-pickup
POST /shopify/notify-collection
POST /shopify/orders/tag
POST /shopify/orders/delivery-qr-payload
```

### Inventory

```text
GET /shopify/inventory-levels
GET /shopify/locations
POST /shopify/inventory-levels/set
POST /shopify/inventory-levels/transfer
```

## 7. Unified operations: catalog, inventory, buy, make, and audit

Access: Public

### Catalog

```text
GET /catalog/products
GET /catalog/materials
POST /catalog/materials
PUT /catalog/materials/:id
GET /catalog/suppliers
GET /catalog/boms
POST /catalog/boms
PUT /catalog/boms/:id
```

### Inventory

```text
GET /inventory/overview
GET /inventory/batches
GET /inventory/movements
GET /inventory/stocktakes
POST /inventory/stocktakes
```

### Buy

```text
GET /buy/purchase-orders
POST /buy/purchase-orders
POST /buy/purchase-orders/:id/dispatch
```

### Make

```text
GET /make/manufacturing-orders
POST /make/manufacturing-orders
POST /make/manufacturing-orders/:id/complete
POST /make/manufacturing-orders/requirements
POST /make/manufacturing-orders/shortages/buy
```

### Audit

```text
GET /audit/log
```

## 8. Compatibility-only module routes

> Compatibility only: the routes below are retained for older flows or older frontends. The preferred operator surfaces are `/stock`, `/buy`, `/make`, and `/admin`.

### Manufacturing compatibility routes

Access: Public

```text
GET /manufacturing/data
POST /manufacturing/products
POST /manufacturing/ingredients
POST /manufacturing/recipes
POST /manufacturing/cost-inputs
GET /manufacturing/sku/:productId/cost
GET /manufacturing/dashboard
```

### Product-management compatibility routes

Access: Public

```text
GET /product-management/products
POST /product-management/products
GET /product-management/ingredients
POST /product-management/ingredients
POST /product-management/ingredient-prices
GET /product-management/suppliers
POST /product-management/suppliers
GET /product-management/packaging-items
POST /product-management/packaging-items
POST /product-management/recipes
POST /product-management/packaging-profiles
POST /product-management/cost-inputs
POST /product-management/price-tiers
POST /product-management/product-prices
GET /product-management/cost/:productId
GET /product-management/dashboard
GET /product-management/sync/status
POST /product-management/sync/now
POST /product-management/backups/snapshot
POST /product-management/backups/restore
GET /product-management/audit-log
```

## 9. Other operational modules

### Agent commissions

Access: Public

```text
GET /agent-commissions/rules
POST /agent-commissions/rules
DELETE /agent-commissions/rules/:id
GET /agent-commissions/payments
POST /agent-commissions/payments
GET /agent-commissions/dashboard
```

### Order payments

Access: Public

```text
GET /order-payments/dashboard
GET /order-payments/bank-payments
POST /order-payments/allocate
```

### Alerts

Access: Public

```text
POST /alerts/book-truck
```

### Traceability

Access: Public

```text
GET /traceability/template.xlsx
POST /traceability/report
```

## 10. Root-level runtime interfaces

These routes are served outside `/api/v1`.

### Customer portal

Access: Customer portal protected

```text
GET /portal
```

### WebSocket controller feed

Access: Public

```text
/ws/controller
```

The server upgrades WebSocket connections on `/ws/controller` and streams `ready`, `controller-event`, and `controller-status` messages.

### GitHub update webhook

Access: Signed GitHub webhook only

```text
POST /__git_update
```

Requirements:

- `x-hub-signature-256` must validate against `GITHUB_WEBHOOK_SECRET`
- the payload `ref` must match `refs/heads/1.9`
