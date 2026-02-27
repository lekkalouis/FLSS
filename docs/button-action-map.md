# Button and Click-Path Map

This map documents each user-clickable button/control found in the app UI, what handler runs, the input consumed by that action, and the observable output/return path.

## Main shell + dispatch board (`public/index.html` + `public/app.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| Top nav tabs (`#navScan`, `#navDocs`, `#navFlocs`, `#navStock`, `#navPriceManager`), footer tabs (`#navFooterAdmin`, `#navFooterChangelog`) | `moduleGrid` click delegates to route loader; view switches by `data-route` | `data-route` value | Active tab/view updates; relevant module init runs |
| `#dispatchSelectionClear` | direct click listener -> `clearDispatchSelection()` | currently selected order IDs | Clears selected set, updates summary counters |
| `#dispatchPrepareDeliveries` | click -> bulk prepare helper | selected orders on board | Attempts document/note preparation; status/log updates |
| `#multiShipmentBtn` | click -> combined shipment creation flow | selected orders, parcel counts, line selection | Calls booking/fulfillment helpers, updates board/status |
| Truck book / emergency / mode toggles (`#btnBookNow`, `#emergencyStopBtn`, `#modeToggle`) | direct click listeners | session state + booking counters | Books truck, toggles mode, or stops flow; status + persisted session changes |
| `slot` easter-egg buttons (`#slotSpinBtn`, `[data-slot-close]`) | click -> `spinSlots()` / `closeSlotEgg()` | random spice picks | Reel animation + result text; close hides modal |
| Dispatch row action buttons (`data-action=*`) | delegated click -> `handleDispatchAction(action)` | `data-action`, `data-order-no`, optional `data-item-key`, `data-doc-key`, `data-doc-type` | Branch-specific results below |
| `data-action="close-modal"` | closes order/shipment modal | none | modal hidden |
| `data-action="start-packing"` | starts packing state for order | order number | starts timer, seeds first box, persists packing state |
| `data-action="pack-all"` | marks all remaining qty packed for item | order + item key | item packed; if complete, finalize packing |
| `data-action="pack-qty"` | packs typed qty from `.dispatchPackingQty` | order + item key + qty input | packs partial qty, clears input, refreshes UI |
| `data-action="add-box"` | add packing parcel | order number | creates new box, logs event, persists |
| `data-action="finish-packing"` | finalize packing | order number | marks end time/completion, refreshes |
| `data-action="run-flow"` | POST `.../orders/run-flow` | `{orderId, orderNo, flowTag}` | success/fail status/log message |
| `data-action="fulfill-shipping"` | packing-aware booking/fulfillment flow | packed line selection, derived parcel count, weight | triggers `doBookingNow(...)`; status and board updates |
| `data-action="prepare-delivery"` | prints docs + delivery note | order payload from cache | both print jobs must succeed; marks prepared |
| `data-action="deliver-delivery"` | `markDeliveryReady(orderNo)` | order number | delivery state transition + status |
| `data-action="ready-collection"` | `notifyPickupReady(orderNo)` | order number | pickup-ready notification pathway |
| `data-action="notify-ready"` | same pickup-ready notifier | order number | notification result shown in status/log |
| `data-action="release-pickup"` | `releasePickupOrder(orderNo)` | order number | order released from pickup hold |
| `data-action="print-opp"` | `printOppDocument(order, docType)` | order + OPP doc type | opens print window; warns if popup blocked |
| `data-action="print-packing-plan"` | `printPackingPlan(orderNo)` | order number | opens/prints plan; status/log update |
| `data-action="print-box"` | `printDocs(order)` | order payload | sends docs to PrintNode; returns boolean |
| `data-action="print-shipping-doc"` | `printShopifyTemplate(order, docKey)` | order + template key | prints selected Shopify template |
| `data-action="print-note"` | `printDeliveryNote(order)` | order payload | prints note; order marked as note-printed |
| `data-action="book-now"` | manual booking shortcut | prompt parcel count + order number | starts order + immediate booking attempt |
| `data-action="increase-box"` / `decrease-box` | updates `.dispatchParcelCountInput` then saves | current numeric input value | persists via parcel count update API |

