import test from "node:test";
import assert from "node:assert/strict";

import { normalizeFlavourKey, resolveFlavourColor } from "../public/views/flavour-map.js";

test("normalizeFlavourKey handles ampersand flavour names", () => {
  assert.equal(normalizeFlavourKey("Red Wine & Garlic"), "red wine garlic");
  assert.equal(normalizeFlavourKey("Salt & Vinegar"), "salt vinegar");
  assert.equal(normalizeFlavourKey("Cheese & Onion"), "cheese onion");
});

test("resolveFlavourColor returns expected mapped colours for common flavour names", () => {
  assert.equal(resolveFlavourColor("Red Wine & Garlic"), "#722F37");
  assert.equal(resolveFlavourColor("Hot & Spicy"), "#DA291C");
  assert.equal(resolveFlavourColor("Sour Cream & Chives"), "#7BC96F");
});
