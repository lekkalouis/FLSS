# Progress checkpoint (2026-02-12)

This checkpoint maps the current codebase against the requested dispatch/order-capture scope.

## Status legend
- ✅ Implemented
- 🟡 Partially implemented / behavior differs from spec
- ⛔ Not found

## 2) New tab – Fulfillment History
- **2.1 Remove Recently Shipped panel from Dispatch:** ✅
- **2.2 Add top-level navigation (Dispatch + Fulfillment History):** ✅
- **2.3 Fulfillment History with 3 separate sections:** 🟡
  - Backend exposes `shipped`, `delivered`, `collected` streams and 30-day cutoff.
  - UI currently renders a single merged list with a status filter (not three persistent lane sections).
  - Order-number search exists.

## 3) Dispatch lane reorder + routing
- **3.1 Lane order left→right (Priority, Medium, Awaiting Payment, Pickup, Delivery):** ✅
  - Implemented with delivery rightmost.
- **3.2 Lane routing logic:** 🟡
  - Awaiting payment correctly gates before priority/medium.
  - Priority logic includes tag/urgent/SLA <=24h.
  - Medium requires paid + unfulfilled fallback.
  - Pickup/Delivery are inferred from tags/shipping-line text (not explicit `delivery_method` field checks).

## 4) Fulfill action behavior
- **Expand scan panel + focus scan input + highlight card + scroll into view:** ✅

## 5) Header refactor (global)
- **Connections + Truck button + box count in shared sticky header:** ✅
- **Remove lane-embedded truck controls:** ✅

## 6) Dispatch right-side button alignment
- **Consistent control-row button styling:** 🟡
  - Shared compact button styles are present.
  - Requested explicit set including "Truck Not Booked" in the same right-side control group does not exactly match current layout.

## 7) Order capture note rule
- **`order.note = "PO: {PO}"` when PO exists, else blank:** ✅

## 8) Customer creation tier selection
- **Tier required in UI and backend validation:** ✅
- **Tag customer with tier:** ✅
- **Write `custom.tier` metafield:** ✅ (default enabled)

## 9) Order capture address layout
- **Billing left + Shipping right on desktop, stacked on mobile:** ✅

## 10) Customer letter selector redesign
- **Selector at top and rendered prominently:** 🟡
- **Large/full-width priority treatment and helper-text removal:** 🟡
  - Selector is present at top of customer section.
  - Current button sizing remains compact; helper explanations requested for removal are not present as a dedicated block in current Order Capture section.

## 11) Item entry system redesign
- **Remove size/unit-price/line-total/override columns:** ✅
- **Filters limited to Spices / Popcorn Sprinkle / Other:** ✅
- **Row-per-flavor with size-variant columns:** ✅
- **Numeric-fast quantity entry without blur:** ✅
- **Per-row clear resets all row quantities:** ✅
- **Submit creates only quantity>0 line items:** ✅

## 12) Testing checklist coverage
- **Automated/recorded checklist evidence for all listed acceptance scenarios:** ⛔
  - No dedicated QA checklist artifact found for the exact list yet.

