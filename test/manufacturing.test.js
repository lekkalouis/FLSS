import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "../src/app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureFile = path.join(__dirname, "..", "data", "manufacturing.json");

function startServer() {
  const { app } = createApp();
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

test("manufacturing true cost and dashboard endpoints compute expected values", async () => {
  await fs.rm(fixtureFile, { force: true });
  const { server, baseUrl } = await startServer();

  try {
    const post = async (pathName, body) => {
      const res = await fetch(`${baseUrl}/api/v1/manufacturing/${pathName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      assert.equal(res.status, 200);
      return res.json();
    };

    await post("products", {
      product_id: "sku-1",
      sku: "FL-SALT-001",
      name: "Salt Blend",
      bottle_cost: 3.8,
      cap_cost: 0.9,
      label_cost: 1.4,
      seal_cost: 0.5,
      selling_price: 70,
      commission_pct: 5,
      gateway_pct: 2.9
    });

    await post("ingredients", { ingredient_id: "salt", name: "Salt", price_per_kg: 12 });
    await post("ingredients", { ingredient_id: "paprika", name: "Paprika", price_per_kg: 120 });
    await post("ingredients", { ingredient_id: "garlic", name: "Garlic", price_per_kg: 180 });

    await post("recipes", { product_id: "sku-1", ingredient_id: "salt", grams_used: 40 });
    await post("recipes", { product_id: "sku-1", ingredient_id: "paprika", grams_used: 20 });
    await post("recipes", { product_id: "sku-1", ingredient_id: "garlic", grams_used: 10 });

    await post("cost-inputs", {
      month: "2026-01",
      labour_total: 45000,
      overhead_total: 30000,
      shipping_total: 60000,
      units_produced: 30000,
      units_shipped: 30000,
      dispatch_materials_per_order: 6.2,
      units_per_box: 12
    });

    const costRes = await fetch(`${baseUrl}/api/v1/manufacturing/sku/sku-1/cost?month=2026-01`);
    assert.equal(costRes.status, 200);
    const costBody = await costRes.json();
    assert.equal(costBody.cost_layers.bom, 11.28);
    assert.equal(costBody.cost_layers.dispatch_materials_per_unit, 0.52);
    assert.equal(costBody.cost_layers.true_cost, 21.83);
    assert.equal(costBody.profitability.margin_pct, 68.81);

    const dashboardRes = await fetch(`${baseUrl}/api/v1/manufacturing/dashboard?month=2026-01`);
    assert.equal(dashboardRes.status, 200);
    const dashboardBody = await dashboardRes.json();
    assert.equal(dashboardBody.per_sku.length, 1);
    assert.equal(dashboardBody.factory_metrics.labour_per_unit, 1.5);
    assert.equal(dashboardBody.factory_metrics.overhead_per_unit, 1);
    assert.equal(dashboardBody.factory_metrics.shipping_per_unit, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(fixtureFile, { force: true });
  }
});
