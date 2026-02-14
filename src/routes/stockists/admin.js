import { Router } from "express";

import { auditStockistEvent } from "../../services/stockists/audit.js";
import {
  addRetailerWithGeocode,
  clearLocatorCache,
  parseRetailerBulkRows,
  replaceSkuRange,
  syncAgentsFromShopify
} from "../../services/stockists/locator.js";
import { removeAgentRetailer, updateAgentRetailer } from "../../services/stockists/store.js";

const router = Router();

function actorFromRequest(req) {
  return req.get("x-admin-user") || "admin";
}

router.post("/admin/agents/:id/retailers", async (req, res) => {
  try {
    const agentId = String(req.params.id || "").trim();
    if (!agentId) return res.status(400).json({ error: "Agent id is required" });

    const actor = actorFromRequest(req);
    const bulkRows = parseRetailerBulkRows(req.body?.bulk_paste);
    if (bulkRows.length) {
      const created = [];
      for (const row of bulkRows) {
        created.push(await addRetailerWithGeocode({ ...row, agent_id: agentId }));
      }
      await auditStockistEvent("admin.retailers.bulk_create", { agent_id: agentId, count: created.length }, actor);
      return res.status(201).json({ retailers: created });
    }

    const retailer = await addRetailerWithGeocode({
      ...req.body,
      agent_id: agentId
    });

    await auditStockistEvent("admin.retailers.create", retailer, actor);
    return res.status(201).json({ retailer });
  } catch (err) {
    return res.status(400).json({ error: "ADMIN_RETAILER_CREATE_FAILED", message: err.message });
  }
});

router.put("/admin/retailers/:id", async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const retailer = await updateAgentRetailer(req.params.id, req.body || {});
    if (!retailer) return res.status(404).json({ error: "RETAILER_NOT_FOUND" });
    clearLocatorCache();
    await auditStockistEvent("admin.retailers.update", retailer, actor);
    return res.json({ retailer });
  } catch (err) {
    return res.status(400).json({ error: "ADMIN_RETAILER_UPDATE_FAILED", message: err.message });
  }
});

router.delete("/admin/retailers/:id", async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const ok = await removeAgentRetailer(req.params.id);
    if (!ok) return res.status(404).json({ error: "RETAILER_NOT_FOUND" });
    clearLocatorCache();
    await auditStockistEvent("admin.retailers.delete", { retailer_id: req.params.id }, actor);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "ADMIN_RETAILER_DELETE_FAILED", message: err.message });
  }
});

router.put("/admin/agents/:id/sku-range", async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const skuRange = await replaceSkuRange(req.params.id, req.body?.sku_range || []);
    await auditStockistEvent(
      "admin.agent.sku_range.replace",
      { agent_id: req.params.id, count: skuRange.length },
      actor
    );
    return res.json({ sku_range: skuRange });
  } catch (err) {
    return res.status(400).json({ error: "ADMIN_AGENT_SKU_RANGE_FAILED", message: err.message });
  }
});

router.post("/admin/stockists/sync/shopify-agents", async (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const result = await syncAgentsFromShopify();
    await auditStockistEvent("sync.shopify_agents", result, actor);
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: "SHOPIFY_AGENT_SYNC_FAILED", message: err.message });
  }
});

export default router;
