import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

import { config } from "../config.js";
import { getDb } from "../db/sqlite.js";
import { recordAppAudit, listAppAuditLog } from "./appAudit.js";
import { getSmtpTransport } from "./email.js";
import {
  buildIncomingVehicleInspectionSheet,
  normalizeIncomingVehicleInspection
} from "./incomingVehicleInspection.js";
import { resolveDocumentPrinterId } from "./printRouting.js";
import {
  fetchInventoryItemIdsForVariants,
  fetchInventoryLevelsForItems,
  fetchPrimaryLocationId,
  setInventoryLevel,
  shopifyFetch
} from "./shopify.js";
import { fetchWithTimeout } from "../utils/http.js";
import {
  createSupplier,
  getProductById,
  getProductBySku,
  getSupplierById,
  listProducts as listDbProducts,
  listSuppliers as listDbSuppliers,
  updateSupplier,
  upsertProduct
} from "./product-management/index.js";
import { PRODUCT_LIST } from "../../public/views/products.js";
import { PO_CATALOG_ITEMS } from "../../public/views/purchase-order-catalog.js";

const GENERATED_DIR = path.resolve(config.ASSETS_PATH || "data/assets", "generated");
const PRINTNODE_PRINTJOBS_URL = "https://api.printnode.com/printjobs";
const SHOPIFY_VARIANT_LOOKUP_CACHE_TTL_MS = 15 * 60 * 1000;
const SHOPIFY_VARIANT_LOOKUP_CONCURRENCY = 4;
const shopifyVariantLookupCache = new Map();
const STATIC_PRODUCTS_BY_SKU = new Map(
  PRODUCT_LIST.map((product) => [String(product.sku || "").trim().toUpperCase(), product])
);

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

function asBooleanFlag(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "active"].includes(normalized)) return true;
    if (["0", "false", "no", "off", "inactive"].includes(normalized)) return false;
  }
  return fallback;
}

