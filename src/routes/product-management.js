import express from "express";

import {
  addIngredientPrice,
  addProductPrice,
  computeTrueCost,
  createBackupSnapshot,
  createIngredient,
  createPackagingItem,
  createSupplier,
  getDashboard,
  getSyncStatus,
  listAuditLog,
  listIngredients,
  listPackagingItems,
  listProducts,
  listSuppliers,
  restoreSnapshot,
  runSyncNow,
  upsertCostInputs,
  upsertPriceTier,
  upsertProduct,
  upsertRecipe,
  upsertPackagingProfile
} from "../services/product-management/index.js";

const router = express.Router();

router.get("/product-management/products", (_req, res) => res.json({ products: listProducts() }));
router.post("/product-management/products", (req, res) => {
  const result = upsertProduct(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/ingredients", (_req, res) => res.json({ ingredients: listIngredients() }));
router.post("/product-management/ingredients", (req, res) => {
  const result = createIngredient(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});
router.post("/product-management/ingredient-prices", (req, res) => {
  const result = addIngredientPrice(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/suppliers", (_req, res) => res.json({ suppliers: listSuppliers() }));
router.post("/product-management/suppliers", (req, res) => {
  const result = createSupplier(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/packaging-items", (_req, res) => res.json({ packagingItems: listPackagingItems() }));
router.post("/product-management/packaging-items", (req, res) => {
  const result = createPackagingItem(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/product-management/recipes", (req, res) => {
  const result = upsertRecipe(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/product-management/packaging-profiles", (req, res) => {
  const result = upsertPackagingProfile(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/product-management/cost-inputs", (req, res) => {
  const result = upsertCostInputs(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/product-management/price-tiers", (req, res) => {
  const result = upsertPriceTier(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.post("/product-management/product-prices", (req, res) => {
  const result = addProductPrice(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/cost/:productId", (req, res) => {
  const productId = Number(req.params.productId);
  const asOfDate = String(req.query.as_of_date || new Date().toISOString().slice(0, 10));
  const tierId = Number(req.query.tier_id || 0) || null;
  const result = computeTrueCost(productId, asOfDate, tierId);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/dashboard", (req, res) => {
  const asOfDate = String(req.query.as_of_date || new Date().toISOString().slice(0, 10));
  const tierId = Number(req.query.tier_id || 0) || null;
  const marginTarget = Number(req.query.margin_target || 30);
  return res.json(getDashboard(asOfDate, tierId, marginTarget));
});

router.get("/product-management/sync/status", (_req, res) => res.json(getSyncStatus()));
router.post("/product-management/sync/now", async (_req, res) => res.json(await runSyncNow()));

router.post("/product-management/backups/snapshot", (_req, res) => res.json(createBackupSnapshot()));
router.post("/product-management/backups/restore", (req, res) => {
  const result = restoreSnapshot(req.body?.zip_path);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/product-management/audit-log", (_req, res) => res.json({ rows: listAuditLog() }));

export default router;
