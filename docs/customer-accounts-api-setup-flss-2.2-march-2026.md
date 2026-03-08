# Customer Accounts API setup (FLSS 2.2 · March 2026)

This guide shows the **end-to-end setup** for customer accounts API flows in FLSS 2.2, including Shopify customer-account-backed access for the agent portal.

## 1) Confirm runtime and baseline

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start FLSS:
   ```bash
   npm run dev
   ```
3. Confirm API health:
   ```bash
   curl -s http://localhost:3000/api/v1/healthz
   ```
   Expected:
   ```json
   {"ok":true}
   ```

## 2) Configure required environment values

Create/update `.env` for your environment.

### Minimum for customer accounts API

- `PORT` (optional, defaults via app config)
- `HOST` (usually `0.0.0.0` in LAN/server usage)

### For Shopify customer-account context + App Proxy signatures

- `SHOPIFY_STORE`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`

> `SHOPIFY_CLIENT_SECRET` is required if you want strict App Proxy signature validation for `signature` query strings.

## 3) Understand FLSS customer-accounts API surfaces

Base path: `/api/v1/customer-accounts`

### Legacy token-based account routes

- `POST /register`
- `POST /login`
- `POST /logout`
- `GET /me`
- `PUT /me`
- `GET /catalog`
- `GET /orders`
- `POST /orders`

These routes use the FLSS bearer-token model (`Authorization: Bearer <token>`).

### Shopify customer-account-backed agent portal routes

- `GET /agent-portal/session`
- `GET /agent-portal/promo-materials`
- `POST /agent-portal/generate-marketing-material`

These routes require Shopify customer identity context in query parameters and/or forwarded headers.

## 4) Shopify customer identity requirements

The agent portal routes accept customer context from Shopify App Proxy / customer-account entrypoints:

### Query parameters (preferred for proxy use)

- `logged_in_customer_id`
- `logged_in_customer_email`
- `logged_in_customer_first_name`
- `logged_in_customer_last_name`

### Header fallback

- `x-shopify-customer-id`
- `x-shopify-customer-email`
- `x-shopify-customer-first-name`
- `x-shopify-customer-last-name`

If neither customer ID nor customer email is present, FLSS returns `401`.

## 5) App Proxy signature validation behavior

When both of these are true:

1. request includes `?signature=...`, and
2. `SHOPIFY_CLIENT_SECRET` is configured,

FLSS verifies the HMAC signature before serving data.

If verification fails, FLSS returns `401` with `Invalid Shopify signature`.

## 6) Smoke test the new agent portal APIs

### 6.1 Session endpoint (success)

```bash
curl -s "http://localhost:3000/api/v1/customer-accounts/agent-portal/session?logged_in_customer_email=agent%40example.com&logged_in_customer_first_name=Alex&logged_in_customer_last_name=Agent"
```

### 6.2 Promo materials endpoint (success)

```bash
curl -s "http://localhost:3000/api/v1/customer-accounts/agent-portal/promo-materials?logged_in_customer_email=agent%40example.com"
```

### 6.3 Generate marketing material (success)

```bash
curl -s -X POST "http://localhost:3000/api/v1/customer-accounts/agent-portal/generate-marketing-material?logged_in_customer_email=agent%40example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignGoal": "Build weekly re-orders",
    "offer": "10% launch discount",
    "audience": "Retail stores",
    "channel": "Email + WhatsApp",
    "productFocus": "Chili bites, Droewors",
    "callToAction": "Reply YES to secure stock"
  }'
```

### 6.4 Missing customer context (expected failure)

```bash
curl -i -s "http://localhost:3000/api/v1/customer-accounts/agent-portal/session"
```

Expected status: `401`.

## 7) Frontend entrypoint for agents

FLSS includes a static page:

- `/agent-portal.html`

Typical usage from Shopify customer-account/App Proxy flow:

```text
https://<flss-host>/agent-portal.html?logged_in_customer_email=...&logged_in_customer_first_name=...&logged_in_customer_last_name=...&signature=...
```

The page calls the APIs above to:

1. confirm customer session context,
2. list promo materials,
3. generate marketing campaign copy.

## 8) Troubleshooting

### 401 Unauthorized on agent portal routes

- Confirm `logged_in_customer_email` or `logged_in_customer_id` is present.
- If `signature` is provided, ensure it matches Shopify App Proxy signing and the configured `SHOPIFY_CLIENT_SECRET`.

### 501 Shopify not configured on Shopify-specific endpoints

- Set `SHOPIFY_STORE`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.

### OAuth interactions

The customer-accounts API routes are treated as public API paths by the OAuth middleware, but internal route-level guards still enforce customer identity/token requirements per endpoint.

## 9) Verification checklist (March 2026 release)

- [ ] `.env` values set for runtime and Shopify app credentials.
- [ ] `/api/v1/healthz` returns `{"ok":true}`.
- [ ] Agent portal session endpoint returns customer payload when query params are present.
- [ ] Agent portal endpoint returns `401` when customer context is absent.
- [ ] Marketing material generation returns `201` and includes `headline` + `message`.
- [ ] `npm test` passes.

