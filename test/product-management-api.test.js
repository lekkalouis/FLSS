import path from "node:path";

process.env.LOCAL_DB_PATH = path.resolve("data/test-products-api.sqlite");

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { closeDb, getDb, runMigrations } from "../src/db/sqlite.js";
import { createApp } from "../src/app.js";

function resetDb() {
  runMigrations();
  const db = getDb();
  db.exec(`
    DELETE FROM change_log;
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
}

function startServer() {
  const { app } = createApp();
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

test("product management API CRUD + dashboard works offline", async () => {
  resetDb();
  const { server, baseUrl } = await startServer();
  try {
    const post = (pathName, body) => fetch(`${baseUrl}/api/v1/product-management/${pathName}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });

    let res = await post("products", { sku: "SKU-1", title: "Product 1", status: "active" });
    const productId = (await res.json()).product.id;

    res = await post("ingredients", { name: "Salt" });
    const ingredientId = (await res.json()).ingredient.id;
    await post("ingredient-prices", { ingredient_id: ingredientId, price_per_kg: 12, effective_from: "2026-01-01" });
    res = await post("packaging-items", { name: "Bottle", unit_cost: 3.8, uom: "ea" });
    const packagingItemId = (await res.json()).packaging_item.id;
    await post("recipes", { product_id: productId, version: "v1", effective_from: "2026-01-01", lines: [{ ingredient_id: ingredientId, grams_used: 40 }] });
    await post("packaging-profiles", { product_id: productId, name: "std", effective_from: "2026-01-01", lines: [{ packaging_item_id: packagingItemId, qty: 1 }] });
    res = await post("price-tiers", { name: "wholesale", gateway_fee_pct: 2.9, commission_pct: 5 });
    const tierId = (await res.json()).tier.id;
    await post("product-prices", { product_id: productId, tier_id: tierId, price: 70, effective_from: "2026-01-01" });
    await post("cost-inputs", { period: "2026-01", labour_total: 45000, overhead_total: 30000, dispatch_total: 15600, shipping_total: 60000, units_produced: 30000, units_shipped: 30000 });

    res = await fetch(`${baseUrl}/api/v1/product-management/cost/${productId}?as_of_date=2026-01-15&tier_id=${tierId}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.breakdown.ingredient_cost, 0.48);

    res = await fetch(`${baseUrl}/api/v1/product-management/dashboard?as_of_date=2026-01-15&tier_id=${tierId}`);
    assert.equal(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDb();
  }
});
