# FLSS Developer Documentation

## Purpose
This guide is for engineers working on FLSS services, UI modules, and integrations.

## System architecture
- **Backend:** Express app bootstrapped in `src/app.js`, mounted from `server.js`.
- **Frontend:** SPA shell in `public/index.html` with coordinator logic in `public/app.js` and module code under `public/views/`.
- **API roots:** `/api/v1` primary API plus `/api/*` aliases for stockist locator/admin endpoints.

## Development workflow
1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Open `http://localhost:3000`
4. Validate sidebar routes and module interactions.

## Backend module map
- `src/routes/status.js` – health/status checks.
- `src/routes/config.js` – runtime frontend config.
- `src/routes/parcelperfect.js` – quote, booking, and place lookups.
- `src/routes/shopify*.js` – customers, products, orders, fulfillment, inventory, notifications.
- `src/routes/pricing.js` – pricing list/rule persistence and resolution.
- `src/routes/traceability.js` – PO/invoice/inspection lineage.
- `src/routes/stockists/*.js` – locator and stockist admin APIs.
- `src/routes/wholesale.js` – print station and discount profile APIs.
- `src/routes/customer-docs.js` – customer document lookup/email/print.
- `src/routes/alerts.js` – operational alert triggers.

## Frontend module map
- `public/views/dashboard.js` – dashboard launcher catalog.
- `public/views/fulfillment-history.js` – fulfillment timeline streams.
- `public/views/contacts.js` – customer directory filters and list rendering.
- `public/views/flocs.js` – Sales Order Workbench.
- `public/views/stock.js` – inventory workflows.
- `public/views/price-manager.js` – pricing administration.
- `public/views/stockists.js` – distribution network management.
- `public/views/traceability.js` – traceability operations.
- `public/views/year-planner.js` – yearly planning board.
- `public/views/wholesale-automation.js` – print station and wholesale automation workflows.

## Engineering conventions
- Keep route paths stable when UI naming changes.
- Prefer module-local state in `public/views/*.js` modules.
- Keep external integration logic in `src/services/*`.
- Never expose server-side credentials to browser code.
