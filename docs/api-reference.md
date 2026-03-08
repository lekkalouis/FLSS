# FLSS API and Interface Reference

Base API path: `/api/v1`

This file inventories the current route surface and the root-level runtime interfaces that sit outside `/api/v1`.

## Access legend

- Public: available without an OAuth session
- OAuth session protected: requires a valid OAuth page or API session when OAuth is enabled
- Bearer or local controller access: accepts an OAuth session, a configured bearer token, or local-network fallback depending on route configuration
- Compatibility only: retained for older flows, not the preferred surface

## 1. Public bootstrap, docs, and auth

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

- `POST /environment/ingest` is public only when OAuth is disabled; when OAuth is enabled it accepts either an OAuth session or the `ROTARY_TOKEN` bearer token.

## 2. Controller status stream

Access: OAuth session protected

```text
GET /controller/status
GET /controller/events
```

## 3. Dispatch state, actions, remote, and telemetry

### View access routes

Access: OAuth session protected

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

- These routes accept an OAuth session.
- If `ROTARY_TOKEN` is configured, they require that bearer token when no OAuth session is present.
- If `ROTARY_TOKEN` is not configured, private-network callers are accepted.

### Remote and environment write routes

Access: Bearer or local controller access

```text
POST /dispatch/environment
POST /dispatch/remote/heartbeat
POST /dispatch/remote/action
```

Notes:

- These routes accept an OAuth session.
- If `REMOTE_TOKEN` is configured, they require that bearer token when no OAuth session is present.
- If `REMOTE_TOKEN` is not configured, they fall back to the rotary authorization rules.

### Remote status route

Access: Public

```text
GET /dispatch/remote/status
```

### Telemetry ingest route

Access: OAuth session protected or `ROTARY_TOKEN` bearer when OAuth is enabled

```text
POST /environment/ingest
```

## 4. System settings, templates, printers, and print history

Access: OAuth session protected

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

Access: OAuth session protected

```text
POST /pp
GET /pp/place
POST /pp/matrix
```

## 6. Customer accounts

Access: Public

```text
POST /customer-accounts/register
POST /customer-accounts/login
POST /customer-accounts/logout
GET /customer-accounts/me
PUT /customer-accounts/me
GET /customer-accounts/catalog
GET /customer-accounts/orders
POST /customer-accounts/orders
GET /customer-accounts/agent-portal/session
GET /customer-accounts/agent-portal/promo-materials
POST /customer-accounts/agent-portal/generate-marketing-material
```

## 7. Shopify proxy and dispatch flows

Access: OAuth session protected unless otherwise noted above

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

## 8. Unified operations: catalog, inventory, buy, make, and audit

Access: OAuth session protected

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

## 9. Compatibility-only module routes

> Compatibility only: the routes below are retained for older flows or older frontends. The preferred operator surfaces are `/stock`, `/buy`, `/make`, and `/admin`.

### Manufacturing compatibility routes

Access: OAuth session protected

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

Access: OAuth session protected

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

## 10. Other operational modules

### Agent commissions

Access: OAuth session protected

```text
GET /agent-commissions/rules
POST /agent-commissions/rules
DELETE /agent-commissions/rules/:id
GET /agent-commissions/payments
POST /agent-commissions/payments
GET /agent-commissions/dashboard
```

### Order payments

Access: OAuth session protected

```text
GET /order-payments/dashboard
GET /order-payments/bank-payments
POST /order-payments/allocate
```

### Alerts

Access: OAuth session protected

```text
POST /alerts/book-truck
```

### Traceability

Access: OAuth session protected

```text
GET /traceability/template.xlsx
POST /traceability/report
```

## 11. Root-level runtime interfaces

These routes are served outside `/api/v1`.

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
