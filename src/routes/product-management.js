import express from "express";

import { computeTrueCost } from "../services/costing/computeTrueCost.js";
import {
  createBackupSnapshot,
  exportSnapshotZip,
  generateCompliance,
  getDashboard,
  getSyncStatus,
  listTable,
  upsertProduct,
  upsertSimple
} from "../services/productManagement.js";
import { runSyncNow } from "../services/productSync.js";

const router = express.Router();

const writableTables = [
  "ingredients",
  "suppliers",
  "ingredient_prices",
  "bom_recipes",
  "bom_lines",
  "packaging_items",
  "packaging_profiles",
  "packaging_lines",
  "price_tiers",
  "product_prices",
  "cost_inputs_period",
  "compliance_profiles"
];

router.get("/product-management/dashboard", (req, res) => {
  const asOfDate = String(req.query.as_of_date || new Date().toISOString().slice(0, 10));
  const tier = String(req.query.tier || "public");
  return res.json(getDashboard(asOfDate, tier));
});

router.get("/product-management/products", (_req, res) => {
  return res.json({ products: listTable("products") });
});

router.post("/product-management/products", (req, res) => {
  const result = upsertProduct(req.body, "api");
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/:table", (req, res) => {
  const table = String(req.params.table || "");
  if (!writableTables.includes(table) && table !== "products" && table !== "change_log" && table !== "audit_log") return res.status(404).json({ error: "Not found" });
  return res.json({ rows: listTable(table) });
});

router.post("/product-management/:table", (req, res) => {
  const table = String(req.params.table || "");
  if (!writableTables.includes(table)) return res.status(404).json({ error: "Not found" });
  const result = upsertSimple(table, req.body, "api");
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/products/:id/cost", (req, res) => {
  const id = Number(req.params.id);
  const asOfDate = String(req.query.as_of_date || new Date().toISOString().slice(0, 10));
  const tier = String(req.query.tier || "public");
  const result = computeTrueCost(id, asOfDate, tier);
  if (result.error) return res.status(404).json({ error: result.error });
  return res.json(result);
});

router.post("/product-management/products/:id/compliance/generate", (req, res) => {
  const result = generateCompliance(Number(req.params.id));
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/sync/status", (_req, res) => {
  return res.json(getSyncStatus());
});

router.post("/product-management/sync/now", async (_req, res) => {
  const result = await runSyncNow();
  if (!result.ok) return res.status(500).json(result);
  return res.json(result);
});

router.post("/product-management/backups/daily", (_req, res) => {
  return res.json(createBackupSnapshot());
});

router.post("/product-management/backups/export", async (_req, res) => {
  const result = await exportSnapshotZip();
  return res.json(result);
});

export default router;
