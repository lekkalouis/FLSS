import express from "express";

import {
  completeManufacturingOrder,
  createBuyPurchaseOrders,
  createCatalogBom,
  createCatalogMaterial,
  createCatalogProduct,
  createCatalogSupplier,
  createLinkedPurchaseOrdersFromShortages,
  createManufacturingOrder,
  createStocktake,
  getInventoryBatchDetail,
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
  printManufacturingOrder,
  previewBuyPurchaseOrders,
  receiveBuyPurchaseOrder,
  releaseManufacturingOrder,
  retryBuyPurchaseOrderDispatch,
  updateCatalogBom,
  updateCatalogMaterial,
  updateCatalogProduct,
  updateCatalogSupplier
} from "../services/unifiedOperations.js";

const router = express.Router();

function truthyQueryFlag(value, defaultValue = true) {
  if (value == null || String(value).trim() === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return defaultValue;
}

function handleError(res, error, fallbackMessage) {
  return res.status(500).json({
    error: "UNIFIED_OPERATIONS_ERROR",
    message: String(error?.message || fallbackMessage || error)
  });
}

router.get("/catalog/products", async (_req, res) => {
  try {
    const live = truthyQueryFlag(_req.query?.live, true);
    return res.json({ products: await listCatalogProducts({ live }) });
  } catch (error) {
    return handleError(res, error, "Could not load products");
  }
});

router.post("/catalog/products", async (req, res) => {
  try {
    const result = await createCatalogProduct(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create product");
  }
});

router.put("/catalog/products/:id", async (req, res) => {
  try {
    const result = await updateCatalogProduct(req.params.id, req.body || {});
    if (result?.error) return res.status(result.error === "Product not found" ? 404 : 400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not update product");
  }
});

router.get("/catalog/materials", async (_req, res) => {
  try {
    const live = truthyQueryFlag(_req.query?.live, true);
    return res.json({ materials: await listCatalogMaterials({ live }) });
  } catch (error) {
    return handleError(res, error, "Could not load materials");
  }
});

router.post("/catalog/materials", async (req, res) => {
  try {
    const result = await createCatalogMaterial(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create material");
  }
});

router.put("/catalog/materials/:id", async (req, res) => {
  try {
    const result = await updateCatalogMaterial(req.params.id, req.body || {});
    if (result?.error) return res.status(result.error === "Material not found" ? 404 : 400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not update material");
  }
});

router.get("/catalog/suppliers", (_req, res) => {
  try {
    return res.json({ suppliers: listCatalogSuppliers() });
  } catch (error) {
    return handleError(res, error, "Could not load suppliers");
  }
});

router.post("/catalog/suppliers", (req, res) => {
  try {
    const result = createCatalogSupplier(req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error, "Could not create supplier");
  }
});

router.put("/catalog/suppliers/:id", (req, res) => {
  try {
    const result = updateCatalogSupplier(req.params.id, req.body || {});
    if (result?.error) return res.status(result.error === "Supplier not found" ? 404 : 400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not update supplier");
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

router.get("/inventory/batches/:id", (req, res) => {
  try {
    const batch = getInventoryBatchDetail(req.params.id);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    return res.json({ batch });
  } catch (error) {
    return handleError(res, error, "Could not load batch detail");
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

router.post("/inventory/stocktakes", async (req, res) => {
  try {
    const result = await createStocktake(req.body || {});
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

router.post("/buy/purchase-orders/preview", async (req, res) => {
  try {
    const result = await previewBuyPurchaseOrders(req.body || {});
    if (!result?.ok && result?.errors?.length) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not preview purchase orders");
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

router.post("/buy/purchase-orders/:id/receive", async (req, res) => {
  try {
    const result = await receiveBuyPurchaseOrder(req.params.id, req.body || {});
    if (result?.error) return res.status(result.error === "Purchase order not found" ? 404 : 400).json(result);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not receive purchase order");
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

router.post("/make/manufacturing-orders/:id/complete", async (req, res) => {
  try {
    const result = await completeManufacturingOrder(req.params.id, req.body || {});
    if (result?.error) return res.status(400).json({ error: result.error });
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not complete manufacturing order");
  }
});

router.post("/make/manufacturing-orders/:id/release", async (req, res) => {
  try {
    const result = await releaseManufacturingOrder(req.params.id, req.body || {});
    if (result?.error) return res.status(result.error === "Manufacturing order not found" ? 404 : 400).json(result);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not release manufacturing order");
  }
});

router.post("/make/manufacturing-orders/:id/print", async (req, res) => {
  try {
    const result = await printManufacturingOrder(req.params.id, req.body || {});
    if (result?.error) return res.status(result.error === "Manufacturing order not found" ? 404 : 400).json(result);
    return res.json(result);
  } catch (error) {
    return handleError(res, error, "Could not print manufacturing order");
  }
});

router.post("/make/manufacturing-orders/requirements", async (req, res) => {
  try {
    return res.json(await getMakeRequirements(req.body || {}));
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
