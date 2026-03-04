import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flss-pm-"));
process.env.LOCAL_DB_PATH = path.join(tmpRoot, "products.sqlite");
process.env.ASSETS_PATH = path.join(tmpRoot, "assets");
process.env.BACKUPS_PATH = path.join(tmpRoot, "backups");
process.env.SYNC_ENABLED = "false";

const { initProductDb } = await import("../src/services/productDb.js");
const { upsertProduct, upsertSimple, generateCompliance } = await import("../src/services/productManagement.js");
const { computeTrueCost } = await import("../src/services/costing/computeTrueCost.js");

initProductDb();

test("effective-dated costing uses latest <= as_of_date records", () => {
  const product = upsertProduct({ sku: "SKU-1", title: "Test Product", commission_pct: 5, gateway_pct: 2.9 }).product;

  const ing = upsertSimple("ingredients", { name: "Salt", allergen_flags: "[]" }).row;
  upsertSimple("ingredient_prices", { ingredient_id: ing.id, supplier_id: null, price_per_kg: 10, effective_from: "2026-01-01" });
  upsertSimple("ingredient_prices", { ingredient_id: ing.id, supplier_id: null, price_per_kg: 20, effective_from: "2026-02-01" });

  const rec = upsertSimple("bom_recipes", { product_id: product.id, version: 1, effective_from: "2026-01-01", yield_pct: 100, waste_pct: 0 }).row;
  upsertSimple("bom_lines", { recipe_id: rec.id, ingredient_id: ing.id, grams_used: 100 });

  const pkg = upsertSimple("packaging_items", { name: "Bottle", unit_cost: 3, uom: "ea" }).row;
  const profile = upsertSimple("packaging_profiles", { product_id: product.id, name: "Default", effective_from: "2026-01-01" }).row;
  upsertSimple("packaging_lines", { profile_id: profile.id, packaging_item_id: pkg.id, qty: 1 });

  const tier = upsertSimple("price_tiers", { code: "public", name: "Public" }).row;
  upsertSimple("product_prices", { product_id: product.id, tier_id: tier.id, price: 70, effective_from: "2026-01-01" });
  upsertSimple("cost_inputs_period", { period: "2026-02", labour_total: 45000, overhead_total: 30000, shipping_total: 60000, dispatch_materials_total: 15600, units_produced: 30000, units_shipped: 30000 });

  const jan = computeTrueCost(product.id, "2026-01-15", "public");
  const feb = computeTrueCost(product.id, "2026-02-15", "public");

  assert.equal(jan.cost_layers.ingredient_cost, 1);
  assert.equal(feb.cost_layers.ingredient_cost, 2);
  assert.equal(feb.cost_layers.packaging_cost, 3);
  assert.equal(feb.cost_layers.labour_per_unit, 1.5);
  assert.equal(feb.cost_layers.overhead_per_unit, 1);
  assert.equal(feb.cost_layers.shipping_per_unit, 2);
  assert.equal(feb.cost_layers.dispatch_per_unit, 0.52);
});

test("compliance generator aggregates allergens from BOM", () => {
  const product = upsertProduct({ sku: "SKU-2", title: "Allergen Product" }).product;
  const nuts = upsertSimple("ingredients", { name: "Peanuts", allergen_flags: JSON.stringify(["nuts"]) }).row;
  const dairy = upsertSimple("ingredients", { name: "Milk Powder", allergen_flags: JSON.stringify(["milk"]) }).row;
  const rec = upsertSimple("bom_recipes", { product_id: product.id, version: 1, effective_from: "2026-01-01", yield_pct: 100, waste_pct: 0 }).row;
  upsertSimple("bom_lines", { recipe_id: rec.id, ingredient_id: nuts.id, grams_used: 40 });
  upsertSimple("bom_lines", { recipe_id: rec.id, ingredient_id: dairy.id, grams_used: 20 });

  const compliance = generateCompliance(product.id);
  assert.equal(compliance.ingredients_text, "Peanuts, Milk Powder");
  assert.deepEqual(compliance.allergens, ["nuts", "milk"]);
});
