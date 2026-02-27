# FLSS Configuration Reference

This document explains runtime environment variables used by FLSS.

## 1) Server and CORS

- `PORT` (default `3000`) — Express listen port.
- `HOST` (default `0.0.0.0`) — bind host.
- `NODE_ENV` (default `development`) — runtime mode.
- `FRONTEND_ORIGIN` (default `*`) — allowed origin(s), comma-separated.

## 2) ParcelPerfect

- `PP_BASE_URL`
- `PP_TOKEN`
- `PP_REQUIRE_TOKEN` (`true`/`false`)
- `PP_ACCNUM`
- `PP_PLACE_ID`
- `PP_TIMEOUT_MS` (default `10000`)

## 3) Shopify

- `SHOPIFY_STORE`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_API_VERSION` (default `2025-10`)
- `SHOPIFY_FLOW_TAG` (default `dispatch_flow`)
- `SHOPIFY_TIMEOUT_MS` (default `10000`)
- `SHOPIFY_THROTTLE_MAX_CONCURRENCY` (default `4`)
- `SHOPIFY_THROTTLE_BASE_DELAY_MS` (default `250`)
- `SHOPIFY_THROTTLE_MAX_DELAY_MS` (default `5000`)
- `SHOPIFY_THROTTLE_CALL_LIMIT_RATIO` (default `0.85`)

## 4) PrintNode

- `PRINTNODE_API_KEY`
- `PRINTNODE_PRINTER_ID`
- `PRINTNODE_DELIVERY_NOTE_PRINTER_ID`
- `PRINTNODE_DELIVERY_NOTE_PRINTER_IDS` (comma-separated)
- `PRINTNODE_TIMEOUT_MS` (default `10000`)

## 5) SMTP and notifications

- `SMTP_HOST`
- `SMTP_PORT` (default `587`)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE` (`true`/`false`, default `false`)
- `SMTP_FROM`
- `TRUCK_EMAIL_TO`

## 6) UI behavior and defaults

- `UI_COST_ALERT_THRESHOLD`
- `UI_BOOKING_IDLE_MS`
- `UI_TRUCK_ALERT_THRESHOLD`
- `UI_BOX_DIM_1`, `UI_BOX_DIM_2`, `UI_BOX_DIM_3`
- `UI_BOX_MASS_KG`
- `UI_ORIGIN_PERSON`
- `UI_ORIGIN_ADDR1`, `UI_ORIGIN_ADDR2`, `UI_ORIGIN_ADDR3`, `UI_ORIGIN_ADDR4`
- `UI_ORIGIN_POSTCODE`, `UI_ORIGIN_TOWN`, `UI_ORIGIN_PLACE_ID`
- `UI_ORIGIN_CONTACT`, `UI_ORIGIN_PHONE`, `UI_ORIGIN_CELL`
- `UI_ORIGIN_NOTIFY`, `UI_ORIGIN_EMAIL`, `UI_ORIGIN_NOTES`
- `UI_FEATURE_MULTI_SHIP`

## 7) Verification steps

After changing config:

1. Restart app.
2. Call `/api/v1/config` to verify UI projection.
3. Call `/api/v1/statusz` to verify service readiness.
