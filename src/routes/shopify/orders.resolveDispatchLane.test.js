import test from "node:test";
import assert from "node:assert/strict";

import { buildDraftOrderLineItem, resolveDispatchLane } from "./orders.js";

test("resolves delivery for local signals", () => {
  assert.equal(resolveDispatchLane({ tags: "local" }), "delivery");
  assert.equal(resolveDispatchLane({ tags: "delivery_local" }), "delivery");
  assert.equal(
    resolveDispatchLane({
      shipping_lines: [{ title: "Local Delivery", code: "delivery_local", source: "manual" }]
    }),
    "delivery"
  );
  assert.equal(resolveDispatchLane({ tags: "same day" }), "delivery");
});

test("pickup indicators take precedence over delivery signals", () => {
  assert.equal(resolveDispatchLane({ tags: "collect, local" }), "pickup");
  assert.equal(resolveDispatchLane({ tags: "warehouse delivery_local" }), "pickup");
  assert.equal(
    resolveDispatchLane({
      shipping_lines: [{ title: "click & collect - same day", code: "delivery" }]
    }),
    "pickup"
  );
});

test("resolves pickup terms", () => {
  assert.equal(resolveDispatchLane({ tags: "collect" }), "pickup");
  assert.equal(resolveDispatchLane({ tags: "collection" }), "pickup");
  assert.equal(resolveDispatchLane({ tags: "warehouse" }), "pickup");
  assert.equal(resolveDispatchLane({ tags: "click & collect" }), "pickup");
});

test("returns shipping when no explicit pickup/delivery signal is found", () => {
  assert.equal(resolveDispatchLane({ tags: "standard courier" }), "shipping");
  assert.equal(
    resolveDispatchLane({ shipping_lines: [{ title: "Economy", code: "shipping" }] }),
    "shipping"
  );
});

test("returns null for truly indeterminate lane inputs", () => {
  assert.equal(resolveDispatchLane({}), null);
  assert.equal(resolveDispatchLane({ tags: "", shipping_lines: [] }), null);
  assert.equal(resolveDispatchLane({ tags: "  ", shipping_lines: [{ title: "", code: "" }] }), null);
});

test("variant lines send variant_id + applied_discount when target is below base", () => {
  const { entry, discountApplied, enforcementReason } = buildDraftOrderLineItem({
    lineItem: { variantId: 123, sku: "SKU-1" },
    quantity: 2,
    variantId: 123,
    basePrice: 100,
    targetPrice: 82.5,
    normalizedTier: "retail"
  });

  assert.deepEqual(entry, {
    quantity: 2,
    variant_id: 123,
    applied_discount: {
      description: "Tier pricing (retail)",
      value: "17.50",
      value_type: "fixed_amount",
      amount: "17.50"
    },
    sku: "SKU-1"
  });
  assert.equal(discountApplied, true);
  assert.equal(enforcementReason, null);
});

test("custom lines keep explicit price", () => {
  const { entry, discountApplied, enforcementReason } = buildDraftOrderLineItem({
    lineItem: { title: "Handling", sku: "FEE-1" },
    quantity: 1,
    variantId: Number.NaN,
    basePrice: null,
    targetPrice: 49.5,
    normalizedTier: "retail"
  });

  assert.deepEqual(entry, {
    quantity: 1,
    title: "Handling",
    price: "49.50",
    sku: "FEE-1"
  });
  assert.equal(discountApplied, false);
  assert.equal(enforcementReason, null);
});

test("variant lines clamp target above base to base behavior (no explicit price override)", () => {
  const { entry, discountApplied, enforcementReason } = buildDraftOrderLineItem({
    lineItem: { variantId: 456 },
    quantity: 3,
    variantId: 456,
    basePrice: 70,
    targetPrice: 90,
    normalizedTier: "agent"
  });

  assert.deepEqual(entry, {
    quantity: 3,
    variant_id: 456
  });
  assert.equal(discountApplied, false);
  assert.equal(enforcementReason, "TARGET_ABOVE_BASE_CLAMPED");
});

test("variant lines with missing base price avoid non-deterministic discount or explicit price", () => {
  const { entry, discountApplied, enforcementReason } = buildDraftOrderLineItem({
    lineItem: { variantId: 789 },
    quantity: 1,
    variantId: 789,
    basePrice: null,
    targetPrice: null,
    normalizedTier: null
  });

  assert.deepEqual(entry, {
    quantity: 1,
    variant_id: 789
  });
  assert.equal(discountApplied, false);
  assert.equal(enforcementReason, "MISSING_BASE_PRICE");
});

test("variant lines with missing tier or missing rule remain deterministic at base via variant only payload", () => {
  const missingTier = buildDraftOrderLineItem({
    lineItem: { variantId: 321 },
    quantity: 1,
    variantId: 321,
    basePrice: 55,
    targetPrice: 55,
    normalizedTier: null
  });
  const missingRule = buildDraftOrderLineItem({
    lineItem: { variantId: 654 },
    quantity: 2,
    variantId: 654,
    basePrice: 80,
    targetPrice: 80,
    normalizedTier: "retail"
  });

  assert.deepEqual(missingTier.entry, { quantity: 1, variant_id: 321 });
  assert.deepEqual(missingRule.entry, { quantity: 2, variant_id: 654 });
  assert.equal(missingTier.discountApplied, false);
  assert.equal(missingRule.discountApplied, false);
  assert.equal(missingTier.enforcementReason, null);
  assert.equal(missingRule.enforcementReason, null);
});
