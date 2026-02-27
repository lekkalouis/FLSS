# FLSS API Reference (Current)

Base URL: `/api/v1`

This reference mirrors route definitions under `src/routes/`.

## Health, status, and config

- `GET /healthz`
- `GET /statusz`
- `GET /config`

## Documentation topics

- `GET /docs`
- `GET /docs/:slug`

## ParcelPerfect

- `POST /pp`
- `GET /pp/place?q=<search>`
- `POST /pp/matrix`

## PrintNode

- `POST /printnode/print`
- `POST /printnode/print-delivery-note`
- `POST /printnode/print-url`

## Alerts

- `POST /alerts/book-truck`

## Customer accounts

- `POST /customer-accounts/register`
- `POST /customer-accounts/login`
- `POST /customer-accounts/logout`
- `GET /customer-accounts/me`
- `PUT /customer-accounts/me`
- `GET /customer-accounts/catalog`
- `GET /customer-accounts/orders`
- `POST /customer-accounts/orders`

## Liquid templates

- `GET /liquid-templates`
- `POST /liquid-templates`
- `DELETE /liquid-templates/:id`

## Notification templates

- `GET /notification-templates`
- `POST /notification-templates`
- `DELETE /notification-templates/:id`

## Traceability

- `GET /traceability/template.xlsx`
- `POST /traceability/report`

## Shopify

### Customers and customer metadata

- `GET /shopify/customers/search`
- `GET /shopify/customers/recent`
- `GET /shopify/customers/:id/metafields`
- `GET /shopify/customers/by-access-code`
- `POST /shopify/customers`

### Product and pricing data

- `GET /shopify/products/search`
- `GET /shopify/products/collection`
- `GET /shopify/payment-terms/options`
- `POST /shopify/variants/price-tiers`
- `POST /shopify/variants/price-tiers/fetch`
- `POST /pricing/resolve`
- `POST /pricing/reconcile-draft-order`
- `GET /pricing/status/:draftOrderId`

### Draft orders and purchase orders

- `POST /shopify/draft-orders`
- `POST /shopify/draft-orders/complete`
- `POST /shopify/draft-orders/purchase-order`
- `POST /draft-orders/purchase-order`
- `POST /shopify/purchase-orders`
- `GET /shopify/purchase-orders/open`
- `GET /shopify/purchase-orders/raw-materials`

### Orders and workflows

- `POST /shopify/orders`
- `POST /shopify/orders/cash`
- `GET /shopify/orders/by-name/:name`
- `POST /shopify/orders/parcel-count`
- `GET /shopify/orders/open`
- `GET /shopify/orders/list`
- `POST /shopify/orders/run-flow`
- `POST /shopify/orders/tag`

### Fulfillment and shipment

- `GET /shopify/shipments/recent`
- `GET /shopify/fulfillment-events`
- `POST /shopify/fulfill`
- `POST /shopify/ready-for-pickup`
- `POST /shopify/collection/fulfill-from-code`

### Inventory

- `GET /shopify/inventory-levels`
- `GET /shopify/locations`
- `POST /shopify/inventory-levels/set`
- `POST /shopify/inventory-levels/transfer`

### Notifications

- `POST /shopify/notify-collection`