function uniqueBy(values = [], keyFn = (value) => value) {
  const seen = new Set();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getOrderLineRemainingQuantity(lineItem = {}) {
  const fulfillableQuantity = Number(lineItem?.fulfillable_quantity);
  if (Number.isFinite(fulfillableQuantity)) {
    return Math.max(0, fulfillableQuantity);
  }

  const currentQuantity = Number(lineItem?.current_quantity ?? lineItem?.quantity ?? 0);
  const fulfilledQuantity = Number(lineItem?.fulfilled_quantity ?? 0);
  const quantityRemaining = currentQuantity - fulfilledQuantity;
  if (Number.isFinite(quantityRemaining)) {
    return Math.max(0, quantityRemaining);
  }

  return Math.max(0, Number(lineItem?.quantity ?? 0));
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
  return Boolean(config.PRINTNODE_API_KEY);
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
    for (const product of PRODUCT_LIST) {
      const sku = String(product?.sku || "").trim().toUpperCase();
      if (!sku) continue;
      const existing = conn.prepare("SELECT id FROM products WHERE sku = ?").get(sku);
      if (existing) continue;
      conn.prepare(
        `INSERT INTO products (
          sku,
          title,
          status,
          shopify_variant_id,
          flavour,
          size,
          weight_kg,
          crate_units,
          is_active,
          created_at,
          updated_at
        ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        sku,
        product.title,
        product.variantId ? String(product.variantId) : null,
        product.flavour || "",
        product.size || "",
        asNumber(product.weightKg, 0),
        Math.max(0, Math.floor(asNumber(product.crateUnits, 0))),
        now(),
        now()
      );
    }

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
  ensureOperationalSeedData();
  return listDbProducts()
    .filter((product) => Number(product?.is_active ?? 1) !== 0)
    .map((product) => {
      const fallback = STATIC_PRODUCTS_BY_SKU.get(String(product.sku || "").trim().toUpperCase()) || null;
      const variantId = asPositiveInteger(product?.shopify_variant_id, null)
        ?? asPositiveInteger(fallback?.variantId, null);
      return {
        id: Number(product.id),
        sku: String(product.sku || "").trim().toUpperCase(),
        title: String(product.title || fallback?.title || product.sku || "").trim(),
        flavour: String(product.flavour || fallback?.flavour || "").trim(),
        size: String(product.size || fallback?.size || "").trim(),
        variantId,
        weightKg: asNumber(product.weight_kg, asNumber(fallback?.weightKg, 0)),
        crateUnits: Math.max(0, Math.floor(asNumber(product.crate_units, asNumber(fallback?.crateUnits, 0)))),
        status: String(product.status || "active").trim() || "active",
        isActive: Number(product.is_active ?? 1) !== 0,
        shopify_product_id: product.shopify_product_id || null,
        shopify_variant_id: product.shopify_variant_id || (variantId ? String(variantId) : null)
      };
    });
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
    fields: "id,product_id,sku,inventory_item_id,title",
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
     WHERE mo.status = 'released'
     GROUP BY mmr.material_id`
  ).all();
  return new Map(rows.map((row) => [Number(row.material_id), round2(row.qty)]));
}

function incomingProductBySku() {
  const rows = db().prepare(
    `SELECT product_sku, COALESCE(SUM(quantity), 0) AS qty
     FROM manufacturing_order_lines mol
     JOIN manufacturing_orders mo ON mo.id = mol.manufacturing_order_id
     WHERE mo.status IN ('draft', 'released')
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
      const quantity = Math.max(0, Math.floor(getOrderLineRemainingQuantity(line)));
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

function supplierOptionsForMaterial(materialId) {
  return db().prepare(
    `SELECT
      sm.id,
      sm.supplier_id,
      sm.material_id,
      sm.supplier_sku,
      sm.is_preferred,
      sm.price_per_unit,
      sm.min_order_qty,
      sm.lead_time_days,
      sm.created_at,
      sm.updated_at,
      s.name AS supplier_name,
      s.email AS supplier_email,
      s.contact_name AS supplier_contact_name,
      s.phone AS supplier_phone
     FROM supplier_materials sm
     JOIN suppliers s ON s.id = sm.supplier_id
     WHERE sm.material_id = ?
     ORDER BY sm.is_preferred DESC, s.name ASC, sm.id ASC`
  ).all(Number(materialId)).map((row) => ({
    id: Number(row.id),
    supplier_id: Number(row.supplier_id),
    material_id: Number(row.material_id),
    supplier_sku: row.supplier_sku || null,
    is_preferred: Number(row.is_preferred || 0) === 1,
    price_per_unit: round2(row.price_per_unit),
    min_order_qty: round2(row.min_order_qty),
    lead_time_days: Math.max(0, Math.floor(asNumber(row.lead_time_days, 0))),
    supplier: {
      id: Number(row.supplier_id),
      name: String(row.supplier_name || "").trim(),
      email: row.supplier_email || null,
      contact_name: row.supplier_contact_name || null,
      phone: row.supplier_phone || null
    }
  }));
}

function supplierOptionForMaterial(materialId, supplierId = null) {
  const options = supplierOptionsForMaterial(materialId);
  if (!options.length) return null;
  if (supplierId == null) return options.find((option) => option.is_preferred) || options[0] || null;
  return options.find((option) => Number(option.supplier_id) === Number(supplierId)) || null;
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

function activeAllocationQtyByBatch() {
  const rows = db().prepare(
    `SELECT
      mma.batch_id,
      COALESCE(SUM(mma.allocated_qty), 0) AS qty
     FROM manufacturing_material_allocations mma
     JOIN manufacturing_material_requirements mmr
       ON mmr.id = mma.manufacturing_requirement_id
     JOIN manufacturing_orders mo
       ON mo.id = mmr.manufacturing_order_id
     WHERE mma.batch_id IS NOT NULL
       AND mo.status = 'released'
     GROUP BY mma.batch_id`
  ).all();
  return new Map(rows.map((row) => [Number(row.batch_id), round2(row.qty)]));
}

function activeAllocationQtyByRequirement() {
  const rows = db().prepare(
    `SELECT
      mma.manufacturing_requirement_id,
      COALESCE(SUM(mma.allocated_qty), 0) AS qty
     FROM manufacturing_material_allocations mma
     JOIN manufacturing_material_requirements mmr
       ON mmr.id = mma.manufacturing_requirement_id
     JOIN manufacturing_orders mo
       ON mo.id = mmr.manufacturing_order_id
     WHERE mo.status = 'released'
     GROUP BY mma.manufacturing_requirement_id`
  ).all();
  return new Map(rows.map((row) => [Number(row.manufacturing_requirement_id), round2(row.qty)]));
}

function ensureOpeningBalanceBatchesForMaterials(materialIds = []) {
  ensureOperationalSeedData();
  const onHandByMaterial = materialStockById();
  const ids = uniqueBy(
    (Array.isArray(materialIds) && materialIds.length
      ? materialIds
      : Array.from(onHandByMaterial.keys())
    ).map((materialId) => Number(materialId)).filter((materialId) => materialId > 0)
  );
  if (!ids.length) return [];

  const conn = db();
  const created = [];
  const tx = conn.transaction(() => {
    ids.forEach((materialId) => {
      const onHand = round2(onHandByMaterial.get(Number(materialId)));
      if (!(onHand > 0)) return;
      const material = materialById(materialId);
      if (!material) return;
      const representedRow = conn.prepare(
        `SELECT COALESCE(SUM(qty_remaining), 0) AS represented_qty
         FROM batches
         WHERE material_id = ?`
      ).get(Number(materialId));
      const representedQty = round2(representedRow?.represented_qty);
      const openingQty = round2(onHand - representedQty);
      if (!(openingQty > 0)) return;

      const batchCode = buildBatchCode(`OB-${safeSlug(material.sku || material.title || String(material.id)).slice(0, 10).toUpperCase()}`);
      const result = conn.prepare(
        `INSERT INTO batches (
          batch_code,
          batch_type,
          material_id,
          qty_total,
          qty_remaining,
          details_json,
          created_at,
          updated_at
        ) VALUES (?, 'opening', ?, ?, ?, ?, ?, ?)`
      ).run(
        batchCode,
        Number(materialId),
        openingQty,
        openingQty,
        JSON.stringify({
          reason: "auto_opening_balance_backfill",
          material_sku: material.sku,
          material_title: material.title,
          represented_qty: representedQty
        }),
        now(),
        now()
      );
      created.push({
        id: Number(result.lastInsertRowid),
        batch_code: batchCode,
        material_id: Number(materialId),
        qty_total: openingQty,
        qty_remaining: openingQty
      });
    });
  });
  tx();
  return created;
}

function listAllocatableBatchesForMaterial(materialId) {
  ensureOpeningBalanceBatchesForMaterials([materialId]);
  const activeAllocatedByBatch = activeAllocationQtyByBatch();
  return db().prepare(
    `SELECT
      b.*,
      m.sku AS material_sku,
      m.title AS material_title,
      s.name AS supplier_name
     FROM batches b
     LEFT JOIN materials m ON m.id = b.material_id
     LEFT JOIN suppliers s ON s.id = b.supplier_id
     WHERE b.material_id = ?
       AND b.batch_type IN ('receipt', 'opening')
       AND COALESCE(b.qty_remaining, 0) > 0
     ORDER BY
       CASE WHEN b.expiry_date IS NULL OR TRIM(b.expiry_date) = '' THEN 1 ELSE 0 END ASC,
       b.expiry_date ASC,
       b.created_at ASC,
       b.id ASC`
  ).all(Number(materialId)).map((batch) => {
    const reserved = asNumber(activeAllocatedByBatch.get(Number(batch.id)), 0);
    const available_to_allocate = round2(Math.max(0, asNumber(batch.qty_remaining, 0) - reserved));
    return {
      ...batch,
      available_to_allocate,
      supplier_name: batch.supplier_name || null,
      details: parseJson(batch.details_json, {})
    };
  }).filter((batch) => batch.available_to_allocate > 0);
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

function normalizeMaterialSupplierOptions(payload = {}, existing = null) {
  const rawOptions = Array.isArray(payload?.supplier_options)
    ? payload.supplier_options
    : Array.isArray(payload?.supplierOptions)
      ? payload.supplierOptions
      : null;

  if (rawOptions) {
    return rawOptions
      .map((entry) => ({
        supplier_id: Number(entry?.supplier_id ?? entry?.supplierId ?? 0),
        supplier_sku: String(entry?.supplier_sku ?? entry?.supplierSku ?? "").trim() || null,
        is_preferred: asBooleanFlag(entry?.is_preferred ?? entry?.isPreferred, false),
        price_per_unit: round2(entry?.price_per_unit ?? entry?.pricePerUnit),
        min_order_qty: round2(entry?.min_order_qty ?? entry?.minOrderQty),
        lead_time_days: Math.max(0, Math.floor(asNumber(entry?.lead_time_days ?? entry?.leadTimeDays, 0)))
      }))
      .filter((entry) => entry.supplier_id > 0);
  }

  const preferredSupplierId = Number(payload?.preferred_supplier_id || payload?.preferredSupplierId || payload?.supplier_id || 0);
  if (preferredSupplierId > 0) {
    return [{
      supplier_id: preferredSupplierId,
      supplier_sku: String(payload?.supplier_sku || "").trim() || null,
      is_preferred: true,
      price_per_unit: round2(payload?.price_per_unit),
      min_order_qty: round2(payload?.min_order_qty),
      lead_time_days: Math.max(0, Math.floor(asNumber(payload?.lead_time_days ?? existing?.lead_time_days, 0)))
    }];
  }

  return [];
}

function replaceSupplierOptionsForMaterial(materialId, payload = {}, existing = null) {
  const options = normalizeMaterialSupplierOptions(payload, existing);
  const explicitOptionsProvided = Array.isArray(payload?.supplier_options) || Array.isArray(payload?.supplierOptions);
  if (!options.length && !explicitOptionsProvided) return;
  const conn = db();
  const timestamp = now();
  if (!options.length) {
    conn.prepare("DELETE FROM supplier_materials WHERE material_id = ?").run(Number(materialId));
    return;
  }
  const validated = uniqueBy(options, (entry) => String(entry.supplier_id))
    .map((entry, index) => {
      const supplier = getSupplierById(entry.supplier_id);
      if (!supplier) {
        throw new Error(`Supplier ${entry.supplier_id} was not found`);
      }
      return {
        supplier_id: Number(entry.supplier_id),
        supplier_sku: entry.supplier_sku,
        is_preferred: Boolean(entry.is_preferred) || index === 0,
        price_per_unit: round2(entry.price_per_unit),
        min_order_qty: round2(entry.min_order_qty),
        lead_time_days: Math.max(0, Math.floor(asNumber(entry.lead_time_days, 0)))
      };
    });
  if (!validated.some((entry) => entry.is_preferred)) {
    validated[0].is_preferred = true;
  }

  conn.prepare(
    `DELETE FROM supplier_materials
     WHERE material_id = ?`
  ).run(Number(materialId));

  validated.forEach((entry) => {
    conn.prepare(
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      Number(entry.supplier_id),
      Number(materialId),
      entry.supplier_sku,
      entry.is_preferred ? 1 : 0,
      round2(entry.price_per_unit),
      round2(entry.min_order_qty),
      Math.max(0, Math.floor(asNumber(entry.lead_time_days, 0))),
      timestamp,
      timestamp
    );
  });
}

export async function listCatalogProducts(options = {}) {
  ensureOperationalSeedData();
  const useLiveMetrics = options?.live !== false && options?.liveMetrics !== false;
  const movementStock = productMovementStockBySku();
  const incoming = incomingProductBySku();
  const demand = useLiveMetrics
    ? await fetchOpenOrderDemandBySku().catch(() => new Map())
    : new Map();
  const liveStock = useLiveMetrics
    ? await fetchProductInventoryMap().catch(() => new Map())
    : new Map();
  return productCatalog().map((product) => {
    const moved = movementStock.get(product.sku);
    const hasLiveInventory = liveStock.has(product.sku);
    const onHand = hasLiveInventory ? asNumber(liveStock.get(product.sku), 0) : asNumber(moved, 0);
    const openDemand = asNumber(demand.get(product.sku), 0);
    const freeStock = round2(onHand - openDemand);
    const plannedIncoming = asNumber(incoming.get(product.sku), 0);
    return {
      id: Number(product.id),
      sku: product.sku,
      title: product.title,
      flavour: product.flavour || "",
      variantId: product.variantId || null,
      size: product.size || "",
      weight_kg: round2(product.weightKg),
      crate_units: Math.max(0, Math.floor(asNumber(product.crateUnits, 0))),
      is_active: product.isActive ? 1 : 0,
      status_label: product.status,
      on_hand: round2(onHand),
      open_demand: openDemand,
      free_stock: freeStock,
      planned_incoming: plannedIncoming,
      committed: openDemand,
      available: freeStock,
      incoming: plannedIncoming,
      status: freeStock < 0 ? "short" : freeStock === 0 ? "empty" : "ok",
      inventory_source: hasLiveInventory ? "shopify" : "local",
      demand_source: useLiveMetrics
        ? hasShopifyConfig() ? "shopify_open_orders" : "unavailable"
        : "disabled",
      shopify_product_id: product.shopify_product_id || null,
      shopify_variant_id: product.shopify_variant_id || null
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
  const supplierOptionsByMaterialId = new Map();
  db().prepare(
    `SELECT
      sm.id,
      sm.material_id,
      sm.supplier_id,
      sm.supplier_sku,
      sm.is_preferred,
      sm.price_per_unit,
      sm.min_order_qty,
      sm.lead_time_days,
      s.name AS supplier_name,
      s.email AS supplier_email,
      s.contact_name AS supplier_contact_name,
      s.phone AS supplier_phone
     FROM supplier_materials sm
     JOIN suppliers s ON s.id = sm.supplier_id
     ORDER BY sm.material_id ASC, sm.is_preferred DESC, s.name ASC, sm.id ASC`
  ).all().forEach((row) => {
    const key = Number(row.material_id);
    const options = supplierOptionsByMaterialId.get(key) || [];
    options.push({
      id: Number(row.id),
      supplier_id: Number(row.supplier_id),
      material_id: Number(row.material_id),
      supplier_sku: row.supplier_sku || null,
      is_preferred: Number(row.is_preferred || 0) === 1,
      price_per_unit: round2(row.price_per_unit),
      min_order_qty: round2(row.min_order_qty),
      lead_time_days: Math.max(0, Math.floor(asNumber(row.lead_time_days, 0))),
      supplier: {
        id: Number(row.supplier_id),
        name: row.supplier_name || null,
        email: row.supplier_email || null,
        contact_name: row.supplier_contact_name || null,
        phone: row.supplier_phone || null
      }
    });
    supplierOptionsByMaterialId.set(key, options);
  });
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
    const supplierOptions = supplierOptionsByMaterialId.get(Number(material.id)) || [];
    const preferredSupplierOption = supplierOptions.find((option) => option.is_preferred) || null;
    return {
      id: material.id,
      sku: material.sku,
      title: material.title,
      category: material.category,
      uom: material.uom,
      icon: material.icon || "*",
      preferred_supplier: preferredSupplierOption
        ? {
            id: preferredSupplierOption.supplier.id,
            name: preferredSupplierOption.supplier.name,
            email: preferredSupplierOption.supplier.email,
            contact_name: preferredSupplierOption.supplier.contact_name,
            phone: preferredSupplierOption.supplier.phone,
            supplier_sku: preferredSupplierOption.supplier_sku,
            price_per_unit: preferredSupplierOption.price_per_unit,
            min_order_qty: preferredSupplierOption.min_order_qty,
            lead_time_days: preferredSupplierOption.lead_time_days
          }
        : null,
      supplier_options: supplierOptions.map((option) => ({
        id: option.id,
        supplier_id: option.supplier_id,
        supplier_sku: option.supplier_sku,
        is_preferred: option.is_preferred,
        price_per_unit: option.price_per_unit,
        min_order_qty: option.min_order_qty,
        lead_time_days: option.lead_time_days,
        supplier: { ...option.supplier }
      })),
      on_hand: round2(onHand),
      allocated,
      available: round2(onHand - allocated),
      reorder_point: round2(material.reorder_point),
      lead_time_days: Number(preferredSupplierOption?.lead_time_days || material.preferred_lead_time_days || 0),
      batch_count: Number(batchCounts.get(Number(material.id)) || 0),
      status: onHand - allocated <= material.reorder_point ? "reorder" : "ok",
      mapping_status: supplierOptions.length ? "mapped" : "missing_supplier_mapping",
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

export async function listCatalogMaterials(options = {}) {
  const baseMaterials = listCatalogMaterialsBase();
  const useLiveInventory = options?.live !== false && options?.liveInventory !== false;
  if (!useLiveInventory || !hasShopifyConfig() || !baseMaterials.length) return baseMaterials;

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
  const materialCounts = new Map(
    db().prepare(
      `SELECT supplier_id, COUNT(*) AS material_count
       FROM supplier_materials
       GROUP BY supplier_id`
    ).all().map((row) => [Number(row.supplier_id), Number(row.material_count || 0)])
  );
  return listDbSuppliers().map((supplier) => ({
    ...supplier,
    material_count: Number(materialCounts.get(Number(supplier.id)) || 0)
  }));
}

async function buildCatalogProductResponse(productRecord) {
  if (!productRecord) return null;
  const lookupNeeded = hasShopifyConfig() && !asPositiveInteger(productRecord.shopify_variant_id, null);
  const shopifyLookup = lookupNeeded
    ? await fetchShopifyVariantBySkuExact(productRecord.sku).catch(() => null)
    : null;
  return {
    product: (await listCatalogProducts()).find((entry) => Number(entry.id) === Number(productRecord.id)) || null,
    shopify_lookup: shopifyLookup
      ? {
          product_id: asPositiveInteger(shopifyLookup.product_id, null),
          variant_id: asPositiveInteger(shopifyLookup.id, null),
          inventory_item_id: asPositiveInteger(shopifyLookup.inventory_item_id, null),
          title: shopifyLookup.title || null,
          sku: shopifyLookup.sku || null
        }
      : null
  };
}

export async function createCatalogProduct(payload = {}) {
  ensureOperationalSeedData();
  const requestId = payload?.request_id || nextRequestId("catalog-product");
  const result = upsertProduct(payload || {});
  if (result?.error) return result;
  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "catalog",
    action: "product_created",
    entity_type: "product",
    entity_id: String(result.product?.id || ""),
    request_id: requestId,
    details: {
      sku: result.product?.sku || null,
      title: result.product?.title || null
    }
  });
  return {
    ...(await buildCatalogProductResponse(result.product)),
    request_id: requestId
  };
}

export async function updateCatalogProduct(productId, payload = {}) {
  ensureOperationalSeedData();
  const existing = getProductById(productId);
  if (!existing) return { error: "Product not found" };
  const requestId = payload?.request_id || nextRequestId("catalog-product-update");
  const result = upsertProduct({ ...payload, id: Number(productId) });
  if (result?.error) return result;
  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "catalog",
    action: "product_updated",
    entity_type: "product",
    entity_id: String(productId),
    request_id: requestId,
    details: {
      sku: result.product?.sku || null,
      title: result.product?.title || null
    }
  });
  return {
    ...(await buildCatalogProductResponse(result.product)),
    request_id: requestId
  };
}

export function createCatalogSupplier(payload = {}) {
  ensureOperationalSeedData();
  const requestId = payload?.request_id || nextRequestId("catalog-supplier");
  const result = createSupplier(payload || {});
  if (result?.error) return result;
  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "catalog",
    action: "supplier_created",
    entity_type: "supplier",
    entity_id: String(result.supplier?.id || ""),
    request_id: requestId,
    details: {
      name: result.supplier?.name || null
    }
  });
  return {
    supplier: {
      ...result.supplier,
      material_count: 0
    },
    request_id: requestId
  };
}

export function updateCatalogSupplier(supplierId, payload = {}) {
  ensureOperationalSeedData();
  const existing = getSupplierById(supplierId);
  if (!existing) return { error: "Supplier not found" };
  const requestId = payload?.request_id || nextRequestId("catalog-supplier-update");
  const result = updateSupplier(supplierId, payload || {});
  if (result?.error) return result;
  const materialCount = Number(
    db().prepare(
      `SELECT COUNT(*) AS count
       FROM supplier_materials
       WHERE supplier_id = ?`
    ).get(Number(supplierId))?.count || 0
  );
  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "catalog",
    action: "supplier_updated",
    entity_type: "supplier",
    entity_id: String(supplierId),
    request_id: requestId,
    details: {
      name: result.supplier?.name || null
    }
  });
  return {
    supplier: {
      ...result.supplier,
      material_count: materialCount
    },
    request_id: requestId
  };
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
    replaceSupplierOptionsForMaterial(result.lastInsertRowid, payload);
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
    replaceSupplierOptionsForMaterial(Number(materialId), payload, existing);
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
    listCatalogMaterials()
  ]);
  return { products, materials };
}

export function listInventoryBatches(filters = {}) {
  ensureOperationalSeedData();
  ensureOpeningBalanceBatchesForMaterials();
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

export function getInventoryBatchDetail(batchId) {
  ensureOperationalSeedData();
  const conn = db();
  const batch = conn.prepare(
    `SELECT
      b.*,
      m.sku AS material_sku,
      m.title AS material_title,
      m.uom AS material_uom,
      s.name AS supplier_name,
      s.email AS supplier_email,
      po.status AS purchase_order_status,
      po.shopify_draft_order_name AS purchase_order_name,
      mo.status AS manufacturing_order_status,
      mo.target_date AS manufacturing_target_date
     FROM batches b
     LEFT JOIN materials m ON m.id = b.material_id
     LEFT JOIN suppliers s ON s.id = b.supplier_id
     LEFT JOIN purchase_orders po ON po.id = b.purchase_order_id
     LEFT JOIN manufacturing_orders mo ON mo.id = b.manufacturing_order_id
     WHERE b.id = ?`
  ).get(Number(batchId));
  if (!batch) return null;

  const movements = conn.prepare(
    `SELECT *
     FROM stock_movements
     WHERE batch_id = ?
     ORDER BY occurred_at ASC, id ASC`
  ).all(Number(batchId)).map((row) => ({
    ...row,
    details: parseJson(row.details_json, {})
  }));

  const upstreamAllocations = conn.prepare(
    `SELECT
      mma.id,
      mma.allocated_qty,
      mma.created_at,
      mmr.id AS manufacturing_requirement_id,
      mmr.material_id,
      mmr.required_qty,
      mo.id AS manufacturing_order_id,
      mo.status AS manufacturing_order_status,
      finished_batch.id AS finished_batch_id,
      finished_batch.batch_code AS finished_batch_code,
      finished_batch.product_sku AS finished_product_sku
     FROM manufacturing_material_allocations mma
     JOIN manufacturing_material_requirements mmr
       ON mmr.id = mma.manufacturing_requirement_id
     JOIN manufacturing_orders mo
       ON mo.id = mmr.manufacturing_order_id
     LEFT JOIN batches finished_batch
       ON finished_batch.manufacturing_order_id = mo.id
      AND finished_batch.batch_type = 'finished'
     WHERE mma.batch_id = ?
     ORDER BY mma.created_at ASC, mma.id ASC`
  ).all(Number(batchId));

  const downstreamLinks = conn.prepare(
    `SELECT DISTINCT
      mo.id AS manufacturing_order_id,
      mo.status AS manufacturing_order_status,
      finished_batch.id AS finished_batch_id,
      finished_batch.batch_code AS finished_batch_code,
      finished_batch.product_sku AS finished_product_sku
     FROM manufacturing_material_allocations mma
     JOIN manufacturing_material_requirements mmr
       ON mmr.id = mma.manufacturing_requirement_id
     JOIN manufacturing_orders mo
       ON mo.id = mmr.manufacturing_order_id
     LEFT JOIN batches finished_batch
       ON finished_batch.manufacturing_order_id = mo.id
      AND finished_batch.batch_type = 'finished'
     WHERE mma.batch_id = ?
     ORDER BY mo.id DESC`
  ).all(Number(batchId));

  const finishedBatchSources = batch.batch_type === "finished" && batch.manufacturing_order_id
    ? conn.prepare(
      `SELECT
        mma.id,
        mma.allocated_qty,
        source_batch.id AS source_batch_id,
        source_batch.batch_code AS source_batch_code,
        source_batch.batch_type AS source_batch_type,
        source_batch.expiry_date AS source_expiry_date,
        source_batch.supplier_lot AS source_supplier_lot,
        material.sku AS material_sku,
        material.title AS material_title
       FROM manufacturing_material_allocations mma
       JOIN manufacturing_material_requirements mmr
         ON mmr.id = mma.manufacturing_requirement_id
       LEFT JOIN batches source_batch
         ON source_batch.id = mma.batch_id
       LEFT JOIN materials material
         ON material.id = mmr.material_id
       WHERE mmr.manufacturing_order_id = ?
       ORDER BY source_batch.expiry_date ASC, source_batch.created_at ASC, source_batch.id ASC`
    ).all(Number(batch.manufacturing_order_id))
    : [];

  return {
    ...batch,
    details: parseJson(batch.details_json, {}),
    source_document: batch.purchase_order_id
      ? {
          type: "purchase_order",
          id: Number(batch.purchase_order_id),
          status: batch.purchase_order_status || null,
          label: batch.purchase_order_name || `PO #${batch.purchase_order_id}`
        }
      : batch.manufacturing_order_id
        ? {
            type: "manufacturing_order",
            id: Number(batch.manufacturing_order_id),
            status: batch.manufacturing_order_status || null,
            label: `MO #${batch.manufacturing_order_id}`
          }
        : null,
    supplier: batch.supplier_id
      ? {
          id: Number(batch.supplier_id),
          name: batch.supplier_name || null,
          email: batch.supplier_email || null
        }
      : null,
    movements,
    upstream_allocations: upstreamAllocations,
    downstream_batches: downstreamLinks,
    finished_batch_sources: finishedBatchSources
  };
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

function formatDocumentDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || "").trim() || "-";
  return date.toISOString().slice(0, 10);
}

