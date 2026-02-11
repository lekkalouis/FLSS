import { Router } from "express";

import {
  adjustInventoryLevel,
  fetchInventoryItemIdsForVariants,
  fetchInventoryLevelsForItems,
  fetchPrimaryLocationId,
  setInventoryLevel,
  shopifyFetch
} from "../../services/shopify.js";
import { badRequest } from "../../utils/http.js";
import { requireShopifyConfigured } from "./shared.js";

const router = Router();
router.get("/shopify/inventory-levels", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const rawIds = String(req.query.variantIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!rawIds.length) {
      return badRequest(res, "Missing variantIds query parameter.");
    }

    const variantIds = rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!variantIds.length) {
      return badRequest(res, "No valid variantIds provided.");
    }

    const locationId =
      req.query.locationId != null
        ? Number(req.query.locationId)
        : await fetchPrimaryLocationId();

    const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants(variantIds);
    const inventoryItemIds = [...inventoryItemIdsByVariant.values()];
    const levelsByItem = await fetchInventoryLevelsForItems(inventoryItemIds, locationId);

    const levels = variantIds.map((variantId) => {
      const inventoryItemId = inventoryItemIdsByVariant.get(variantId) || null;
      const available =
        inventoryItemId != null ? levelsByItem.get(inventoryItemId) ?? 0 : null;
      return { variantId, inventoryItemId, locationId, available };
    });

    return res.json({ ok: true, locationId, levels });
  } catch (err) {
    console.error("Shopify inventory levels fetch failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/locations", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const resp = await shopifyFetch(`${base}/locations.json`, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(502).json({
        error: "UPSTREAM_ERROR",
        message: `Shopify locations fetch failed (${resp.status}): ${body}`
      });
    }
    const data = await resp.json();
    const locations = Array.isArray(data.locations) ? data.locations : [];
    const normalized = locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      active: loc.active !== false
    }));
    return res.json({ ok: true, locations: normalized });
  } catch (err) {
    console.error("Shopify locations fetch failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/inventory-levels/set", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const { variantId, value, mode = "take", locationId: rawLocationId } = req.body || {};

    const safeVariantId = Number(variantId);
    if (!Number.isFinite(safeVariantId)) {
      return badRequest(res, "Missing variantId in request body.");
    }

    const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants([
      safeVariantId
    ]);
    const inventoryItemId = inventoryItemIdsByVariant.get(safeVariantId);
    if (!inventoryItemId) {
      return res.status(404).json({
        error: "INVENTORY_ITEM_NOT_FOUND",
        message: "Unable to resolve inventory item for variant."
      });
    }

    const locationId = Number.isFinite(Number(rawLocationId))
      ? Number(rawLocationId)
      : await fetchPrimaryLocationId();

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return badRequest(res, "Missing inventory value.");
    }

    let inventoryLevel;
    if (String(mode).toLowerCase() === "receive") {
      inventoryLevel = await adjustInventoryLevel({
        inventoryItemId,
        locationId,
        adjustment: Math.floor(numericValue)
      });
    } else {
      inventoryLevel = await setInventoryLevel({
        inventoryItemId,
        locationId,
        available: Math.floor(numericValue)
      });
    }

    const available = Number(inventoryLevel?.available ?? numericValue);
    return res.json({
      ok: true,
      level: {
        variantId: safeVariantId,
        inventoryItemId,
        locationId,
        available: Number.isFinite(available) ? available : 0
      }
    });
  } catch (err) {
    console.error("Shopify inventory level update failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/inventory-levels/transfer", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const {
      variantId,
      fromLocationId,
      toLocationId,
      quantity
    } = req.body || {};

    const safeVariantId = Number(variantId);
    if (!Number.isFinite(safeVariantId)) {
      return badRequest(res, "Missing variantId in request body.");
    }

    const fromId = Number(fromLocationId);
    const toId = Number(toLocationId);
    if (!Number.isFinite(fromId) || !Number.isFinite(toId)) {
      return badRequest(res, "Missing from/to location IDs.");
    }
    if (fromId === toId) {
      return badRequest(res, "Source and destination locations must differ.");
    }

    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      return badRequest(res, "Missing transfer quantity.");
    }

    const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants([
      safeVariantId
    ]);
    const inventoryItemId = inventoryItemIdsByVariant.get(safeVariantId);
    if (!inventoryItemId) {
      return res.status(404).json({
        error: "INVENTORY_ITEM_NOT_FOUND",
        message: "Unable to resolve inventory item for variant."
      });
    }

    const fromLevel = await adjustInventoryLevel({
      inventoryItemId,
      locationId: fromId,
      adjustment: -qty
    });
    const toLevel = await adjustInventoryLevel({
      inventoryItemId,
      locationId: toId,
      adjustment: qty
    });

    return res.json({
      ok: true,
      from: {
        locationId: fromId,
        available: Number(fromLevel?.available ?? 0)
      },
      to: {
        locationId: toId,
        available: Number(toLevel?.available ?? 0)
      }
    });
  } catch (err) {
    console.error("Shopify inventory transfer failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});


export default router;
