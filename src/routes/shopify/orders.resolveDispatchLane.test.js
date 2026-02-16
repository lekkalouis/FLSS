import test from "node:test";
import assert from "node:assert/strict";

import { buildDraftOrderLineItem, resolveDispatchLane } from "./orders.js";

test("resolves delivery for local signals", () => {
  assert.equal(resolveDispatchLane({ tags: "local", id: 1 }), "delivery");
  assert.equal(resolveDispatchLane({ tags: "delivery_local", id: 2 }), "delivery");
  assert.equal(
    resolveDispatchLane({
      id: 3,
      shipping_lines: [{ title: "Local Delivery", code: "delivery_local", source: "manual" }]
    }),
    "delivery"
  );
  assert.equal(
    resolveDispatchLane({
      id: 4,
      metafields: [{ namespace: "custom", key: "delivery_type", value: "local" }]
    }),
    "delivery"
  );
});

test("pickup indicators take precedence over delivery signals", () => {
  assert.equal(resolveDispatchLane({ tags: "pickup, local", id: 10 }), "pickup");
  assert.equal(resolveDispatchLane({ tags: "collection, delivery_local", id: 11 }), "pickup");
  assert.equal(
    resolveDispatchLane({
      id: 12,
      shipping_lines: [{ title: "click & collect - same day", code: "delivery" }]
    }),
    "pickup"
  );
});

test("distributes neutral shipping lanes by order id modulo", () => {
  assert.equal(resolveDispatchLane({ id: 300, tags: "courier" }), "shipping_a");
  assert.equal(resolveDispatchLane({ id: 301, tags: "courier" }), "shipping_b");
  assert.equal(resolveDispatchLane({ id: 302, tags: "courier" }), "shipping_c");
});

test("falls back to deterministic shipping lane with no explicit signals", () => {
  assert.equal(resolveDispatchLane({ tags: "standard courier", id: 1 }), "shipping_b");
  assert.equal(
    resolveDispatchLane({ shipping_lines: [{ title: "Economy", code: "shipping" }], id: 2 }),
    "shipping_c"
  );
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