function renderIncomingVehicleInspectionPage(doc, inspectionInput = {}) {
  const inspection = buildIncomingVehicleInspectionSheet(inspectionInput);
  const blank = (value, width = 30) => String(value || "").trim() || "_".repeat(width);
  const writeField = (label, value, width = 30) => {
    doc.font("Helvetica-Bold").fillColor("#0f172a").text(`${label}: `, { continued: true });
    doc.font("Helvetica").fillColor("#475569").text(blank(value, width));
  };

  doc.addPage();
  doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(18).text("Incoming Vehicle Inspection Sheet");
  doc.moveDown(0.3);
  doc.font("Helvetica").fillColor("#475569").fontSize(10).text(
    "Complete this sheet when goods arrive and keep it with the receipt and traceability paperwork."
  );
  doc.moveDown(1);

  writeField("Supplier", inspection.supplierName);
  writeField("PO number", inspection.purchaseOrderNumber);
  writeField("PO date", inspection.date);
  writeField("Receipt date", inspection.receiptDate);
  writeField("Vehicle registration", inspection.vehicleRegistrationNumber);
  writeField("Driver", inspection.driverName);
  writeField("Delivery reference", inspection.deliveryReference);
  writeField("COA/COC reference", inspection.coaReference);

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(12).text("Inspection checks");
  doc.moveDown(0.3);
  inspection.checks.forEach((check, index) => {
    doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(10).text(`${index + 1}. ${check.question}`);
    doc.font("Helvetica").fillColor("#475569").text(
      `Answer: ${check.answer ? check.answer.toUpperCase() : "YES / NO"}    Initials: __________`
    );
    doc.moveDown(0.35);
  });

  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fillColor("#0f172a").text("Notes");
  doc.font("Helvetica").fillColor("#475569").text(blank(inspection.notes, 100));
  doc.text("_".repeat(100));
  doc.text("_".repeat(100));

  doc.moveDown(0.8);
  writeField("Checked by", inspection.checkedBy, 24);
  doc.font("Helvetica-Bold").fillColor("#0f172a").text("Signature: ", { continued: true });
  doc.font("Helvetica").fillColor("#475569").text("_".repeat(28), { continued: true });
  doc.font("Helvetica-Bold").fillColor("#0f172a").text("    Time in/out: ", { continued: true });
  doc.font("Helvetica").fillColor("#475569").text("_".repeat(20));
}

