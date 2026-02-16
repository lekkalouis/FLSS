import test from "node:test";
import assert from "node:assert/strict";

import { resolveDispatchLane } from "./orders.js";

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
