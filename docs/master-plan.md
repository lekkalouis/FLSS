# FLSS Master Plan (Printable Reference)

> **Purpose:** This page is the single master reference for planning, operating, and improving FLSS end-to-end.
>
> **How to use it:** Print this document, work through one section at a time, and capture notes/actions in the provided checklists.

---

## 1) Mission, Scope, and Success Criteria

### Mission
Operate FLSS as a stable, accurate, and fast operations platform that supports:
- Daily dispatch scanning and booking.
- Order triage and shipment tracking.
- Customer/order capture and quoting.
- Inventory adjustments.
- Price-tier management and synchronization.

### In scope
- Frontend SPA modules: Scan, Dispatch Board, Docs, Flowcharts, FLOCS, Stock, Price Manager.
- Backend API under `/api/v1`.
- Integrations: Shopify, ParcelPerfect, PrintNode, SMTP.
- Day-to-day operational workflows and continuous improvements.

### Success criteria (quarterly)
- **Reliability:** `healthz` and `statusz` stable during operating hours.
- **Speed:** Scan-to-book/print workflows consistently responsive.
- **Accuracy:** Parcel counts, inventory changes, and tier updates are correct.
- **Operability:** Incidents have clear runbooks, owners, and follow-up actions.
- **Change safety:** Each release has validation and rollback notes.

### Section sign-off
- [ ] Mission confirmed with stakeholders.
- [ ] Scope boundaries accepted.
- [ ] Success metrics agreed and measured.

---

## 2) System Map (What exists today)

### Application modules
1. **Scan Station (`/scan` or `/`)**
   - Barcode parsing, order resolution, booking orchestration, label printing, fulfillment triggers.
2. **Dispatch Board (`/ops`)**
   - Open-order triage, packing/dispatch progress, delivery document support, parcel thresholds.
3. **Documentation (`/docs`)**
   - Internal guide and operational reference.
4. **Flowcharts (`/flowcharts`)**
   - Decision guidance for packing/dispatch rules.
5. **FLOCS (`/flocs`)**
   - Customer + product search, quoting, draft-order/order creation.
6. **Stock Take (`/stock`)**
   - Inventory review and stock adjustments (set/transfer).
7. **Price Manager (`/price-manager`)**
   - Tiered price metafield management and optional public price sync.

### Backend responsibilities
- API gateway and middleware controls.
- Integration proxy logic for Shopify/ParcelPerfect/PrintNode.
- Email alerting and customer notification email delivery.
- Config exposure to frontend via `/config`.
- Static hosting of SPA and fallback routing.

### Integration dependencies
- **Shopify Admin API** (orders, products, customers, inventory, metafields, fulfillment).
- **ParcelPerfect API** (quotes/bookings/place lookups).
- **PrintNode API** (label print jobs).
- **SMTP** (alerts/notifications).

### Section sign-off
- [ ] Module inventory verified.
- [ ] API ownership clear.
- [ ] Integration owners and credentials location documented.

---

## 3) Operating Model (People + Process)

### Roles and ownership
- **Operations Lead:** owns dispatch outcomes and SOPs.
- **Support Engineer:** handles incidents, troubleshooting, integrations.
- **Product/Process Owner:** prioritizes workflow improvements.
- **Release Owner:** controls deploys, rollback decisions, release notes.

### Cadence
- **Daily (15 min):** status review, active incidents, backlog triage.
- **Weekly (45 min):** KPI trends, defects, quality actions.
- **Monthly (60 min):** architecture debt and integration risk review.
- **Quarterly (90 min):** roadmap reset + success criteria review.

### Section sign-off
- [ ] Named owners for each role.
- [ ] Meeting cadence on calendar.
- [ ] Escalation path documented.

---

## 4) Production Workflow Master Checklist