async function buildPurchaseOrderPdfBase64({ purchaseOrder, supplier, lines = [], requestId = null }) {
  ensureGeneratedDir();
  const title = `Purchase Order ${purchaseOrder.id} - ${supplier.name}`;
  const fileName = `${safeSlug(title)}-${Date.now()}.pdf`;
  const filePath = path.join(GENERATED_DIR, fileName);
  const doc = new PDFDocument({ margin: 48, compress: false });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(20).text(title);
  doc.moveDown(0.35);
  [
    ["Supplier", supplier.name || "-"],
    ["Supplier email", supplier.email || "-"],
    ["PO number", String(purchaseOrder.id || "-")],
    ["Status", purchaseOrder.status || "ordered"],
    ["Created", formatDocumentDate(purchaseOrder.created_at)],
    ["Request", purchaseOrder.request_id || requestId || "-"]
  ].forEach(([label, value]) => {
    doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(10).text(`${label}: `, { continued: true });
    doc.font("Helvetica").fillColor("#475569").text(String(value || "-"));
  });

  doc.moveDown(0.9);
  doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(12).text("Ordered lines");
  doc.moveDown(0.35);
  lines.forEach((line, index) => {
    const lineTitle = line.title_snapshot || line.title || "Item";
    const lineSku = line.sku_snapshot || line.sku || "no-sku";
    const lineQty = round2(line.quantity);
    const lineUom = line.uom_snapshot || line.uom || "unit";
    doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(10).text(`${index + 1}. ${lineTitle}`);
    doc.font("Helvetica").fillColor("#475569").text(`SKU: ${lineSku}    Qty: ${lineQty} ${lineUom}`.trim());
    doc.moveDown(0.25);
  });

  if (purchaseOrder.note) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(12).text("Notes");
    doc.font("Helvetica").fillColor("#475569").fontSize(10).text(String(purchaseOrder.note));
  }

  doc.moveDown(0.9);
  doc.font("Helvetica").fillColor("#475569").fontSize(10).text(
    "Incoming vehicle inspection sheet attached on the next page for receipt traceability."
  );

  renderIncomingVehicleInspectionPage(doc, {
    supplierName: supplier.name,
    purchaseOrderNumber: String(purchaseOrder.id || ""),
    date: formatDocumentDate(purchaseOrder.created_at)
  });

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  const pdfBase64 = fs.readFileSync(filePath).toString("base64");
  return { filePath, pdfBase64 };
}

