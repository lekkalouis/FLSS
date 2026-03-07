# FLSS

FLSS is a Node + Express operations platform for order capture, dispatch, printing, notifications, inventory control, purchasing, manufacturing, pricing, and admin tooling.

The current workspace serves the SPA, compatibility pages, APIs, and controller interfaces from one runtime. When code and docs disagree, treat the current checkout and passing tests as the source of truth.

## Primary routes

Main operator routes:

- `/` - Orders and dispatch workspace
- `/fulfillment-history` - Recently fulfilled orders and delivery history
- `/flocs` - Sales order capture
- `/stock` - Inventory, raw materials, batches, and stocktakes
- `/buy` - Purchase order orchestration
- `/make` - Manufacturing order orchestration
- `/docs` - In-app documentation browser
- `/flowcharts` - Packing and dispatch decision maps
- `/admin` - Admin launcher
- `/admin/price-manager` - Price Manager
- `/admin/agent-commissions` - Agent Commissions

Public utility route:

- `/deliver` - Driver delivery check-in page used by signed delivery QR codes

## Compatibility redirects

> Compatibility / legacy: the routes below are retained only so old bookmarks and printed links still land on the supported surfaces.

- `/purchase-orders.html` -> `/buy`
- `/manufacturing.html` -> `/make`
- `/product-management.html` -> `/stock?section=inventory&tab=raw-materials`
- `/price-manager.html` -> `/admin/price-manager`
- `/agent-commissions.html` -> `/admin/agent-commissions`
- `/traceability.html` -> `/stock?section=batches`
- `/dispatch-settings` -> `/stock?notice=tool-retired`
- `/logs` -> `/stock?notice=tool-retired`
- `/station-controller.html` -> `/stock?notice=tool-retired`
- `/pos.html` -> `/stock?notice=tool-retired`
- `/shipping-matrix.html` -> `/stock?notice=tool-retired`
- `/order-capture-custom.html` -> `/stock?notice=tool-retired`
- `/customer-accounts.html` -> `/stock?notice=tool-retired`
- `/liquid-templates.html` -> `/stock?notice=tool-retired`
- `/notification-templates.html` -> `/stock?notice=tool-retired`

## Runtime interfaces

HTTP API base:

- `/api/v1`

Non-API runtime interfaces:

- `/ws/controller` - WebSocket feed for controller status and events
- `POST /__git_update` - GitHub webhook entrypoint for the repo update script

See [docs/api-reference.md](docs/api-reference.md) for the exact route inventory and access rules.

## Development

Install and run locally:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Generate runtime artifacts and run tests:

```bash
npm run build
npm test
```

Production start is cross-platform:

```bash
npm start
```

`npm start` runs [`scripts/start-production.mjs`](scripts/start-production.mjs), which sets `NODE_ENV=production` and imports `server.js`.

## Configuration

Copy `.env.example` to `.env` and fill in the integrations you use.

Common groups:

- Core runtime: `PORT`, `HOST`, `NODE_ENV`, `FRONTEND_ORIGIN`
- OAuth / SSO: `OAUTH_*`
- Shopify and delivery flows: `SHOPIFY_*`, `DELIVERY_CODE_SECRET`, `TRACKING_COMPANY`
- ParcelPerfect: `PP_*`
- PrintNode: `PRINTNODE_*`
- Notifications: `SMTP_*`, `TRUCK_EMAIL_TO`
- Local data: `LOCAL_DB_PATH`, `ASSETS_PATH`, `BACKUPS_PATH`, `SYNC_ENABLED`
- Dispatch and telemetry: `ROTARY_TOKEN`, `REMOTE_TOKEN`, `ENV_*`, `REMOTE_HEARTBEAT_*`
- UI defaults: `UI_*`
- Ops automation: `GITHUB_WEBHOOK_SECRET`, `FLSS_BASE_URL`, CI metadata variables

See [docs/config-reference.md](docs/config-reference.md) for the complete reference.

## Documentation map

Operator workflow docs:

- [docs/operator-manual.md](docs/operator-manual.md)
- [docs/button-action-map.md](docs/button-action-map.md)
- [docs/traceability-workflow.md](docs/traceability-workflow.md)
- [docs/rotary-pi-wired.md](docs/rotary-pi-wired.md)
- [docs/raspberry-pi-all-in-one-setup.md](docs/raspberry-pi-all-in-one-setup.md)

Technical and maintenance docs:

- [docs/api-reference.md](docs/api-reference.md)
- [docs/build-guide.md](docs/build-guide.md)
- [docs/config-reference.md](docs/config-reference.md)
- [docs/data-model.md](docs/data-model.md)
- [docs/offline-storage-and-backups.md](docs/offline-storage-and-backups.md)
- [docs/shopify-sync-rules.md](docs/shopify-sync-rules.md)
- [docs/price-tiers-theme.md](docs/price-tiers-theme.md)
- [docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md)

Archived historical docs:

- [docs/archive/README.md](docs/archive/README.md)
