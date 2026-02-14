# FLSS Stockists Module (Store Locator + Agent Network)

This module implements a source-of-truth stockist directory for FLSS with these business rules:

- Agents are primary verified entities.
- Retailers supplied by agents are stored as declarative directory entries.
- Retailers are not inferred from order history.
- Shopify customer sync only applies to tagged agent customers.

## Data model implemented

Persisted in `data/stockists.json` with top-level arrays:

- `stockists`
  - Core fields: `id`, `name`, `type`, `is_shopify_customer`, `shopify_customer_id`, `active`, contact + address + geolocation, timestamps.
  - Agent-specific metadata: `coverage_area`, `agent_code`, `show_in_locator`.
- `agentRetailers`
  - Fields include `agent_id`, `retailer_name`, address, optional phone/notes, optional lat/lng, timestamps.
- `agentSkuRange`
  - Fields include `agent_id`, `sku`, `availability_label`, `priority_score`, timestamps.
- `geocodeCache`
  - Address lookup cache used by directory geocoding.

## Endpoints

### Public

- `GET /api/locator/agents`
- `GET /api/locator/agents/:id`
- `GET /api/locator/retailers?agent_id=`

Equivalent versions also available under `/api/v1/...`.

### Admin (requires `Bearer ADMIN_TOKEN` when configured)

- `POST /api/admin/agents/:id/retailers`
- `PUT /api/admin/retailers/:id`
- `DELETE /api/admin/retailers/:id`
- `PUT /api/admin/agents/:id/sku-range`
- `POST /api/admin/stockists/sync/shopify-agents`

Equivalent versions also available under `/api/v1/admin/...`.

## Locator performance + cache

- Locator payloads are cached in-memory for 15 minutes.
- Cache is invalidated after retailer and SKU range mutations and after Shopify sync.

## Geocoding behavior

- Retailer create flow attempts geocoding via OpenStreetMap Nominatim.
- If geocoding fails, retailer still saves.
- Successful geocode results are cached by normalized address string.

## Audit log

- Admin mutations and sync operations append JSON lines to `data/stockists-audit.log`.