async function sendPrintNodeJob({ title, pdfBase64, documentType = "printDocs", printerId = null }) {
  if (!hasPrintNodeConfig()) {
    return { ok: false, skipped: true, reason: "PRINTNODE_NOT_CONFIGURED" };
  }
  const resolvedPrinterId = resolveDocumentPrinterId(documentType, printerId);
  if (!resolvedPrinterId) {
    return { ok: false, skipped: true, reason: "PRINTER_NOT_CONFIGURED", document_type: documentType };
  }
  const payload = {
    printerId: Number(resolvedPrinterId),
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
  return { ok: true, data: body, printer_id: Number(resolvedPrinterId), document_type: documentType };
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

function normalizePurchaseDispatchOptions(payload = {}) {
  const source = payload?.dispatch || payload?.dispatch_channels || payload?.dispatchChannels || {};
  return {
    shopify: source?.shopify !== undefined ? asBooleanFlag(source.shopify, true) : true,
    email: source?.email !== undefined ? asBooleanFlag(source.email, true) : true,
    print: source?.print !== undefined ? asBooleanFlag(source.print, true) : true
  };
}

function normalizePurchaseSelections(selections = []) {
  return (Array.isArray(selections) ? selections : [])
    .map((selection) => ({
      material_id: Number(selection?.material_id || selection?.materialId || 0),
      requested_qty: round2(selection?.quantity ?? selection?.requested_qty ?? selection?.requestedQty),
      supplier_id: Number(selection?.supplier_id || selection?.supplierId || 0) || null
    }))
    .filter((selection) => selection.material_id > 0 && selection.requested_qty > 0);
}

function buildPurchaseOrderPlan({ selections = [], note = "", dispatch = {} } = {}) {
  ensureOperationalSeedData();
  const normalizedSelections = normalizePurchaseSelections(selections);
  if (!normalizedSelections.length) {
    return {
      ok: false,
      errors: [{ code: "NO_SELECTIONS", message: "At least one material selection is required" }],
      warnings: [],
      groups: [],
      note: String(note || ""),
      dispatch: normalizePurchaseDispatchOptions({ dispatch })
    };
  }

  const errors = [];
  const warnings = [];
  const grouped = new Map();

  normalizedSelections.forEach((selection) => {
    const material = materialById(selection.material_id);
    if (!material) {
      errors.push({
        code: "MATERIAL_NOT_FOUND",
        material_id: selection.material_id,
        message: `Material ${selection.material_id} was not found`
      });
      return;
    }
    const supplierOption = supplierOptionForMaterial(selection.material_id, selection.supplier_id);
    if (!supplierOption?.supplier?.id) {
      errors.push({
        code: "SUPPLIER_MAPPING_MISSING",
        material_id: Number(material.id),
        material_sku: material.sku,
        material_title: material.title,
        message: `Material ${material.title} has no supplier mapping`
      });
      return;
    }
    const requestedQty = round2(selection.requested_qty);
    const minOrderQty = round2(supplierOption.min_order_qty);
    const orderQty = round2(Math.max(requestedQty, minOrderQty || 0));
    if (orderQty > requestedQty && minOrderQty > 0) {
      warnings.push({
        code: "MOQ_APPLIED",
        material_id: Number(material.id),
        material_sku: material.sku,
        requested_qty: requestedQty,
        order_qty: orderQty,
        min_order_qty: minOrderQty,
        message: `${material.sku} increased to MOQ ${minOrderQty}`
      });
    }
    const groupKey = String(supplierOption.supplier.id);
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        supplier: {
          id: Number(supplierOption.supplier.id),
          name: supplierOption.supplier.name,
          email: supplierOption.supplier.email || null,
          contact_name: supplierOption.supplier.contact_name || null,
          phone: supplierOption.supplier.phone || null
        },
        items: []
      });
    }
    grouped.get(groupKey).items.push({
      material_id: Number(material.id),
      material_sku: material.sku,
      material_title: material.title,
      category: material.category,
      uom: material.uom || "unit",
      requested_qty: requestedQty,
      order_qty: orderQty,
      supplier_id: Number(supplierOption.supplier.id),
      supplier_name: supplierOption.supplier.name || null,
      supplier_sku: supplierOption.supplier_sku || null,
      min_order_qty: minOrderQty,
      price_per_unit: round2(supplierOption.price_per_unit),
      lead_time_days: Math.max(0, Math.floor(asNumber(supplierOption.lead_time_days, material.lead_time_days))),
      is_preferred: Boolean(supplierOption.is_preferred),
      free_stock: round2(asNumber(materialStockById().get(Number(material.id)), 0) - asNumber(reservedMaterialById().get(Number(material.id)), 0)),
      reorder_point: round2(material.reorder_point)
    });
  });

  const groups = Array.from(grouped.values()).map((group) => ({
    ...group,
    item_count: group.items.length,
    total_order_qty: round2(group.items.reduce((sum, item) => sum + asNumber(item.order_qty, 0), 0))
  })).sort((left, right) => String(left.supplier?.name || "").localeCompare(String(right.supplier?.name || "")));

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    groups,
    note: String(note || ""),
    dispatch: normalizePurchaseDispatchOptions({ dispatch }),
    selection_count: normalizedSelections.length
  };
}

function derivePurchaseOrderLifecycleStatus(purchaseOrderId, conn = db()) {
  const totals = conn.prepare(
    `SELECT
      COALESCE(SUM(quantity), 0) AS ordered_qty,
      COALESCE(SUM(received_qty), 0) AS received_qty,
      COUNT(*) AS line_count
     FROM purchase_order_lines
     WHERE purchase_order_id = ?`
  ).get(Number(purchaseOrderId));
  const orderedQty = round2(totals?.ordered_qty);
  const receivedQty = round2(totals?.received_qty);
  if (orderedQty > 0 && receivedQty >= orderedQty) return "received";
  if (receivedQty > 0) return "partially_received";
  return "ordered";
}

function hydratePurchaseOrderRow(row, conn = db()) {
  const dispatches = conn.prepare(
    `SELECT *
     FROM purchase_order_dispatches
     WHERE purchase_order_id = ?
     ORDER BY channel ASC`
  ).all(row.id).map((dispatch) => ({
    ...dispatch,
    details: parseJson(dispatch.details_json, {})
  }));
  const lines = conn.prepare(
    `SELECT *
     FROM purchase_order_lines
     WHERE purchase_order_id = ?
     ORDER BY id ASC`
  ).all(row.id);
  const failedChannels = dispatches
    .filter((dispatch) => dispatch.status === "failed")
    .map((dispatch) => dispatch.channel);
  return {
    ...row,
    lifecycle_status: String(row.status || ""),
    has_dispatch_failures: failedChannels.length > 0,
    failed_channels: failedChannels,
    can_receive: !["received", "cancelled"].includes(String(row.status || "")),
    dispatches,
    lines
  };
}

export async function previewBuyPurchaseOrders(payload = {}) {
  const requestId = payload?.request_id || nextRequestId("buy-preview");
  const plan = buildPurchaseOrderPlan(payload || {});
  return {
    ok: plan.ok,
    request_id: requestId,
    ...plan
  };
}

