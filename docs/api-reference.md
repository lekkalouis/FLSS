# FLSS API Reference (Current)

Base URL: `/api/v1`.

This reference mirrors mounted routers in `src/routes/` and lists all active endpoints exposed by the app.

## Health and runtime config

- `GET /healthz` — process liveness.
- `GET /statusz` — integration/runtime readiness summary.
- `GET /config` — frontend/runtime config projection.

## Controller and dispatch runtime

### Controller bridge

- `GET /controller/status`
- `GET /controller/events`

### Dispatch controller

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

## Environment telemetry

- `POST /environment/ingest` — ingest environment sample payloads.
- `GET /environment` — latest aggregated environment data.

## Documentation topics

- `GET /docs`
- `GET /docs/:slug`

## ParcelPerfect

- `POST /pp` — quote/book proxy.
- `GET /pp/place?q=<search>` — place lookup.
- `POST /pp/matrix` — shipping matrix simulator endpoint.

## PrintNode

- `POST /printnode/print`
- `POST /printnode/print-delivery-note`
- `POST /printnode/print-url`

## Alerts

- `POST /alerts/book-truck`

## Customer accounts demo

- `POST /customer-accounts/register`
- `POST /customer-accounts/login`
- `POST /customer-accounts/logout`
- `GET /customer-accounts/me`
- `PUT /customer-accounts/me`
- `GET /customer-accounts/catalog`
- `GET /customer-accounts/orders`
- `POST /customer-accounts/orders`

## Template management

### Liquid templates

- `GET /liquid-templates`
- `POST /liquid-templates`
- `DELETE /liquid-templates/:id`

### Notification templates

- `GET /notification-templates`
- `POST /notification-templates`
- `DELETE /notification-templates/:id`

## Agent commissions

- `GET /agent-commissions/rules`
- `POST /agent-commissions/rules`
- `DELETE /agent-commissions/rules/:id`
- `GET /agent-commissions/payments`
- `POST /agent-commissions/payments`
- `GET /agent-commissions/dashboard`

## Order payments

- `GET /order-payments/dashboard`
- `GET /order-payments/bank-payments`
- `POST /order-payments/allocate`

## Traceability

- `GET /traceability/template.xlsx`
- `POST /traceability/report`

## Shopify proxy domain

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

### Draft orders, PO helpers, and pricing resolution

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

### Shipments and fulfillments

- `GET /shopify/shipments/recent`
- `GET /shopify/orders/fulfilled/recent`
- `GET /shopify/fulfillment-events`
- `POST /shopify/fulfill`
- `POST /shopify/ready-for-pickup`
- `POST /shopify/collection/fulfill-from-code`
- `POST /shopify/delivery/complete-from-code`

### Inventory

- `GET /shopify/inventory-levels`
- `GET /shopify/locations`
- `POST /shopify/inventory-levels/set`
- `POST /shopify/inventory-levels/transfer`

### Notifications

- `POST /shopify/notify-collection`
