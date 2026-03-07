# FLSS Configuration Reference

This reference covers both process-level environment variables and persisted runtime settings.

## 1. Environment variables

Use `.env` for secrets, upstream hosts, runtime behavior, and compatibility helpers.

### Core server and frontend access

- `PORT` - HTTP listen port. Default: `3000`.
- `HOST` - HTTP listen host. Default: `0.0.0.0`.
- `NODE_ENV` - runtime mode. Typical values: `development`, `production`.
- `FRONTEND_ORIGIN` - comma-separated allowed browser origins. Use the public hostname in deployed environments.

### OAuth 2.0 / SSO

- `OAUTH_PROVIDER_NAME` - provider label shown in auth state.
- `OAUTH_AUTHORIZATION_URL` - OAuth authorization endpoint.
- `OAUTH_TOKEN_URL` - OAuth token endpoint.
- `OAUTH_USERINFO_URL` - optional user-profile endpoint.
- `OAUTH_CLIENT_ID` - OAuth client ID.
- `OAUTH_CLIENT_SECRET` - OAuth client secret.
- `OAUTH_SCOPE` - requested OAuth scopes.
- `OAUTH_REDIRECT_URI` - explicit callback URL override.
- `OAUTH_COOKIE_SECURE` - secure-cookie override. If unset, production defaults to secure cookies.
- `OAUTH_SESSION_TTL_MS` - session lifetime in milliseconds. Default: 8 hours.

### ParcelPerfect

- `PP_BASE_URL` - ParcelPerfect base URL.
- `PP_TOKEN` - ParcelPerfect token when token auth is enabled.
- `PP_REQUIRE_TOKEN` - whether ParcelPerfect calls require the token.
- `PP_ACCNUM` - account number used by booking flows.
- `PP_PLACE_ID` - default origin place ID.
- `PP_TIMEOUT_MS` - ParcelPerfect request timeout in milliseconds.

### Shopify, pricing, and delivery flows

- `SHOPIFY_STORE` - Shopify store hostname.
- `SHOPIFY_CLIENT_ID` - Shopify app client ID.
- `SHOPIFY_CLIENT_SECRET` - Shopify app client secret or access secret used by the current integration code.
- `DELIVERY_CODE_SECRET` - signing secret for delivery QR payloads and `/deliver`.
- `SHOPIFY_API_VERSION` - Admin API version used by the server.
- `SHOPIFY_FLOW_TAG` - tag used by dispatch flow triggers.
- `SHOPIFY_TIMEOUT_MS` - Shopify request timeout in milliseconds.
- `SHOPIFY_THROTTLE_MAX_CONCURRENCY` - max parallel Shopify requests.
- `SHOPIFY_THROTTLE_BASE_DELAY_MS` - base delay for throttling and retries.
- `SHOPIFY_THROTTLE_MAX_DELAY_MS` - max delay for throttling and retries.
- `SHOPIFY_THROTTLE_CALL_LIMIT_RATIO` - pressure threshold before throttling increases.
- `TRACKING_COMPANY` - default tracking company label written into shipping flows.

### PrintNode

- `PRINTNODE_API_KEY` - PrintNode API key.
- `PRINTNODE_PRINTER_ID` - default printer ID.
- `PRINTNODE_DELIVERY_NOTE_PRINTER_ID` - legacy dedicated delivery-note printer ID.
- `PRINTNODE_DELIVERY_NOTE_PRINTER_IDS` - comma-separated delivery-note printer pool.
- `PRINTNODE_TIMEOUT_MS` - PrintNode request timeout in milliseconds.

### Maps and notification delivery

- `GOOGLE_MAPS_API_KEY` - projected to the UI config for map-powered features.
- `SMTP_HOST` - SMTP host.
- `SMTP_PORT` - SMTP port.
- `SMTP_USER` - SMTP username.
- `SMTP_PASS` - SMTP password.
- `SMTP_SECURE` - SMTP TLS mode toggle.
- `SMTP_FROM` - default sender address for notification flows.
- `TRUCK_EMAIL_TO` - default truck-booking recipient list or fallback target.

### Local storage and sync

- `LOCAL_DB_PATH` - SQLite database path.
- `ASSETS_PATH` - asset root used for generated files.
- `BACKUPS_PATH` - snapshot and restore working directory.
- `SYNC_ENABLED` - legacy product-management sync toggle.

### Dispatch controller auth and telemetry

- `ROTARY_TOKEN` - bearer token accepted by dispatch action endpoints.
- `ROTARY_DEBOUNCE_MS` - debounce window for dispatch actions.
- `REMOTE_TOKEN` - bearer token accepted by remote-controller endpoints.
- `REMOTE_HEARTBEAT_STALE_MS` - stale threshold for remote heartbeat status.
- `ENV_TEMP_MIN_C` - minimum expected environment temperature.
- `ENV_TEMP_MAX_C` - maximum expected environment temperature.
- `ENV_HUMIDITY_MIN` - minimum expected humidity.
- `ENV_HUMIDITY_MAX` - maximum expected humidity.
- `ENV_STALE_MS` - stale threshold for environment readings.

### UI defaults projected by `/api/v1/config`

