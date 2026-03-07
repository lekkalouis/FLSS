import express from "express";

import {
  completeManufacturingOrder,
  createBuyPurchaseOrders,
  createCatalogBom,
  createCatalogMaterial,
  createLinkedPurchaseOrdersFromShortages,
  createManufacturingOrder,
  createStocktake,
  getInventoryOverview,
  getMakeRequirements,
  getMasterAuditLog,
  listBuyPurchaseOrders,
  listCatalogBoms,
  listCatalogMaterials,
  listCatalogProducts,
  listCatalogSuppliers,
  listInventoryBatches,
  listInventoryMovements,
  listInventoryStocktakes,
  listManufacturingOrders,
  retryBuyPurchaseOrderDispatch,
  updateCatalogBom
} from "../services/unifiedOperations.js";

const router = express.Router();

function handleError(res, error, fallbackMessage) {
  return res.status(500).json({
    error: "UNIFIED_OPERATIONS_ERROR",
    message: String(error?.message || fallbackMessage || error)
  });
}

router.get("/catalog/products", async (_req, res) => {
  try {
    return res.json({ products: await listCatalogProducts() });
  } catch (error) {
    return handleError(res, error, "Could not load products");
  }
});

router.get("/catalog/materials", (_req, res) => {
  try {
    return res.json({ materials: listCatalogMaterials() });
  } catch (error) {
    return handleError(res, error, "Could not load materials");
  }
});

router.post("/catalog/materials", (req, res) => {
  try {
    const result = createCatalogMaterial(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create material");
  }
});

router.get("/catalog/suppliers", (_req, res) => {
  try {
    return res.json({ suppliers: listCatalogSuppliers() });
  } catch (error) {
    return handleError(res, error, "Could not load suppliers");
  }
});

router.get("/catalog/boms", (req, res) => {
  try {
    return res.json({ boms: listCatalogBoms(req.query || {}) });
  } catch (error) {
    return handleError(res, error, "Could not load BOMs");
  }
});

router.post("/catalog/boms", (req, res) => {
  try {
    const result = createCatalogBom(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create BOM");
  }
});

router.put("/catalog/boms/:id", (req, res) => {
  try {
    const result = updateCatalogBom(req.params.id, req.body || {});
    if (result?.error) return res.status(result.error === "BOM not found" ? 404 : 400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not update BOM");
  }
});

router.get("/inventory/overview", async (_req, res) => {
  try {
    return res.json(await getInventoryOverview());
  } catch (error) {
    return handleError(res, error, "Could not load inventory overview");
  }
});

router.get("/inventory/batches", (req, res) => {
  try {
    return res.json({
      batches: listInventoryBatches(req.query || {})
    });
  } catch (error) {
    return handleError(res, error, "Could not load batches");
  }
});

router.get("/inventory/movements", (req, res) => {
  try {
    return res.json({
      movements: listInventoryMovements(req.query || {})
    });
  } catch (error) {
    return handleError(res, error, "Could not load stock movements");
  }
});

router.get("/inventory/stocktakes", (_req, res) => {
  try {
    return res.json({
      stocktakes: listInventoryStocktakes()
    });
  } catch (error) {
    return handleError(res, error, "Could not load stocktakes");
  }
});

router.post("/inventory/stocktakes", (req, res) => {
  try {
    const result = createStocktake(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create stocktake");
  }
});

router.get("/buy/purchase-orders", (_req, res) => {
  try {
    return res.json({
      purchaseOrders: listBuyPurchaseOrders()
    });
  } catch (error) {
    return handleError(res, error, "Could not load purchase orders");
  }
});

router.post("/buy/purchase-orders", async (req, res) => {
  try {
    const result = await createBuyPurchaseOrders(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create purchase orders");
  }
});

router.post("/buy/purchase-orders/:id/dispatch", async (req, res) => {
  try {
    const result = await retryBuyPurchaseOrderDispatch(req.params.id, req.body || {});
    if (result?.error) return res.status(404).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not retry purchase order dispatch");
  }
});

router.get("/make/manufacturing-orders", (_req, res) => {
  try {
    return res.json({
      manufacturingOrders: listManufacturingOrders()
    });
  } catch (error) {
    return handleError(res, error, "Could not load manufacturing orders");
  }
});

router.post("/make/manufacturing-orders", async (req, res) => {
  try {
    const result = await createManufacturingOrder(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create manufacturing order");
  }
});

router.post("/make/manufacturing-orders/:id/complete", (req, res) => {
  try {
    const result = completeManufacturingOrder(req.params.id, req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not complete manufacturing order");
  }
});

router.post("/make/manufacturing-orders/requirements", (req, res) => {
  try {
    return res.json(getMakeRequirements(req.body || {}));
  } catch (error) {
    return handleError(res, error, "Could not compute requirements");
  }
});

router.post("/make/manufacturing-orders/shortages/buy", async (req, res) => {
  try {
    const result = await createLinkedPurchaseOrdersFromShortages(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create linked purchase orders");
  }
});

router.get("/audit/log", (req, res) => {
  try {
    return res.json({
      rows: getMasterAuditLog(req.query || {})
    });
  } catch (error) {
    return handleError(res, error, "Could not load audit log");
  }
});

export default router;
