# FLSS Repo 2.2

FLSS is a Node + Express operations platform for order capture, dispatch, printing, notification delivery, inventory support, pricing tools, traceability, and admin utilities.

## 2.2 highlights

- Dispatch selection now uses a two-phase rotary model: order mode first, then line mode for packing.
- The controller overlay exposes large on-screen `Back / Cancel` and `Confirm / Select` actions for 65-inch dispatch screens.
- Settings are grouped into `General`, `Printers`, `Controller`, `Notifications`, and `Monitoring` inside one modal.
- Notification templates are the runtime source of truth for pickup-ready and truck-collection emails.
- Admin is now the primary launcher for operational tools, while direct standalone URLs still work.
- The changelog feature has been retired from the UI, build flow, and generated assets.

## App surfaces

### SPA routes

- `/` - Orders and dispatch workspace
- `/flocs` - FLOCS order capture
- `/stock` - Stock tools
- `/price-manager` - Price manager
- `/docs` - In-app documentation for Repo 2.2
- `/flowcharts` - Dispatch and packing guidance
- `/dispatch-settings` - Admin-only dispatch settings view
- `/logs` - Admin-only operational logs
- `/admin` - Admin launcher and embedded tool workspace

### Direct standalone tools

Direct URLs remain available for compatibility:

- `/station-controller.html`
- `/manufacturing.html`
- `/product-management.html`
- `/pos.html`
- `/shipping-matrix.html`
- `/order-capture-custom.html`
- `/customer-accounts.html`
- `/purchase-orders.html`
- `/liquid-templates.html`
- `/notification-templates.html`
- `/traceability.html`
- `/agent-commissions.html`
- `/order-payments.html`

## Settings model

System settings are stored server-side and normalized additively so existing records keep their current values.

Persisted sections:

- `sticker`
- `printHistory`
- `relay`
- `controller`
- `notifications`

Notification settings control sender override, fallback recipients, event bindings, event-specific recipients, and test sends.

## API groups

All routes are mounted at `/api/v1`.

- Health and config: `/healthz`, `/statusz`, `/config`
- Docs: `/docs`, `/docs/:slug`
- Dispatch controller: `/dispatch/state`, `/dispatch/events`, `/dispatch/remote/*`, `/dispatch/{next,prev,confirm,back,print,fulfill}`
- System settings: `/system/settings`, `/system/settings/notifications/test`
- Templates: `/liquid-templates`, `/notification-templates`
- Alerts: `/alerts/book-truck`
- Shopify proxy and dispatch flows: `/shopify/*`
- PrintNode: `/printnode/*`
- ParcelPerfect: `/pp*`
- Traceability: `/traceability/*`

See [docs/api-reference.md](docs/api-reference.md) for the current route map.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build and test

```bash
npm run build
npm test
```

`npm run build` now generates the remaining runtime artifacts without any changelog step.

## Configuration

Create `.env` from `.env.example` and set the integrations you use.

Common groups:

- Core server: `PORT`, `HOST`, `NODE_ENV`, `FRONTEND_ORIGIN`
- Shopify: `SHOPIFY_*`
- ParcelPerfect: `PP_*`
- PrintNode: `PRINTNODE_*`
- SMTP: `SMTP_*`
- Dispatch auth and telemetry: `ROTARY_TOKEN`, `REMOTE_TOKEN`, `ROTARY_DEBOUNCE_MS`, `ENV_*`, `REMOTE_HEARTBEAT_*`

See [docs/config-reference.md](docs/config-reference.md) for the current reference.

## Raspberry Pi controller

The wired Pi client lives at `scripts/rotary-pi-wired.py`.

Repo 2.2 defaults:

- Knob rotate: `next` / `prev`
- Knob click: confirm flow
- Confirm side button: confirm flow
- Back side button: context-aware `back`
- Print button: `GPIO19`
- Fulfill button: `GPIO26`

Setup guides:

- [docs/rotary-pi-wired.md](docs/rotary-pi-wired.md)
- [docs/raspberry-pi-all-in-one-setup.md](docs/raspberry-pi-all-in-one-setup.md)

## Documentation map

- [docs/operator-manual.md](docs/operator-manual.md)
- [docs/api-reference.md](docs/api-reference.md)
- [docs/config-reference.md](docs/config-reference.md)
- [docs/button-action-map.md](docs/button-action-map.md)
- [docs/build-guide.md](docs/build-guide.md)
- [docs/data-model.md](docs/data-model.md)
