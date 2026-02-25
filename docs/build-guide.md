# FLSS Build & Run Guide (Current State)

This guide documents how to run, test, and package the current FLSS app.

## 1) Prerequisites

- Node.js 20+ (Node.js 18+ can run the app, but 20+ is recommended for parity with modern tooling).
- npm 10+.
- Access credentials for integrations you plan to use:
  - Shopify Admin API (OAuth client credentials)
  - ParcelPerfect API token/account
  - PrintNode API key + printer id
  - SMTP relay details

## 2) Install dependencies

```bash
npm install
```

For CI and reproducible production installs:

```bash
npm ci
```

## 3) Configure environment

Create a `.env` file in the project root (or provide env vars through your runtime).

Minimal local boot:

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
```

Integration variables are documented in `README.md`.

## 4) Run locally

```bash
npm run dev
```

Open:

- `http://localhost:3000` (Scan Station + main SPA)
- `http://localhost:3000/flocs`
- `http://localhost:3000/stock`
- `http://localhost:3000/price-manager`

## 5) Run tests

```bash
npm test
```

Covers:

- numeric config parsing helper behavior
- app health and config API smoke checks

## 6) Production run

```bash
NODE_ENV=production npm start
```

The production command starts the same Express server with production middleware mode.

## 7) Build/Release notes for current architecture

FLSS currently ships as a runtime Node app (no transpile/bundle build step).

A typical deployment pipeline is:

1. `npm ci`
2. `npm test`
3. `NODE_ENV=production npm start`

If containerizing, expose port `3000` (or your configured `PORT`) and mount/inject env vars securely.
