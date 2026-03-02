import test from "node:test";
import assert from "node:assert/strict";

import { flavourSortIndexForType } from "../public/views/flocs.js";

test("flavourSortIndexForType normalizes aliases, ampersands, and plurals for spice order", () => {
  const flavours = [
    "Salt & Vinegar",
    "Savoury Herb",
    "Red Wine & Garlic",
    "Hot & Spicy"
  ];

  const sorted = [...flavours].sort((a, b) =>
    flavourSortIndexForType(a, "spices") - flavourSortIndexForType(b, "spices")
  );

  assert.deepEqual(sorted, [
    "Hot & Spicy",
    "Red Wine & Garlic",
    "Savoury Herb",
    "Salt & Vinegar"
  ]);
});

test("flavourSortIndexForType keeps popcorn aliases in configured order", () => {
  const flavours = [
    "Salt & Vinegar",
    "Cheese and Onion",
    "Sour Cream & Chives"
  ];

  const sorted = [...flavours].sort((a, b) =>
    flavourSortIndexForType(a, "popcorn") - flavourSortIndexForType(b, "popcorn")
  );

  assert.deepEqual(sorted, [
    "Sour Cream & Chives",
    "Cheese and Onion",
    "Salt & Vinegar"
  ]);
});
