# FLSS Developer Documentation

## Purpose
This guide is for engineers working on FLSS services, UI modules, and integrations.

## System architecture
- **Backend:** Express app bootstrapped in `src/app.js`, mounted from `server.js`.
- **Frontend:** SPA shell in `public/index.html` with controller logic in `public/app.js` and module-specific code under `public/views/`.
- **API root:** `/api/v1`.

## Development workflow
1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Open `http://localhost:3000`
4. Use sidebar routes to test each module view.

## Backend module map
- `src/routes/status.js` – health/status checks.
- `src/routes/config.js` – runtime frontend config.
- `src/routes/parcelperfect.js` – quote, booking, and place lookups.
- `src/routes/shopify*.js` – Shopify domain endpoints.
- `src/routes/pricing.js` – pricing model persistence.
- `src/routes/traceability.js` – PO/invoice/inspection lineage.
- `src/routes/alerts.js` – operational alert triggers.

## Frontend module map
- `public/views/dashboard.js` – dashboard module launcher catalog.
- `public/views/flocs.js` – Sales Order Workbench.
- `public/views/stock.js` – Inventory Control workflows.
- `public/views/price-manager.js` – Pricing Control Center.
- `public/views/stockists.js` – Distribution Network management.
- `public/views/traceability.js` – traceability operations.

## Engineering conventions
- Keep route paths stable even when UI naming changes.
- Prefer module-local state in each `public/views/*.js` file.
- Use `src/services/*` for external integration logic.
- Avoid exposing secrets or tokens to the browser.
