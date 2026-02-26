# FLSS Build, Run, and Deployment Guide

This guide reflects the current app architecture: a Node.js runtime server that serves both API routes and static frontend assets.

## 1) Runtime prerequisites

- Node.js **20+** recommended (18+ generally works).
- npm **10+** recommended.
- Environment variables for integrations you intend to use:
  - Shopify Admin API credentials
  - ParcelPerfect credentials/token
  - PrintNode API key/printer IDs
  - SMTP host/user/pass/sender for email features

## 2) Install dependencies

```bash
npm install
```

For CI and reproducible installs:

```bash
npm ci
```

## 3) Configure `.env`

Minimum boot values:

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
```

For full integration values and UI tuning variables, use the environment section in `README.md`.

## 4) Start in development

```bash
npm run dev
```

The app serves:

- SPA shell at `http://localhost:3000`
- API at `http://localhost:3000/api/v1`
- static tools at `/shipping-matrix.html`, `/traceability.html`, etc.

## 5) Run tests

```bash
npm test
```

Tests currently cover unit helpers and route-level behavior for key paths.

## 6) Production start

```bash
NODE_ENV=production npm start
```

There is no bundling/transpile build stage in this repo; deployment runs source directly.

## 7) Suggested deployment pipeline

1. `npm ci`
2. `npm test`
3. Inject runtime secrets/config
4. `NODE_ENV=production npm start`

## 8) Optional operational scripts

- Generate purchase-order catalog JSON:

```bash
npm run po:catalog:generate
```

- Generate traceability sample workbook:

```bash
npm run traceability:template:generate
```

## 9) Common startup issues

- **CORS blocked:** check `FRONTEND_ORIGIN` list and origin host.
- **Shopify calls fail:** validate `SHOPIFY_*` env values and API app permissions.
- **ParcelPerfect requests fail:** verify base URL, token requirement, and account/place IDs.
- **Print jobs fail:** confirm API key and printer IDs.
- **Email endpoints fail:** ensure SMTP host/from credentials are set.
