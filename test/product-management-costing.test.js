import path from "node:path";

process.env.LOCAL_DB_PATH = path.resolve("data/test-products-costing.sqlite");

import test from "node:test";
import assert from "node:assert/strict";

import { closeDb, runMigrations, getDb } from "../src/db/sqlite.js";
import { computeTrueCost } from "../src/services/product-management/costing.js";

function resetDb() {
  runMigrations();
  const db = getDb();
  db.exec(`
    DELETE FROM product_prices;
    DELETE FROM price_tiers;
    DELETE FROM packaging_lines;
    DELETE FROM packaging_profiles;
    DELETE FROM packaging_items;
    DELETE FROM bom_lines;
    DELETE FROM bom_recipes;
    DELETE FROM ingredient_prices;
    DELETE FROM suppliers;
    DELETE FROM ingredients;
    DELETE FROM cost_inputs_period;
    DELETE FROM products;
  `);
  return db;
}

test("computeTrueCost uses effective-dated prices/recipes and expected formulas", () => {
  const db = resetDb();

  const p = db.prepare("INSERT INTO products (sku, title, status, created_at, updated_at) VALUES ('SKU1','Prod','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  const productId = Number(p.lastInsertRowid);

  db.prepare("INSERT INTO ingredients (id, name, allergen_flags, created_at, updated_at) VALUES (101,'Salt','[]',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  db.prepare("INSERT INTO ingredients (id, name, allergen_flags, created_at, updated_at) VALUES (102,'Paprika','[]',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  db.prepare("INSERT INTO ingredient_prices (ingredient_id, price_per_kg, effective_from) VALUES (101, 10, '2026-01-01')").run();
  db.prepare("INSERT INTO ingredient_prices (ingredient_id, price_per_kg, effective_from) VALUES (101, 12, '2026-02-01')").run();
  db.prepare("INSERT INTO ingredient_prices (ingredient_id, price_per_kg, effective_from) VALUES (102, 100, '2026-01-01')").run();

  db.prepare("INSERT INTO bom_recipes (id, product_id, version, effective_from, yield_pct, waste_pct, created_at) VALUES (301, ?, 'v1', '2026-01-01', 100, 0, CURRENT_TIMESTAMP)").run(productId);
  db.prepare("INSERT INTO bom_recipes (id, product_id, version, effective_from, yield_pct, waste_pct, created_at) VALUES (302, ?, 'v2', '2026-02-01', 100, 0, CURRENT_TIMESTAMP)").run(productId);
  db.prepare("INSERT INTO bom_lines (recipe_id, ingredient_id, grams_used) VALUES (301,101,30),(301,102,20),(302,101,40),(302,102,20)").run();

  db.prepare("INSERT INTO packaging_items (id, name, unit_cost, uom, created_at, updated_at) VALUES (201,'Bottle',3.8,'ea',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),(202,'Cap',0.9,'ea',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  db.prepare("INSERT INTO packaging_profiles (id, product_id, name, effective_from, created_at) VALUES (401, ?, 'std', '2026-01-01', CURRENT_TIMESTAMP)").run(productId);
  db.prepare("INSERT INTO packaging_lines (profile_id, packaging_item_id, qty) VALUES (401,201,1),(401,202,1)").run();

  db.prepare("INSERT INTO cost_inputs_period (period, labour_total, overhead_total, dispatch_total, shipping_total, units_produced, units_shipped, created_at, updated_at) VALUES ('2026-02', 45000,30000,15600,60000,30000,30000,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  db.prepare("INSERT INTO price_tiers (id, name, gateway_fee_pct, commission_pct, created_at, updated_at) VALUES (501,'wholesale',2.9,5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run();
  db.prepare("INSERT INTO product_prices (product_id, tier_id, price, effective_from, created_at) VALUES (?,501,70,'2026-01-01',CURRENT_TIMESTAMP)").run(productId);

  const result = computeTrueCost(productId, "2026-02-15", 501);
  assert.equal(result.breakdown.ingredient_cost, 2.48);
  assert.equal(result.breakdown.packaging_cost, 4.7);
  assert.equal(result.breakdown.labour_per_unit, 1.5);
  assert.equal(result.breakdown.overhead_per_unit, 1);
  assert.equal(result.breakdown.dispatch_per_unit, 0.52);
  assert.equal(result.breakdown.shipping_per_unit, 2);
  assert.equal(result.breakdown.fees, 5.53);
  assert.equal(result.breakdown.true_cost, 17.73);
  closeDb();
});
