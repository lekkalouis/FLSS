# Draft-order wholesale discount function extraction

## Extracted function

Source location: `src/routes/shopify/orders.js`.

```js
function toMoneyString(value) {
  return Number(value).toFixed(2);
}

export function buildDraftOrderLineItem({
  lineItem,
  quantity,
  variantId,
  basePrice,
  targetPrice,
  normalizedTier
}) {
  const hasVariant = Number.isFinite(variantId);
  const entry = {
    quantity: quantity > 0 ? quantity : 1
  };
  let discountApplied = false;
  let enforcementReason = null;

  if (hasVariant) {
    entry.variant_id = variantId;

    if (!Number.isFinite(basePrice)) {
      enforcementReason = "MISSING_BASE_PRICE";
    } else if (Number.isFinite(targetPrice) && targetPrice < basePrice) {
      const discount = toMoneyString(basePrice - targetPrice);
      entry.applied_discount = {
        description: `Tier pricing (${normalizedTier || "default"})`,
        value: discount,
        value_type: "fixed_amount",
        amount: discount
      };
      discountApplied = true;
    } else if (Number.isFinite(targetPrice) && targetPrice > basePrice) {
      enforcementReason = "TARGET_ABOVE_BASE_CLAMPED";
      console.warn("Tier price higher than base price; using base price", {
        variantId,
        basePrice,
        targetPrice,
        tier: normalizedTier
      });
    }

    if (lineItem.sku) entry.sku = lineItem.sku;
    return { entry, discountApplied, enforcementReason };
  }

  entry.title = lineItem.title || lineItem.sku || "Custom item";
  if (Number.isFinite(targetPrice)) {
    entry.price = toMoneyString(targetPrice);
  }
  if (lineItem.sku) entry.sku = lineItem.sku;
  return { entry, discountApplied, enforcementReason };
}
```

## Prompt to implement this in an older repo version

Use this prompt with your coding agent:

```text
Port the wholesale draft-order discount line-item builder from the newer FLSS codebase into this older branch.

Requirements:
1) Add a helper:
   function toMoneyString(value) { return Number(value).toFixed(2); }

2) Add/export this function in the Shopify orders route module:
   buildDraftOrderLineItem({ lineItem, quantity, variantId, basePrice, targetPrice, normalizedTier })

3) Behavior must match exactly:
   - Always start entry as: { quantity: quantity > 0 ? quantity : 1 }
   - If variantId is finite:
     - set entry.variant_id = variantId
     - if basePrice is not finite: enforcementReason = "MISSING_BASE_PRICE"
     - else if targetPrice < basePrice: set entry.applied_discount as fixed_amount with value/amount = (basePrice-targetPrice).toFixed(2), description = `Tier pricing (${normalizedTier || "default"})`; discountApplied = true
     - else if targetPrice > basePrice: enforcementReason = "TARGET_ABOVE_BASE_CLAMPED" and log warning; DO NOT set entry.price or applied_discount
     - include entry.sku when lineItem.sku exists
     - return { entry, discountApplied, enforcementReason }
   - If variantId is not finite (custom line):
     - set entry.title = lineItem.title || lineItem.sku || "Custom item"
     - if targetPrice is finite, set entry.price = toMoneyString(targetPrice)
     - include entry.sku when present
     - return { entry, discountApplied, enforcementReason } (discountApplied false by default)

4) Keep determinism constraints:
   - For variant-backed lines, do not send explicit `price`.
   - Only send `applied_discount` when targetPrice is below basePrice.

5) Add/update tests for these cases:
   - variant line with discount
   - custom line with explicit price
   - variant line target > base clamped
   - variant line missing base price
   - variant line target == base (no discount)

6) Run tests and fix any route exports/imports so tests pass.

Deliverables:
- Updated route module code
- Test coverage for the function
- Short note explaining why explicit variant `price` is avoided
```
