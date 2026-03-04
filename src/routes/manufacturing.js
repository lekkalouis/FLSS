import express from "express";

import {
  calculateSkuTrueCost,
  getManufacturingDashboard,
  getManufacturingData,
  upsertCostInputs,
  upsertIngredient,
  upsertProduct,
  upsertRecipe
} from "../services/manufacturing.js";

const router = express.Router();

router.get("/manufacturing/data", (_req, res) => {
  return res.json(getManufacturingData());
});

router.post("/manufacturing/products", (req, res) => {
  const result = upsertProduct(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/manufacturing/ingredients", (req, res) => {
  const result = upsertIngredient(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/manufacturing/recipes", (req, res) => {
  const result = upsertRecipe(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/manufacturing/cost-inputs", (req, res) => {
  const result = upsertCostInputs(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/manufacturing/sku/:productId/cost", (req, res) => {
  const productId = String(req.params.productId || "").trim();
  const month = String(req.query.month || "").trim();
  if (!month) return res.status(400).json({ error: "month query param is required" });
  const result = calculateSkuTrueCost({ productId, month });
  if (result.error) return res.status(404).json({ error: result.error });
  return res.json(result);
});

router.get("/manufacturing/dashboard", (req, res) => {
  const month = String(req.query.month || "").trim();
  if (!month) return res.status(400).json({ error: "month query param is required" });
  const result = getManufacturingDashboard(month);
  if (result.error) return res.status(404).json({ error: result.error });
  return res.json(result);
});

export default router;
