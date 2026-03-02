# Button Press Outcomes

This is a plain-language list of each button/control in the FLSS app and what happens after pressing it.

## Main shell + dispatch board (`public/index.html` + `public/app.js`)

- **Top nav tabs** (`#navScan`, `#navDocs`, `#navFlocs`, `#navStock`, `#navPriceManager`) and **footer tabs** (`#navFooterAdmin`, `#navFooterChangelog`): switches route/view and runs the module initializer for that view.
- **Clear dispatch selection** (`#dispatchSelectionClear`): clears selected order IDs and refreshes dispatch selection counters.
- **Prepare deliveries** (`#dispatchPrepareDeliveries`): bulk-runs delivery preparation for selected orders and updates status/logs.
- **Multi shipment** (`#multiShipmentBtn`): starts combined shipment flow for selected orders and updates dispatch state.
- **Book now / emergency stop / mode toggle** (`#btnBookNow`, `#emergencyStopBtn`, `#modeToggle`): books a truck immediately, halts flow, or changes mode; UI/session state updates.
- **Slot easter egg** (`#slotSpinBtn`, `[data-slot-close]`): spins animation with random result, or closes the modal.
- **Dispatch row actions** (`data-action=*`): branches by action value and updates modal/order state.
  - `close-modal`: hides current modal.
  - `start-packing`: starts packing timer/state and seeds first box.
  - `pack-all`: packs remaining quantity for item; finalizes if complete.
  - `pack-qty`: packs typed quantity and refreshes item state.
  - `add-box`: adds a packing box/parcel and persists.
  - `finish-packing`: marks packing complete and updates board.
  - `run-flow`: calls `.../orders/run-flow` and writes success/failure status.
  - `fulfill-shipping`: performs packing-aware booking/fulfillment and updates board/status.
  - `prepare-delivery`: prints docs + delivery note and marks prepared when both succeed.
  - `deliver-delivery`: marks delivery ready.
  - `ready-collection`: sends pickup-ready notification.
  - `notify-ready`: same notification path with status feedback.
  - `release-pickup`: releases pickup hold.
  - `print-opp`: opens print window for selected OPP doc.
  - `print-packing-plan`: opens/prints packing plan and logs status.
  - `print-box`: sends docs to PrintNode and returns success/fail.
  - `print-shipping-doc`: prints chosen Shopify shipping template.
  - `print-note`: prints delivery note and marks note as printed.
  - `book-now`: prompts parcel count then attempts immediate booking.
  - `increase-box` / `decrease-box`: changes parcel count input and persists via API.

## FLOCS order capture (`public/views/flocs.js`)

- **A–Z quick buttons** (`[data-letter]`): updates selected letters and reruns customer search/filter.
- **Create-customer panel toggle** (`#flocs-customerCreateToggle`): shows/hides customer creation panel.
- **Create customer** (`#flocs-customerCreateBtn`): posts customer payload, loads created customer, shows success status.
- **Reset customer form** (`#flocs-customerResetBtn`): clears customer create fields.
- **Product type tabs** (`button[data-type]`): switches product set (spices/popcorn) and rerenders list.
- **Qty controls** (`data-action=quick-add/inc/dec`): adjusts line quantities and recalculates totals.
- **Calculate shipping** (`#flocs-calcShip`): requests shipping quote and updates shipping summary + totals.
- **Create draft** (`#flocs-createDraftBtn`): creates Shopify draft order and reveals conversion flow.
- **Convert draft** (`#flocs-convertBtn`): converts draft to order and updates status/state.
- **Print/open order actions** (module order actions): opens print workflow/admin order page depending on action.
- **Receive PO row action** (`data-po-action="receive"`): marks PO received and removes/updates row state.

## POS (`public/pos.html` + `public/views/pos.js`)

- **Add scanned product** (`#pos-addBtn`): looks up scan code and adds first matching product to cart.
- **Line qty +/-** (`data-action=inc/dec`): increments/decrements quantity; removes line at zero.
- **Submit cash order** (`#pos-submit`): creates cash order, shows order reference, resets cart.
- **Print receipt** (`#pos-print`): opens browser print dialog.
- **Clear** (`#pos-clear`): empties cart and receipt area.

## Custom order capture (`public/order-capture-custom.html` + `public/order-capture-custom.js`)

- **Load by access code** (`#customer-access-load`): fetches customer, locks/auto-fills form.
- **Open quick picker** (`#quick-picker-btn`): opens customer quick-pick modal.
- **Close quick picker** (`#quick-picker-close`): closes modal.
- **Clear form** (`#clear-form`): resets customer/items/totals.
- **Submit draft order** (`#submit-draft-order`): posts draft payload and shows response status.
- **Submit live order** (`#submit-order`): posts live order payload and shows response status.
- **Print form** (`#print-form`): opens browser print dialog.

## Customer accounts portal (`public/customer-accounts.html`)

- **Register** (`#registerBtn`): creates account, sets session/token.
- **Login** (`#loginBtn`): authenticates, loads profile + order history.
- **Save profile** (`#saveProfileBtn`): persists profile changes and renders response.
- **Place order** (`#placeOrderBtn`): submits account order and refreshes history.
- **Refresh orders** (`#refreshOrdersBtn`): reloads account order list.
- **Logout** (`#logoutBtn`): clears local session and returns UI to logged-out mode.

## Liquid template editor (`public/liquid-templates.html` + `public/liquid-templates.js`)

- **New template** (`#newTemplateBtn`): clears current editor/selection.
- **Refresh preview** (`#refreshPreviewBtn`): rerenders preview with current template + sample data.
- **Save template** (`#saveTemplateBtn`): upserts template and reselects it.
- **Delete template** (`#deleteTemplateBtn`): deletes selected template and clears editor.
- **Snippet buttons**: inserts snippet text at cursor.
- **Template list items**: loads selected template into editor.

## Notification template editor (`public/notification-templates.html` + `public/notification-templates.js`)

- **New template** (`#newTemplateBtn`): resets form.
- **Refresh preview** (`#refreshPreviewBtn`): rerenders preview with substitutions.
- **Save template** (`#saveTemplateBtn`): upserts notification template.
- **Delete template** (`#deleteTemplateBtn`): removes template and clears form.
- **Snippet buttons**: inserts snippet in body.
- **Template list items**: loads template into form.

## Purchase orders (`public/purchase-orders.html` + `public/purchase-orders.js`)

- **Submit** (`#submitBtn`): creates draft PO via available endpoint and may open Shopify admin URL.

## Shipping matrix (`public/shipping-matrix.html`)

- **Run** (`#runBtn`): generates matrix output for provided query fields.

## Traceability (`public/traceability.html`)

- **Traceability submit action**: submits lot/order/date filters and renders/downloads traceability report.
