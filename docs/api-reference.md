# FLSS API Reference (Repo 2.2)

Base URL: `/api/v1`

This reference covers the active endpoints that matter for Repo 2.2 operations.

## Health and docs

- `GET /healthz`
- `GET /statusz`
- `GET /config`
- `GET /docs`
- `GET /docs/:slug`

## Dispatch controller

### State and events

- `GET /dispatch/state`
- `POST /dispatch/state`
  - `selectionMode` is included in request and response payloads.
- `GET /dispatch/events`

### Rotary and legacy action endpoints

- `POST /dispatch/next`
- `POST /dispatch/prev`
- `POST /dispatch/confirm`
- `POST /dispatch/back`
- `POST /dispatch/print`
- `POST /dispatch/fulfill`

### Remote controller endpoints

- `POST /dispatch/remote/heartbeat`
- `GET /dispatch/remote/status`
- `POST /dispatch/remote/action`
  - Supported actions: `next`, `prev`, `confirm`, `back`, `print`, `fulfill`, `confirm_hold`, `set_packed_qty`, `qty_increase`, `qty_decrease`

### Environment telemetry

- `GET /dispatch/environment`
- `POST /dispatch/environment`
- `POST /environment/ingest`
- `GET /environment`

## System settings and notifications

- `GET /system/settings`
- `PUT /system/settings`
- `POST /system/settings/notifications/test`
- `GET /notification-templates`
- `POST /notification-templates`
- `DELETE /notification-templates/:id`
- `GET /liquid-templates`
- `POST /liquid-templates`
- `DELETE /liquid-templates/:id`

Notification runtime endpoints:

- `POST /shopify/notify-collection`
  - Resolves the enabled pickup-ready template at send time.
- `POST /alerts/book-truck`
  - Resolves the enabled truck-collection template at send time.

## Print and shipping services

- `POST /printnode/print`
- `POST /printnode/print-delivery-note`
- `POST /printnode/print-url`
- `POST /pp`
- `GET /pp/place?q=<search>`
- `POST /pp/matrix`

## Shopify proxy groups

### Customers and account metadata

- `GET /shopify/customers/search`
- `GET /shopify/customers/recent`
- `GET /shopify/customers/:id/metafields`
- `GET /shopify/payment-terms/options`
- `GET /shopify/customers/by-access-code`
- `POST /shopify/customers`

### Products and price tiers

- `GET /shopify/products/search`
- `GET /shopify/products/collection`
- `POST /shopify/variants/price-tiers`
- `POST /shopify/variants/price-tiers/fetch`

### Draft orders, pricing, and purchase-order helpers

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

### Orders and dispatch flows

- `POST /shopify/orders`
- `POST /shopify/orders/cash`
- `GET /shopify/orders/by-name/:name`
- `POST /shopify/orders/parcel-count`
- `GET /shopify/orders/open`
- `GET /shopify/orders/list`
- `POST /shopify/orders/run-flow`
- `POST /shopify/orders/tag`
- `POST /shopify/orders/delivery-qr-payload`
- `POST /shopify/ready-for-pickup`
- `POST /shopify/collection/fulfill-from-code`
- `POST /shopify/delivery/complete-from-code`

### Shipments and inventory

- `GET /shopify/shipments/recent`
- `GET /shopify/fulfillment-events`
- `POST /shopify/fulfill`
- `GET /shopify/inventory-levels`
- `GET /shopify/locations`
- `POST /shopify/inventory-levels/set`
- `POST /shopify/inventory-levels/transfer`

## Other operational modules

- Customer accounts: `/customer-accounts/*`
- Manufacturing: `/manufacturing/*`
- Product management: `/product-management/*`
- Agent commissions: `/agent-commissions/*`
- Order payments: `/order-payments/*`
- Traceability: `/traceability/*`