async function createPurchaseOrdersInternal({
  selections = [],
  note = "",
  dispatch = {},
  actor_type = "system",
  actor_id = "system",
  request_id = nextRequestId("buy")
}) {
  ensureOperationalSeedData();
  const conn = db();
  const plan = buildPurchaseOrderPlan({ selections, note, dispatch });
  if (!plan.ok) {
    return {
      error: plan.errors[0]?.message || "Purchase order validation failed",
      errors: plan.errors,
      warnings: plan.warnings,
      preview: plan
    };
  }
  const dispatchOptions = normalizePurchaseDispatchOptions({ dispatch });

  const results = [];
  for (const group of plan.groups) {
    const supplier = group.supplier;
    const items = group.items;
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
          ) VALUES (?, 'ordered', ?, ?, ?, ?)`
        ).run(supplier.id, note || null, request_id, now(), now());
        const poId = poResult.lastInsertRowid;
        items.forEach((item) => {
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
          ).run(
            poId,
            item.material_id,
            item.order_qty,
            item.material_title,
            item.material_sku,
            item.uom || "unit",
            now()
          );
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
      const purchaseOrder = conn.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(Number(purchaseOrderId));

      const title = `Purchase Order ${purchaseOrderId} - ${supplier.name}`;
      const pdf = await buildPurchaseOrderPdfBase64({
        purchaseOrder,
        supplier,
        lines: lineRows,
        requestId: request_id
      });

      conn.prepare("UPDATE purchase_orders SET generated_document_path = ?, updated_at = ? WHERE id = ?")
        .run(pdf.filePath, now(), purchaseOrderId);

      let shopifyResult = { ok: false, skipped: true, reason: "DISABLED_BY_REQUEST" };
      if (dispatchOptions.shopify) {
        shopifyResult = await createShopifyDraftOrder({
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
             SET shopify_draft_order_id = ?, shopify_draft_order_name = ?, shopify_admin_url = ?, updated_at = ?
             WHERE id = ?`
          ).run(shopifyResult.id, shopifyResult.name, shopifyResult.adminUrl, now(), purchaseOrderId);
          setPurchaseDispatchStatus(purchaseOrderId, "shopify", "success", shopifyResult);
        } else {
          setPurchaseDispatchStatus(purchaseOrderId, "shopify", "skipped", shopifyResult);
        }
      } else {
        setPurchaseDispatchStatus(purchaseOrderId, "shopify", "skipped", shopifyResult);
      }

      let emailResult = { ok: false, skipped: true, reason: "DISABLED_BY_REQUEST" };
      try {
        if (dispatchOptions.email) {
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
        }
        setPurchaseDispatchStatus(
          purchaseOrderId,
          "email",
          emailResult.ok ? "success" : emailResult.skipped ? "skipped" : "failed",
          emailResult
        );
      } catch (error) {
        emailResult = { ok: false, error: String(error?.message || error) };
        setPurchaseDispatchStatus(purchaseOrderId, "email", "failed", emailResult);
      }

      let printResult = { ok: false, skipped: true, reason: "DISABLED_BY_REQUEST" };
      try {
        if (dispatchOptions.print) {
          printResult = await sendPrintNodeJob({
            title,
            pdfBase64: pdf.pdfBase64,
            documentType: "purchaseOrder"
          });
        }
        setPurchaseDispatchStatus(
          purchaseOrderId,
          "print",
          printResult.ok ? "success" : printResult.skipped ? "skipped" : "failed",
          printResult
        );
      } catch (error) {
        printResult = { ok: false, error: String(error?.message || error) };
        setPurchaseDispatchStatus(purchaseOrderId, "print", "failed", printResult);
      }

      const resultStatus = [shopifyResult, emailResult, printResult].some((entry) => entry?.ok === false && !entry?.skipped)
        ? "partial"
        : "ok";

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
        status: resultStatus,
        details: {
          supplier_name: supplier.name,
          item_count: lineRows.length,
          warnings: plan.warnings.filter((warning) => items.some((item) => item.material_id === warning.material_id)),
          shopify: shopifyResult,
          email: emailResult,
          print: printResult
        }
      });

      results.push({
        purchase_order_id: purchaseOrderId,
        supplier: { id: supplier.id, name: supplier.name, email: supplier.email || null },
        status: resultStatus,
        lifecycle_status: "ordered",
        draft_order: shopifyResult,
        email: emailResult,
        print: printResult,
        document: { path: pdf.filePath, includes_incoming_vehicle_inspection: true },
        warnings: plan.warnings.filter((warning) => items.some((item) => item.material_id === warning.material_id))
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

export async function receiveBuyPurchaseOrder(purchaseOrderId, payload = {}) {
  const conn = db();
  const purchaseOrder = conn.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(Number(purchaseOrderId));
  if (!purchaseOrder) return { error: "Purchase order not found" };
  if (String(purchaseOrder.status || "") === "cancelled") return { error: "Cancelled purchase orders cannot be received" };
  const supplier = conn.prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(purchaseOrder.supplier_id));

  const lines = conn.prepare(
    `SELECT *
     FROM purchase_order_lines
     WHERE purchase_order_id = ?
     ORDER BY id ASC`
  ).all(Number(purchaseOrderId));
  const lineById = new Map(lines.map((line) => [Number(line.id), line]));
  const receivedEntries = [];
  (Array.isArray(payload?.lines) ? payload.lines : []).forEach((entry) => {
    const lineId = Number(entry?.purchase_order_line_id || entry?.purchaseOrderLineId || entry?.line_id || entry?.lineId || entry?.id || 0);
    const batches = Array.isArray(entry?.batches) && entry.batches.length ? entry.batches : [entry];
    batches.forEach((batchEntry) => {
      receivedEntries.push({
        line_id: lineId,
        received_qty: round2(batchEntry?.received_qty ?? batchEntry?.quantity ?? batchEntry?.qty),
        supplier_lot: String(batchEntry?.supplier_lot ?? batchEntry?.lot ?? "").trim() || null,
        batch_code: String(batchEntry?.batch_code || "").trim() || null,
        expiry_date: String(batchEntry?.expiry_date || "").trim() || null,
        coa_status: String(batchEntry?.coa_status || "").trim() || null,
        details: batchEntry?.details || null
      });
    });
  });

  if (!receivedEntries.length) {
    return { error: "At least one receipt line is required" };
  }

  const totalsByLineId = new Map();
  for (const entry of receivedEntries) {
    const line = lineById.get(Number(entry.line_id));
    if (!line) return { error: `Purchase order line ${entry.line_id} was not found` };
    if (!(entry.received_qty > 0)) return { error: `Receipt quantity for line ${entry.line_id} must be greater than zero` };
    totalsByLineId.set(Number(entry.line_id), round2((totalsByLineId.get(Number(entry.line_id)) || 0) + entry.received_qty));
  }

  for (const [lineId, totalReceived] of totalsByLineId.entries()) {
    const line = lineById.get(Number(lineId));
    const remainingQty = round2(asNumber(line.quantity, 0) - asNumber(line.received_qty, 0));
    if (totalReceived > remainingQty) {
      return {
        error: `Receipt quantity for line ${lineId} exceeds remaining quantity`,
        line_id: Number(lineId),
        remaining_qty: remainingQty,
        attempted_qty: totalReceived
      };
    }
  }

  const requestId = payload?.request_id || nextRequestId("buy-receive");
  const inspection = normalizeIncomingVehicleInspection(payload?.inspection, {
    supplierName: supplier?.name || "",
    purchaseOrderNumber: String(purchaseOrderId || ""),
    date: formatDocumentDate(purchaseOrder.created_at),
    receiptDate: formatDocumentDate(payload?.received_at || payload?.receivedAt || now())
  });
  const createdBatchIds = [];
  const shopifyTargets = [];
  const tx = conn.transaction(() => {
    receivedEntries.forEach((entry) => {
      const line = lineById.get(Number(entry.line_id));
      const material = materialById(line.material_id);
      if (!material) {
        throw new Error(`Material ${line.material_id} was not found`);
      }
      const batchCode = entry.batch_code || buildBatchCode("RCV");
      const result = conn.prepare(
        `INSERT INTO batches (
          batch_code,
          batch_type,
          material_id,
          supplier_id,
          purchase_order_id,
          qty_total,
          qty_remaining,
          supplier_lot,
          coa_status,
          expiry_date,
          details_json,
          created_at,
          updated_at
        ) VALUES (?, 'receipt', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        batchCode,
        Number(line.material_id),
        Number(purchaseOrder.supplier_id),
        Number(purchaseOrderId),
        entry.received_qty,
        entry.received_qty,
        entry.supplier_lot,
        entry.coa_status,
        entry.expiry_date,
        JSON.stringify({
          request_id: requestId,
          received_from_purchase_order_line_id: Number(entry.line_id),
          details: entry.details || null,
          inspection
        }),
        now(),
        now()
      );
      const batchId = Number(result.lastInsertRowid);
      createdBatchIds.push(batchId);

      conn.prepare(
        `INSERT INTO stock_movements (
          occurred_at,
          movement_type,
          material_id,
          batch_id,
          quantity,
          reference_type,
          reference_id,
          actor_type,
          actor_id,
          details_json
        ) VALUES (?, 'purchase_receipt', ?, ?, ?, 'purchase_order', ?, ?, ?, ?)`
      ).run(
        now(),
        Number(line.material_id),
        batchId,
        entry.received_qty,
        String(purchaseOrderId),
        payload?.actor_type || "system",
        payload?.actor_id || "system",
        JSON.stringify({
          purchase_order_line_id: Number(entry.line_id),
          supplier_lot: entry.supplier_lot,
          expiry_date: entry.expiry_date,
          coa_status: entry.coa_status,
          inspection
        })
      );

      conn.prepare(
        `UPDATE purchase_order_lines
         SET received_qty = COALESCE(received_qty, 0) + ?
         WHERE id = ?`
      ).run(entry.received_qty, Number(entry.line_id));

      shopifyTargets.push({
        entity_type: "material",
        material_id: Number(line.material_id),
        sku: material.sku,
        title: material.title,
        variant_id: asPositiveInteger(material.shopify_variant_id, null),
        inventory_item_id: asPositiveInteger(material.shopify_inventory_item_id, null),
        adjustment: Math.abs(toShopifyInventoryUnits(entry.received_qty, material))
      });
    });

    const lifecycleStatus = derivePurchaseOrderLifecycleStatus(Number(purchaseOrderId), conn);
    conn.prepare(
      `UPDATE purchase_orders
       SET status = ?, updated_at = ?
       WHERE id = ?`
    ).run(lifecycleStatus, now(), Number(purchaseOrderId));
  });

  try {
    tx();
  } catch (error) {
    return { error: String(error?.message || error) };
  }

  const uniqueTargets = uniqueBy(
    shopifyTargets.filter((target) => target.adjustment !== 0 && (target.variant_id || target.inventory_item_id)),
    (target) => `${target.material_id}:${target.variant_id || ""}:${target.inventory_item_id || ""}`
  ).map((target) => {
    const matching = shopifyTargets.filter((entry) => Number(entry.material_id) === Number(target.material_id));
    return {
      ...target,
      adjustment: matching.reduce((sum, entry) => sum + asNumber(entry.adjustment, 0), 0)
    };
  });
  const shopifySync = await syncDeltaShopifyInventoryTargets(uniqueTargets, {
    locationKey: payload?.location_key || payload?.locationKey || null
  });

  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "buy",
    action: "purchase_order_received",
    entity_type: "purchase_order",
    entity_id: String(purchaseOrderId),
    request_id: requestId,
    status: shopifySync.failed.length ? "partial" : "ok",
    details: {
      receipt_count: receivedEntries.length,
      batch_ids: createdBatchIds,
      shopify_sync: shopifySync
    }
  });

  return {
    purchase_order: hydratePurchaseOrderRow(
      conn.prepare(
        `SELECT
          po.*,
          s.name AS supplier_name,
          s.email AS supplier_email
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.id = ?`
      ).get(Number(purchaseOrderId)),
      conn
    ),
    batches: createdBatchIds.map((batchId) => conn.prepare("SELECT * FROM batches WHERE id = ?").get(batchId)),
    request_id: requestId,
    shopify_sync: shopifySync
  };
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
  ).all().map((row) => hydratePurchaseOrderRow(row));
}

export async function retryBuyPurchaseOrderDispatch(
  purchaseOrderId,
  { actor_type = "system", actor_id = "system", channels = [] } = {}
) {
  const conn = db();
  const purchaseOrder = conn.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(Number(purchaseOrderId));
  if (!purchaseOrder) return { error: "Purchase order not found" };
  const supplier = conn.prepare("SELECT * FROM suppliers WHERE id = ?").get(purchaseOrder.supplier_id);
  const lines = conn.prepare("SELECT * FROM purchase_order_lines WHERE purchase_order_id = ? ORDER BY id ASC").all(Number(purchaseOrderId));
  if (!supplier || !lines.length) return { error: "Purchase order is missing supplier or lines" };
  const dispatches = conn.prepare("SELECT * FROM purchase_order_dispatches WHERE purchase_order_id = ?").all(Number(purchaseOrderId));
  const byChannel = new Map(dispatches.map((dispatch) => [dispatch.channel, dispatch]));
  const title = `Purchase Order ${purchaseOrderId} - ${supplier.name}`;
  const requestedChannels = new Set(
    (Array.isArray(channels) ? channels : [])
      .map((channel) => String(channel || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const shouldRetryChannel = (channel) => !requestedChannels.size || requestedChannels.has(String(channel || "").toLowerCase());

  if (!purchaseOrder.generated_document_path || !fs.existsSync(purchaseOrder.generated_document_path)) {
    const pdf = await buildPurchaseOrderPdfBase64({
      purchaseOrder,
      supplier,
      lines,
      requestId: purchaseOrder.request_id
    });
    conn.prepare("UPDATE purchase_orders SET generated_document_path = ?, updated_at = ? WHERE id = ?")
      .run(pdf.filePath, now(), Number(purchaseOrderId));
    purchaseOrder.generated_document_path = pdf.filePath;
  }

  const result = {
    purchase_order_id: Number(purchaseOrderId),
    lifecycle_status: String(purchaseOrder.status || ""),
    retried: []
  };

  if (shouldRetryChannel("shopify") && !purchaseOrder.shopify_draft_order_id && (!byChannel.get("shopify") || byChannel.get("shopify").status !== "success")) {
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

  if (shouldRetryChannel("email") && (!byChannel.get("email") || byChannel.get("email").status !== "success")) {
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

  if (shouldRetryChannel("print") && (!byChannel.get("print") || byChannel.get("print").status !== "success")) {
    const pdfBase64 = fs.readFileSync(purchaseOrder.generated_document_path).toString("base64");
    const printResult = await sendPrintNodeJob({ title, pdfBase64, documentType: "purchaseOrder" });
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

function hydrateManufacturingOrderRow(row, conn = db()) {
  if (!row) return null;
  const lines = conn.prepare(
    `SELECT *
     FROM manufacturing_order_lines
     WHERE manufacturing_order_id = ?
     ORDER BY id ASC`
  ).all(Number(row.id));
  const requirements = conn.prepare(
    `SELECT
      mmr.*,
      m.sku AS material_sku,
      m.title AS material_title,
      m.uom AS material_uom
     FROM manufacturing_material_requirements mmr
     JOIN materials m ON m.id = mmr.material_id
     WHERE mmr.manufacturing_order_id = ?
     ORDER BY m.title ASC`
  ).all(Number(row.id));
  const requirementIds = requirements.map((requirement) => Number(requirement.id));
  const allocations = requirementIds.length
    ? conn.prepare(
      `SELECT
        mma.*,
        b.batch_code,
        b.batch_type,
        b.expiry_date,
        b.supplier_lot,
        mmr.material_id,
        m.sku AS material_sku,
        m.title AS material_title
       FROM manufacturing_material_allocations mma
       JOIN manufacturing_material_requirements mmr
         ON mmr.id = mma.manufacturing_requirement_id
       LEFT JOIN batches b
         ON b.id = mma.batch_id
       LEFT JOIN materials m
         ON m.id = mmr.material_id
       WHERE mma.manufacturing_requirement_id IN (${requirementIds.map(() => "?").join(", ")})
       ORDER BY mma.created_at ASC, mma.id ASC`
    ).all(...requirementIds)
    : [];
  const allocationByRequirementId = new Map();
  allocations.forEach((allocation) => {
    const key = Number(allocation.manufacturing_requirement_id);
    const existing = allocationByRequirementId.get(key) || [];
    existing.push(allocation);
    allocationByRequirementId.set(key, existing);
  });

  return {
    ...row,
    can_release: String(row.status || "") === "draft",
    can_complete: ["draft", "released"].includes(String(row.status || "")),
    has_shortages: requirements.some((requirement) => asNumber(requirement.shortage_qty, 0) > 0),
    lines,
    requirements: requirements.map((requirement) => ({
      ...requirement,
      allocations: allocationByRequirementId.get(Number(requirement.id)) || []
    }))
  };
}

function planManufacturingAllocations(requirements = []) {
  const normalizedRequirements = (Array.isArray(requirements) ? requirements : [])
    .map((requirement) => ({
      ...requirement,
      id: Number(requirement.id),
      material_id: Number(requirement.material_id),
      required_qty: round2(requirement.required_qty)
    }))
    .filter((requirement) => requirement.id > 0 && requirement.material_id > 0 && requirement.required_qty > 0);
  ensureOpeningBalanceBatchesForMaterials(normalizedRequirements.map((requirement) => requirement.material_id));

  const allocations = [];
  const shortages = [];
  const plannedByBatchId = new Map();

  normalizedRequirements.forEach((requirement) => {
    let remainingQty = round2(requirement.required_qty);
    const candidateBatches = listAllocatableBatchesForMaterial(requirement.material_id);
    candidateBatches.forEach((batch) => {
      if (!(remainingQty > 0)) return;
      const alreadyPlanned = asNumber(plannedByBatchId.get(Number(batch.id)), 0);
      const availableToAllocate = round2(asNumber(batch.available_to_allocate, 0) - alreadyPlanned);
      if (!(availableToAllocate > 0)) return;
      const allocatedQty = round2(Math.min(remainingQty, availableToAllocate));
      if (!(allocatedQty > 0)) return;
      allocations.push({
        manufacturing_requirement_id: Number(requirement.id),
        batch_id: Number(batch.id),
        allocated_qty: allocatedQty,
        batch_code: batch.batch_code,
        batch_type: batch.batch_type,
        expiry_date: batch.expiry_date || null,
        supplier_lot: batch.supplier_lot || null,
        material_id: Number(requirement.material_id),
        material_sku: requirement.material_sku || batch.material_sku || null,
        material_title: requirement.material_title || batch.material_title || null
      });
      plannedByBatchId.set(Number(batch.id), round2(alreadyPlanned + allocatedQty));
      remainingQty = round2(remainingQty - allocatedQty);
    });
    if (remainingQty > 0) {
      shortages.push({
        manufacturing_requirement_id: Number(requirement.id),
        material_id: Number(requirement.material_id),
        material_sku: requirement.material_sku || null,
        material_title: requirement.material_title || null,
        required_qty: round2(requirement.required_qty),
        shortage_qty: round2(remainingQty)
      });
    }
  });

  return {
    ok: shortages.length === 0,
    allocations,
    shortages
  };
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
        0,
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
    manufacturing_order: hydrateManufacturingOrderRow(
      db().prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(manufacturingOrderId)
    ),
    draft_order: shopifyResult,
    ...requirementsPayload
  };
}

export async function releaseManufacturingOrder(manufacturingOrderId, payload = {}) {
  const conn = db();
  const mo = conn.prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(Number(manufacturingOrderId));
  if (!mo) return { error: "Manufacturing order not found" };
  if (String(mo.status || "") === "completed") return { error: "Manufacturing order already completed" };
  if (String(mo.status || "") === "cancelled") return { error: "Manufacturing order is cancelled" };
  if (String(mo.status || "") === "released") {
    return {
      manufacturing_order: hydrateManufacturingOrderRow(mo, conn),
      already_released: true
    };
  }

  const requirements = conn.prepare(
    `SELECT
      mmr.*,
      m.sku AS material_sku,
      m.title AS material_title
     FROM manufacturing_material_requirements mmr
     JOIN materials m ON m.id = mmr.material_id
     WHERE mmr.manufacturing_order_id = ?
     ORDER BY m.title ASC`
  ).all(Number(manufacturingOrderId));
  if (!requirements.length) return { error: "Manufacturing order has no material requirements" };

  const allocationPlan = planManufacturingAllocations(requirements);
  if (!allocationPlan.ok) {
    return {
      error: "Insufficient batch stock to release manufacturing order",
      shortages: allocationPlan.shortages,
      manufacturing_order: hydrateManufacturingOrderRow(mo, conn)
    };
  }

  const materialAvailability = new Map(
    (await listCatalogMaterials().catch(() => []))
      .map((material) => [Number(material.id), material])
  );
  const allocationsByRequirementId = new Map();
  allocationPlan.allocations.forEach((allocation) => {
    const key = Number(allocation.manufacturing_requirement_id);
    allocationsByRequirementId.set(key, round2((allocationsByRequirementId.get(key) || 0) + asNumber(allocation.allocated_qty, 0)));
  });

  const requestId = payload?.request_id || nextRequestId("make-release");
  const tx = conn.transaction(() => {
    conn.prepare(
      `DELETE FROM manufacturing_material_allocations
       WHERE manufacturing_requirement_id IN (
         SELECT id
         FROM manufacturing_material_requirements
         WHERE manufacturing_order_id = ?
       )`
    ).run(Number(manufacturingOrderId));

    allocationPlan.allocations.forEach((allocation) => {
      conn.prepare(
        `INSERT INTO manufacturing_material_allocations (
          manufacturing_requirement_id,
          batch_id,
          allocated_qty,
          created_at
        ) VALUES (?, ?, ?, ?)`
      ).run(
        Number(allocation.manufacturing_requirement_id),
        Number(allocation.batch_id),
        allocation.allocated_qty,
        now()
      );
    });

    requirements.forEach((requirement) => {
      const reservedQty = round2(allocationsByRequirementId.get(Number(requirement.id)) || 0);
      const material = materialAvailability.get(Number(requirement.material_id));
      conn.prepare(
        `UPDATE manufacturing_material_requirements
         SET reserved_qty = ?,
             available_qty = ?,
             shortage_qty = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        reservedQty,
        round2(asNumber(material?.available, requirement.available_qty)),
        round2(Math.max(0, asNumber(requirement.required_qty, 0) - reservedQty)),
        now(),
        Number(requirement.id)
      );
    });

    conn.prepare(
      `UPDATE manufacturing_orders
       SET status = 'released',
           updated_at = ?
       WHERE id = ?`
    ).run(now(), Number(manufacturingOrderId));
  });
  tx();

  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "make",
    action: "manufacturing_order_released",
    entity_type: "manufacturing_order",
    entity_id: String(manufacturingOrderId),
    request_id: requestId,
    details: {
      allocation_count: allocationPlan.allocations.length
    }
  });

  return {
    manufacturing_order: hydrateManufacturingOrderRow(
      conn.prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(Number(manufacturingOrderId)),
      conn
    ),
    allocations: allocationPlan.allocations,
    request_id: requestId
  };
}

