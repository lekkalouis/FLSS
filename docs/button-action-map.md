# FLSS Button and Action Map (Current)

This file maps every major user-pressable control to its resulting behavior. It includes static button IDs and key dynamic `data-action` controls used by the SPA.

## 1) Main SPA shell (`public/index.html` + `public/app.js`)

| Control | Where | Action after press |
|---|---|---|
| `#navScan` | top nav | Switches route/view to Orders (`/`). |
| `#navFlocs` | top nav | Switches route/view to FLOCS (`/flocs`). |
| `#navStock` | top nav | Switches route/view to Stock (`/stock`). |
| `#navPriceManager` | top nav | Switches route/view to Price manager (`/price-manager`, admin-unlocked). |
| `#navDocs`, `#navFlowcharts`, `#navDispatchSettings`, `#navLogs` | top nav/footer | Opens docs/flowcharts/admin utility views depending on unlock state. |
| `#navToggle` | shell | Collapses/expands nav and persists preference to localStorage. |
| `#dispatchExpandToggle` | dispatch top bar | Toggles expanded dispatch controls panel. |
| `#btnBookNow` | Orders view | Immediately starts booking flow instead of waiting for auto timer. |
| `#emergencyStopBtn` | Orders view | Stops/pauses active automated booking progression and updates status. |
| `#modeToggle` | Orders view | Toggles delivery/collection mode behavior and re-renders mode dependent UI. |
| `#multiShipmentBtn` | Orders/Dispatch | Starts create-multi-shipment flow for selected eligible orders. |
| `#dispatchCreateCombined` | Dispatch board | Creates combined shipment group from selected orders. |
| `#dispatchPrepareDeliveries` | Dispatch board | Runs grouped delivery preparation flow for selected dispatch items. |
| `#truckBookBtn` | Dispatch board | Sends truck booking alert request (`POST /alerts/book-truck`). |
| `#dispatchSelectionClear` | Dispatch board | Clears currently selected dispatch rows. |
| `#dispatchNotesClose` | dispatch notes drawer | Closes notes panel (notes are persisted separately). |
| `#slotSpinBtn` | easter egg modal | Spins slot reels and updates win/result text. |
| `[data-slot-close]` | easter egg modal | Closes slot modal. |

### Dynamic dispatch row/modal controls

| Dynamic control | Action after press |
|---|---|
| `.dispatchShipmentRow` | Opens shipment modal for that shipment key. |
| `[data-action="set-priority"]` | Updates dispatch priority for selected row/shipment. |
| `.dispatchParcelCountInput` (blur/change) | Persists parcel count updates for order/shipment context. |
| `[data-action]` inside order modal | Executes mapped dispatch action (print, fulfill, tag, ready-for-pickup, etc.). |
| `[data-action="close-modal"]` inside shipment modal | Closes shipment modal. |

## 2) FLOCS (`public/views/flocs.js`)

| Control | Action after press |
|---|---|
| `#flocs-customerCreateToggle` | Opens/closes customer create panel. |
| `#flocs-customerCreateBtn` | Creates customer through Shopify customer endpoint. |
| `#flocs-customerResetBtn` | Resets customer creation form fields. |
| customer result row (`.flocs-customerItem`) | Selects that customer and loads profile/addresses/tier context. |
| product qty controls (`[data-action="inc"/"dec"/"clear"]`) | Adjusts SKU quantity and recalculates order totals preview. |
| quick qty buttons (`.flocs-qtyQuickBtn`) | Adds a predefined quantity increment to selected SKU. |
| `#flocs-clearAllQtyBtn` | Clears all selected product quantities. |
| A–Z bar letter buttons | Filters/scrolls product list by flavour/name grouping. |
| product type filter controls | Switches active product category matrix rendering. |
| `#flocs-calcShip` | Calls ParcelPerfect quote flow and populates shipping summary. |
| `#flocs-createDraftBtn` | Creates Shopify draft order. |
| `#flocs-convertBtn` | Converts most recent draft order to final order where applicable. |
| `#flocs-createOrderBtn` | Creates direct Shopify order without draft step. |

## 3) Stock view (`public/stock.html` + `public/views/stock.js`)

