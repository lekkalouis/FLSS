# FLSS Hours Saved Baseline Assumptions

## Scope
This baseline models the full order-to-delivery flow across Shopify, FLSS Scan Station, Dispatch Board, ParcelPerfect, PrintNode, shopfloor packing activity, and exception handling.

## Reality assumptions captured
- Before FLSS automation, Scan Station did not exist; shipping quotes and dispatch readiness checks were manual.
- Operators manually calculated and quoted shipping, then emailed customers and waited for replies.
- Order throughput faced multi-day delays caused by re-entry and approval loops.
- The manual process required high operator barrier-to-entry (ops manager + shopfloor coordination).
- Slow systems and page load waits are explicitly represented as action time.
- Context switching, distraction risk, and manual data re-entry are captured as measurable action metadata.

## Method
Each atomic action references constants from `actions.v1.json`:
- `manual_seconds`
- `automated_seconds`
- `manual_error_rate`
- `automated_error_rate`
- `avg_fix_seconds`
- `avg_direct_cost`

Savings are computed from emitted events, not stopwatch timing.

## Event interpretation
An emitted action event means the action occurred for an order in the automated flow. Savings are calculated as the difference between baseline manual constants and automated constants.

## Cost conversion
Hours saved are converted to ZAR using a selectable hourly model from `cost-model.json`:
- R180/hour
- R250/hour
- R350/hour

Equivalent FTE avoided = monthly hours saved / 160.
