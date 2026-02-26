# FLSS Professional User Manual (Frontend and Backend)

## 1. Purpose and audience

This manual is the operational and technical guide for the **Flippen Lekka Scan Station (FLSS)** platform.

It is written for:
- **Operations users** (warehouse and dispatch teams).
- **Sales and order-capture users**.
- **Support users** handling incidents.
- **Developers and administrators** deploying and maintaining the backend.

---

## 2. System overview

FLSS is a Node/Express application serving a browser-based single-page app (SPA). The app orchestrates shipping, fulfillment, printing, stock, and price workflows by proxying requests to external systems.

### Core integrations
- **Shopify Admin API** for customers, products, orders, fulfillments, inventory, and price tier metafields.
- **ParcelPerfect API** for shipping quotes, place resolution, and bookings.
- **PrintNode API** for label and delivery-note printing.
- **SMTP provider** for operational and customer emails.

### High-level modules
- **Scan Station (`/`)**
- **Dispatch Board (`/ops`)**
- **FLOCS / Order Capture (`/flocs`)**
- **Stock Take (`/stock`)**
- **Price Manager (`/price-manager`)**
- **Documentation (`/docs`)**
- Additional admin routes: templates, customer accounts, traceability.

---

## 3. Frontend user guide

## 3.1 Scan Station

**Goal:** Process scanned parcels quickly from booking to fulfillment.

### Typical workflow
1. Scan barcode.
2. Confirm parsed order and parcel sequence.
3. Fetch order context and shipping details.
4. Trigger booking (manual or auto-book).
5. Print label(s).
6. Fulfill order in Shopify.

### Operational notes
- Auto-book behavior can depend on parcel-count metadata and timeout settings.
- Failed bookings should be retried after confirming place code and payload values.
- If printing fails, verify PrintNode credentials/printer mapping before rescanning.

---

## 3.2 Dispatch Board

**Goal:** Keep outstanding operations visible and move orders through dispatch safely.

### Typical workflow
1. Review open orders and recent shipments.
2. Use **Book Now** for urgent/manual dispatch actions.
3. Print delivery notes where required.
4. Monitor daily parcel totals.
5. Trigger or verify truck-booking alert notifications when thresholds are reached.

### Operational notes
- Treat board data as near-real-time and refresh when investigating stale records.
- Verify email recipients for truck alerts in environment configuration.

---

## 3.3 FLOCS / Order Capture

**Goal:** Build and submit customer orders or draft orders with shipping support.

### Typical workflow
1. Search existing customer or create a new one.
2. Search products or load from collections.
3. Build cart/order lines.
4. Request shipping quote (ParcelPerfect) where applicable.
5. Create draft order and optionally complete, or create order directly.

### Operational notes
- Keep customer delivery method metafields accurate to avoid downstream dispatch issues.
- For custom order capture page, local authentication state/password hash is browser-local.

---

## 3.4 Stock Take

**Goal:** Maintain inventory accuracy at Shopify location level.

### Typical workflow
1. Load inventory by location.
2. Select mode:
   - **Stock Take** (set to exact quantity).
   - **Stock Received/Transfer** (adjust quantity).
3. Submit adjustments.
4. Validate returned inventory levels.

### Operational notes
- Activity history is stored in browser `localStorage`; it is not shared between devices.
- Use caution with set operations; they overwrite expected quantity baselines.

---

## 3.5 Price Manager

**Goal:** Manage tiered pricing metadata and optional storefront variant pricing updates.

### Typical workflow
1. Fetch current `custom.price_tiers` variant metafields.
2. Edit tier breakpoints/prices.
3. Save tier metadata back to Shopify.
4. Optionally sync tiers into variant `price` values.

### Operational notes
- Validate pricing in a safe environment before broad production sync.
- Keep internal pricing policy ownership clear before publishing changes.

---

## 3.6 Documentation and Admin views

- **Documentation (`/docs`)**: Embedded guidance and references.
- **Notification/Liquid templates**: Maintain messaging and template artifacts.
- **Customer accounts**: Manage customer account related flows.
- **Traceability**: Use traceability routes/features for batch/order lineage workflows.

---

## 4. Backend technical manual

## 4.1 Runtime architecture