export function listManufacturingOrders() {
  return db().prepare(
    `SELECT *
     FROM manufacturing_orders
     ORDER BY created_at DESC, id DESC`
  ).all().map((row) => hydrateManufacturingOrderRow(row));
}

export async function printManufacturingOrder(manufacturingOrderId, payload = {}) {
  const conn = db();
  const order = hydrateManufacturingOrderRow(
    conn.prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(Number(manufacturingOrderId)),
    conn
  );
  if (!order) return { error: "Manufacturing order not found" };

  const title = `Manufacturing Order ${manufacturingOrderId}`;
  const pdf = await buildPdfBase64({
    title,
    meta: [
      ["Status", order.status || "draft"],
      ["Target date", order.target_date || "-"],
      ["Request", order.request_id || "-"]
    ],
    lines: [
      ...order.lines.map((line) => ({
        title: `Produce ${line.product_title || line.product_sku}`,
        sku: line.product_sku,
        quantity: line.quantity,
        uom: "units"
      })),
      ...order.requirements.map((requirement) => ({
        title: `Material: ${requirement.material_title || requirement.material_sku}`,
        sku: requirement.material_sku,
        quantity: requirement.required_qty,
        uom: requirement.uom || requirement.material_uom || "unit"
      }))
    ]
  });
  const printResult = await sendPrintNodeJob({
    title,
    pdfBase64: pdf.pdfBase64,
    documentType: "manufacturingOrder"
  });
  recordAppAudit({
    actor_type: payload?.actor_type || "system",
    actor_id: payload?.actor_id || "system",
    surface: "make",
    action: "manufacturing_order_printed",
    entity_type: "manufacturing_order",
    entity_id: String(manufacturingOrderId),
    status: printResult.ok ? "ok" : printResult.skipped ? "partial" : "failed",
    details: {
      print: printResult,
      document_path: pdf.filePath
    }
  });
  return {
    manufacturing_order: order,
    document: { path: pdf.filePath },
    print: printResult
  };
}