### A. Scan & Dispatch workflow
- [ ] Verify `statusz` at shift start.
- [ ] Confirm scanner input and station readiness.
- [ ] Process scans and monitor parcel sequence/order matching.
- [ ] Verify booking result and generated labels.
- [ ] Confirm fulfillment/update feedback.
- [ ] Track daily parcel totals and threshold actions.

### B. Dispatch Board workflow
- [ ] Refresh open orders and recent shipment visibility.
- [ ] Prioritize aged/high-risk orders.
- [ ] Execute "Book Now" where automation was skipped/blocked.
- [ ] Print documents and ensure completion records.
- [ ] Mark delivery/dispatch states accurately.

### C. FLOCS workflow
- [ ] Validate customer identity/details.
- [ ] Build quote with correct shipping method.
- [ ] Validate products, quantities, and pricing tier.
- [ ] Create draft order or order and confirm IDs.

### D. Stock workflow
- [ ] Select correct location.
- [ ] Run stock take or receive mode intentionally.
- [ ] Validate adjustment reason and quantity.
- [ ] Confirm post-adjustment inventory levels.
- [ ] Export/save activity log if required by SOP.

### E. Price workflow
- [ ] Verify tier inputs per variant.
- [ ] Update metafields and confirm persistence.
- [ ] If syncing public price, confirm change controls.
- [ ] Spot-check storefront/admin outcome.

### Section sign-off
- [ ] Printed checklist used during live ops.
- [ ] Workflow exceptions captured for process updates.

---

## 5) Technical Control Plan

### Environment controls
- [ ] Maintain a validated `.env` per environment.
- [ ] Rotate credentials by policy and verify with `statusz`.
- [ ] Keep API versions and feature flags under change control.

### API controls
- [ ] Maintain an endpoint inventory and owner for each route.
- [ ] Track request/response errors by dependency.
- [ ] Define timeout, retry, and fallback standards per integration.

### Data controls
- [ ] Standardize key business fields (order number, parcel count, service code, place code).
- [ ] Validate metafield update paths (parcel counts, price tiers).
- [ ] Confirm inventory updates include clear operator intent.

### Frontend controls
- [ ] Maintain UX consistency across modules.
- [ ] Keep operator messages actionable (what failed + next step).
- [ ] Ensure long-running actions expose progress and terminal state.

### Section sign-off
- [ ] Controls mapped to owners.
- [ ] Gaps prioritized in backlog.

---

## 6) Quality and Testing Plan

### Baseline checks (before release)
1. **Server boot and health:** app starts; `healthz` and `statusz` return expected values.
2. **Config contract:** `/config` contains expected keys and defaults.
3. **Core happy paths:**
   - Scan flow can parse, fetch order, book, and print.
   - Dispatch board can list and action orders.
   - FLOCS can create customer/order artifacts.
   - Stock and price updates complete and persist.
4. **Failure paths:** invalid credentials, dependency outage, malformed payload handling.
5. **Security checks:** key headers/middleware active and rate limiting in place.

### Regression matrix (printable)
- [ ] Scan module regression run.
- [ ] Dispatch module regression run.
- [ ] FLOCS regression run.
- [ ] Stock regression run.
- [ ] Price Manager regression run.
- [ ] Cross-module smoke test run.

### Section sign-off
- [ ] Release candidate approved.
- [ ] Known issues recorded with mitigations.

---

## 7) Observability and Incident Response Plan

### Monitoring minimums
- API availability (`healthz`, `statusz`).
- Integration status snapshots (Shopify, PP, PrintNode, SMTP).
- Error rates by endpoint and dependency.
- Operational counters (parcels/day, failed bookings, print failures).

### Incident severity model
- **Sev 1:** Dispatch blocked for majority of orders.
- **Sev 2:** Partial workflow degradation with workaround.
- **Sev 3:** Non-critical module issue.

### Incident runbook (print and keep at station)
1. Detect and classify severity.
2. Stabilize (feature disable/manual fallback).
3. Communicate owner + ETA.
4. Resolve and verify in production.
5. Record post-incident actions.