## FLOCS order capture module (`public/index.html` + `public/views/flocs.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| A–Z quick buttons (`[data-letter]`) | click -> update `state.azLetters` -> `searchCustomersNow()` | chosen letter + current search prefix | live customer filtering result list |
| `#flocs-customerCreateToggle` | toggles create panel visibility | current panel hidden state | panel shown/hidden |
| `#flocs-customerCreateBtn` | click -> `createCustomer()` -> POST `/api/v1/shopify/customers` | new customer form payload | created customer loaded + status toast |
| `#flocs-customerResetBtn` | click -> `resetCustomerForm()` | none | create form fields cleared |
| Product type tabs (`button[data-type]`) | click -> set `state.productType` | selected type (`spices`/`popcorn`) | product list rerendered |
| Qty quick/add buttons (`data-action=quick-add/inc/dec`) | delegated click in product table | product key + amount/step | line item qty changes, invoice recalculated |
| `#flocs-calcShip` | click -> `requestShippingQuote()` -> POST ParcelPerfect endpoint | ship-to address, items, computed parcel dimensions/weight | sets `state.shippingQuote`, updates shipping summary + totals |
| `#flocs-createDraftBtn` | click -> `createDraftOrder()` -> POST `/api/v1/shopify/draft-orders` | customer, items, delivery, shipping quote, addresses | stores draft id; success toast; convert button revealed |
| `#flocs-convertBtn` | click -> POST `/api/v1/shopify/draft-orders/complete` | `draftOrderId` | returns converted order metadata; clears draft id |
| `#flocs-createOrderBtn` | click -> `createOrderNow()` -> POST `/api/v1/shopify/orders` | full order payload incl price tier, addresses, shipping | order created response consumed for confirmation/reset |

## Stock + purchase tabs in main app (`public/index.html` + `public/views/stock.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| Stock/Purchase top tab buttons (`data-tab`) | click -> `switchTab(tab)` | selected tab id | panel visibility changes |
| Mode buttons (`data-mode=read/count/make`) | click -> set `state.mode` | selected mode | UI mode change (editable vs read workflows) |
| Row `data-action="crate"` | increments crate count for row | row dataset values | recalculates target stock total |
| Row `data-action="set"` | `setInventory(item,nextVal)` -> POST `/inventory-levels/set` | variant id + target available qty | updates stock map + log entry |
| PO sub-tabs (`data-po-tab`) | click -> `switchPoTab` (+ maybe `loadOpenPOs`) | tab id | shows create/receive panel |
| `#po-submit` | click -> `createPO()` -> POST `/purchase-orders` | supplier, note, selected lines | creates draft PO, clears quantities, refreshes open POs |
| Open PO row `data-po-action="print"` | opens `/purchase-orders` in new tab | none | navigates to print workflow |
| Open PO row `data-po-action="receive"` | local receive marker | selected PO id | toast/log entry, row removed |

## POS module (`public/pos.html` + `public/views/pos.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| `#pos-addBtn` | click -> `handleScan()` -> GET `/api/v1/shopify/products/search` | scanned code from `#pos-scan` | first matching product added to in-memory cart |
| Line qty buttons (`data-action=inc/dec`) | delegated click in `#pos-items` | item key | increments/decrements quantity; removes zero lines |
| `#pos-submit` | click -> POST `/api/v1/shopify/orders/cash` | cashier + cart line items | success message with order ref, then cart reset |
| `#pos-print` | `window.print()` | browser print context | opens print dialog |
| `#pos-clear` | `clearOrder()` | current cart | empties cart and receipt panel |

