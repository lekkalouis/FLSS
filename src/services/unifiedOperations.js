import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import { config } from "../config.js";
import { getDb } from "../db/sqlite.js";
import { recordAppAudit, listAppAuditLog } from "./appAudit.js";
import { getSmtpTransport } from "./email.js";
import {
  fetchInventoryItemIdsForVariants,
  fetchInventoryLevelsForItems,
  fetchPrimaryLocationId,
  setInventoryLevel,
  shopifyFetch
} from "./shopify.js";
import { fetchWithTimeout } from "../utils/http.js";
import { PRODUCT_LIST } from "../../public/views/products.js";
import { PO_CATALOG_ITEMS } from "../../public/views/purchase-order-catalog.js";

const GENERATED_DIR = path.resolve(config.ASSETS_PATH || "data/assets", "generated");
const PRINTNODE_PRINTJOBS_URL = "https://api.printnode.com/printjobs";
const SHOPIFY_VARIANT_LOOKUP_CACHE_TTL_MS = 15 * 60 * 1000;
const SHOPIFY_VARIANT_LOOKUP_CONCURRENCY = 4;
const shopifyVariantLookupCache = new Map();

function db() {
  return getDb();
}

function now() {
  return new Date().toISOString();
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getCachedShopifyVariantLookup(sku) {
  const key = String(sku || "").trim().toUpperCase();
  if (!key) return undefined;
  const cached = shopifyVariantLookupCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    shopifyVariantLookupCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function setCachedShopifyVariantLookup(sku, value) {
  const key = String(sku || "").trim().toUpperCase();
  if (!key) return;
  shopifyVariantLookupCache.set(key, {
    value: value || null,
    expiresAt: Date.now() + SHOPIFY_VARIANT_LOOKUP_CACHE_TTL_MS
  });
}

function asPositiveInteger(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function defaultShopifyInventoryMultiplierForUom(uom) {
  const normalized = String(uom || "").trim().toLowerCase();
  if (["kg", "kgs", "kilogram", "kilograms", "l", "lt", "liter", "litre", "liters", "litres"].includes(normalized)) {
    return 1000;
  }
  return 1;
}

function defaultShopifyInventoryUnitForMaterial(material) {
  const normalized = String(material?.uom || "").trim().toLowerCase();
  if (["kg", "kgs", "kilogram", "kilograms"].includes(normalized)) return "g";
  if (["l", "lt", "liter", "litre", "liters", "litres"].includes(normalized)) return "ml";
  return String(material?.uom || "unit").trim() || "unit";
}

function resolvedMaterialShopifyMultiplier(material) {
  return asPositiveInteger(material?.shopify_inventory_multiplier, defaultShopifyInventoryMultiplierForUom(material?.uom));
}

function resolvedMaterialShopifyUnit(material) {
  const explicit = String(material?.shopify_inventory_unit || "").trim();
  return explicit || defaultShopifyInventoryUnitForMaterial(material);
}

function toShopifyInventoryUnits(quantity, material) {
  return Math.round(asNumber(quantity, 0) * resolvedMaterialShopifyMultiplier(material));
}

function fromShopifyInventoryUnits(quantity, material) {
  return round2(asNumber(quantity, 0) / resolvedMaterialShopifyMultiplier(material));
}

function parseJson(raw, fallback = {}) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function hasShopifyConfig() {
  return Boolean(config.SHOPIFY_STORE && config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET);
}

function hasSmtpConfig() {
  return Boolean(config.SMTP_HOST);
}

function hasPrintNodeConfig() {
  return Boolean(config.PRINTNODE_API_KEY && Number(config.PRINTNODE_PRINTER_ID) > 0);
}

function ensureGeneratedDir() {
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }
}

function nextRequestId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function materialCategoryForSeed(item) {
  const title = String(item?.title || "").toLowerCase();
  const category = String(item?.category || "").toLowerCase();
  if (title.includes("label") || category.includes("labelling")) return "labels";
  if (
    category.includes("packaging") ||
    category.includes("container") ||
    title.includes("carton") ||
    title.includes("bottle") ||
    title.includes("cap") ||
    title.includes("bag")
  ) {
    return "packaging";
  }
  return "ingredient";
}

function defaultSupplierNameForCategory(category) {
  if (category === "labels") return "Label Supplier";
  if (category === "packaging") return "Packaging Supplier";
  return "Ingredient Supplier";
}

function ensureOperationalSeedData() {
  const conn = db();
  const tx = conn.transaction(() => {
    for (const item of PO_CATALOG_ITEMS) {
      const existing = conn.prepare("SELECT id FROM materials WHERE sku = ?").get(item.sku);
      if (existing) continue;
      const category = materialCategoryForSeed(item);
      conn.prepare(
        `INSERT INTO materials (sku, title, category, uom, icon, source_type, source_ref_id, reorder_point, lead_time_days, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'seed_catalog', ?, 0, ?, ?, ?)`
      ).run(
        item.sku,
        item.title,
        category,
        item.uom || "unit",
        item.icon || null,
        item.sku,
        category === "ingredient" ? 7 : 14,
        now(),
        now()
      );
    }

    const materials = conn.prepare("SELECT id, category FROM materials").all();
    for (const material of materials) {
      const preferred = conn.prepare(
        "SELECT 1 FROM supplier_materials WHERE material_id = ? AND is_preferred = 1"
      ).get(material.id);
      if (preferred) continue;

      const supplierName = defaultSupplierNameForCategory(String(material.category || ""));
      let supplier = conn.prepare("SELECT * FROM suppliers WHERE name = ?").get(supplierName);
      if (!supplier) {
        const result = conn.prepare(
          `INSERT INTO suppliers (name, contact_name, email, phone, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(supplierName, null, null, null, now(), now());
        supplier = conn.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid);
      }

      conn.prepare(
        `INSERT OR IGNORE INTO supplier_materials (
          supplier_id,
          material_id,
          supplier_sku,
          is_preferred,
          price_per_unit,
          min_order_qty,
          lead_time_days,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, 1, 0, 0, ?, ?, ?)`
      ).run(
        supplier.id,
        material.id,
        null,
        String(material.category || "") === "ingredient" ? 7 : 14,
        now(),
        now()
      );
    }
  });
  tx();
}

function productCatalog() {
  return PRODUCT_LIST.filter((product) => product.variantId || product.sku === "GBOX");
}

function updateMaterialShopifyBinding(materialId, { variantId = null, inventoryItemId = null } = {}) {
  db().prepare(
    `UPDATE materials
     SET shopify_variant_id = COALESCE(?, shopify_variant_id),
         shopify_inventory_item_id = COALESCE(?, shopify_inventory_item_id),
         updated_at = ?
     WHERE id = ?`
  ).run(
    asPositiveInteger(variantId, null),
    asPositiveInteger(inventoryItemId, null),
    now(),
    Number(materialId)
  );
}

async function fetchShopifyVariantBySkuExact(sku) {
  if (!hasShopifyConfig()) return null;
  const normalizedSku = String(sku || "").trim();
  if (!normalizedSku) return null;
  const cached = getCachedShopifyVariantLookup(normalizedSku);
  if (cached !== undefined) {
    return cached;
  }
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const params = new URLSearchParams({
    limit: "10",
    fields: "id,sku,inventory_item_id,title",
    sku: normalizedSku
  });
  const response = await shopifyFetch(`${base}/variants.json?${params.toString()}`, { method: "GET" });
  if (!response.ok) {
    setCachedShopifyVariantLookup(normalizedSku, null);
    return null;
  }
  const payload = await response.json().catch(() => ({}));
  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  const matched = variants.find((variant) => String(variant?.sku || "").trim().toLowerCase() === normalizedSku.toLowerCase()) || null;
  setCachedShopifyVariantLookup(normalizedSku, matched);
  return matched;
}

async function resolveMaterialShopifyBindings(materials = []) {
  const resolved = Array.isArray(materials) ? materials.map((material) => ({ ...material })) : [];
  if (!hasShopifyConfig() || !resolved.length) return resolved;

  const unresolvedMaterials = resolved.filter((material) => !asPositiveInteger(material.shopify_variant_id, null));
  for (let index = 0; index < unresolvedMaterials.length; index += SHOPIFY_VARIANT_LOOKUP_CONCURRENCY) {
    const batch = unresolvedMaterials.slice(index, index + SHOPIFY_VARIANT_LOOKUP_CONCURRENCY);
    const variants = await Promise.all(
      batch.map((material) => fetchShopifyVariantBySkuExact(material.sku).catch(() => null))
    );
    batch.forEach((material, materialIndex) => {
      const variant = variants[materialIndex];
      if (!variant?.id) return;
      material.shopify_variant_id = Number(variant.id);
      material.shopify_inventory_item_id = asPositiveInteger(variant.inventory_item_id, null);
      updateMaterialShopifyBinding(material.id, {
        variantId: material.shopify_variant_id,
        inventoryItemId: material.shopify_inventory_item_id
      });
    });
  }

  const missingInventoryItemIds = resolved
    .filter((material) => asPositiveInteger(material.shopify_variant_id, null) && !asPositiveInteger(material.shopify_inventory_item_id, null));
  if (missingInventoryItemIds.length) {
    const variantIds = missingInventoryItemIds
      .map((material) => asPositiveInteger(material.shopify_variant_id, null))
      .filter(Boolean);
    const inventoryItemIds = await fetchInventoryItemIdsForVariants(variantIds).catch(() => new Map());
    missingInventoryItemIds.forEach((material) => {
      const inventoryItemId = inventoryItemIds.get(Number(material.shopify_variant_id));
      if (!inventoryItemId) return;
      material.shopify_inventory_item_id = Number(inventoryItemId);
      updateMaterialShopifyBinding(material.id, { inventoryItemId });
    });
  }

  return resolved;
}

function materialStockById() {
  const rows = db().prepare(
    `SELECT material_id, COALESCE(SUM(quantity), 0) AS qty
     FROM stock_movements
     WHERE material_id IS NOT NULL
     GROUP BY material_id`
  ).all();
  return new Map(rows.map((row) => [Number(row.material_id), round2(row.qty)]));
}

function productMovementStockBySku() {
  const rows = db().prepare(
    `SELECT product_sku, COALESCE(SUM(quantity), 0) AS qty
     FROM stock_movements
     WHERE product_sku IS NOT NULL AND TRIM(product_sku) <> ''
     GROUP BY product_sku`
  ).all();
  return new Map(rows.map((row) => [String(row.product_sku), round2(row.qty)]));
}

function reservedMaterialById() {
  const rows = db().prepare(
    `SELECT mmr.material_id, COALESCE(SUM(mmr.required_qty), 0) AS qty
     FROM manufacturing_material_requirements mmr
     JOIN manufacturing_orders mo ON mo.id = mmr.manufacturing_order_id
     WHERE mo.status IN ('draft', 'queued', 'released')
     GROUP BY mmr.material_id`
  ).all();
  return new Map(rows.map((row) => [Number(row.material_id), round2(row.qty)]));
}

function incomingProductBySku() {
  const rows = db().prepare(
    `SELECT product_sku, COALESCE(SUM(quantity), 0) AS qty
     FROM manufacturing_order_lines mol
     JOIN manufacturing_orders mo ON mo.id = mol.manufacturing_order_id
     WHERE mo.status IN ('draft', 'queued', 'released')
     GROUP BY product_sku`
  ).all();
  return new Map(rows.map((row) => [String(row.product_sku), round2(row.qty)]));
}

async function fetchProductInventoryMap() {
  if (!hasShopifyConfig()) return new Map();
  const products = productCatalog().filter((product) => product.variantId);
  if (!products.length) return new Map();
  const variantIds = products
    .map((product) => Number(product.variantId))
    .filter((value) => Number.isFinite(value));
  const locationId = await fetchPrimaryLocationId();
  const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants(variantIds);
  const inventoryItemIds = Array.from(inventoryItemIdsByVariant.values());
  const levels = await fetchInventoryLevelsForItems(inventoryItemIds, locationId);
  const bySku = new Map();
  products.forEach((product) => {
    const inventoryItemId = inventoryItemIdsByVariant.get(Number(product.variantId));
    const available = inventoryItemId ? asNumber(levels.get(inventoryItemId), 0) : 0;
    bySku.set(product.sku, Math.floor(available));
  });
  return bySku;
}

async function fetchOpenOrderDemandBySku() {
  if (!hasShopifyConfig()) return new Map();
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const params = new URLSearchParams({
    status: "open",
    limit: "250",
    fields: "id,line_items"
  });
  const resp = await shopifyFetch(`${base}/orders.json?${params.toString()}`, { method: "GET" });
  if (!resp.ok) {
    return new Map();
  }
  const payload = await resp.json().catch(() => ({}));
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const demand = new Map();
  orders.forEach((order) => {
    (order.line_items || []).forEach((line) => {
      const sku = String(line?.sku || "").trim();
      if (!sku) return;
      const quantity = Math.max(0, Math.floor(asNumber(line.quantity_remaining ?? line.quantity, 0)));
      demand.set(sku, round2((demand.get(sku) || 0) + quantity));
    });
  });
  return demand;
}

function activeBomHeaderForSku(productSku) {
  return db().prepare(
    `SELECT *
     FROM bom_headers
     WHERE product_sku = ? AND is_active = 1
     ORDER BY effective_from DESC, id DESC
     LIMIT 1`
  ).get(String(productSku));
}

function bomLinesForHeader(headerId) {
  return db().prepare(
    `SELECT
      bml.*,
      m.sku AS material_sku,
      m.title AS material_title,
      m.category AS material_category,
      m.uom AS material_uom,
      m.icon AS material_icon
     FROM bom_material_lines bml
     JOIN materials m ON m.id = bml.material_id
     WHERE bml.bom_header_id = ?
     ORDER BY bml.line_type ASC, m.title ASC`
  ).all(Number(headerId));
}

function buildBatchCode(prefix = "MO") {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

function preferredSupplierForMaterial(materialId) {
  return db().prepare(
    `SELECT
      s.*,
      sm.id AS supplier_material_id,
      sm.supplier_sku,
      sm.is_preferred,
      sm.price_per_unit,
      sm.min_order_qty,
      sm.lead_time_days
     FROM supplier_materials sm
     JOIN suppliers s ON s.id = sm.supplier_id
     WHERE sm.material_id = ? AND sm.is_preferred = 1
     ORDER BY sm.updated_at DESC, sm.id DESC
     LIMIT 1`
  ).get(Number(materialId));
}

function materialById(materialId) {
  return db().prepare("SELECT * FROM materials WHERE id = ?").get(Number(materialId));
}

function productBySku(productSku) {
  return productCatalog().find((product) => String(product.sku) === String(productSku)) || null;
}

function productRecordBySku(productSku) {
  return db().prepare("SELECT * FROM products WHERE sku = ?").get(String(productSku).trim()) || null;
}

function defaultLineTypeForMaterial(material) {
  const category = String(material?.category || "").trim().toLowerCase();
  if (category.includes("pack")) return "packaging";
  if (category.includes("label")) return "label";
  if (category.includes("consum")) return "consumable";
  return "ingredient";
}

function nextBomVersionForSku(productSku) {
  const row = db().prepare(
    `SELECT COUNT(*) AS count
     FROM bom_headers
     WHERE product_sku = ?`
  ).get(String(productSku).trim());
  return `v${Number(row?.count || 0) + 1}`;
}

function hydrateBomHeader(header) {
  const product = productBySku(header.product_sku) || productRecordBySku(header.product_sku);
  const lines = bomLinesForHeader(header.id);
  return {
    ...header,
    product_title: product?.title || String(header.product_sku || ""),
    line_count: lines.length,
    lines
  };
}

function normalizeBomLines(lines = []) {
  const source = Array.isArray(lines) ? lines : [];
  const aggregated = new Map();
  for (const line of source) {
    const materialId = Number(line?.material_id ?? line?.materialId);
    if (!Number.isFinite(materialId) || materialId <= 0) {
      throw new Error("Each BOM line requires a valid material");
    }
    const material = materialById(materialId);
    if (!material) {
      throw new Error(`Material ${materialId} was not found`);
    }
    const quantity = round2(line?.quantity);
    if (!(quantity > 0)) {
      throw new Error(`Material ${material.sku} requires a quantity greater than zero`);
    }
    const uom = String(line?.uom || material.uom || "unit").trim() || "unit";
    const lineType = String(line?.line_type || line?.lineType || defaultLineTypeForMaterial(material)).trim().toLowerCase() || "ingredient";
    const key = `${materialId}:${uom}:${lineType}`;
    const existing = aggregated.get(key) || {
      material_id: materialId,
      quantity: 0,
      uom,
      line_type: lineType
    };
    existing.quantity = round2(existing.quantity + quantity);
    aggregated.set(key, existing);
  }
  const normalized = Array.from(aggregated.values());
  if (!normalized.length) {
    throw new Error("At least one BOM line is required");
  }
  return normalized;
}

function upsertPreferredSupplierForMaterial(materialId, payload = {}) {
  const supplierId = Number(payload?.preferred_supplier_id || payload?.preferredSupplierId || payload?.supplier_id || 0);
  if (!Number.isFinite(supplierId) || supplierId <= 0) return;
  const supplier = db().prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId);
  if (!supplier) {
    throw new Error("Preferred supplier was not found");
  }
  db().prepare(
    `UPDATE supplier_materials
     SET is_preferred = 0, updated_at = ?
     WHERE material_id = ?`
  ).run(now(), Number(materialId));
  db().prepare(
    `INSERT INTO supplier_materials (
      supplier_id,
      material_id,
      supplier_sku,
      is_preferred,
      price_per_unit,
      min_order_qty,
      lead_time_days,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(supplier_id, material_id) DO UPDATE SET
      supplier_sku = excluded.supplier_sku,
      is_preferred = 1,
      price_per_unit = excluded.price_per_unit,
      min_order_qty = excluded.min_order_qty,
      lead_time_days = excluded.lead_time_days,
      updated_at = excluded.updated_at`
  ).run(
    supplierId,
    Number(materialId),
    payload?.supplier_sku || null,
    round2(payload?.price_per_unit),
    round2(payload?.min_order_qty),
    Math.max(0, Math.floor(asNumber(payload?.lead_time_days, 0))),
    now(),
    now()
  );
}

export async function listCatalogProducts() {
  ensureOperationalSeedData();
  const movementStock = productMovementStockBySku();
  const incoming = incomingProductBySku();
  const demand = await fetchOpenOrderDemandBySku().catch(() => new Map());
  const liveStock = await fetchProductInventoryMap().catch(() => new Map());
  return productCatalog().map((product) => {
    const moved = movementStock.get(product.sku);
    const hasLiveInventory = liveStock.has(product.sku);
    const onHand = hasLiveInventory ? asNumber(liveStock.get(product.sku), 0) : asNumber(moved, 0);
    const committed = asNumber(demand.get(product.sku), 0);
    const available = round2(onHand - committed);
    return {
      sku: product.sku,
      title: product.title,
      flavour: product.flavour || "",
      variantId: product.variantId || null,
      size: product.size || "",
      on_hand: round2(onHand),
      committed,
      available,
      incoming: asNumber(incoming.get(product.sku), 0),
      status: available < 0 ? "short" : available === 0 ? "empty" : "ok",
      inventory_source: hasLiveInventory ? "shopify" : "local"
    };
  });
}

function listCatalogMaterialsBase() {
  ensureOperationalSeedData();
  const onHandByMaterial = materialStockById();
  const reservedByMaterial = reservedMaterialById();
  const batchCounts = new Map(
    db().prepare(
      `SELECT material_id, COUNT(*) AS count
       FROM batches
       WHERE material_id IS NOT NULL
       GROUP BY material_id`
    ).all().map((row) => [Number(row.material_id), Number(row.count || 0)])
  );
  const materials = db().prepare(
    `SELECT
      m.*,
      s.id AS supplier_id,
      s.name AS supplier_name,
      s.email AS supplier_email,
      s.contact_name AS supplier_contact_name,
      sm.supplier_sku,
      sm.min_order_qty,
      COALESCE(NULLIF(sm.lead_time_days, 0), m.lead_time_days, 0) AS preferred_lead_time_days
     FROM materials m
     LEFT JOIN supplier_materials sm
       ON sm.material_id = m.id
      AND sm.is_preferred = 1
     LEFT JOIN suppliers s ON s.id = sm.supplier_id
     WHERE m.is_active = 1
     ORDER BY m.category ASC, m.title ASC`
  ).all();

  return materials.map((material) => {
    const onHand = asNumber(onHandByMaterial.get(Number(material.id)), 0);
    const allocated = asNumber(reservedByMaterial.get(Number(material.id)), 0);
    const multiplier = resolvedMaterialShopifyMultiplier(material);
    const inventoryUnit = resolvedMaterialShopifyUnit(material);
    return {
      id: material.id,
      sku: material.sku,
      title: material.title,
      category: material.category,
      uom: material.uom,
      icon: material.icon || "*",
      preferred_supplier: material.supplier_id
        ? {
            id: material.supplier_id,
            name: material.supplier_name,
            email: material.supplier_email,
            contact_name: material.supplier_contact_name,
            supplier_sku: material.supplier_sku
          }
        : null,
      on_hand: round2(onHand),
      allocated,
      available: round2(onHand - allocated),
      reorder_point: round2(material.reorder_point),
      lead_time_days: Number(material.preferred_lead_time_days || 0),
      batch_count: Number(batchCounts.get(Number(material.id)) || 0),
      status: onHand - allocated <= material.reorder_point ? "reorder" : "ok",
      inventory_source: "local",
      shopify_variant_id: asPositiveInteger(material.shopify_variant_id, null),
      shopify_inventory_item_id: asPositiveInteger(material.shopify_inventory_item_id, null),
      shopify_inventory_unit: inventoryUnit,
      shopify_inventory_multiplier: multiplier,
      shopify: {
        variant_id: asPositiveInteger(material.shopify_variant_id, null),
        inventory_item_id: asPositiveInteger(material.shopify_inventory_item_id, null),
        inventory_unit: inventoryUnit,
        inventory_multiplier: multiplier,
        mapped: Boolean(asPositiveInteger(material.shopify_variant_id, null))
      }
    };
  });
}

export async function listCatalogMaterials() {
  const baseMaterials = listCatalogMaterialsBase();
  if (!hasShopifyConfig() || !baseMaterials.length) return baseMaterials;

  const resolvedMaterials = await resolveMaterialShopifyBindings(baseMaterials).catch(() => baseMaterials);
  const locationId = await fetchPrimaryLocationId().catch(() => null);
  const inventoryItemIds = resolvedMaterials
    .map((material) => asPositiveInteger(material.shopify_inventory_item_id, null))
    .filter(Boolean);
  const levelsByItem = locationId && inventoryItemIds.length
    ? await fetchInventoryLevelsForItems(inventoryItemIds, locationId).catch(() => new Map())
    : new Map();

  return resolvedMaterials.map((material) => {
    const inventoryItemId = asPositiveInteger(material.shopify_inventory_item_id, null);
    if (!inventoryItemId || !levelsByItem.has(inventoryItemId)) {
      return material;
    }
    const onHand = fromShopifyInventoryUnits(levelsByItem.get(inventoryItemId), material);
    const allocated = asNumber(material.allocated, 0);
    const available = round2(onHand - allocated);
    return {
      ...material,
      on_hand: onHand,
      available,
      status: available <= asNumber(material.reorder_point, 0) ? "reorder" : "ok",
      inventory_source: "shopify",
      shopify: {
        ...(material.shopify || {}),
        variant_id: asPositiveInteger(material.shopify_variant_id, null),
        inventory_item_id: inventoryItemId,
        inventory_unit: resolvedMaterialShopifyUnit(material),
        inventory_multiplier: resolvedMaterialShopifyMultiplier(material),
        mapped: Boolean(asPositiveInteger(material.shopify_variant_id, null))
      }
    };
  });
}

export function listCatalogSuppliers() {
  ensureOperationalSeedData();
  return db().prepare(
    `SELECT
      s.*,
      COUNT(sm.id) AS material_count
     FROM suppliers s
     LEFT JOIN supplier_materials sm ON sm.supplier_id = s.id
     GROUP BY s.id
     ORDER BY s.name ASC`
  ).all();
}

export function listCatalogBoms(filters = {}) {
  ensureOperationalSeedData();
  const clauses = [];
  const params = [];
  if (filters?.product_sku) {
    clauses.push("product_sku = ?");
    params.push(String(filters.product_sku).trim());
  }
  if (filters?.is_active != null && String(filters.is_active).trim() !== "") {
    const activeValue = String(filters.is_active).trim().toLowerCase();
    clauses.push("is_active = ?");
    params.push(["1", "true", "yes", "active"].includes(activeValue) ? 1 : 0);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const headers = db().prepare(
    `SELECT *
     FROM bom_headers
     ${where}
     ORDER BY product_sku ASC, effective_from DESC, id DESC`
  ).all(...params);
  return headers.map((header) => hydrateBomHeader(header));
}

async function hydrateCatalogMaterialById(materialId) {
  const materials = await listCatalogMaterials();
  return materials.find((entry) => Number(entry.id) === Number(materialId)) || null;
}

function normalizeCatalogMaterialPayload(payload = {}, existing = null) {
  const sku = String(payload?.sku ?? existing?.sku ?? "").trim().toUpperCase();
  const title = String(payload?.title ?? existing?.title ?? "").trim();
  const category = String(payload?.category ?? existing?.category ?? "ingredient").trim().toLowerCase() || "ingredient";
  const uom = String(payload?.uom ?? existing?.uom ?? "unit").trim() || "unit";
  const icon = String(payload?.icon ?? existing?.icon ?? "").trim() || null;
  const shopifyVariantId = asPositiveInteger(
    payload?.shopify_variant_id ?? payload?.shopifyVariantId ?? existing?.shopify_variant_id,
    null
  );
  const shopifyInventoryItemId = asPositiveInteger(
    payload?.shopify_inventory_item_id ?? payload?.shopifyInventoryItemId ?? existing?.shopify_inventory_item_id,
    null
  );
  const shopifyInventoryUnit = String(
    payload?.shopify_inventory_unit ?? payload?.shopifyInventoryUnit ?? existing?.shopify_inventory_unit ?? ""
  ).trim() || defaultShopifyInventoryUnitForMaterial({ uom });
  const multiplierSource =
    payload?.shopify_inventory_multiplier ?? payload?.shopifyInventoryMultiplier ?? existing?.shopify_inventory_multiplier;
  const shopifyInventoryMultiplier =
    multiplierSource == null || String(multiplierSource).trim() === ""
      ? null
      : asPositiveInteger(multiplierSource, defaultShopifyInventoryMultiplierForUom(uom));

  return {
    sku,
    title,
    category,
    uom,
    icon,
    reorder_point: round2(payload?.reorder_point ?? payload?.reorderPoint ?? existing?.reorder_point),
    lead_time_days: Math.max(0, Math.floor(asNumber(payload?.lead_time_days ?? payload?.leadTimeDays ?? existing?.lead_time_days, 0))),
    shopify_variant_id: shopifyVariantId,
    shopify_inventory_item_id: shopifyInventoryItemId,
    shopify_inventory_unit: shopifyInventoryUnit,
    shopify_inventory_multiplier: shopifyInventoryMultiplier
  };
}

export async function createCatalogMaterial(payload = {}) {
  ensureOperationalSeedData();
  const normalized = normalizeCatalogMaterialPayload(payload);
  if (!normalized.sku) return { error: "Material SKU is required" };
  if (!normalized.title) return { error: "Material title is required" };
  const existing = db().prepare("SELECT id FROM materials WHERE sku = ?").get(normalized.sku);
  if (existing) return { error: `Material SKU already exists: ${normalized.sku}` };

  const requestId = payload?.request_id || nextRequestId("material");
  const tx = db().transaction(() => {
    const result = db().prepare(
      `INSERT INTO materials (
        sku,
        title,
        category,
        uom,
        icon,
        reorder_point,
        lead_time_days,
        shopify_variant_id,
        shopify_inventory_item_id,
        shopify_inventory_unit,
        shopify_inventory_multiplier,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      normalized.sku,
      normalized.title,
      normalized.category,
      normalized.uom,
      normalized.icon,
      normalized.reorder_point,
      normalized.lead_time_days,
      normalized.shopify_variant_id,
      normalized.shopify_inventory_item_id,
      normalized.shopify_inventory_unit,
      normalized.shopify_inventory_multiplier,
      now(),
      now()
    );
    upsertPreferredSupplierForMaterial(result.lastInsertRowid, payload);
    recordAppAudit({
      actor_type: payload?.actor_type || "system",
      actor_id: payload?.actor_id || "system",
      surface: "catalog",
      action: "material_created",
      entity_type: "material",
      entity_id: String(result.lastInsertRowid),
      request_id: requestId,
      details: {
        sku: normalized.sku,
        title: normalized.title,
        category: normalized.category,
        uom: normalized.uom,
        shopify_variant_id: normalized.shopify_variant_id
      }
    });
    return Number(result.lastInsertRowid);
  });
  const materialId = tx();
  const material = await hydrateCatalogMaterialById(materialId);
  return { material, request_id: requestId };
}

export async function updateCatalogMaterial(materialId, payload = {}) {
  ensureOperationalSeedData();
  const existing = db().prepare("SELECT * FROM materials WHERE id = ?").get(Number(materialId));
  if (!existing) return { error: "Material not found" };
  const normalized = normalizeCatalogMaterialPayload(payload, existing);
  if (!normalized.sku) return { error: "Material SKU is required" };
  if (!normalized.title) return { error: "Material title is required" };

  const duplicate = db().prepare("SELECT id FROM materials WHERE sku = ? AND id <> ?").get(normalized.sku, Number(materialId));
  if (duplicate) return { error: `Material SKU already exists: ${normalized.sku}` };

  const requestId = payload?.request_id || nextRequestId("material-update");
  const tx = db().transaction(() => {
    db().prepare(
      `UPDATE materials
       SET sku = ?,
           title = ?,
           category = ?,
           uom = ?,
           icon = ?,
           reorder_point = ?,
           lead_time_days = ?,
           shopify_variant_id = ?,
           shopify_inventory_item_id = ?,
           shopify_inventory_unit = ?,
           shopify_inventory_multiplier = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      normalized.sku,
      normalized.title,
      normalized.category,
      normalized.uom,
      normalized.icon,
      normalized.reorder_point,
      normalized.lead_time_days,
      normalized.shopify_variant_id,
      normalized.shopify_inventory_item_id,
      normalized.shopify_inventory_unit,
      normalized.shopify_inventory_multiplier,
      now(),
      Number(materialId)
    );
    upsertPreferredSupplierForMaterial(Number(materialId), payload);
    recordAppAudit({
      actor_type: payload?.actor_type || "system",
      actor_id: payload?.actor_id || "system",
      surface: "catalog",
      action: "material_updated",
      entity_type: "material",
      entity_id: String(materialId),
      request_id: requestId,
      details: {
        sku: normalized.sku,
        title: normalized.title,
        category: normalized.category,
        shopify_variant_id: normalized.shopify_variant_id
      }
    });
  });
  tx();
  const material = await hydrateCatalogMaterialById(materialId);
  return { material, request_id: requestId };
}

export function createCatalogBom(payload = {}) {
  ensureOperationalSeedData();
  const productSku = String(payload?.product_sku || payload?.productSku || "").trim();
  if (!productSku) return { error: "Product SKU is required" };
  const product = productBySku(productSku) || productRecordBySku(productSku);
  if (!product) return { error: `Unknown product SKU: ${productSku}` };

  let normalizedLines;
  try {
    normalizedLines = normalizeBomLines(payload?.lines);
  } catch (error) {
    return { error: String(error?.message || error) };
  }

  const requestId = payload?.request_id || nextRequestId("bom");
  const version = String(payload?.version || "").trim() || nextBomVersionForSku(productSku);
  const effectiveFrom = String(payload?.effective_from || payload?.effectiveFrom || "").trim() || new Date().toISOString().slice(0, 10);
  const yieldPct = round2(payload?.yield_pct ?? payload?.yieldPct ?? 100);
  const wastePct = round2(payload?.waste_pct ?? payload?.wastePct ?? 0);
  const activeFlag = payload?.is_active === false || payload?.is_active === 0 || String(payload?.is_active || "").toLowerCase() === "false" ? 0 : 1;

  const tx = db().transaction(() => {
    if (activeFlag) {
      db().prepare(
        `UPDATE bom_headers
         SET is_active = 0, updated_at = ?
         WHERE product_sku = ?`
      ).run(now(), productSku);
    }
    const productRow = productRecordBySku(productSku);
    const result = db().prepare(
      `INSERT INTO bom_headers (
        product_id,
        product_sku,
        version,
        effective_from,
        yield_pct,
        waste_pct,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      productRow?.id || null,
      productSku,
      version,
      effectiveFrom,
      yieldPct,
      wastePct,
      activeFlag,
      now(),
      now()
    );
    const bomHeaderId = Number(result.lastInsertRowid);
    normalizedLines.forEach((line) => {
      db().prepare(
        `INSERT INTO bom_material_lines (
          bom_header_id,
          material_id,
          quantity,
          uom,
          line_type,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        bomHeaderId,
        line.material_id,
        line.quantity,
        line.uom,
        line.line_type,
        now()
      );
    });
    recordAppAudit({
      actor_type: payload?.actor_type || "system",
      actor_id: payload?.actor_id || "system",
      surface: "make",
      action: "bom_created",
      entity_type: "bom_header",
      entity_id: String(bomHeaderId),
      related_entity_type: "product",
      related_entity_id: productSku,
      request_id: requestId,
      details: {
        version,
        effective_from: effectiveFrom,
        line_count: normalizedLines.length
      }
    });
    return bomHeaderId;
  });
  const bomHeaderId = tx();
  const bom = listCatalogBoms({ product_sku: productSku }).find((entry) => Number(entry.id) === bomHeaderId) || null;
  return { bom, request_id: requestId };
}

export function updateCatalogBom(bomHeaderId, payload = {}) {
  ensureOperationalSeedData();
  const existing = db().prepare("SELECT * FROM bom_headers WHERE id = ?").get(Number(bomHeaderId));
  if (!existing) return { error: "BOM not found" };

  let normalizedLines;
  try {
    normalizedLines = normalizeBomLines(payload?.lines);
  } catch (error) {
    return { error: String(error?.message || error) };
  }

  const productSku = String(payload?.product_sku || payload?.productSku || existing.product_sku || "").trim();
  const product = productBySku(productSku) || productRecordBySku(productSku);
  if (!product) return { error: `Unknown product SKU: ${productSku}` };

  const requestId = payload?.request_id || nextRequestId("bom-update");
  const version = String(payload?.version || existing.version || "").trim() || existing.version || nextBomVersionForSku(productSku);
  const effectiveFrom = String(payload?.effective_from || payload?.effectiveFrom || existing.effective_from || "").trim() || existing.effective_from;
  const yieldPct = round2(payload?.yield_pct ?? payload?.yieldPct ?? existing.yield_pct ?? 100);
  const wastePct = round2(payload?.waste_pct ?? payload?.wastePct ?? existing.waste_pct ?? 0);
  const activeFlag = payload?.is_active == null
    ? Number(existing.is_active || 0)
    : payload?.is_active === false || payload?.is_active === 0 || String(payload?.is_active || "").toLowerCase() === "false"
      ? 0
      : 1;

  const tx = db().transaction(() => {
    if (activeFlag) {
      db().prepare(
        `UPDATE bom_headers
         SET is_active = 0, updated_at = ?
         WHERE product_sku = ? AND id <> ?`
      ).run(now(), productSku, Number(bomHeaderId));
    }
    const productRow = productRecordBySku(productSku);
    db().prepare(
      `UPDATE bom_headers
       SET product_id = ?,
           product_sku = ?,
           version = ?,
           effective_from = ?,
           yield_pct = ?,
           waste_pct = ?,
           is_active = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      productRow?.id || null,
      productSku,
      version,
      effectiveFrom,
      yieldPct,
      wastePct,
      activeFlag,
      now(),
      Number(bomHeaderId)
    );
    db().prepare("DELETE FROM bom_material_lines WHERE bom_header_id = ?").run(Number(bomHeaderId));
    normalizedLines.forEach((line) => {
      db().prepare(
        `INSERT INTO bom_material_lines (
          bom_header_id,
          material_id,
          quantity,
          uom,
          line_type,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        Number(bomHeaderId),
        line.material_id,
        line.quantity,
        line.uom,
        line.line_type,
        now()
      );
    });
    recordAppAudit({
      actor_type: payload?.actor_type || "system",
      actor_id: payload?.actor_id || "system",
      surface: "make",
      action: "bom_updated",
      entity_type: "bom_header",
      entity_id: String(bomHeaderId),
      related_entity_type: "product",
      related_entity_id: productSku,
      request_id: requestId,
      details: {
        version,
        effective_from: effectiveFrom,
        line_count: normalizedLines.length
      }
    });
  });
  tx();
  const bom = listCatalogBoms({ product_sku: productSku }).find((entry) => Number(entry.id) === Number(bomHeaderId)) || null;
  return { bom, request_id: requestId };
}

export async function getInventoryOverview() {
  const [products, materials] = await Promise.all([
    listCatalogProducts(),
    Promise.resolve(listCatalogMaterials())
  ]);
  return { products, materials };
}

export function listInventoryBatches(filters = {}) {
  ensureOperationalSeedData();
  const clauses = [];
  const params = [];
  if (filters.batch_type) {
    clauses.push("b.batch_type = ?");
    params.push(String(filters.batch_type));
  }
  if (filters.supplier_id) {
    clauses.push("b.supplier_id = ?");
    params.push(Number(filters.supplier_id));
  }
  if (filters.material_id) {
    clauses.push("b.material_id = ?");
    params.push(Number(filters.material_id));
  }
  if (filters.product_sku) {
    clauses.push("b.product_sku = ?");
    params.push(String(filters.product_sku));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db().prepare(
    `SELECT
      b.*,
      m.sku AS material_sku,
      m.title AS material_title,
      s.name AS supplier_name,
      po.shopify_draft_order_name AS purchase_order_name
     FROM batches b
     LEFT JOIN materials m ON m.id = b.material_id
     LEFT JOIN suppliers s ON s.id = b.supplier_id
     LEFT JOIN purchase_orders po ON po.id = b.purchase_order_id
     ${where}
     ORDER BY b.created_at DESC, b.id DESC`
  ).all(...params).map((row) => ({
    ...row,
    details: parseJson(row.details_json, {})
  }));
}

export function listInventoryMovements(filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.material_id) {
    clauses.push("sm.material_id = ?");
    params.push(Number(filters.material_id));
  }
  if (filters.product_sku) {
    clauses.push("sm.product_sku = ?");
    params.push(String(filters.product_sku));
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db().prepare(
    `SELECT
      sm.*,
      m.title AS material_title,
      m.sku AS material_sku
     FROM stock_movements sm
     LEFT JOIN materials m ON m.id = sm.material_id
     ${where}
     ORDER BY sm.occurred_at DESC, sm.id DESC
     LIMIT 200`
  ).all(...params).map((row) => ({
    ...row,
    details: parseJson(row.details_json, {})
  }));
}

export function listInventoryStocktakes() {
  return db().prepare(
    `SELECT *
     FROM stocktakes
     ORDER BY created_at DESC, id DESC`
  ).all();
}

async function resolveShopifyLocationId(locationKey) {
  const explicit = Number(locationKey);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (!hasShopifyConfig()) return null;
  return fetchPrimaryLocationId().catch(() => null);
}

async function hydrateInventoryTargets(targets = []) {
  const hydrated = Array.isArray(targets) ? targets.map((target) => ({ ...target })) : [];
  const missingInventoryItemTargets = hydrated.filter(
    (target) => asPositiveInteger(target.variant_id, null) && !asPositiveInteger(target.inventory_item_id, null)
  );
  if (!missingInventoryItemTargets.length) return hydrated;

  const variantIds = Array.from(
    new Set(
      missingInventoryItemTargets
        .map((target) => asPositiveInteger(target.variant_id, null))
        .filter(Boolean)
    )
  );
  if (!variantIds.length) return hydrated;

  const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants(variantIds).catch(() => new Map());
  hydrated.forEach((target) => {
    if (asPositiveInteger(target.inventory_item_id, null)) return;
    const inventoryItemId = inventoryItemIdsByVariant.get(Number(target.variant_id));
    if (!inventoryItemId) return;
    target.inventory_item_id = Number(inventoryItemId);
    if (target.entity_type === "material" && Number.isFinite(target.material_id)) {
      updateMaterialShopifyBinding(target.material_id, { inventoryItemId });
    }
  });

  return hydrated;
}

function buildShopifySyncSummary({ configured, locationId = null, attempted = [], succeeded = [], failed = [], skipped = [] }) {
  return {
    configured: Boolean(configured),
    location_id: locationId,
    attempted: attempted.length,
    succeeded: succeeded.length,
    failed,
    skipped
  };
}

async function syncAbsoluteShopifyInventoryTargets(targets = [], { locationKey } = {}) {
  if (!hasShopifyConfig()) {
    return buildShopifySyncSummary({
      configured: false,
      skipped: (targets || []).map((target) => ({
        sku: target.sku || null,
        title: target.title || null,
        reason: "SHOPIFY_NOT_CONFIGURED"
      }))
    });
  }

  const locationId = await resolveShopifyLocationId(locationKey);
  if (!locationId) {
    return buildShopifySyncSummary({
      configured: true,
      skipped: (targets || []).map((target) => ({
        sku: target.sku || null,
        title: target.title || null,
        reason: "LOCATION_NOT_RESOLVED"
      }))
    });
  }

  const hydrated = await hydrateInventoryTargets(targets);
  const attempted = [];
  const succeeded = [];
  const failed = [];
  const skipped = [];

  for (const target of hydrated) {
    const variantId = asPositiveInteger(target.variant_id, null);
    const inventoryItemId = asPositiveInteger(target.inventory_item_id, null);
    if (!variantId || !inventoryItemId) {
      skipped.push({
        sku: target.sku || null,
        title: target.title || null,
        reason: "VARIANT_NOT_MAPPED"
      });
      continue;
    }

    const available = Math.max(0, Math.round(asNumber(target.desired_available, 0)));
    attempted.push(target);
    try {
      const level = await setInventoryLevel({
        inventoryItemId,
        locationId,
        available
      });
      succeeded.push({
        sku: target.sku || null,
        title: target.title || null,
        variant_id: variantId,
        inventory_item_id: inventoryItemId,
        available: Number(level?.available ?? available)
      });
    } catch (error) {
      failed.push({
        sku: target.sku || null,
        title: target.title || null,
        variant_id: variantId,
        inventory_item_id: inventoryItemId,
        message: String(error?.message || error)
      });
    }
  }

  return buildShopifySyncSummary({ configured: true, locationId, attempted, succeeded, failed, skipped });
}

async function syncDeltaShopifyInventoryTargets(targets = [], { locationKey } = {}) {
  if (!hasShopifyConfig()) {
    return buildShopifySyncSummary({
      configured: false,
      skipped: (targets || []).map((target) => ({
        sku: target.sku || null,
        title: target.title || null,
        reason: "SHOPIFY_NOT_CONFIGURED"
      }))
    });
  }

  const locationId = await resolveShopifyLocationId(locationKey);
  if (!locationId) {
    return buildShopifySyncSummary({
      configured: true,
      skipped: (targets || []).map((target) => ({
        sku: target.sku || null,
        title: target.title || null,
        reason: "LOCATION_NOT_RESOLVED"
      }))
    });
  }

  const hydrated = await hydrateInventoryTargets(targets);
  const actionable = hydrated.filter((target) => asPositiveInteger(target.inventory_item_id, null));
  const currentLevels = actionable.length
    ? await fetchInventoryLevelsForItems(
        actionable.map((target) => Number(target.inventory_item_id)),
        locationId
      ).catch(() => new Map())
    : new Map();

  const attempted = [];
  const succeeded = [];
  const failed = [];
  const skipped = [];

  for (const target of hydrated) {
    const variantId = asPositiveInteger(target.variant_id, null);
    const inventoryItemId = asPositiveInteger(target.inventory_item_id, null);
    if (!variantId || !inventoryItemId) {
      skipped.push({
        sku: target.sku || null,
        title: target.title || null,
        reason: "VARIANT_NOT_MAPPED"
      });
      continue;
    }

    const current = Math.max(0, Math.round(asNumber(currentLevels.get(inventoryItemId), 0)));
    const delta = Math.round(asNumber(target.adjustment, 0));
    const desired = Math.max(0, current + delta);
    attempted.push(target);
    try {
      const level = await setInventoryLevel({
        inventoryItemId,
        locationId,
        available: desired
      });
      succeeded.push({
        sku: target.sku || null,
        title: target.title || null,
        variant_id: variantId,
        inventory_item_id: inventoryItemId,
        previous_available: current,
        available: Number(level?.available ?? desired),
        clamped_to_zero: current + delta < 0
      });
    } catch (error) {
      failed.push({
        sku: target.sku || null,
        title: target.title || null,
        variant_id: variantId,
        inventory_item_id: inventoryItemId,
        previous_available: current,
        attempted_available: desired,
        message: String(error?.message || error)
      });
    }
  }

  return buildShopifySyncSummary({ configured: true, locationId, attempted, succeeded, failed, skipped });
}

export async function createStocktake({ scope, location_key, notes, lines = [], actor_type = "system", actor_id = "system" }) {
  ensureOperationalSeedData();
  const requestId = nextRequestId("stocktake");
  const conn = db();
  const localMaterialStock = materialStockById();
  const localProductStock = productMovementStockBySku();
  const [products, materials] = await Promise.all([
    listCatalogProducts().catch(() => []),
    listCatalogMaterials().catch(() => [])
  ]);
  const productsBySku = new Map(products.map((product) => [String(product.sku), product]));
  const materialsById = new Map(materials.map((material) => [Number(material.id), material]));
  const normalizedLines = (Array.isArray(lines) ? lines : []).map((line) => {
    const entityType = String(line?.entity_type || "").trim().toLowerCase();
    if (!["product", "material"].includes(entityType)) return null;

    const productSku = entityType === "product" ? String(line?.product_sku || "").trim() : null;
    const materialId = entityType === "material" ? Number(line?.material_id || 0) : null;
    const countedQty = round2(line?.counted_qty);
    const currentProduct = entityType === "product" ? productsBySku.get(productSku) : null;
    const currentMaterial = entityType === "material" ? materialsById.get(materialId) : null;
    const beforeQty = entityType === "material"
      ? asNumber(currentMaterial?.on_hand, asNumber(localMaterialStock.get(materialId), 0))
      : asNumber(currentProduct?.on_hand, asNumber(localProductStock.get(productSku), 0));
    const diffQty = round2(countedQty - beforeQty);

    return {
      entity_type: entityType,
      product_sku: productSku,
      material_id: materialId,
      batch_id: line?.batch_id || null,
      counted_qty: countedQty,
      before_qty: beforeQty,
      diff_qty: diffQty,
      product: currentProduct,
      material: currentMaterial
    };
  }).filter(Boolean);

  const tx = conn.transaction(() => {
    const stocktakeResult = conn.prepare(
      `INSERT INTO stocktakes (status, scope, location_key, notes, actor_type, actor_id, created_at)
       VALUES ('closed', ?, ?, ?, ?, ?, ?)`
    ).run(String(scope || "full"), location_key || null, notes || null, actor_type, actor_id, now());
    const stocktakeId = stocktakeResult.lastInsertRowid;

    for (const line of normalizedLines) {
      conn.prepare(
        `INSERT INTO stocktake_lines (
          stocktake_id,
          entity_type,
          product_sku,
          material_id,
          counted_qty,
          before_qty,
          diff_qty,
          batch_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        stocktakeId,
        line.entity_type,
        line.product_sku || null,
        line.material_id || null,
        line.counted_qty,
        line.before_qty,
        line.diff_qty,
        line.batch_id || null,
        now()
      );
      if (line.diff_qty !== 0) {
        conn.prepare(
          `INSERT INTO stock_movements (
            occurred_at,
            movement_type,
            location_key,
            product_sku,
            material_id,
            batch_id,
            quantity,
            reference_type,
            reference_id,
            actor_type,
            actor_id,
            details_json
          ) VALUES (?, 'stocktake_adjustment', ?, ?, ?, ?, ?, 'stocktake', ?, ?, ?, ?)`
        ).run(
          now(),
          location_key || null,
          line.entity_type === "product" ? line.product_sku || null : null,
          line.entity_type === "material" ? line.material_id || null : null,
          line.batch_id || null,
          line.diff_qty,
          String(stocktakeId),
          actor_type,
          actor_id,
          JSON.stringify({
            before_qty: line.before_qty,
            counted_qty: line.counted_qty
          })
        );
      }
    }

    conn.prepare("UPDATE stocktakes SET closed_at = ? WHERE id = ?").run(now(), stocktakeId);
    recordAppAudit({
      actor_type,
      actor_id,
      surface: "stock",
      action: "stocktake_closed",
      entity_type: "stocktake",
      entity_id: String(stocktakeId),
      request_id: requestId,
      details: { scope, line_count: normalizedLines.length }
    });
    return stocktakeId;
  });

  const stocktakeId = tx();
  const shopifyTargets = normalizedLines.map((line) => {
    if (line.entity_type === "product") {
      return {
        entity_type: "product",
        sku: line.product_sku,
        title: line.product?.title || line.product_sku,
        variant_id: asPositiveInteger(line.product?.variantId, null),
        inventory_item_id: null,
        desired_available: line.counted_qty
      };
    }
    return {
      entity_type: "material",
      material_id: line.material_id,
      sku: line.material?.sku || null,
      title: line.material?.title || line.material_id,
      variant_id: asPositiveInteger(line.material?.shopify_variant_id, null),
      inventory_item_id: asPositiveInteger(line.material?.shopify_inventory_item_id, null),
      desired_available: toShopifyInventoryUnits(line.counted_qty, line.material || { uom: "unit" })
    };
  }).filter((target) => target.variant_id || target.inventory_item_id);
  const shopifySync = await syncAbsoluteShopifyInventoryTargets(shopifyTargets, { locationKey: location_key });
  recordAppAudit({
    actor_type,
    actor_id,
    surface: "stock",
    action: "stocktake_shopify_sync",
    entity_type: "stocktake",
    entity_id: String(stocktakeId),
    request_id: requestId,
    status: shopifySync.failed.length ? "partial" : "ok",
    details: shopifySync
  });
  return {
    stocktake: db().prepare("SELECT * FROM stocktakes WHERE id = ?").get(stocktakeId),
    request_id: requestId,
    shopify_sync: shopifySync
  };
}

async function createShopifyDraftOrder({ lines, tags, note, noteAttributes = [] }) {
  if (!hasShopifyConfig()) {
    return {
      ok: false,
      skipped: true,
      reason: "SHOPIFY_NOT_CONFIGURED"
    };
  }
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const payload = {
    draft_order: {
      line_items: lines.map((line) => {
        if (line.variant_id) {
          return { variant_id: Number(line.variant_id), quantity: asNumber(line.quantity, 0) };
        }
        return {
          title: String(line.title || line.sku || "Line item"),
          quantity: asNumber(line.quantity, 0),
          price: String(line.price ?? "0.00")
        };
      }),
      tags: Array.isArray(tags) ? tags.join(", ") : String(tags || ""),
      note: String(note || ""),
      note_attributes: noteAttributes
    }
  };
  const resp = await shopifyFetch(`${base}/draft_orders.json`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(body?.message || body?.error || `Shopify draft order failed (${resp.status})`);
  }
  const draftOrder = body?.draft_order || {};
  return {
    ok: true,
    id: draftOrder.id ? String(draftOrder.id) : null,
    name: draftOrder.name || null,
    adminUrl: draftOrder.id
      ? `https://${config.SHOPIFY_STORE}.myshopify.com/admin/draft_orders/${draftOrder.id}`
      : null
  };
}

async function buildPdfBase64({ title, lines, meta = [] }) {
  ensureGeneratedDir();
  const fileName = `${safeSlug(title)}-${Date.now()}.pdf`;
  const filePath = path.join(GENERATED_DIR, fileName);
  const doc = new PDFDocument({ margin: 48 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.fontSize(18).text(title);
  doc.moveDown(0.5);
  meta.forEach(([label, value]) => {
    doc.fontSize(10).fillColor("#475569").text(`${label}: ${value}`);
  });
  doc.moveDown(1);
  doc.fillColor("#0f172a").fontSize(11);
  lines.forEach((line) => {
    doc.text(`${line.title} (${line.sku || "no-sku"})  x ${line.quantity} ${line.uom || ""}`.trim());
  });
  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  const pdfBase64 = fs.readFileSync(filePath).toString("base64");
  return { filePath, pdfBase64 };
}

async function sendPrintNodeJob({ title, pdfBase64 }) {
  if (!hasPrintNodeConfig()) {
    return { ok: false, skipped: true, reason: "PRINTNODE_NOT_CONFIGURED" };
  }
  const payload = {
    printerId: Number(config.PRINTNODE_PRINTER_ID),
    title,
    contentType: "pdf_base64",
    content: String(pdfBase64 || "").replace(/\s/g, ""),
    source: "FLSS Unified Operations"
  };
  const auth = Buffer.from(`${config.PRINTNODE_API_KEY}:`).toString("base64");
  const response = await fetchWithTimeout(
    PRINTNODE_PRINTJOBS_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    config.PRINTNODE_TIMEOUT_MS,
    {
      upstream: "printnode",
      route: "unifiedOperations.sendPrintNodeJob",
      target: PRINTNODE_PRINTJOBS_URL
    }
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `PrintNode failed (${response.status})`);
  }
  return { ok: true, data: body };
}

async function sendSupplierEmail({ supplier, subject, text, filePath }) {
  if (!hasSmtpConfig()) {
    return { ok: false, skipped: true, reason: "SMTP_NOT_CONFIGURED" };
  }
  if (!supplier?.email) {
    return { ok: false, skipped: true, reason: "SUPPLIER_EMAIL_MISSING" };
  }
  const transport = getSmtpTransport();
  const from = config.SMTP_FROM || config.SMTP_USER || "no-reply@flss.local";
  const info = await transport.sendMail({
    from,
    to: supplier.email,
    subject,
    text,
    attachments: filePath ? [{ filename: path.basename(filePath), path: filePath }] : []
  });
  return { ok: true, messageId: info?.messageId || null };
}

function setPurchaseDispatchStatus(purchaseOrderId, channel, status, details = {}) {
  const conn = db();
  const existing = conn.prepare(
    "SELECT id, attempt_count FROM purchase_order_dispatches WHERE purchase_order_id = ? AND channel = ?"
  ).get(purchaseOrderId, channel);
  const serialized = JSON.stringify(details || {});
  if (existing) {
    conn.prepare(
      `UPDATE purchase_order_dispatches
       SET status = ?, attempt_count = ?, last_attempt_at = ?, details_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(status, Number(existing.attempt_count || 0) + 1, now(), serialized, now(), existing.id);
    return existing.id;
  }
  const result = conn.prepare(
    `INSERT INTO purchase_order_dispatches (
      purchase_order_id,
      channel,
      status,
      attempt_count,
      last_attempt_at,
      details_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?)`
  ).run(purchaseOrderId, channel, status, now(), serialized, now(), now());
  return result.lastInsertRowid;
}

function formatSupplierEmailBody({ supplier, purchaseOrder, lines }) {
  const supplierName = supplier?.contact_name || supplier?.name || "Supplier";
  return [
    `Hello ${supplierName},`,
    "",
    `Please find attached purchase order ${purchaseOrder.id}.`,
    "",
    "Requested items:",
    ...lines.map((line) => `- ${line.title_snapshot} (${line.sku_snapshot}) x ${line.quantity} ${line.uom_snapshot}`),
    "",
    purchaseOrder.note ? `Note: ${purchaseOrder.note}` : null,
    "",
    "Regards,",
    "FLSS"
  ].filter(Boolean).join("\n");
}

async function createPurchaseOrdersInternal({
  selections = [],
  note = "",
  actor_type = "system",
  actor_id = "system",
  request_id = nextRequestId("buy")
}) {
  ensureOperationalSeedData();
  const conn = db();
  const normalized = selections.map((selection) => ({
    material_id: Number(selection?.material_id || selection?.materialId),
    quantity: round2(selection?.quantity)
  })).filter((selection) => selection.material_id && selection.quantity > 0);

  if (!normalized.length) {
    return { error: "At least one material selection is required" };
  }

  const grouped = new Map();
  for (const selection of normalized) {
    const material = materialById(selection.material_id);
    if (!material) return { error: `Material ${selection.material_id} was not found` };
    const supplier = preferredSupplierForMaterial(selection.material_id);
    if (!supplier?.id) return { error: `Material ${material.title} has no preferred supplier` };
    const key = String(supplier.id);
    if (!grouped.has(key)) grouped.set(key, { supplier, items: [] });
    grouped.get(key).items.push({ material, quantity: selection.quantity });
  }

  const results = [];
  for (const { supplier, items } of grouped.values()) {
    let purchaseOrderId = null;
    try {
      const tx = conn.transaction(() => {
        const poResult = conn.prepare(
          `INSERT INTO purchase_orders (
            supplier_id,
            status,
            note,
            request_id,
            created_at,
            updated_at
          ) VALUES (?, 'draft', ?, ?, ?, ?)`
        ).run(supplier.id, note || null, request_id, now(), now());
        const poId = poResult.lastInsertRowid;
        items.forEach(({ material, quantity }) => {
          conn.prepare(
            `INSERT INTO purchase_order_lines (
              purchase_order_id,
              material_id,
              quantity,
              title_snapshot,
              sku_snapshot,
              uom_snapshot,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(poId, material.id, quantity, material.title, material.sku, material.uom || "unit", now());
        });
        return poId;
      });
      purchaseOrderId = tx();

      const lineRows = conn.prepare(
        `SELECT *
         FROM purchase_order_lines
         WHERE purchase_order_id = ?
         ORDER BY id ASC`
      ).all(purchaseOrderId);

      const title = `Purchase Order ${purchaseOrderId} - ${supplier.name}`;
      const pdf = await buildPdfBase64({
        title,
        lines: lineRows.map((line) => ({
          title: line.title_snapshot,
          sku: line.sku_snapshot,
          quantity: line.quantity,
          uom: line.uom_snapshot
        })),
        meta: [["Supplier", supplier.name], ["Request", request_id]]
      });

      conn.prepare("UPDATE purchase_orders SET generated_document_path = ?, updated_at = ? WHERE id = ?")
        .run(pdf.filePath, now(), purchaseOrderId);

      const shopifyResult = await createShopifyDraftOrder({
        tags: ["purchase-order", "FLSS"],
        note: [supplier.name ? `Supplier: ${supplier.name}` : "", note].filter(Boolean).join("\n"),
        noteAttributes: [
          { name: "source", value: "FLSS buy" },
          { name: "supplier", value: supplier.name }
        ],
        lines: lineRows.map((line) => ({
          title: line.title_snapshot,
          sku: line.sku_snapshot,
          quantity: line.quantity,
          price: "0.00"
        }))
      });
      if (shopifyResult.ok) {
        conn.prepare(
          `UPDATE purchase_orders
           SET shopify_draft_order_id = ?, shopify_draft_order_name = ?, shopify_admin_url = ?, updated_at = ?, status = 'dispatched'
           WHERE id = ?`
        ).run(shopifyResult.id, shopifyResult.name, shopifyResult.adminUrl, now(), purchaseOrderId);
        setPurchaseDispatchStatus(purchaseOrderId, "shopify", "success", shopifyResult);
      } else {
        setPurchaseDispatchStatus(purchaseOrderId, "shopify", "skipped", shopifyResult);
      }

      let emailResult;
      try {
        emailResult = await sendSupplierEmail({
          supplier,
          subject: title,
          text: formatSupplierEmailBody({
            supplier,
            purchaseOrder: { id: purchaseOrderId, note },
            lines: lineRows
          }),
          filePath: pdf.filePath
        });
        setPurchaseDispatchStatus(purchaseOrderId, "email", emailResult.ok ? "success" : emailResult.skipped ? "skipped" : "failed", emailResult);
      } catch (error) {
        emailResult = { ok: false, error: String(error?.message || error) };
        setPurchaseDispatchStatus(purchaseOrderId, "email", "failed", emailResult);
      }

      let printResult;
      try {
        printResult = await sendPrintNodeJob({ title, pdfBase64: pdf.pdfBase64 });
        setPurchaseDispatchStatus(purchaseOrderId, "print", printResult.ok ? "success" : printResult.skipped ? "skipped" : "failed", printResult);
      } catch (error) {
        printResult = { ok: false, error: String(error?.message || error) };
        setPurchaseDispatchStatus(purchaseOrderId, "print", "failed", printResult);
      }

      recordAppAudit({
        actor_type,
        actor_id,
        surface: "buy",
        action: "purchase_order_created",
        entity_type: "purchase_order",
        entity_id: String(purchaseOrderId),
        related_entity_type: "supplier",
        related_entity_id: String(supplier.id),
        request_id,
        status: emailResult?.ok === false && !emailResult?.skipped ? "partial" : "ok",
        details: {
          supplier_name: supplier.name,
          item_count: lineRows.length,
          shopify: shopifyResult,
          email: emailResult,
          print: printResult
        }
      });

      results.push({
        purchase_order_id: purchaseOrderId,
        supplier: { id: supplier.id, name: supplier.name, email: supplier.email || null },
        status: "ok",
        draft_order: shopifyResult,
        email: emailResult,
        print: printResult,
        document: { path: pdf.filePath }
      });
    } catch (error) {
      if (purchaseOrderId) {
        setPurchaseDispatchStatus(purchaseOrderId, "orchestration", "failed", { error: String(error?.message || error) });
      }
      results.push({
        purchase_order_id: purchaseOrderId,
        supplier: { id: supplier.id, name: supplier.name, email: supplier.email || null },
        status: "failed",
        error: String(error?.message || error)
      });
    }
  }

  return { ok: true, request_id, results };
}

export async function createBuyPurchaseOrders(payload = {}) {
  return createPurchaseOrdersInternal(payload);
}

export function listBuyPurchaseOrders() {
  return db().prepare(
    `SELECT
      po.*,
      s.name AS supplier_name,
      s.email AS supplier_email
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     ORDER BY po.created_at DESC, po.id DESC`
  ).all().map((row) => ({
    ...row,
    dispatches: db().prepare(
      `SELECT *
       FROM purchase_order_dispatches
       WHERE purchase_order_id = ?
       ORDER BY channel ASC`
    ).all(row.id).map((dispatch) => ({
      ...dispatch,
      details: parseJson(dispatch.details_json, {})
    })),
    lines: db().prepare(
      `SELECT *
       FROM purchase_order_lines
       WHERE purchase_order_id = ?
       ORDER BY id ASC`
    ).all(row.id)
  }));
}

export async function retryBuyPurchaseOrderDispatch(purchaseOrderId, { actor_type = "system", actor_id = "system" } = {}) {
  const conn = db();
  const purchaseOrder = conn.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(Number(purchaseOrderId));
  if (!purchaseOrder) return { error: "Purchase order not found" };
  const supplier = conn.prepare("SELECT * FROM suppliers WHERE id = ?").get(purchaseOrder.supplier_id);
  const lines = conn.prepare("SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY id ASC").all(Number(purchaseOrderId));
  if (!supplier || !lines.length) return { error: "Purchase order is missing supplier or lines" };
  const dispatches = conn.prepare("SELECT * FROM purchase_order_dispatches WHERE purchase_order_id = ?").all(Number(purchaseOrderId));
  const byChannel = new Map(dispatches.map((dispatch) => [dispatch.channel, dispatch]));
  const title = `Purchase Order ${purchaseOrderId} - ${supplier.name}`;

  if (!purchaseOrder.generated_document_path || !fs.existsSync(purchaseOrder.generated_document_path)) {
    const pdf = await buildPdfBase64({
      title,
      lines: lines.map((line) => ({
        title: line.title_snapshot,
        sku: line.sku_snapshot,
        quantity: line.quantity,
        uom: line.uom_snapshot
      })),
      meta: [["Supplier", supplier.name]]
    });
    conn.prepare("UPDATE purchase_orders SET generated_document_path = ?, updated_at = ? WHERE id = ?")
      .run(pdf.filePath, now(), Number(purchaseOrderId));
    purchaseOrder.generated_document_path = pdf.filePath;
  }

  const result = {
    purchase_order_id: Number(purchaseOrderId),
    retried: []
  };

  if (!purchaseOrder.shopify_draft_order_id && (!byChannel.get("shopify") || byChannel.get("shopify").status !== "success")) {
    const shopifyResult = await createShopifyDraftOrder({
      tags: ["purchase-order", "FLSS"],
      note: [supplier.name ? `Supplier: ${supplier.name}` : "", purchaseOrder.note || ""].filter(Boolean).join("\n"),
      noteAttributes: [
        { name: "source", value: "FLSS buy retry" },
        { name: "supplier", value: supplier.name }
      ],
      lines: lines.map((line) => ({
        title: line.title_snapshot,
        sku: line.sku_snapshot,
        quantity: line.quantity,
        price: "0.00"
      }))
    });
    if (shopifyResult.ok) {
      conn.prepare(
        `UPDATE purchase_orders
         SET shopify_draft_order_id = ?, shopify_draft_order_name = ?, shopify_admin_url = ?, updated_at = ?
         WHERE id = ?`
      ).run(shopifyResult.id, shopifyResult.name, shopifyResult.adminUrl, now(), Number(purchaseOrderId));
      setPurchaseDispatchStatus(Number(purchaseOrderId), "shopify", "success", shopifyResult);
    }
    result.retried.push({ channel: "shopify", result: shopifyResult });
  }

  if (!byChannel.get("email") || byChannel.get("email").status !== "success") {
    const emailResult = await sendSupplierEmail({
      supplier,
      subject: title,
      text: formatSupplierEmailBody({ supplier, purchaseOrder, lines }),
      filePath: purchaseOrder.generated_document_path
    });
    setPurchaseDispatchStatus(
      Number(purchaseOrderId),
      "email",
      emailResult.ok ? "success" : emailResult.skipped ? "skipped" : "failed",
      emailResult
    );
    result.retried.push({ channel: "email", result: emailResult });
  }

  if (!byChannel.get("print") || byChannel.get("print").status !== "success") {
    const pdfBase64 = fs.readFileSync(purchaseOrder.generated_document_path).toString("base64");
    const printResult = await sendPrintNodeJob({ title, pdfBase64 });
    setPurchaseDispatchStatus(
      Number(purchaseOrderId),
      "print",
      printResult.ok ? "success" : printResult.skipped ? "skipped" : "failed",
      printResult
    );
    result.retried.push({ channel: "print", result: printResult });
  }

  recordAppAudit({
    actor_type,
    actor_id,
    surface: "buy",
    action: "purchase_order_retry",
    entity_type: "purchase_order",
    entity_id: String(purchaseOrderId),
    status: "ok",
    details: result
  });
  return result;
}

async function computeMakeRequirements(lines = []) {
  ensureOperationalSeedData();
  const materials = new Map((await listCatalogMaterials()).map((material) => [Number(material.id), material]));
  const aggregated = new Map();
  const missingBom = [];

  for (const line of lines) {
    const product = productBySku(line.product_sku);
    if (!product) continue;
    const header = activeBomHeaderForSku(product.sku);
    if (!header) {
      missingBom.push(product.sku);
      continue;
    }
    const bomLines = bomLinesForHeader(header.id);
    bomLines.forEach((bomLine) => {
      const key = Number(bomLine.material_id);
      const existing = aggregated.get(key) || {
        material_id: key,
        material_sku: bomLine.material_sku,
        material_title: bomLine.material_title,
        category: bomLine.material_category,
        uom: bomLine.material_uom || bomLine.uom || "unit",
        icon: bomLine.material_icon || "*",
        required_qty: 0
      };
      existing.required_qty = round2(existing.required_qty + (asNumber(bomLine.quantity, 0) * asNumber(line.quantity, 0)));
      aggregated.set(key, existing);
    });
  }

  const requirements = Array.from(aggregated.values()).map((requirement) => {
    const material = materials.get(Number(requirement.material_id));
    return {
      ...requirement,
      available_qty: asNumber(material?.available, 0),
      shortage_qty: Math.max(0, round2(requirement.required_qty - asNumber(material?.available, 0))),
      preferred_supplier: material?.preferred_supplier || null,
      inventory_source: material?.inventory_source || "local"
    };
  }).sort((left, right) => String(left.material_title).localeCompare(String(right.material_title)));

  return { requirements, missing_bom: missingBom };
}

export async function getMakeRequirements(payload = {}) {
  const normalizedLines = (Array.isArray(payload?.lines) ? payload.lines : [])
    .map((line) => ({
      product_sku: String(line?.product_sku || line?.productSku || "").trim(),
      quantity: round2(line?.quantity)
    }))
    .filter((line) => line.product_sku && line.quantity > 0);
  return computeMakeRequirements(normalizedLines);
}

export async function createManufacturingOrder(payload = {}) {
  const lines = (Array.isArray(payload?.lines) ? payload.lines : [])
    .map((line) => ({
      product_sku: String(line?.product_sku || line?.productSku || "").trim(),
      quantity: round2(line?.quantity)
    }))
    .filter((line) => line.product_sku && line.quantity > 0);
  if (!lines.length) return { error: "At least one manufacturing line is required" };

  const requestId = payload?.request_id || nextRequestId("make");
  const requirementsPayload = await computeMakeRequirements(lines);
  const conn = db();
  const tx = conn.transaction(() => {
    const moResult = conn.prepare(
      `INSERT INTO manufacturing_orders (
        status,
        target_date,
        notes,
        request_id,
        created_at,
        updated_at
      ) VALUES ('draft', ?, ?, ?, ?, ?)`
    ).run(payload?.target_date || null, payload?.notes || null, requestId, now(), now());
    const manufacturingOrderId = moResult.lastInsertRowid;

    lines.forEach((line) => {
      const product = productBySku(line.product_sku);
      conn.prepare(
        `INSERT INTO manufacturing_order_lines (
          manufacturing_order_id,
          product_sku,
          product_title,
          variant_id,
          quantity,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        manufacturingOrderId,
        line.product_sku,
        product?.title || line.product_sku,
        product?.variantId ? String(product.variantId) : null,
        line.quantity,
        now()
      );
    });

    requirementsPayload.requirements.forEach((requirement) => {
      conn.prepare(
        `INSERT INTO manufacturing_material_requirements (
          manufacturing_order_id,
          material_id,
          required_qty,
          reserved_qty,
          available_qty,
          shortage_qty,
          uom,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        manufacturingOrderId,
        requirement.material_id,
        requirement.required_qty,
        Math.max(0, requirement.required_qty - requirement.shortage_qty),
        requirement.available_qty,
        requirement.shortage_qty,
        requirement.uom || "unit",
        now(),
        now()
      );
    });

    return manufacturingOrderId;
  });

  const manufacturingOrderId = tx();
  const shopifyResult = await createShopifyDraftOrder({
    tags: ["manufacturing-order", "FLSS"],
    note: [payload?.notes || "", `Manufacturing order ${manufacturingOrderId}`].filter(Boolean).join("\n"),
    noteAttributes: [
      { name: "source", value: "FLSS make" },
      { name: "manufacturing_order_id", value: String(manufacturingOrderId) }
    ],
    lines: lines.map((line) => {
      const product = productBySku(line.product_sku);
      return {
        variant_id: product?.variantId || null,
        title: product?.title || line.product_sku,
        sku: line.product_sku,
        quantity: line.quantity,
        price: "0.00"
      };
    })
  });

  if (shopifyResult.ok) {
    db().prepare(
      `UPDATE manufacturing_orders
       SET shopify_draft_order_id = ?, shopify_draft_order_name = ?, shopify_admin_url = ?, updated_at = ?
       WHERE id = ?`
    ).run(shopifyResult.id, shopifyResult.name, shopifyResult.adminUrl, now(), manufacturingOrderId);
  }

  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "make",
    action: "manufacturing_order_created",
    entity_type: "manufacturing_order",
    entity_id: String(manufacturingOrderId),
    request_id: requestId,
    status: requirementsPayload.missing_bom.length ? "partial" : "ok",
    details: {
      lines,
      requirements: requirementsPayload.requirements,
      missing_bom: requirementsPayload.missing_bom,
      shopify: shopifyResult
    }
  });

  return {
    manufacturing_order: db().prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(manufacturingOrderId),
    draft_order: shopifyResult,
    ...requirementsPayload
  };
}

export function listManufacturingOrders() {
  return db().prepare(
    `SELECT *
     FROM manufacturing_orders
     ORDER BY created_at DESC, id DESC`
  ).all().map((row) => ({
    ...row,
    lines: db().prepare(
      `SELECT *
       FROM manufacturing_order_lines
       WHERE manufacturing_order_id = ?
       ORDER BY id ASC`
    ).all(row.id),
    requirements: db().prepare(
      `SELECT
        mmr.*,
        m.sku AS material_sku,
        m.title AS material_title
       FROM manufacturing_material_requirements mmr
       JOIN materials m ON m.id = mmr.material_id
       WHERE mmr.manufacturing_order_id = ?
       ORDER BY m.title ASC`
    ).all(row.id)
  }));
}

export async function completeManufacturingOrder(manufacturingOrderId, payload = {}) {
  const conn = db();
  const mo = conn.prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(Number(manufacturingOrderId));
  if (!mo) return { error: "Manufacturing order not found" };
  if (String(mo.status) === "completed") return { error: "Manufacturing order already completed" };

  const lines = conn.prepare("SELECT * FROM manufacturing_order_lines WHERE manufacturing_order_id = ?").all(Number(manufacturingOrderId));
  const requirements = conn.prepare("SELECT * FROM manufacturing_material_requirements WHERE manufacturing_order_id = ?").all(Number(manufacturingOrderId));
  const batchCode = buildBatchCode("FG");
  const requestId = nextRequestId("make-complete");
  const tx = conn.transaction(() => {
    const batchResult = conn.prepare(
      `INSERT INTO batches (
        batch_code,
        batch_type,
        product_sku,
        manufacturing_order_id,
        qty_total,
        qty_remaining,
        bom_header_id,
        details_json,
        created_at,
        updated_at
      ) VALUES (?, 'finished', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      batchCode,
      lines[0]?.product_sku || null,
      Number(manufacturingOrderId),
      round2(lines.reduce((sum, line) => sum + asNumber(line.quantity, 0), 0)),
      round2(lines.reduce((sum, line) => sum + asNumber(line.quantity, 0), 0)),
      activeBomHeaderForSku(lines[0]?.product_sku || "")?.id || null,
      JSON.stringify({ note: payload?.note || null }),
      now(),
      now()
    );
    const batchId = batchResult.lastInsertRowid;

    requirements.forEach((requirement) => {
      conn.prepare(
        `INSERT INTO stock_movements (
          occurred_at,
          movement_type,
          material_id,
          quantity,
          batch_id,
          reference_type,
          reference_id,
          actor_type,
          actor_id,
          details_json
        ) VALUES (?, 'manufacturing_consumption', ?, ?, NULL, 'manufacturing_order', ?, ?, ?, ?)`
      ).run(
        now(),
        requirement.material_id,
        -Math.abs(asNumber(requirement.required_qty, 0)),
        String(manufacturingOrderId),
        payload?.actor_type || "system",
        payload?.actor_id || "system",
        JSON.stringify({ batch_code: batchCode })
      );
    });

    lines.forEach((line) => {
      conn.prepare(
        `INSERT INTO stock_movements (
          occurred_at,
          movement_type,
          product_sku,
          quantity,
          batch_id,
          reference_type,
          reference_id,
          actor_type,
          actor_id,
          details_json
        ) VALUES (?, 'manufacturing_output', ?, ?, ?, 'manufacturing_order', ?, ?, ?, ?)`
      ).run(
        now(),
        line.product_sku,
        Math.abs(asNumber(line.quantity, 0)),
        batchId,
        String(manufacturingOrderId),
        payload?.actor_type || "system",
        payload?.actor_id || "system",
        JSON.stringify({ batch_code: batchCode })
      );
    });

    conn.prepare("UPDATE manufacturing_orders SET status = 'completed', batch_id = ?, updated_at = ? WHERE id = ?")
      .run(batchId, now(), Number(manufacturingOrderId));
    return batchId;
  });

  const batchId = tx();
  const materialsById = new Map((await listCatalogMaterials().catch(() => [])).map((material) => [Number(material.id), material]));
  const shopifyTargets = [
    ...requirements.map((requirement) => {
      const material = materialsById.get(Number(requirement.material_id));
      return {
        entity_type: "material",
        material_id: Number(requirement.material_id),
        sku: material?.sku || null,
        title: material?.title || `Material ${requirement.material_id}`,
        variant_id: asPositiveInteger(material?.shopify_variant_id, null),
        inventory_item_id: asPositiveInteger(material?.shopify_inventory_item_id, null),
        adjustment: -Math.abs(toShopifyInventoryUnits(requirement.required_qty, material || { uom: requirement.uom || "unit" }))
      };
    }),
    ...lines.map((line) => ({
      entity_type: "product",
      sku: line.product_sku,
      title: line.product_title || line.product_sku,
      variant_id: asPositiveInteger(line.variant_id, null),
      inventory_item_id: null,
      adjustment: Math.abs(Math.round(asNumber(line.quantity, 0)))
    }))
  ].filter((target) => target.adjustment !== 0 && (target.variant_id || target.inventory_item_id));
  const shopifySync = await syncDeltaShopifyInventoryTargets(shopifyTargets, {
    locationKey: payload?.location_key || payload?.locationKey || null
  });
  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "make",
    action: "manufacturing_order_completed",
    entity_type: "manufacturing_order",
    entity_id: String(manufacturingOrderId),
    related_entity_type: "batch",
    related_entity_id: String(batchId),
    request_id: requestId,
    status: shopifySync.failed.length ? "partial" : "ok",
    details: {
      batch_code: batchCode,
      line_count: lines.length,
      requirement_count: requirements.length,
      shopify_sync: shopifySync
    }
  });

  return {
    manufacturing_order: conn.prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(Number(manufacturingOrderId)),
    batch: conn.prepare("SELECT * FROM batches WHERE id = ?").get(Number(batchId)),
    shopify_sync: shopifySync
  };
}

export async function createLinkedPurchaseOrdersFromShortages(payload = {}) {
  const requirements = await getMakeRequirements(payload);
  const selections = requirements.requirements
    .filter((requirement) => requirement.shortage_qty > 0)
    .map((requirement) => ({
      material_id: requirement.material_id,
      quantity: requirement.shortage_qty
    }));
  return createPurchaseOrdersInternal({
    selections,
    note: payload?.note || "Linked from manufacturing shortages",
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system"
  });
}

export function getMasterAuditLog(filters = {}) {
  return listAppAuditLog(filters);
}
