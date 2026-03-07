# FLSS Build, Run, and Deployment Guide

FLSS runs directly from Node.js source. The same runtime serves the SPA, the `/api/v1` routes, compatibility redirects, `/deliver`, and `/ws/controller`.

## 1. Runtime prerequisites

- Node.js 20+ recommended
- npm 10+ recommended
- SQLite access for `LOCAL_DB_PATH`
- Optional integrations: Shopify, ParcelPerfect, PrintNode, SMTP, OAuth provider
- Optional shell utilities for the legacy backup flow: `bash`, `zip`, and `unzip`

## 2. Install dependencies

```bash
npm install
```

For reproducible CI installs:

```bash
npm ci
```

## 3. Configure `.env`

Create `.env` from `.env.example` and set the integrations you need.

Minimum local boot values:

```dotenv
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
```

Common additions:

- OAuth: `OAUTH_*`
- Shopify: `SHOPIFY_*`, `DELIVERY_CODE_SECRET`
- ParcelPerfect: `PP_*`
- PrintNode: `PRINTNODE_*`
- SMTP: `SMTP_*`, `TRUCK_EMAIL_TO`
- Dispatch controller: `ROTARY_TOKEN`, `REMOTE_TOKEN`, `ENV_*`

See [config-reference.md](config-reference.md) for the full reference.

## 4. Generate runtime artifacts

```bash
npm run build
```

`npm run build` generates:

- `public/data/purchase-order-catalog.generated.json`
- the traceability template workbook used by `/api/v1/traceability/template.xlsx`

## 5. Start in development

```bash
npm run dev
```

Open:

- SPA: `http://localhost:3000`
- API: `http://localhost:3000/api/v1`
- delivery check-in: `http://localhost:3000/deliver`

## 6. Start in production

Cross-platform production start:

```bash
npm start
```

`npm start` calls `node scripts/start-production.mjs`, which sets `NODE_ENV=production` before importing `server.js`.

If you need to launch the server manually:

- Bash: `NODE_ENV=production node server.js`
- PowerShell: `$env:NODE_ENV='production'; node server.js`

## 7. Tests

Run the full suite:

```bash
npm test
```

Notes:

- The route tests boot the real app and validate docs, auth, dispatch, print, unified operations, and compatibility routes.
- If your `.env` contains live Shopify credentials, some tests can hit the configured store APIs. Use a safe test store or a sanitized `.env` in CI.

## 8. Deployment notes

Suggested order:

1. `npm ci`
2. `npm run build`
3. `npm test`
4. Inject runtime secrets and integration config
5. `npm start`

The runtime writes `flss.pid` on boot and serves both APIs and static assets from one Node process.

## 9. Optional GitHub webhook update flow

The root webhook endpoint is:

- `POST /__git_update`

Requirements:

- `GITHUB_WEBHOOK_SECRET` must be set
- the webhook payload `ref` must match `refs/heads/1.9`
- `update.bat` must exist and be valid for the host

The endpoint verifies the `x-hub-signature-256` HMAC before running the update script.

## 10. Compatibility and legacy notes

> Compatibility / legacy: old standalone HTML routes still exist as redirect entrypoints, but the supported runtime surfaces are `/`, `/stock`, `/buy`, `/make`, `/admin`, `/docs`, and `/deliver`.

Examples:

- `/purchase-orders.html` redirects to `/buy`
- `/manufacturing.html` redirects to `/make`
- `/traceability.html` redirects to `/stock?section=batches`

## 11. Common issues

- CORS failures: check `FRONTEND_ORIGIN`
- OAuth redirect problems: check `OAUTH_REDIRECT_URI` and reverse-proxy headers
- Print failures: confirm `PRINTNODE_*` values and printer mappings in system settings
- Delivery QR failures: check `DELIVERY_CODE_SECRET`
- Controller or Pi failures: verify `ROTARY_TOKEN`, `REMOTE_TOKEN`, and `FLSS_BASE_URL`
- Backup snapshot failures on Windows: install `bash`, `zip`, and `unzip`, or avoid the legacy snapshot endpoints
