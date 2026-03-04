import fs from "fs";
import path from "path";

import JSZip from "jszip";

import { config } from "../config.js";
import { computeTrueCost } from "./costing/computeTrueCost.js";
import { getProductDb } from "./productDb.js";

const ownFields = new Set(["ingredients_text", "allergens"]);

function json(v, fallback) {
  try { return JSON.parse(v); } catch { return fallback; }
}

function queueChange(entityType, entityId, op, payload) {
  const db = getProductDb();
  db.prepare(`INSERT INTO change_log(entity_type, entity_id, op, payload_json) VALUES (?, ?, ?, ?)`)
    .run(entityType, String(entityId), op, JSON.stringify(payload || {}));
}

function audit(actor, action, details = {}) {
  const db = getProductDb();
  db.prepare("INSERT INTO audit_log(actor, action, details_json) VALUES (?, ?, ?)").run(actor || "system", action, JSON.stringify(details));
}

export function upsertProduct(payload, actor = "system") {
  const db = getProductDb();
  const id = payload?.id ? Number(payload.id) : null;
  const sku = String(payload?.sku || "").trim();
  const title = String(payload?.title || "").trim();
  if (!sku || !title) return { error: "sku and title are required" };

  if (id) {
    db.prepare(`UPDATE products SET sku=?, barcode=?, title=?, status=?, shopify_product_id=?, shopify_variant_id=?, target_margin_pct=?, commission_pct=?, gateway_pct=?, updated_at=datetime('now') WHERE id=?`)
      .run(sku, payload?.barcode || null, title, payload?.status || "active", payload?.shopify_product_id || null, payload?.shopify_variant_id || null, Number(payload?.target_margin_pct || 0), Number(payload?.commission_pct || 0), Number(payload?.gateway_pct || 0), id);
    queueChange("products", id, "update", payload);
    audit(actor, "product.update", { id, sku });
    return { product: db.prepare("SELECT * FROM products WHERE id = ?").get(id) };
  }
  const result = db.prepare(`INSERT INTO products(sku, barcode, title, status, shopify_product_id, shopify_variant_id, target_margin_pct, commission_pct, gateway_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sku, payload?.barcode || null, title, payload?.status || "active", payload?.shopify_product_id || null, payload?.shopify_variant_id || null, Number(payload?.target_margin_pct || 0), Number(payload?.commission_pct || 0), Number(payload?.gateway_pct || 0));
  queueChange("products", result.lastInsertRowid, "create", payload);
  audit(actor, "product.create", { id: result.lastInsertRowid, sku });
  return { product: db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid) };
}

export function upsertSimple(table, payload, actor = "system") {
  const db = getProductDb();
  const allowed = new Set(["ingredients", "suppliers", "packaging_items", "price_tiers", "cost_inputs_period", "ingredient_prices", "bom_recipes", "bom_lines", "packaging_profiles", "packaging_lines", "product_prices", "compliance_profiles"]);
  if (!allowed.has(table)) return { error: "invalid table" };
  const id = payload?.id ? Number(payload.id) : null;
  if (id) {
    const cols = Object.keys(payload).filter((k) => k !== "id");
    const set = cols.map((c) => `${c} = ?`).join(", ");
    db.prepare(`UPDATE ${table} SET ${set}${set ? ", " : ""}updated_at = datetime('now') WHERE id = ?`).run(...cols.map((c) => payload[c]), id);
    queueChange(table, id, "update", payload);
    audit(actor, `${table}.update`, { id });
    return { row: db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) };
  }
  const cols = Object.keys(payload);
  const vals = cols.map((c) => payload[c]);
  const marks = cols.map(() => "?").join(", ");
  const result = db.prepare(`INSERT INTO ${table}(${cols.join(",")}) VALUES (${marks})`).run(...vals);
  queueChange(table, result.lastInsertRowid, "create", payload);
  audit(actor, `${table}.create`, { id: result.lastInsertRowid });
  return { row: db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid) };
}

export function listTable(table) {
  const db = getProductDb();
  return db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
}

export function getDashboard(asOfDate, tier = "public") {
  const db = getProductDb();
  const products = db.prepare("SELECT * FROM products ORDER BY title").all();
  const rows = products.map((p) => computeTrueCost(p.id, asOfDate, tier));

  const alerts = [];
  for (const row of rows) {
    if (row.error) continue;
    if (!row.recipe) alerts.push({ severity: "warning", type: "missing_bom", product_id: row.product.id, sku: row.product.sku });
    if (!row.packaging_profile) alerts.push({ severity: "warning", type: "missing_packaging", product_id: row.product.id, sku: row.product.sku });
    if (row.pricing.margin_pct < Number(row.product.target_margin_pct || 0)) alerts.push({ severity: "critical", type: "low_margin", product_id: row.product.id, sku: row.product.sku, margin_pct: row.pricing.margin_pct });
  }

  const outdatedPrices = db.prepare(`
    SELECT i.id ingredient_id, i.name ingredient_name, MAX(ip.effective_from) last_effective_from
    FROM ingredients i
    LEFT JOIN ingredient_prices ip ON ip.ingredient_id = i.id
    GROUP BY i.id, i.name
  `).all().filter((x) => !x.last_effective_from || (new Date(asOfDate) - new Date(x.last_effective_from)) / (1000*60*60*24) > 90);

  return {
    as_of_date: asOfDate,
    rows: rows.filter((r) => !r.error),
    alerts: [...alerts, ...outdatedPrices.map((p) => ({ severity: "warning", type: "outdated_ingredient_price", ...p }))]
  };
}

export function generateCompliance(productId) {
  const db = getProductDb();
  const recipe = db.prepare("SELECT * FROM bom_recipes WHERE product_id=? ORDER BY date(effective_from) DESC, version DESC LIMIT 1").get(productId);
  if (!recipe) return { error: "No active recipe" };
  const lines = db.prepare(`
    SELECT i.name, i.allergen_flags, bl.grams_used
    FROM bom_lines bl JOIN ingredients i ON i.id = bl.ingredient_id
    WHERE bl.recipe_id = ?
    ORDER BY bl.grams_used DESC
  `).all(recipe.id);
  const ingredientsText = lines.map((l) => l.name).join(", ");
  const allergens = [...new Set(lines.flatMap((l) => json(l.allergen_flags, [])))];

  const existing = db.prepare("SELECT * FROM compliance_profiles WHERE product_id = ?").get(productId);
  if (existing) db.prepare("UPDATE compliance_profiles SET ingredients_text=?, allergens=?, updated_at=datetime('now') WHERE product_id=?").run(ingredientsText, JSON.stringify(allergens), productId);
  else db.prepare("INSERT INTO compliance_profiles(product_id, ingredients_text, allergens) VALUES (?, ?, ?)").run(productId, ingredientsText, JSON.stringify(allergens));

  queueChange("compliance_profiles", productId, "upsert", { ingredients_text: ingredientsText, allergens });
  return { product_id: productId, ingredients_text: ingredientsText, allergens };
}

export function getSyncStatus() {
  const db = getProductDb();
  const state = db.prepare("SELECT * FROM sync_state WHERE id = 1").get();
  const queued = db.prepare("SELECT COUNT(*) c FROM change_log WHERE sync_status IN ('pending','failed')").get().c;
  const failures = db.prepare("SELECT * FROM change_log WHERE sync_status='failed' ORDER BY updated_at DESC LIMIT 20").all();
  const conflicts = db.prepare("SELECT * FROM sync_conflicts WHERE resolution_status='open' ORDER BY created_at DESC").all();
  return { ...state, queued_changes: queued, failures, conflicts };
}

export function applyRemoteField(entityType, entityId, field, remoteValue) {
  const db = getProductDb();
  if (entityType !== "compliance_profiles") return { ok: true, ignored: true };
  const local = db.prepare("SELECT * FROM compliance_profiles WHERE product_id=?").get(entityId);
  if (!local || !ownFields.has(field)) return { ok: true, ignored: true };
  const localValue = field === "allergens" ? JSON.stringify(json(local[field], [])) : String(local[field] || "");
  const remoteNormalized = typeof remoteValue === "string" ? remoteValue : JSON.stringify(remoteValue);
  if (localValue !== remoteNormalized) {
    db.prepare("INSERT INTO sync_conflicts(entity_type, entity_id, field_name, local_value, remote_value) VALUES (?, ?, ?, ?, ?)")
      .run(entityType, String(entityId), field, localValue, remoteNormalized);
    audit("sync", "sync.conflict", { entityType, entityId, field });
    return { ok: false, conflict: true };
  }
  return { ok: true };
}

export function createBackupSnapshot() {
  const dbPath = path.resolve(config.LOCAL_DB_PATH);
  const backupDir = path.resolve(config.BACKUPS_PATH);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const target = path.join(backupDir, `${date}.sqlite`);
  fs.copyFileSync(dbPath, target);
  audit("system", "backup.daily", { target });
  return { path: target };
}

export async function exportSnapshotZip() {
  const dbPath = path.resolve(config.LOCAL_DB_PATH);
  const assetsDir = path.resolve(config.ASSETS_PATH);
  const backupDir = path.resolve(config.BACKUPS_PATH);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:]/g, "-");
  const zipPath = path.join(backupDir, `snapshot-${stamp}.zip`);

  const zip = new JSZip();
  if (fs.existsSync(dbPath)) zip.file("flss-products.sqlite", fs.readFileSync(dbPath));
  zip.file("config-template.env", [
    "LOCAL_DB_PATH=data/flss-products.sqlite",
    "ASSETS_PATH=data/assets/products",
    "BACKUPS_PATH=data/backups",
    "SYNC_ENABLED=true"
  ].join("\n"));

  const addDir = (root, folder) => {
    if (!fs.existsSync(folder)) return;
    const items = fs.readdirSync(folder, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(folder, item.name);
      if (item.isDirectory()) addDir(root, full);
      else zip.file(path.relative(root, full), fs.readFileSync(full));
    }
  };
  addDir(path.resolve("data"), assetsDir);

  const content = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(zipPath, content);
  audit("system", "backup.export", { zipPath });
  return { path: zipPath };
}
