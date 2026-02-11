import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "..", "..", "data");
const dataFile = path.join(dataDir, "corporate-identity-labels.json");

function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeVariant(variant = {}) {
  return {
    id: normalizeString(variant.id) || `var_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: normalizeString(variant.name),
    size: normalizeString(variant.size),
    weight: normalizeString(variant.weight),
    barcode: normalizeString(variant.barcode),
    ingredients: normalizeString(variant.ingredients),
    allergens: normalizeString(variant.allergens),
    nutritionalInfoZA: normalizeString(variant.nutritionalInfoZA),
    labelSize: normalizeString(variant.labelSize),
    materialCoating: normalizeString(variant.materialCoating),
    updatedAt: normalizeString(variant.updatedAt) || new Date().toISOString()
  };
}

function normalizeFlavor(flavor = {}) {
  return {
    id: normalizeString(flavor.id) || `flv_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: normalizeString(flavor.name),
    notes: normalizeString(flavor.notes),
    variants: normalizeArray(flavor.variants).map((variant) => normalizeVariant(variant)),
    updatedAt: normalizeString(flavor.updatedAt) || new Date().toISOString()
  };
}

function normalizeDesign(design = {}) {
  return {
    id: normalizeString(design.id) || `dsg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name: normalizeString(design.name),
    mimeType: normalizeString(design.mimeType),
    uploadedAt: normalizeString(design.uploadedAt) || new Date().toISOString(),
    dataUrl: normalizeString(design.dataUrl)
  };
}

function normalizeLabelRecord(payload = {}) {
  return {
    id: normalizeString(payload.id) || `lbl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    title: normalizeString(payload.title),
    category: normalizeString(payload.category) || "Corporate Identity",
    flavors: normalizeArray(payload.flavors).map((flavor) => normalizeFlavor(flavor)),
    blanketDesigns: normalizeArray(payload.blanketDesigns).map((design) => normalizeDesign(design)),
    createdAt: normalizeString(payload.createdAt) || new Date().toISOString(),
    updatedAt: normalizeString(payload.updatedAt) || new Date().toISOString()
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    const initial = { records: [], updatedAt: new Date().toISOString() };
    await fs.writeFile(dataFile, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { records: [], updatedAt: new Date().toISOString() };
    return {
      records: normalizeArray(parsed.records).map((record) => normalizeLabelRecord(record)),
      updatedAt: normalizeString(parsed.updatedAt) || new Date().toISOString()
    };
  } catch {
    return { records: [], updatedAt: new Date().toISOString() };
  }
}

async function writeStore(store) {
  const normalized = {
    records: normalizeArray(store.records).map((record) => normalizeLabelRecord(record)),
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(dataFile, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

export async function listLabelRecords() {
  const store = await readStore();
  return store.records;
}

export async function upsertLabelRecord(payload = {}) {
  const store = await readStore();
  const record = normalizeLabelRecord(payload);
  record.updatedAt = new Date().toISOString();
  const idx = store.records.findIndex((item) => item.id === record.id);
  if (idx >= 0) {
    record.createdAt = store.records[idx].createdAt || record.createdAt;
    store.records[idx] = record;
  } else {
    store.records.unshift(record);
  }
  const updated = await writeStore(store);
  return updated.records.find((item) => item.id === record.id) || record;
}