| Control | Action after press |
|---|---|
| `.stock-modeBtn[data-mode="read"]` | Enables read-only mode. |
| `.stock-modeBtn[data-mode="take"]` | Enables stock take mode (set quantities). |
| `.stock-modeBtn[data-mode="receive"]` | Enables stock receiving workflow. |
| `#stock-focusApply` | Applies focused quantity action for current row/mode. |
| `#stock-focusPrev` / `#stock-focusNext` | Moves focus between stock rows in focused workflow mode. |
| row `Set` button (`[data-action="set"]`) | Sends inventory set/update action for that row. |
| row crate button (`[data-action="crate"]`) | Adds crate-sized quantity increment in receive mode. |
| open PO row `[data-po-action="receive"]` | Applies receipt quantities from selected purchase order. |
| open PO row `[data-po-action="print"]` | Opens/prints PO docs when admin URL is available. |
| PO submit button (`els.poSubmit`) | Creates purchase-order draft using selected raw materials. |

## 4) Price manager (`public/views/price-manager.js`)

| Control | Action after press |
|---|---|
| row `Save` (`.pm-saveBtn[data-action="save"]`) | Saves edited tier JSON to `custom.price_tiers` metafield via API. |
| table-level dynamic controls | Trigger row-specific edit/reset/load actions depending on selected variant state. |

## 5) POS (`public/pos.html` + `public/views/pos.js`)

| Control | Action after press |
|---|---|
| `#pos-addBtn` | Looks up scanned code and adds matching product row. |
| qty buttons in table (`[data-action="inc"/"dec"]`) | Adjusts item qty, recalculates total and receipt preview. |
| `#pos-submit` | Creates cash order (`POST /shopify/orders/cash`). |
| `#pos-print` | Opens browser print dialog for receipt. |
| `#pos-clear` | Clears current POS basket and resets totals. |

## 6) Standalone order capture custom (`public/order-capture-custom.html`)

| Control | Action after press |
|---|---|
| `#customer-access-load` | Loads customer account context by access code. |
| `#quick-picker-btn` | Opens quick product picker modal. |
| `#quick-picker-close` | Closes quick picker modal. |
| `#clear-form` | Clears entire capture form and selected items. |
| `#submit-draft-order` | Submits draft order creation request. |
| `#submit-order` | Submits direct order creation request. |
| `#print-form` | Prints the order-capture form view. |

## 7) Customer accounts demo (`public/customer-accounts.html`)

| Control | Action after press |
|---|---|
| `#registerBtn` | Registers account and sets session token state. |
| `#loginBtn` | Logs user in and loads profile/catalog/orders. |
| `#saveProfileBtn` | Saves profile updates to account endpoint. |
| `#placeOrderBtn` | Creates order from selected catalog items. |
| `#refreshOrdersBtn` | Reloads account order history list. |
| `#logoutBtn` | Logs out and returns page to anonymous state. |

## 8) Template management

### Liquid templates (`public/liquid-templates.html`)

| Control | Action after press |
|---|---|
| `#newTemplateBtn` | Clears editor for new template entry. |
| `#refreshPreviewBtn` | Re-renders preview against sample context. |
| `#saveTemplateBtn` | Upserts template via API. |
| `#deleteTemplateBtn` | Deletes selected template by id. |
| snippet buttons (dynamic) | Inserts snippet at cursor into template body. |
| template list item (dynamic) | Loads selected template into editor. |

### Notification templates (`public/notification-templates.html`)

| Control | Action after press |
|---|---|
| `#newTemplateBtn` | Clears form for new notification template. |
| `#refreshPreviewBtn` | Refreshes subject/body preview rendering. |
| `#saveTemplateBtn` | Upserts notification template. |
| `#deleteTemplateBtn` | Deletes selected notification template. |
| snippet buttons (dynamic) | Inserts variable snippet into message body. |
| template list item (dynamic) | Loads template into edit form. |

## 9) Purchase orders (`public/purchase-orders.html`)

| Control | Action after press |
|---|---|
| `#submitBtn` | Creates draft purchase order via first available PO endpoint and may open admin URL. |

## 10) Shipping matrix (`public/shipping-matrix.html`)

| Control | Action after press |
|---|---|
| `#runBtn` | Runs matrix generation call and renders quote/result table. |

## 11) Traceability (`public/traceability.html`)

| Control | Action after press |
|---|---|
| Traceability submit button (form submit) | Sends report request; renders sales + PO/COA traceability output. |
| Template download action | Downloads workbook template from `/traceability/template.xlsx`. |