- Backend is an Express application with middleware for security, CORS, JSON parsing, rate limiting, and logging.
- API is mounted at `/api/v1`.
- Static SPA assets are served from `public/` with `index.html` fallback routing.
- The backend is stateless and does not maintain an application database.

---

## 4.2 Route domains

### Status and configuration
- `GET /api/v1/healthz`
- `GET /api/v1/statusz`
- `GET /api/v1/config`

### ParcelPerfect
- `POST /api/v1/pp`
- `GET /api/v1/pp/place?q=...`
- `POST /api/v1/pp/matrix`

### PrintNode
- `POST /api/v1/printnode/print`

### Shopify (selected)
- Customers: search/create
- Products and collections: search/retrieve
- Price tiers: fetch/update variant metafields
- Draft orders: create/complete
- Orders: create/cash/list/open/by-name
- Parcel counts and flow trigger endpoints
- Fulfillment and shipment event endpoints
- Inventory-level and location endpoints
- Collection notification email endpoint

### Alerts
- `POST /api/v1/alerts/book-truck`

### Additional backend domains
- `customer-accounts`
- `docs`
- `liquidTemplates`
- `notificationTemplates`
- `traceability`

---

## 4.3 Environment configuration

Define environment variables before startup. The most important groups are:

- **Server**: `PORT`, `HOST`, `FRONTEND_ORIGIN`, `NODE_ENV`.
- **ParcelPerfect**: base URL, token/credentials, origin place/account settings.
- **Shopify**: store ID, OAuth client credentials, API version, optional Flow tag.
- **PrintNode**: API key, default printer IDs, delivery-note printer overrides.
- **SMTP**: host/port/auth/sender and recipient settings for alerts.

Best practice:
- Use a `.env` file for local development.
- Use secret managers in production.
- Keep separate configs for dev/staging/prod.

---

## 4.4 Startup and operation

### Local start
1. Install dependencies.
2. Populate environment variables.
3. Start the server.
4. Open browser at configured frontend origin/port.

### Production start recommendations
- Run under a process manager (systemd, PM2, or container orchestration).
- Terminate TLS at a trusted reverse proxy/load balancer.
- Enable structured logs and external log retention.
- Restrict CORS to known frontend origins.

---

## 4.5 Security and controls

- **Helmet** hardening headers are enabled.
- **CORS allow-list** logic controls accepted origins.
- **Rate limiting** protects public endpoints.
- **No persistent server-side state** reduces data-at-rest footprint in app runtime.

Operationally:
- Rotate external API credentials on schedule.
- Monitor failed auth and rate-limit spikes.
- Review email recipient controls for alert endpoints.

---

## 4.6 Observability and support runbook

### Health checks
- Use `/healthz` for liveness.
- Use `/statusz` for integration readiness/availability checks.

### Common incident patterns
1. **Shopify failures**
   - Symptoms: order/customer/inventory requests fail.
   - Checks: OAuth credentials, API version, token fetch errors.

2. **ParcelPerfect failures**
   - Symptoms: quote/booking errors, unresolved places.
   - Checks: account/token, request payload validity, place IDs.

3. **Print failures**
   - Symptoms: no labels or notes printed.
   - Checks: API key, printer IDs, print payload encoding.

4. **Email failures**
   - Symptoms: missing truck/collection notifications.
   - Checks: SMTP auth, sender domain policy, recipient settings.

### First-line troubleshooting sequence
1. Validate `statusz` output.
2. Reproduce via affected UI action.
3. Inspect request/response in logs.
4. Isolate integration-specific credentials and payloads.
5. Re-test with known-good sample request.

---

## 5. Data handling and persistence

- FLSS server is stateless for business entities.
- Browser stores selected operational state/history in `localStorage`.
- System-of-record data remains external:
  - Shopify for commerce data.
  - ParcelPerfect for shipping transactions.
  - PrintNode for print jobs.
  - SMTP provider for email delivery metadata.

---

## 6. Governance and change control

For safe operation:
- Separate responsibilities for operations actions vs pricing configuration.
- Use change logs for pricing and template edits.
- Validate workflow-impacting changes in staging first.
- Document incident retrospectives and known failure signatures.

---

## 7. Related project documentation

- Build and run: `docs/build-guide.md`
- Data model: `docs/data-model.md`
- Architecture diagrams: `docs/system-mind-map-and-process-flow.md`
- Cloudflare tunnel guidance: `docs/cloudflare-tunnel.md`