## Standalone custom order capture (`public/order-capture-custom.html` + `public/order-capture-custom.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| `#customer-access-load` | `loadCustomerByAccessCode()` -> GET `/customers/by-access-code` | entered access code | locks form to loaded customer, autofills addresses |
| `#quick-picker-btn` | opens quick-picker modal | current customer list/filter | modal visible with customer cards |
| `#quick-picker-close` | closes quick-picker modal | none | modal hidden |
| `#clear-form` | `resetForm({keepCustomerSearch:false})` | current form state | clears selected customer/items/totals |
| `#submit-draft-order` | `submitLiveOrDraft("draft")` -> POST `/draft-orders` | line items + customer + shipping/billing + PO data | draft order response shown in status |
| `#submit-order` | `submitLiveOrDraft("live")` -> POST `/orders` | same payload as draft path | live order response shown in status |
| `#print-form` | `window.print()` | browser print context | opens print dialog |

## Customer accounts portal (`public/customer-accounts.html` inline script)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| `#registerBtn` | click -> POST `/api/v1/customer-accounts/register` | email + password + name fields | account created + token/session set |
| `#loginBtn` | click -> POST `/api/v1/customer-accounts/login` | email + password | auth token + profile/order data load |
| `#saveProfileBtn` | click -> PUT `/api/v1/customer-accounts/profile` | profile form fields + auth token | persisted profile response rendered |
| `#placeOrderBtn` | click -> POST `/api/v1/customer-accounts/orders` | cart/order form payload + auth token | new order created and history refreshed |
| `#refreshOrdersBtn` | click -> GET `/api/v1/customer-accounts/orders` | auth token | replaces order history table |
| `#logoutBtn` | clears token/session client-side | none | returns UI to logged-out state |

## Template editors

### Liquid templates (`public/liquid-templates.html` + `public/liquid-templates.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| `#newTemplateBtn` | `clearEditor()` | none | resets selection + clears fields |
| `#refreshPreviewBtn` | `renderPreview()` | current template text | preview textarea rerendered from sample context |
| `#saveTemplateBtn` | POST `/api/v1/liquid-templates` | `{id?,name,content}` | upserts template in list, selects saved template |
| `#deleteTemplateBtn` | DELETE `/api/v1/liquid-templates/:id` | selected template id | removes template + clears editor |
| Variable snippet buttons (dynamic) | click -> `insertSnippet(snippet)` | snippet text + cursor position | snippet inserted at cursor; preview refreshed |
| Template list item buttons (dynamic) | click -> `loadTemplate(id)` | selected template id | editor populated with stored template |

### Notification templates (`public/notification-templates.html` + `public/notification-templates.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| `#newTemplateBtn` | `clearForm()` | none | resets all fields to defaults |
| `#refreshPreviewBtn` | `renderPreview()` | subject + body text | preview pane updated with sample substitutions |
| `#saveTemplateBtn` | POST `/api/v1/notification-templates` | template metadata + subject/body + enabled flag | template upserted and selected |
| `#deleteTemplateBtn` | DELETE `/api/v1/notification-templates/:id` | selected template id | template removed, form reset |
| Variable snippet buttons (dynamic) | click -> `insertSnippet()` | snippet + body cursor position | snippet inserted into body |
| Template list item buttons (dynamic) | click -> `loadTemplate(id)` | template id | form filled with template content |

## Purchase orders standalone (`public/purchase-orders.html` + `public/purchase-orders.js`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| `#submitBtn` | click -> `submitPurchaseOrder()` -> POST first available endpoint | supplier, note, selected SKU quantities | draft PO created; may open Shopify admin URL |

## Shipping matrix (`public/shipping-matrix.html`)

| Button/control | Click path | Input consumed | Output / return |
|---|---|---|---|
| `#runBtn` | form/script generator action | matrix query fields on form | generated matrix output rendered in page |

## Traceability (`public/traceability.html`)

| Button/control | Click path | form submit -> traceability route | lot/order/date filters | traceability report payload rendered/downloaded |

---

## Notes on return values

- Most click handlers return `void` in JS terms; practical “returns” are side effects (DOM updates, status toasts, modal state changes).
- For API-backed buttons, “return” means response JSON/text consumed by handler to either:
  - update local state (`state.*`, table/list rerender),
  - show success/failure status text/toasts,
  - or open print windows / external admin URLs.
