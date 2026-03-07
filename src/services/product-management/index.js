import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

import { config } from "../../config.js";
import { getDb } from "../../db/sqlite.js";
import { shopifyFetch } from "../shopify.js";
import { computeTrueCost } from "./costing.js";

const db = () => getDb();
const now = () => new Date().toISOString();

function queueChange(entityType, entityId, op, payload) {
  db().prepare(`INSERT INTO change_log (entity_type, entity_id, op, payload_json, sync_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)`)
    .run(entityType, String(entityId), op, JSON.stringify(payload || {}), now(), now());
}

function audit(action, entityType, entityId, details = {}) {
  db().prepare("INSERT INTO audit_log (action, entity_type, entity_id, details_json) VALUES (?, ?, ?, ?)")
    .run(action, entityType || null, entityId ? String(entityId) : null, JSON.stringify(details));
}

function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asFiniteInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeBoolFlag(value, fallback = true) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value > 0 ? 1 : 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["0", "false", "no", "inactive", "archived"].includes(normalized)) return 0;
    if (["1", "true", "yes", "active"].includes(normalized)) return 1;
  }
  return fallback ? 1 : 0;
}

function mapProductRow(row) {
  if (!row) return null;
  return {
    ...row,
    weight_kg: asFiniteNumber(row.weight_kg, 0),
    crate_units: asFiniteInt(row.crate_units, 0),
    is_active: normalizeBoolFlag(row.is_active, true)
  };
}

function normalizeProductPayload(payload = {}, existing = null) {
  const sku = String(payload?.sku ?? existing?.sku ?? "").trim().toUpperCase();
  const title = String(payload?.title ?? existing?.title ?? "").trim();
  const status = String(payload?.status ?? existing?.status ?? "draft").trim() || "draft";
  const isActiveSource =
    payload?.is_active ?? payload?.isActive ?? existing?.is_active ?? (status.toLowerCase() === "archived" ? 0 : 1);
  return {
    sku,
    barcode: payload?.barcode ?? existing?.barcode ?? null,
    title,
    status,
    compliance_ingredients_text: payload?.compliance_ingredients_text ?? existing?.compliance_ingredients_text ?? null,
    compliance_allergens: payload?.compliance_allergens ?? existing?.compliance_allergens ?? null,
    shopify_product_id: payload?.shopify_product_id ?? payload?.shopifyProductId ?? existing?.shopify_product_id ?? null,
    shopify_variant_id: payload?.shopify_variant_id ?? payload?.shopifyVariantId ?? existing?.shopify_variant_id ?? null,
    flavour: String(payload?.flavour ?? existing?.flavour ?? "").trim(),
    size: String(payload?.size ?? existing?.size ?? "").trim(),
    weight_kg: asFiniteNumber(payload?.weight_kg ?? payload?.weightKg ?? existing?.weight_kg, 0),
    crate_units: Math.max(0, asFiniteInt(payload?.crate_units ?? payload?.crateUnits ?? existing?.crate_units, 0)),
    is_active: normalizeBoolFlag(isActiveSource, true)
  };
}

export function getProductById(productId) {
  return mapProductRow(db().prepare("SELECT * FROM products WHERE id = ?").get(Number(productId)));
}

export function getProductBySku(sku) {
  return mapProductRow(db().prepare("SELECT * FROM products WHERE sku = ?").get(String(sku || "").trim().toUpperCase()));
}

