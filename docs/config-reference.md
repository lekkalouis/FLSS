# FLSS Configuration Reference (Repo 2.2)

Repo 2.2 splits configuration across environment variables and persisted system settings.

## 1. Environment variables

Use `.env` for process-level secrets, upstream hosts, and station runtime behavior.

### Core server

- `PORT` (default `3000`)
- `HOST` (default `0.0.0.0`)
- `NODE_ENV`
- `FRONTEND_ORIGIN`

### OAuth 2.0 / SSO

- `OAUTH_PROVIDER_NAME`
- `OAUTH_AUTHORIZATION_URL`
- `OAUTH_TOKEN_URL`
- `OAUTH_USERINFO_URL`
- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_SCOPE`
- `OAUTH_REDIRECT_URI`
- `OAUTH_COOKIE_SECURE`
- `OAUTH_SESSION_TTL_MS`

### ParcelPerfect

- `PP_BASE_URL`
- `PP_TOKEN`
- `PP_REQUIRE_TOKEN`
- `PP_ACCNUM`
- `PP_PLACE_ID`
- `PP_TIMEOUT_MS`

### Shopify

- `SHOPIFY_STORE`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_API_VERSION`
- `SHOPIFY_FLOW_TAG`
- `SHOPIFY_TIMEOUT_MS`
- `SHOPIFY_THROTTLE_MAX_CONCURRENCY`
- `SHOPIFY_THROTTLE_BASE_DELAY_MS`
- `SHOPIFY_THROTTLE_MAX_DELAY_MS`
- `SHOPIFY_THROTTLE_CALL_LIMIT_RATIO`

### PrintNode

- `PRINTNODE_API_KEY`
- `PRINTNODE_PRINTER_ID`
- `PRINTNODE_DELIVERY_NOTE_PRINTER_ID`
- `PRINTNODE_DELIVERY_NOTE_PRINTER_IDS`
- `PRINTNODE_TIMEOUT_MS`

### SMTP and notification delivery

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `SMTP_FROM`

### Dispatch controller auth and telemetry

- `ROTARY_TOKEN`
- `REMOTE_TOKEN`
- `ROTARY_DEBOUNCE_MS`
- `REMOTE_HEARTBEAT_STALE_MS`
- `ENV_STALE_MS`
- `ENV_TEMP_MIN_C`
- `ENV_TEMP_MAX_C`
- `ENV_HUMIDITY_MIN`
- `ENV_HUMIDITY_MAX`

### UI tuning

- `UI_BOOKING_IDLE_MS`
- `UI_COST_ALERT_THRESHOLD`
- `UI_TRUCK_ALERT_THRESHOLD`
- `UI_BOX_DIM_1`, `UI_BOX_DIM_2`, `UI_BOX_DIM_3`
- `UI_BOX_MASS_KG`
- `UI_ORIGIN_*`
- `UI_FEATURE_MULTI_SHIP`

## 2. Persisted system settings

System settings are stored in SQLite and edited from the SPA settings modal.

### `sticker`

- `shelfLifeMonths`
- `defaultButtonQty`
- `commandLanguage`
- `stickerPrinterId`

### `printHistory`

- `retentionDays`

### `relay`

- `enabled`
- `targets[]`

### `controller`

- `showOnScreenButtons`
- `requireConnectedRemote`
- `highVisibilityMode`

### `notifications`

- `senderOverride`
- `fallbackRecipient`
- `events.pickupReady`
- `events.truckCollection`

Each notification event stores:

- `enabled`
- `templateId`
- `useCustomerEmail`
- `recipients[]`
- `fallbackRecipient`

## 3. Raspberry Pi wired controller variables

`scripts/rotary-pi-wired.py` uses these environment variables:

- `FLSS_BASE_URL`
- `ROTARY_SOURCE`
- `REMOTE_ID`
- `REMOTE_FIRMWARE`
- `ROTARY_CLK_PIN`
- `ROTARY_DT_PIN`
- `ROTARY_SW_PIN`
- `ROTARY_CONFIRM_BTN_PIN`
- `ROTARY_BACK_BTN_PIN`
- `ROTARY_PRINT_BTN_PIN`
- `ROTARY_FULFILL_BTN_PIN`
- `ROTARY_CONFIRM_HOLD_TIME_S`
- `ROTARY_RGB_RED_PIN`
- `ROTARY_RGB_GREEN_PIN`
- `ROTARY_RGB_BLUE_PIN`
- `ROTARY_LED_FEEDBACK_S`
- `ROTARY_MIN_ACTION_GAP_S`
- `REMOTE_HEARTBEAT_INTERVAL_S`
- `ENV_TELEMETRY_INTERVAL_S`
- `ENV_SENSOR_CMD`
- `DHT11_ENABLED`
- `DHT_PIN`
- `DHT_POLL_INTERVAL_S`
- `STATION_ID`

Legacy compatibility remains for `ROTARY_ACTION_BTN_PIN` as the confirm button alias and `ROTARY_SW_HOLD_TIME_S` as the confirm-hold alias.

## 4. Verification

After changing config:

1. Restart the app and any Pi-side services.
2. Check `GET /api/v1/config` for projected UI config.
3. Check `GET /api/v1/statusz` for integration readiness.
4. Check `GET /api/v1/system/settings` for normalized persisted settings.
