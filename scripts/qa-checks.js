import assert from "node:assert/strict";

import { resolveDispatchLane, resolveTargetUnitPrice } from "../src/routes/shopify/orders.js";

async function run() {
  assert.equal(resolveDispatchLane({ tags: "local" }), "delivery");
  assert.equal(resolveDispatchLane({ tags: "delivery_local" }), "delivery");
  assert.equal(resolveDispatchLane({ tags: "collection" }), "pickup");

  const priceResult = await resolveTargetUnitPrice({
    lineItem: { variantId: 12345, price: "999.00", quantity: 1, sku: "SKU-1" },
    normalizedTier: "retail",
    customerTags: ["retail"],
    basePrice: 120,
    priceLists: [],
    tierCache: new Map([[12345, { retail: 80 }]])
  });

  assert.equal(priceResult.targetPrice, 80);
  assert.equal(priceResult.source, "metafield");

  console.log("QA checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