export function upsertProduct(payload) {
  const requestedId = Number(payload?.id || 0);
  const existingById = requestedId > 0 ? db().prepare("SELECT * FROM products WHERE id = ?").get(requestedId) : null;
  const existingBySku = !existingById
    ? db().prepare("SELECT * FROM products WHERE sku = ?").get(String(payload?.sku || "").trim().toUpperCase())
    : null;
  const existing = existingById || existingBySku || null;
  const normalized = normalizeProductPayload(payload, existing);
  if (!normalized.sku || !normalized.title) return { error: "sku and title are required" };

  const duplicate = db().prepare("SELECT id FROM products WHERE sku = ? AND id <> ?").get(
    normalized.sku,
    Number(existing?.id || 0)
  );
  if (duplicate) return { error: `sku already exists: ${normalized.sku}` };

  if (existing) {
    db().prepare(
      `UPDATE products
       SET sku=?,
           barcode=?,
           title=?,
           status=?,
           compliance_ingredients_text=?,
           compliance_allergens=?,
           shopify_product_id=?,
           shopify_variant_id=?,
           flavour=?,
           size=?,
           weight_kg=?,
           crate_units=?,
           is_active=?,
           updated_at=?
       WHERE id=?`
    ).run(
      normalized.sku,
      normalized.barcode,
      normalized.title,
      normalized.status,
      normalized.compliance_ingredients_text,
      normalized.compliance_allergens,
      normalized.shopify_product_id,
      normalized.shopify_variant_id,
      normalized.flavour,
      normalized.size,
      normalized.weight_kg,
      normalized.crate_units,
      normalized.is_active,
      now(),
      existing.id
    );
    queueChange("products", existing.id, "update", normalized);
    audit("product_updated", "products", existing.id, normalized);
    return { product: getProductById(existing.id) };
  }

  const res = db().prepare(
    `INSERT INTO products (
      sku,
      barcode,
      title,
      status,
      compliance_ingredients_text,
      compliance_allergens,
      shopify_product_id,
      shopify_variant_id,
      flavour,
      size,
      weight_kg,
      crate_units,
      is_active,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    normalized.sku,
    normalized.barcode,
    normalized.title,
    normalized.status,
    normalized.compliance_ingredients_text,
    normalized.compliance_allergens,
    normalized.shopify_product_id,
    normalized.shopify_variant_id,
    normalized.flavour,
    normalized.size,
    normalized.weight_kg,
    normalized.crate_units,
    normalized.is_active,
    now(),
    now()
  );
  queueChange("products", res.lastInsertRowid, "create", normalized);
  audit("product_created", "products", res.lastInsertRowid, normalized);
  return { product: getProductById(res.lastInsertRowid) };
}

export function listProducts() {
  return db().prepare("SELECT * FROM products ORDER BY title ASC, sku ASC").all().map(mapProductRow);
}

export function createIngredient(payload) {
  const name = String(payload?.name || "").trim();
  if (!name) return { error: "name is required" };
  const allergenFlags = Array.isArray(payload?.allergen_flags) ? payload.allergen_flags : [];
  const res = db().prepare("INSERT INTO ingredients (name, allergen_flags, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, JSON.stringify(allergenFlags), payload?.notes || null, now(), now());
  queueChange("ingredients", res.lastInsertRowid, "create", payload);
  return { ingredient: db().prepare("SELECT * FROM ingredients WHERE id=?").get(res.lastInsertRowid) };
}

export function listIngredients() {
  return db().prepare("SELECT * FROM ingredients ORDER BY name ASC").all().map((row) => ({ ...row, allergen_flags: JSON.parse(row.allergen_flags || "[]") }));
}

function mapSupplierRow(row) {
  return row ? { ...row } : null;
}

function normalizeSupplierPayload(payload = {}, existing = null) {
  return {
    name: String(payload?.name ?? existing?.name ?? "").trim(),
    contact_name: String(payload?.contact_name ?? payload?.contactName ?? existing?.contact_name ?? "").trim() || null,
    email: String(payload?.email ?? existing?.email ?? "").trim() || null,
    phone: String(payload?.phone ?? existing?.phone ?? "").trim() || null
  };
}

export function getSupplierById(supplierId) {
  return mapSupplierRow(db().prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(supplierId)));
}

export function createSupplier(payload) {
  const normalized = normalizeSupplierPayload(payload);
  if (!normalized.name) return { error: "name is required" };
  const existing = db().prepare("SELECT id FROM suppliers WHERE name = ?").get(normalized.name);
  if (existing) return { error: `supplier already exists: ${normalized.name}` };
  const res = db().prepare("INSERT INTO suppliers (name, contact_name, email, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(normalized.name, normalized.contact_name, normalized.email, normalized.phone, now(), now());
  queueChange("suppliers", res.lastInsertRowid, "create", normalized);
  audit("supplier_created", "suppliers", res.lastInsertRowid, normalized);
  return { supplier: getSupplierById(res.lastInsertRowid) };
}

export function updateSupplier(supplierId, payload) {
  const existing = db().prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(supplierId));
  if (!existing) return { error: "supplier not found" };
  const normalized = normalizeSupplierPayload(payload, existing);
  if (!normalized.name) return { error: "name is required" };
  const duplicate = db().prepare("SELECT id FROM suppliers WHERE name = ? AND id <> ?").get(normalized.name, Number(supplierId));
  if (duplicate) return { error: `supplier already exists: ${normalized.name}` };
  db().prepare(
    `UPDATE suppliers
     SET name = ?, contact_name = ?, email = ?, phone = ?, updated_at = ?
     WHERE id = ?`
  ).run(normalized.name, normalized.contact_name, normalized.email, normalized.phone, now(), Number(supplierId));
  queueChange("suppliers", Number(supplierId), "update", normalized);
  audit("supplier_updated", "suppliers", supplierId, normalized);
  return { supplier: getSupplierById(supplierId) };
}

export function listSuppliers() {
  return db().prepare("SELECT * FROM suppliers ORDER BY name ASC").all().map(mapSupplierRow);
}

export function addIngredientPrice(payload) {
  const ingredientId = Number(payload?.ingredient_id);
  if (!ingredientId) return { error: "ingredient_id is required" };
  const effectiveFrom = String(payload?.effective_from || "").trim();
  if (!effectiveFrom) return { error: "effective_from is required" };
  const res = db().prepare("INSERT INTO ingredient_prices (ingredient_id, supplier_id, price_per_kg, effective_from) VALUES (?, ?, ?, ?)")
    .run(ingredientId, payload?.supplier_id || null, Number(payload?.price_per_kg || 0), effectiveFrom);
  queueChange("ingredient_prices", res.lastInsertRowid, "create", payload);
  return { ingredient_price: db().prepare("SELECT * FROM ingredient_prices WHERE id=?").get(res.lastInsertRowid) };
}

export function upsertRecipe(payload) {
  const productId = Number(payload?.product_id);
  if (!productId) return { error: "product_id is required" };
  const effectiveFrom = String(payload?.effective_from || "").trim();
  if (!effectiveFrom) return { error: "effective_from is required" };
  const tx = db().transaction(() => {
    const recipeRes = db().prepare("INSERT INTO bom_recipes (product_id, version, effective_from, yield_pct, waste_pct, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
      .run(productId, payload?.version || "v1", effectiveFrom, Number(payload?.yield_pct || 100), Number(payload?.waste_pct || 0), now());
    const recipeId = recipeRes.lastInsertRowid;
    for (const line of Array.isArray(payload?.lines) ? payload.lines : []) {
      db().prepare("INSERT INTO bom_lines (recipe_id, ingredient_id, grams_used) VALUES (?, ?, ?)")
        .run(recipeId, Number(line.ingredient_id), Number(line.grams_used || 0));
    }
    queueChange("bom_recipes", recipeId, "create", payload);
    return recipeId;
  });
  const recipeId = tx();
  return { recipe: db().prepare("SELECT * FROM bom_recipes WHERE id=?").get(recipeId) };
}

export function upsertPackagingProfile(payload) {
  const productId = Number(payload?.product_id);
  if (!productId) return { error: "product_id is required" };
  const effectiveFrom = String(payload?.effective_from || "").trim();
  if (!effectiveFrom) return { error: "effective_from is required" };

  const tx = db().transaction(() => {
    const profileRes = db().prepare("INSERT INTO packaging_profiles (product_id, name, effective_from, is_active, created_at) VALUES (?, ?, ?, 1, ?)")
      .run(productId, payload?.name || "Default", effectiveFrom, now());
    const profileId = profileRes.lastInsertRowid;
    for (const line of Array.isArray(payload?.lines) ? payload.lines : []) {
      db().prepare("INSERT INTO packaging_lines (profile_id, packaging_item_id, qty) VALUES (?, ?, ?)")
        .run(profileId, Number(line.packaging_item_id), Number(line.qty || 0));
    }
    queueChange("packaging_profiles", profileId, "create", payload);
    return profileId;
  });
  const profileId = tx();
  return { profile: db().prepare("SELECT * FROM packaging_profiles WHERE id = ?").get(profileId) };
}

export function createPackagingItem(payload) {
  const name = String(payload?.name || "").trim();
  if (!name) return { error: "name is required" };
  const res = db().prepare("INSERT INTO packaging_items (name, unit_cost, uom, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, Number(payload?.unit_cost || 0), payload?.uom || "ea", now(), now());
  queueChange("packaging_items", res.lastInsertRowid, "create", payload);
  return { packaging_item: db().prepare("SELECT * FROM packaging_items WHERE id=?").get(res.lastInsertRowid) };
}

export function listPackagingItems() { return db().prepare("SELECT * FROM packaging_items ORDER BY name").all(); }

export function upsertCostInputs(payload) {
  const period = String(payload?.period || "").trim();
  if (!period) return { error: "period is required" };
  const existing = db().prepare("SELECT id FROM cost_inputs_period WHERE period=?").get(period);
  if (existing) {
    db().prepare("UPDATE cost_inputs_period SET labour_total=?, overhead_total=?, shipping_total=?, dispatch_total=?, units_produced=?, units_shipped=?, updated_at=? WHERE id=?")
      .run(Number(payload?.labour_total || 0), Number(payload?.overhead_total || 0), Number(payload?.shipping_total || 0), Number(payload?.dispatch_total || 0), Number(payload?.units_produced || 0), Number(payload?.units_shipped || 0), now(), existing.id);
    queueChange("cost_inputs_period", existing.id, "update", payload);
    return { period: db().prepare("SELECT * FROM cost_inputs_period WHERE id=?").get(existing.id) };
  }
  const res = db().prepare("INSERT INTO cost_inputs_period (period, labour_total, overhead_total, shipping_total, dispatch_total, units_produced, units_shipped, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(period, Number(payload?.labour_total || 0), Number(payload?.overhead_total || 0), Number(payload?.shipping_total || 0), Number(payload?.dispatch_total || 0), Number(payload?.units_produced || 0), Number(payload?.units_shipped || 0), now(), now());
  queueChange("cost_inputs_period", res.lastInsertRowid, "create", payload);
  return { period: db().prepare("SELECT * FROM cost_inputs_period WHERE id=?").get(res.lastInsertRowid) };
}

export function upsertPriceTier(payload) {
  const name = String(payload?.name || "").trim();
  if (!name) return { error: "name is required" };
  const existing = db().prepare("SELECT * FROM price_tiers WHERE name = ?").get(name);
  if (existing) {
    db().prepare("UPDATE price_tiers SET gateway_fee_pct=?, commission_pct=?, updated_at=? WHERE id=?")
      .run(Number(payload?.gateway_fee_pct || 0), Number(payload?.commission_pct || 0), now(), existing.id);
    queueChange("price_tiers", existing.id, "update", payload);
    return { tier: db().prepare("SELECT * FROM price_tiers WHERE id=?").get(existing.id) };
  }
  const res = db().prepare("INSERT INTO price_tiers (name, gateway_fee_pct, commission_pct, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, Number(payload?.gateway_fee_pct || 0), Number(payload?.commission_pct || 0), now(), now());
  queueChange("price_tiers", res.lastInsertRowid, "create", payload);
  return { tier: db().prepare("SELECT * FROM price_tiers WHERE id=?").get(res.lastInsertRowid) };
}

export function addProductPrice(payload) {
  const productId = Number(payload?.product_id);
  const tierId = Number(payload?.tier_id);
  const effectiveFrom = String(payload?.effective_from || "").trim();
  if (!productId || !tierId || !effectiveFrom) return { error: "product_id, tier_id and effective_from are required" };
  const res = db().prepare("INSERT INTO product_prices (product_id, tier_id, price, effective_from, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(productId, tierId, Number(payload?.price || 0), effectiveFrom, now());
  queueChange("product_prices", res.lastInsertRowid, "create", payload);
  return { product_price: db().prepare("SELECT * FROM product_prices WHERE id=?").get(res.lastInsertRowid) };
}

export function getDashboard(asOfDate, tierId, marginTargetPct = 30) {
  const products = listProducts();
  const rows = products.map((p) => computeTrueCost(p.id, asOfDate, tierId)).filter((r) => !r.error);

  const recipeMap = new Set(db().prepare("SELECT DISTINCT product_id FROM bom_recipes").all().map((x) => x.product_id));
  const packagingMap = new Set(db().prepare("SELECT DISTINCT product_id FROM packaging_profiles").all().map((x) => x.product_id));

  const alerts = {
    missing_bom: products.filter((p) => !recipeMap.has(p.id)).map((p) => ({ id: p.id, sku: p.sku, title: p.title })),
    missing_packaging: products.filter((p) => !packagingMap.has(p.id)).map((p) => ({ id: p.id, sku: p.sku, title: p.title })),
    low_margin: rows.filter((r) => r.breakdown.margin_pct < marginTargetPct).map((r) => ({
      product_id: r.product.id,
      sku: r.product.sku,
      margin_pct: r.breakdown.margin_pct,
      true_cost: r.breakdown.true_cost,
      selling_price: r.selling_price
    }))
  };

  return {
    as_of_date: asOfDate,
    tier_id: tierId,
    alerts,
    products: rows.map((r) => ({
      product_id: r.product.id,
      sku: r.product.sku,
      title: r.product.title,
      true_cost: r.breakdown.true_cost,
      margin_pct: r.breakdown.margin_pct,
      selling_price: r.selling_price
    }))
  };
}

export function getSyncStatus() {
  return {
    queue: db().prepare("SELECT sync_status, COUNT(*) count FROM change_log GROUP BY sync_status").all(),
    failures: db().prepare("SELECT id, entity_type, entity_id, last_error, attempts, updated_at FROM change_log WHERE sync_status='failed' ORDER BY updated_at DESC LIMIT 30").all(),
    conflicts: db().prepare("SELECT * FROM conflicts WHERE status='open' ORDER BY created_at DESC").all(),
    last_pull: db().prepare("SELECT value FROM sync_state WHERE key='last_pull'").get()?.value || null,
    last_push: db().prepare("SELECT value FROM sync_state WHERE key='last_push'").get()?.value || null
  };
}

async function pushMetafield(product, namespace, key, value, type = "single_line_text_field") {
  if (!product.shopify_variant_id) return;
  await shopifyFetch(`/graphql.json`, {
    method: "POST",
    body: JSON.stringify({
      query: `mutation metafieldsSet($metafields:[MetafieldsSetInput!]!) { metafieldsSet(metafields:$metafields) { userErrors { field message } } }`,
      variables: {
        metafields: [{
          ownerId: `gid://shopify/ProductVariant/${product.shopify_variant_id}`,
          namespace,
          key,
          value: String(value || ""),
          type
        }]
      }
    })
  });
}