### Section sign-off
- [ ] Severity levels accepted by team.
- [ ] Runbook tested at least once.

---

## 8) Security, Compliance, and Access Plan

### Access model
- [ ] Principle of least privilege for all external services.
- [ ] Separate service credentials per environment.
- [ ] Restrict printer and email credentials to required scopes.

### Secrets and configuration
- [ ] Do not commit secrets.
- [ ] Maintain rotation schedule and emergency reset process.
- [ ] Record config changes with owner/date/reason.

### Auditability
- [ ] Keep action logs for critical operations (inventory, pricing, fulfillments).
- [ ] Capture release notes with impacted routes/modules.

### Section sign-off
- [ ] Access review complete.
- [ ] Secrets rotation current.

---

## 9) Roadmap Plan (90-day rolling)

### Theme 1: Reliability hardening
- [ ] Dependency fallback strategy per external API.
- [ ] Error taxonomy standardization.
- [ ] Recovery playbooks for each critical endpoint.

### Theme 2: Workflow speed
- [ ] Reduce scan-to-book latency.
- [ ] Improve Dispatch Board batch actions.
- [ ] Add targeted UX shortcuts for operators.

### Theme 3: Data correctness
- [ ] Inventory adjustment safeguards.
- [ ] Price-tier validation and audit enhancements.
- [ ] Parcel count/fulfillment consistency checks.

### Theme 4: Operational excellence
- [ ] KPI dashboarding and alert thresholds.
- [ ] Structured release checklist and rollback script.
- [ ] Documentation refresh cycle.

### Section sign-off
- [ ] Quarter priorities agreed.
- [ ] Delivery owners assigned.
- [ ] Milestones and dates set.

---

## 10) Section Capture Templates (Print-friendly)

Use one template per initiative/incident/process improvement.

### A. Improvement card
- **Title:**
- **Problem statement:**
- **Current behavior:**
- **Target behavior:**
- **Affected module(s):**
- **API endpoints touched:**
- **Risk level:** Low / Medium / High
- **Owner:**
- **Target date:**
- **Validation steps:**
- **Rollback approach:**
- **Outcome notes:**

### B. Incident card
- **Incident ID:**
- **Date/time detected:**
- **Severity:**
- **Customer/ops impact:**
- **Systems affected:**
- **Immediate mitigation:**
- **Root cause:**
- **Permanent fix:**
- **Follow-up tasks:**
- **Closed date:**

### C. Release card
- **Release name/version:**
- **Scope summary:**
- **Modules impacted:**
- **Routes impacted:**
- **Pre-release checks:**
- **Deployment steps:**
- **Verification checklist:**
- **Rollback trigger:**
- **Rollback steps:**
- **Sign-off:**

---

## 11) Practical Daily/Weekly/Monthly Checklist

### Daily
- [ ] Check system/integration status.
- [ ] Confirm no stuck dispatch workflows.
- [ ] Review previous-day exceptions.

### Weekly
- [ ] Trend failures and repeat errors.
- [ ] Review top improvement opportunities.
- [ ] Validate backup/manual procedures.

### Monthly
- [ ] Access/secrets review.
- [ ] Performance hotspot review.
- [ ] Documentation and runbook refresh.

---

## 12) Master Plan Governance

- **Document owner:** ______________________
- **Version:** ______________________
- **Last updated:** ______________________
- **Next review date:** ______________________
- **Approved by:** ______________________

### Change log
| Date | Owner | Change summary |
|------|-------|----------------|
|      |       |                |
|      |       |                |
|      |       |                |

---

## Quick start (for printed copy)
1. Fill in **Section 12** ownership fields.
2. Confirm **Sections 1–3** with team leads.
3. Use **Section 4** live during operations for one week.
4. Capture improvements/incidents using **Section 10** cards.
5. Review progress using **Sections 9 and 11** at weekly/monthly cadence.
