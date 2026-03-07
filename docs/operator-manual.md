# FLSS Operator Manual (Repo 2.2)

This manual reflects the current 2.2 workflows.

## 1. Navigation

### SPA routes

- `/` - Orders and dispatch workspace
- `/flocs` - FLOCS order capture
- `/stock` - Stock tools
- `/price-manager` - Price manager
- `/docs` - Documentation browser
- `/flowcharts` - Flow guidance
- `/admin` - Admin launcher and embedded tool workspace

Admin-only routes still exist for dispatch settings and logs, but the primary access pattern is the Admin workspace.

### Standalone tools

The standalone pages remain available directly, but Admin is the preferred entry point for day-to-day use.

## 2. Shift startup checklist

1. Open the Orders view and confirm the dispatch board loads.
2. Check `GET /api/v1/healthz` and `GET /api/v1/statusz`.
3. Verify scanner focus and a test scan path.
4. Verify PrintNode connectivity if printing is required.
5. If a Pi controller is attached, verify remote heartbeat status and the on-screen overlay.
6. If notifications are required, send a test email from Settings -> Notifications.

## 3. Dispatch and packing flow

Repo 2.2 dispatch control is two-phase.

### Order mode

- `next` and `prev` move between orders.
- Confirm selects the active order and enters line mode.
- No line is packed on the first confirm.

### Line mode

- `next` and `prev` move only between line items on the active order.
- Movement stops at the first and last line item.
- Confirm marks the selected line as packed.

### Back behavior

`back` is context-aware:

1. Close a quantity prompt if one is open.
2. Leave line mode and return to order mode.
3. If already in order mode, move to the previous order.

### Mouse safety

A click on a line item inside an unselected order only selects that order. A second click is required before the line can toggle packed state.

## 4. Settings workflow

Open Settings from the footer and work inside these sections:

- `General`
- `Printers`
- `Controller`
- `Notifications`
- `Monitoring`

Controller settings affect overlay visibility, remote connection requirements, and high-visibility styling.

Notification settings control sender override, fallback recipients, pickup-ready bindings, truck-collection bindings, and test sends.

## 5. Admin workspace

Admin is now the primary operational launcher. Use it to open embedded panels for:

- Station Controller
- Manufacturing
- Product Management
- POS
- Shipping Matrix
- Custom Order Capture
- Customer Accounts
- Purchase Orders
- Liquid Templates
- Notification Templates
- Traceability
- Agent Commissions
- Order Payments

Direct URLs still work if a workflow depends on them, but the Admin workspace should be the default operator path.

## 6. Notifications

Notification templates are resolved at send time.

- Pickup-ready emails use the active pickup-ready binding in Settings -> Notifications.
- Truck-collection emails use the active truck-collection binding in Settings -> Notifications.
- If customer email is unavailable, event and global fallback recipients are used.

## 7. End-of-shift routine

1. Confirm no orders are left in an ambiguous packing state.
2. Confirm pending print or fulfill actions are resolved.
3. Confirm truck bookings and pickup notifications were sent where required.
4. Close Admin tools and lock the workstation.

The changelog is no longer part of the operating workflow in Repo 2.2.