export async function runSyncNow() {
  if (String(config.SYNC_ENABLED).toLowerCase() === "false") return { ok: false, error: "SYNC_DISABLED" };

  const pending = db().prepare("SELECT * FROM change_log WHERE sync_status='pending' ORDER BY created_at ASC LIMIT 100").all();
  let pushed = 0;

  for (const row of pending) {
    try {
      db().prepare("UPDATE change_log SET sync_status='processing', attempts=attempts+1, updated_at=? WHERE id=?").run(now(), row.id);
      const payload = JSON.parse(row.payload_json || "{}");
      if (row.entity_type === "products") {
        const product = db().prepare("SELECT * FROM products WHERE id = ?").get(row.entity_id);
        if (product) {
          await pushMetafield(product, "flss", "ingredients_text", product.compliance_ingredients_text || "");
          await pushMetafield(product, "flss", "allergens", product.compliance_allergens || "");
        }
      }
      db().prepare("UPDATE change_log SET sync_status='synced', updated_at=? WHERE id=?").run(now(), row.id);
      pushed += 1;
      audit("sync_push_success", row.entity_type, row.entity_id, payload);
    } catch (error) {
      db().prepare("UPDATE change_log SET sync_status='failed', last_error=?, updated_at=? WHERE id=?").run(String(error?.message || error), now(), row.id);
      audit("sync_push_failed", row.entity_type, row.entity_id, { error: String(error?.message || error) });
    }
  }

  db().prepare("INSERT INTO sync_state (key, value, updated_at) VALUES ('last_push', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .run(now(), now());

  return { ok: true, pushed, remaining: db().prepare("SELECT COUNT(*) c FROM change_log WHERE sync_status='pending'").get().c };
}

export function createBackupSnapshot() {
  const dbPath = path.resolve(config.LOCAL_DB_PATH);
  const backupsDir = path.resolve(config.BACKUPS_PATH);
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const sqliteCopy = path.join(backupsDir, `${date}.sqlite`);
  fs.copyFileSync(dbPath, sqliteCopy);

  const snapshotDir = path.join(backupsDir, `snapshot-${Date.now()}`);
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.copyFileSync(dbPath, path.join(snapshotDir, "flss-products.sqlite"));

  const assetsPath = path.resolve(config.ASSETS_PATH);
  if (fs.existsSync(assetsPath)) {
    fs.cpSync(assetsPath, path.join(snapshotDir, "assets"), { recursive: true });
  }

  const envTemplate = `LOCAL_DB_PATH=${config.LOCAL_DB_PATH}\nASSETS_PATH=${config.ASSETS_PATH}\nBACKUPS_PATH=${config.BACKUPS_PATH}\nSYNC_ENABLED=${config.SYNC_ENABLED}\n`;
  fs.writeFileSync(path.join(snapshotDir, "config.template.env"), envTemplate);

  const zipPath = path.join(backupsDir, `snapshot-${Date.now()}.zip`);
  execFileSync("bash", ["-lc", `cd ${JSON.stringify(snapshotDir)} && zip -r ${JSON.stringify(zipPath)} . >/dev/null`]);
  fs.rmSync(snapshotDir, { recursive: true, force: true });

  return { sqlite_copy: sqliteCopy, snapshot_zip: zipPath };
}

export function restoreSnapshot(zipPath) {
  const target = path.resolve(zipPath || "");
  if (!target || !fs.existsSync(target)) return { error: "snapshot zip not found" };

  const restoreDir = path.join(path.resolve(config.BACKUPS_PATH), `restore-${Date.now()}`);
  fs.mkdirSync(restoreDir, { recursive: true });
  execFileSync("bash", ["-lc", `cd ${JSON.stringify(restoreDir)} && unzip -o ${JSON.stringify(target)} >/dev/null`]);

  const sqliteSrc = path.join(restoreDir, "flss-products.sqlite");
  if (!fs.existsSync(sqliteSrc)) return { error: "sqlite file missing in snapshot" };

  fs.copyFileSync(sqliteSrc, path.resolve(config.LOCAL_DB_PATH));
  const assetsSrc = path.join(restoreDir, "assets");
  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, path.resolve(config.ASSETS_PATH), { recursive: true });
  }
  fs.rmSync(restoreDir, { recursive: true, force: true });
  audit("snapshot_restored", "snapshot", target, {});
  return { ok: true };
}

export function listAuditLog() {
  return db().prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200").all();
}

export { computeTrueCost };
