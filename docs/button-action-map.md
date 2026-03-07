# FLSS Button and Action Map (Repo 2.2)

This file maps the major operator controls that matter in the current build.

## 1. Main SPA shell

| Control | Location | Result |
| --- | --- | --- |
| `#navScan` | top nav | Opens the Orders and dispatch workspace. |
| `#navFlocs` | top nav | Opens FLOCS order capture. |
| `#navStock` | top nav | Opens Stock tools. |
| `#navPriceManager` | top nav | Opens Price Manager when admin unlock is active. |
| `#navDocs` | nav/footer | Opens the in-app documentation browser. |
| `#navFlowcharts` | nav/footer | Opens the flow guidance view. |
| `#navAdmin` | nav/footer | Opens the Admin launcher and embedded workspace. |
| `#navFooterSettings` | footer | Opens the unified settings modal. |
| `#navToggle` | shell | Collapses or expands the nav. |

## 2. Dispatch board and controller

| Control | Result |
| --- | --- |
| Keyboard `ArrowUp` / `ArrowDown` while controller is active | Sends mode-aware `prev` / `next`. |
| Keyboard `Enter` while controller is active | Sends mode-aware `confirm`. |
| `#dispatchControllerBackBtn` | Sends context-aware `back`. |
| `#dispatchControllerConfirmBtn` | Sends mode-aware `confirm`. |
| `.dispatchLineItem` in an unselected order | Selects the order only. |
| `.dispatchLineItem` in the selected order | Toggles packed state. |
| `.dispatchPackQtyBtn` | Opens or applies quantity-based packing for that line. |
| `#truckBookBtn` | Sends `POST /alerts/book-truck`. |
| `#dispatchPrepareDeliveries` | Runs grouped preparation logic for selected orders. |
| `#dispatchCreateCombined` | Creates a combined shipment group from selected orders. |

## 3. Settings modal

| Control | Result |
| --- | --- |
| `[data-settings-tab="general"]` | Opens General settings. |
| `[data-settings-tab="printers"]` | Opens printer settings and print tooling. |
| `[data-settings-tab="controller"]` | Opens controller overlay and visibility options. |
| `[data-settings-tab="notifications"]` | Opens notification bindings, recipients, and test send actions. |
| `[data-settings-tab="monitoring"]` | Opens monitoring and runtime diagnostics. |
| `#settingsTestPickupEmailBtn` | Sends a pickup-ready test email. |
| `#settingsTestTruckEmailBtn` | Sends a truck-collection test email. |
| `#settingsSaveBtn` | Persists the normalized settings payload. |

## 4. Admin workspace

| Control | Result |
| --- | --- |
| `#adminLauncher [data-admin-tool-id]` | Opens the selected tool inside the Admin workspace iframe. |
| `#adminWorkspaceOpenLink` | Opens the active tool in its direct standalone URL. |

## 5. Template tools

### Notification templates

| Control | Result |
| --- | --- |
| `#newTemplateBtn` | Clears the form for a new template. |
| `#refreshPreviewBtn` | Renders the preview with sample data. |
| `#saveTemplateBtn` | Creates or updates the template. |
| `#deleteTemplateBtn` | Deletes the selected template. |

### Liquid templates

| Control | Result |
| --- | --- |
| `#newTemplateBtn` | Clears the editor for a new template. |
| `#refreshPreviewBtn` | Renders the sample preview. |
| `#saveTemplateBtn` | Creates or updates the template. |
| `#deleteTemplateBtn` | Deletes the selected template. |

## 6. Raspberry Pi wired controller

Default GPIO behavior for Repo 2.2:

| Hardware control | Default GPIO | Result |
| --- | --- | --- |
| Rotary clockwise | `GPIO17` / `GPIO27` pair | `next` in order mode, or next line in line mode. |
| Rotary counter-clockwise | `GPIO17` / `GPIO27` pair | `prev` in order mode, or previous line in line mode. |
| Knob click | `GPIO22` | Confirm flow. |
| Confirm side button | `GPIO5` | Confirm flow. |
| Back side button | `GPIO6` | Context-aware `back`. |
| Print button | `GPIO19` | `print`. |
| Fulfill button | `GPIO26` | `fulfill`. |

Holding the knob or confirm side button triggers `confirm_hold` so packed quantity mode remains available.
