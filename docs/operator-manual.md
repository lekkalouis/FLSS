# FLSS Operator Manual

This manual is for the current workspace and the live `Orders / Stock / Buy / Make / Admin` shell.

## 1. Navigation

Primary views:

- `Orders` (`/`) is the dispatch board and daily shipping workspace.
- `Fulfillment History` (`/fulfillment-history`) shows recently fulfilled orders.
- `Stock` (`/stock`) manages raw materials, product inventory, batches, and stocktakes.
- `Buy` (`/buy`) raises and retries purchase orders.
- `Make` (`/make`) builds and completes manufacturing orders.
- `Docs` (`/docs`) exposes the live markdown set in the app.
- `Admin` (`/admin`) opens pricing, commissions, raw materials, and one-click settings shortcuts.

New work is created from the floating `New Order` button:

- `Sales Order` opens `/flocs`
- `Stocktake` opens the stocktakes tab
- `Purchase Order` opens `/buy`
- `Manufacturing Order` opens `/make`
- `New Customer` opens `/flocs` with the customer action preselected

Public utility flow:

- `/deliver` is the delivery confirmation page used by driver QR codes. It is not part of the normal operator shell.

## 2. Shift startup checklist

1. Open `/` and confirm the dispatch board loads.
2. Check `GET /api/v1/healthz` and `GET /api/v1/statusz`.
3. Confirm the selected-orders sidebar, packing lanes, and fulfillment counts populate.
4. If a rotary controller is attached, verify the on-screen overlay appears in the Orders view.
5. Open `Settings -> Printers` and run a print test if label or delivery-note printing is required.
6. Open `Settings -> Notifications` and send a pickup or truck test email if notifications are in scope for the shift.
7. If stock, purchasing, or manufacturing work is planned, open `Stock`, `Buy`, and `Make` once to confirm those views load cleanly.

## 3. Orders and dispatch workflow

Dispatch uses a two-phase controller model.

### Order mode

- `next` and `prev` move between orders.
- Confirm selects the active order and enters line mode.
- The first confirm does not pack a line item.

### Line mode

- `next` and `prev` move between line items inside the selected order.
- Confirm marks the selected line as packed.
- Quantity mode is available through the packed-quantity button or `confirm_hold`.

### Back behavior

`back` is context aware:

1. Close the packed-quantity prompt when it is open.
2. Leave line mode and return to order mode.
3. Move to the previous order when already in order mode.

### Selection sidebar

The right-side selected-orders panel is the operator staging area for multi-order work.

- `Print selection` prints the supported order documents for the selected orders.
- `Book selection` runs the grouped delivery-booking flow for selected delivery orders.
- `Clear` removes the current selected-order set.

### Delivery and fulfillment helpers

- The Orders view can print delivery notes, prepare delivery paperwork, and mark delivery orders out for delivery.
- `Fulfillment History` is read-only operator reporting for recent shipping, delivery, and collection activity.

## 4. Stock, Buy, and Make

### Stock

Use `/stock` for:

- raw materials and supplier mappings
- finished-goods and material batches
- inventory movements
- stocktakes

### Buy

Use `/buy` for:

- purchase order creation
- purchase order status review
- retrying failed print, email, or Shopify draft dispatches

### Make

Use `/make` for:

- requirements calculation
- manufacturing order creation
- shortage-to-purchase-order handoff
- manufacturing completion and resulting batch creation

## 5. Admin and settings

Admin is a launcher, not a separate legacy workspace.

Admin shortcuts currently open:

- Price Manager
- Agent Commissions
- Raw Materials inside Stock
- One Click Actions inside Settings

Settings tabs:

- `General`
- `One Click Actions`
- `Printers`
- `Controller`
- `Notifications`
- `Monitoring`

Operational notes:

- `One Click Actions` currently manages the best-before print test and the GBOX barcode label action.
- `Printers` manages document-printer mappings and print tests.
- `Controller` controls the large on-screen dispatch overlay.
- `Monitoring` exposes print history and runtime diagnostics.

## 6. Notifications and delivery confirmation

Notification bindings are runtime settings, not hard-coded templates.

- Pickup-ready emails use the active pickup-ready notification binding.
- Truck-collection emails use the active truck-collection binding.
- Test sends are available in `Settings -> Notifications`.

The `/deliver` page is the public delivery-confirmation endpoint used by signed QR payloads. Operators usually reach it by scanning the generated QR rather than navigating there directly.

## 7. Compatibility notes

> Compatibility / legacy: several old HTML pages still exist in the repo, but the runtime redirects them to supported routes.

Examples:

- `/purchase-orders.html` redirects to `/buy`
- `/manufacturing.html` redirects to `/make`
- `/traceability.html` redirects to `/stock?section=batches`
- retired standalone admin pages redirect to `/stock?notice=tool-retired`

Treat the main shell routes as the supported workflow.

## 8. End-of-shift routine

1. Confirm no orders are left half-packed or stuck in quantity mode.
2. Clear the selected-orders sidebar if it still contains working sets from the shift.
3. Confirm delivery paperwork, truck bookings, and notifications are complete where required.
4. Review `Fulfillment History` if you need a final dispatch sanity check.
5. If you used `/portal`, sign out through the Shopify customer account session before closing the browser.