export async function completeManufacturingOrder(manufacturingOrderId, payload = {}) {
  const conn = db();
  const mo = conn.prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(Number(manufacturingOrderId));
  if (!mo) return { error: "Manufacturing order not found" };
  if (String(mo.status) === "completed") return { error: "Manufacturing order already completed" };
  if (String(mo.status) === "cancelled") return { error: "Manufacturing order is cancelled" };

  let autoRelease = null;
  if (String(mo.status) !== "released") {
    autoRelease = await releaseManufacturingOrder(manufacturingOrderId, payload);
    if (autoRelease?.error) {
      return autoRelease;
    }
  }

  const lines = conn.prepare("SELECT * FROM manufacturing_order_lines WHERE manufacturing_order_id = ?").all(Number(manufacturingOrderId));
  const requirements = conn.prepare(
    `SELECT
      mmr.*,
      m.sku AS material_sku,
      m.title AS material_title
     FROM manufacturing_material_requirements mmr
     JOIN materials m ON m.id = mmr.material_id
     WHERE mmr.manufacturing_order_id = ?`
  ).all(Number(manufacturingOrderId));
  const allocations = conn.prepare(
    `SELECT
      mma.*,
      b.batch_code,
      b.batch_type,
      b.expiry_date,
      mmr.material_id,
      m.sku AS material_sku,
      m.title AS material_title
     FROM manufacturing_material_allocations mma
     JOIN manufacturing_material_requirements mmr
       ON mmr.id = mma.manufacturing_requirement_id
     JOIN materials m
       ON m.id = mmr.material_id
     LEFT JOIN batches b
       ON b.id = mma.batch_id
     WHERE mmr.manufacturing_order_id = ?
     ORDER BY mma.created_at ASC, mma.id ASC`
  ).all(Number(manufacturingOrderId));
  const allocatedByRequirementId = new Map();
  allocations.forEach((allocation) => {
    const key = Number(allocation.manufacturing_requirement_id);
    allocatedByRequirementId.set(key, round2((allocatedByRequirementId.get(key) || 0) + asNumber(allocation.allocated_qty, 0)));
  });
  const shortages = requirements
    .map((requirement) => ({
      manufacturing_requirement_id: Number(requirement.id),
      material_id: Number(requirement.material_id),
      material_sku: requirement.material_sku,
      material_title: requirement.material_title,
      required_qty: round2(requirement.required_qty),
      allocated_qty: round2(allocatedByRequirementId.get(Number(requirement.id)) || 0)
    }))
    .filter((entry) => entry.allocated_qty < entry.required_qty)
    .map((entry) => ({
      ...entry,
      shortage_qty: round2(entry.required_qty - entry.allocated_qty)
    }));
  if (shortages.length) {
    return {
      error: "Insufficient allocated batch stock to complete manufacturing order",
      shortages
    };
  }
  const batchCode = buildBatchCode("FG");
  const requestId = payload?.request_id || nextRequestId("make-complete");
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
      lines.length === 1 ? lines[0]?.product_sku || null : null,
      Number(manufacturingOrderId),
      round2(lines.reduce((sum, line) => sum + asNumber(line.quantity, 0), 0)),
      round2(lines.reduce((sum, line) => sum + asNumber(line.quantity, 0), 0)),
      activeBomHeaderForSku(lines[0]?.product_sku || "")?.id || null,
      JSON.stringify({
        note: payload?.note || null,
        auto_release: Boolean(autoRelease)
      }),
      now(),
      now()
    );
    const batchId = batchResult.lastInsertRowid;

    allocations.forEach((allocation) => {
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
        ) VALUES (?, 'manufacturing_consumption', ?, ?, ?, 'manufacturing_order', ?, ?, ?, ?)`
      ).run(
        now(),
        allocation.material_id,
        -Math.abs(asNumber(allocation.allocated_qty, 0)),
        Number(allocation.batch_id),
        String(manufacturingOrderId),
        payload?.actor_type || "system",
        payload?.actor_id || "system",
        JSON.stringify({
          batch_code: batchCode,
          source_batch_code: allocation.batch_code || null
        })
      );

      conn.prepare(
        `UPDATE batches
         SET qty_remaining = MAX(0, COALESCE(qty_remaining, 0) - ?),
             updated_at = ?
         WHERE id = ?`
      ).run(
        Math.abs(asNumber(allocation.allocated_qty, 0)),
        now(),
        Number(allocation.batch_id)
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

    conn.prepare(
      `UPDATE manufacturing_material_requirements
       SET reserved_qty = required_qty,
           shortage_qty = 0,
           updated_at = ?
       WHERE manufacturing_order_id = ?`
    ).run(now(), Number(manufacturingOrderId));

    conn.prepare("UPDATE manufacturing_orders SET status = 'completed', batch_id = ?, updated_at = ? WHERE id = ?")
      .run(batchId, now(), Number(manufacturingOrderId));
    return batchId;
  });

  const batchId = tx();
  const materialsById = new Map((await listCatalogMaterials().catch(() => [])).map((material) => [Number(material.id), material]));
  const shopifyTargets = [
    ...uniqueBy(allocations, (allocation) => Number(allocation.material_id)).map((allocation) => {
      const material = materialsById.get(Number(allocation.material_id));
      const totalAllocatedQty = allocations
        .filter((entry) => Number(entry.material_id) === Number(allocation.material_id))
        .reduce((sum, entry) => sum + asNumber(entry.allocated_qty, 0), 0);
      return {
        entity_type: "material",
        material_id: Number(allocation.material_id),
        sku: material?.sku || null,
        title: material?.title || `Material ${allocation.material_id}`,
        variant_id: asPositiveInteger(material?.shopify_variant_id, null),
        inventory_item_id: asPositiveInteger(material?.shopify_inventory_item_id, null),
        adjustment: -Math.abs(toShopifyInventoryUnits(totalAllocatedQty, material || { uom: material?.uom || "unit" }))
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
    manufacturing_order: hydrateManufacturingOrderRow(
      conn.prepare("SELECT * FROM manufacturing_orders WHERE id = ?").get(Number(manufacturingOrderId)),
      conn
    ),
    batch: conn.prepare("SELECT * FROM batches WHERE id = ?").get(Number(batchId)),
    auto_release: autoRelease,
    shopify_sync: shopifySync
  };
}

export async function createLinkedPurchaseOrdersFromShortages(payload = {}) {
  const manufacturingOrderId = Number(payload?.manufacturing_order_id || payload?.manufacturingOrderId || 0);
  let selections = [];

  if (manufacturingOrderId > 0) {
    const storedRequirements = db().prepare(
      `SELECT
        mmr.material_id,
        mmr.required_qty,
        mmr.reserved_qty,
        mmr.shortage_qty
       FROM manufacturing_material_requirements mmr
       WHERE mmr.manufacturing_order_id = ?
       ORDER BY mmr.id ASC`
    ).all(manufacturingOrderId);
    if (!storedRequirements.length) {
      return { error: "Manufacturing order not found" };
    }
    selections = storedRequirements
      .map((requirement) => ({
        material_id: Number(requirement.material_id),
        quantity: round2(
          Math.max(
            asNumber(requirement.shortage_qty, 0),
            asNumber(requirement.required_qty, 0) - asNumber(requirement.reserved_qty, 0)
          )
        )
      }))
      .filter((requirement) => requirement.material_id > 0 && requirement.quantity > 0);
  } else {
    const requirements = await getMakeRequirements(payload);
    selections = requirements.requirements
      .filter((requirement) => requirement.shortage_qty > 0)
      .map((requirement) => ({
        material_id: requirement.material_id,
        quantity: requirement.shortage_qty
      }));
  }

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
