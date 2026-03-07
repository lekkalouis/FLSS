# FLSS Button and Action Map

This map reflects the current shell in `public/index.html` and `public/app.js`.

## 1. Main shell navigation

| Control | Location | Result |
| --- | --- | --- |
| `#navScan` | top nav | Opens the Orders and dispatch workspace. |
| `#navFulfillment` | top nav | Opens Fulfillment History. |
| `#navStock` | top nav | Opens Stock. |
| `#navBuy` | top nav | Opens Buy. |
| `#navMake` | top nav | Opens Make. |
| `#navDocs` | top nav | Opens the markdown docs browser. |
| `#navNewOrder` | floating action button | Opens the new-order menu. |
| `.flNewOrderMenuItem[data-route="/flocs"]` | new-order menu | Opens Sales Order capture. |
| `.flNewOrderMenuItem[data-stock-tab="stocktakes"]` | new-order menu | Opens Stocktakes in Stock. |
| `.flNewOrderMenuItem[data-route="/buy"]` | new-order menu | Opens Buy. |
| `.flNewOrderMenuItem[data-route="/make"]` | new-order menu | Opens Make. |
| `.flNewOrderMenuItem[data-flocs-action="new-customer"]` | new-order menu | Opens Order Capture with the new-customer flow. |
| `#navFooterAdmin` | footer | Opens Admin. |
| `#navFooterSettings` | footer | Opens the settings modal. |

## 2. Orders and dispatch

| Control | Result |
| --- | --- |
| `.dispatchLineItem` in an unselected order | Selects the order only. |
| `.dispatchLineItem` in the selected order | Toggles packed state. |
| `.dispatchPackQtyBtn` | Opens or updates packed quantity for the line. |
| `#dispatchSelectionSidebarToggle` | Collapses or expands the selected-orders sidebar. |
| `#dispatchSelectionClear` | Clears the current selected-order set. |
| `#dispatchSelectionPrintBtn` | Prints supported documents for the selected orders. |
| `#dispatchPrepareDeliveries` | Books the selected delivery orders. |
| `#dispatchControllerBackBtn` | Sends the context-aware `back` action. |
| `#dispatchControllerConfirmBtn` | Sends the context-aware `confirm` action. |
| Keyboard `ArrowUp` / `ArrowDown` | Sends `prev` / `next` when controller navigation is active. |
| Keyboard `Enter` | Sends `confirm` when controller navigation is active. |

## 3. Admin shortcuts

| Control | Result |
| --- | --- |
| `.flAdminLauncherBtn[data-route="/admin/price-manager"]` | Opens Price Manager. |
| `.flAdminLauncherBtn[data-route="/admin/agent-commissions"]` | Opens Agent Commissions. |
| `.flAdminLauncherBtn[data-stock-inventory-tab="materials"]` | Opens raw materials in Stock. |
| `.flAdminLauncherBtn[data-settings-tab-open="one-click-actions"]` | Opens the One Click Actions settings tab. |

## 4. Settings modal

| Control | Result |
| --- | --- |
| `[data-settings-tab="general"]` | Opens General settings. |
| `[data-settings-tab="one-click-actions"]` | Opens One Click Actions. |
| `[data-settings-tab="printers"]` | Opens printer mappings and print tools. |
| `[data-settings-tab="controller"]` | Opens controller overlay settings. |
| `[data-settings-tab="notifications"]` | Opens notification bindings and test sends. |
| `[data-settings-tab="monitoring"]` | Opens monitoring and print-history diagnostics. |
| `#settingsTestStickerBtn` | Runs the best-before print test. |
| `#settingsTestGboxBtn` | Runs the GBOX label print action. |
| `#settingsTestPickupEmailBtn` | Sends a pickup notification test. |
| `#settingsTestTruckEmailBtn` | Sends a truck notification test. |
| `#settingsSaveBtn` | Persists the normalized settings payload. |

## 5. Compatibility notes

> Compatibility / legacy: the current shell no longer embeds an admin iframe and no longer exposes old standalone admin pages as first-class controls.

If you still see references to `/purchase-orders.html`, `/product-management.html`, or other retired pages, treat them as redirect entrypoints rather than supported operator surfaces.

## 6. Raspberry Pi wired controller

Default GPIO behavior for the current workspace:

| Hardware control | Default GPIO | Result |
| --- | --- | --- |
| Rotary clockwise | `GPIO17` / `GPIO27` pair | `next` in order mode, or next line in line mode. |
| Rotary counter-clockwise | `GPIO17` / `GPIO27` pair | `prev` in order mode, or previous line in line mode. |
| Knob click | `GPIO22` | Confirm flow. |
| Confirm side button | `GPIO5` | Confirm flow. |
| Back side button | `GPIO6` | Context-aware `back`. |
| Print button | `GPIO19` | `print`. |
| Fulfill button | `GPIO26` | `fulfill`. |

Holding the knob or confirm side button sends `confirm_hold` so quantity mode can be adjusted without the mouse.