- `UI_COST_ALERT_THRESHOLD` - low-margin alert threshold used by the UI.
- `UI_BOOKING_IDLE_MS` - idle delay used by booking flows.
- `UI_TRUCK_ALERT_THRESHOLD` - truck-booking threshold used by the UI.
- `UI_BOX_DIM_1` - default parcel dimension 1.
- `UI_BOX_DIM_2` - default parcel dimension 2.
- `UI_BOX_DIM_3` - default parcel dimension 3.
- `UI_BOX_MASS_KG` - default parcel mass.
- `UI_ORIGIN_PERSON` - default origin company or person label.
- `UI_ORIGIN_ADDR1` - origin address line 1.
- `UI_ORIGIN_ADDR2` - origin address line 2.
- `UI_ORIGIN_ADDR3` - origin address line 3.
- `UI_ORIGIN_ADDR4` - origin address line 4.
- `UI_ORIGIN_POSTCODE` - origin postal code.
- `UI_ORIGIN_TOWN` - origin town.
- `UI_ORIGIN_PLACE_ID` - origin place ID projected to ParcelPerfect payloads.
- `UI_ORIGIN_CONTACT` - origin contact person.
- `UI_ORIGIN_PHONE` - origin phone number.
- `UI_ORIGIN_CELL` - origin cell number.
- `UI_ORIGIN_NOTIFY` - origin notification flag.
- `UI_ORIGIN_EMAIL` - origin email address.
- `UI_ORIGIN_NOTES` - freeform origin notes.
- `UI_FEATURE_MULTI_SHIP` - toggles multi-shipment behavior in the UI.

### Raspberry Pi wired controller

- `FLSS_BASE_URL` - base API URL used by `scripts/rotary-pi-wired.py`.

### GitHub webhook and CI compatibility

- `GITHUB_WEBHOOK_SECRET` - HMAC secret for `POST /__git_update`.
- `PR_NUMBER` - compatibility metadata variable for older CI flows.
- `GITHUB_PR_NUMBER` - compatibility metadata variable for older CI flows.
- `GITHUB_REF` - compatibility metadata variable for older CI flows.
- `PR_URL` - compatibility metadata variable for older CI flows.
- `GITHUB_SERVER_URL` - compatibility metadata variable for older CI flows.
- `GITHUB_REPOSITORY` - compatibility metadata variable for older CI flows.
- `PR_TITLE` - compatibility metadata variable for older CI flows.
- `GITHUB_PR_TITLE` - compatibility metadata variable for older CI flows.
- `GITHUB_ACTOR` - compatibility metadata variable for older CI flows.

These CI metadata variables are not part of the normal runtime path. They remain in `.env.example` for compatibility with older automation.

## 2. Persisted system settings

System settings live in SQLite and are normalized by `src/services/systemSettings.js`.

### `sticker`

Current fields:

- `shelfLifeMonths`
- `defaultButtonQty`
- `commandLanguage`
- `stickerPrinterId`
- `layoutProfile`
- `calibration.xOffsetMm`
- `calibration.yOffsetMm`
- `calibration.labelWidthMm`
- `calibration.labelHeightMm`
- `calibration.columnGapMm`
- `calibration.line1YMm`
- `calibration.line2YMm`
- `calibration.line3YMm`
- `calibration.textRotation`

Current normalization rules:

- `commandLanguage` allowed values: `PPLB`, `PPLA`, `ZPL`
- `layoutProfile` currently allows only `continuous_4up`
- `xOffsetMm` and `yOffsetMm` clamp to `-12` through `12`
- `labelWidthMm` clamps to `8` through `60`
- `labelHeightMm` clamps to `8` through `80`
- `columnGapMm` clamps to `0` through `30`
- `line1YMm` clamps to `0` through `40`
- `line2YMm` clamps to `0` through `50`
- `line3YMm` clamps to `0` through `70`
- `textRotation` allows integer values `0` through `3`

Current defaults:

- `shelfLifeMonths: 12`
- `defaultButtonQty: 50`
- `commandLanguage: PPLB`
- `layoutProfile: continuous_4up`
- `calibration.xOffsetMm: 0`
- `calibration.yOffsetMm: 0`
- `calibration.labelWidthMm: 22`
- `calibration.labelHeightMm: 16`
- `calibration.columnGapMm: 3`
- `calibration.line1YMm: 2`
- `calibration.line2YMm: 6.5`
- `calibration.line3YMm: 11`
- `calibration.textRotation: 0`

### `printers.documents`

Document printer fields:

- `deliveryNote`
- `printDocs`
- `taxInvoice`
- `parcelStickers`
- `lineItemStickers`

Current defaults in code:

- `deliveryNote: 74467271`
- `printDocs: 74901099`
- `taxInvoice: 74467271`
- `parcelStickers: 74901099`
- `lineItemStickers: 74901099`

### `printHistory`

- `retentionDays` - normalized to `1` through `3650`

### `relay`

- `enabled`
- `targets[]`

Each relay target stores:

- `id`
- `name`
- `relayTarget`
- `relayChannel`
- `printerId`

### `controller`

- `showOnScreenButtons`
- `requireConnectedRemote`
- `highVisibilityMode`

### `notifications`

Top-level fields:

- `senderOverride`
- `fallbackRecipient`
- `events.pickupReady`
- `events.truckCollection`

Each event stores:

- `enabled`
- `templateId`
- `useCustomerEmail`
- `recipients[]`
- `fallbackRecipient`

Current defaults:

- pickup-ready defaults to enabled and uses `flss-pickup-ready-email`
- truck-collection defaults to enabled and uses `flss-truck-collection-email`

### `oneClickActions.gbox`

Fields:

- `title`
- `barcodeValue`
- `subtitle`
- `defaultQty`
- `printerId`

Current defaults:

- `title: GBOX`
- `barcodeValue: GBOX`
- `subtitle: Gift Box`
- `defaultQty: 24`
- `printerId: null`

## 3. Verification

After changing config:

1. restart the server and any Pi-side controller services
2. check `GET /api/v1/config` for projected UI values
3. check `GET /api/v1/statusz` for runtime health
4. check `GET /api/v1/system/settings` for normalized persisted settings
