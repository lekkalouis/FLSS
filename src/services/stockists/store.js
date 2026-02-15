import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const DATA_PATH = path.join(process.cwd(), "data", "stockists.json");

const STOCKIST_TYPES = new Set(["AGENT", "RETAILER"]);
const SKU_AVAILABILITY = new Set(["Core Range", "Extended Range", "On Request"]);

const EMPTY_STATE = {
  stockists: [],
  agentRetailers: [],
  agentSkuRange: [],
  geocodeCache: {}
};

let writeChain = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeStockist(input = {}, existing = {}) {
  const type = normalizeText(input.type || existing.type || "AGENT").toUpperCase();
  if (!STOCKIST_TYPES.has(type)) {
    throw new Error("Invalid stockist type. Expected AGENT or RETAILER.");
  }

  const createdAt = existing.created_at || nowIso();
  return {
    id: existing.id || randomUUID(),
    name: normalizeText(input.name, existing.name),
    type,
    is_shopify_customer: Boolean(
      input.is_shopify_customer ?? existing.is_shopify_customer ?? false
    ),
    shopify_customer_id: normalizeText(
      input.shopify_customer_id,
      existing.shopify_customer_id || ""
    ) || null,
    active: Boolean(input.active ?? existing.active ?? true),
    phone: normalizeText(input.phone, existing.phone || "") || null,
    email: normalizeText(input.email, existing.email || "") || null,
    website: normalizeText(input.website, existing.website || "") || null,
    address_line1: normalizeText(input.address_line1, existing.address_line1 || ""),
    suburb: normalizeText(input.suburb, existing.suburb || ""),
    city: normalizeText(input.city, existing.city || ""),
    province: normalizeText(input.province, existing.province || ""),
    postal_code: normalizeText(input.postal_code, existing.postal_code || ""),
    country: normalizeText(input.country, existing.country || "ZA") || "ZA",
    lat: normalizeNumber(input.lat ?? existing.lat),
    lng: normalizeNumber(input.lng ?? existing.lng),
    coverage_area: normalizeText(input.coverage_area, existing.coverage_area || "") || null,
    agent_code: normalizeText(input.agent_code, existing.agent_code || "") || null,
    show_in_locator: Boolean(input.show_in_locator ?? existing.show_in_locator ?? true),
    created_at: createdAt,
    updated_at: nowIso()
  };
}

function normalizeAgentRetailer(input = {}, existing = {}) {
  const createdAt = existing.created_at || nowIso();
  return {
    id: existing.id || randomUUID(),
    agent_id: normalizeText(input.agent_id, existing.agent_id),
    retailer_name: normalizeText(input.retailer_name, existing.retailer_name),
    retailer_phone: normalizeText(input.retailer_phone, existing.retailer_phone || "") || null,
    address_line1: normalizeText(input.address_line1, existing.address_line1 || ""),
    suburb: normalizeText(input.suburb, existing.suburb || ""),
    city: normalizeText(input.city, existing.city || ""),
    province: normalizeText(input.province, existing.province || ""),
    postal_code: normalizeText(input.postal_code, existing.postal_code || ""),
    country: normalizeText(input.country, existing.country || "ZA") || "ZA",
    lat: normalizeNumber(input.lat ?? existing.lat),
    lng: normalizeNumber(input.lng ?? existing.lng),
    active: Boolean(input.active ?? existing.active ?? true),
    notes: normalizeText(input.notes, existing.notes || "") || null,
    confidence_level:
      normalizeText(input.confidence_level, existing.confidence_level || "") || null,
    created_at: createdAt,
    updated_at: nowIso()
  };
}

function normalizeAgentSkuRange(input = {}, existing = {}) {
  const label = normalizeText(
    input.availability_label,
    existing.availability_label || "Core Range"
  );
  if (!SKU_AVAILABILITY.has(label)) {
    throw new Error(`Invalid availability label: ${label}`);
  }

  const createdAt = existing.created_at || nowIso();
  return {
    id: existing.id || randomUUID(),
    agent_id: normalizeText(input.agent_id, existing.agent_id),
    sku: normalizeText(input.sku, existing.sku).toUpperCase(),
    availability_label: label,
    priority_score: Number.isFinite(Number(input.priority_score))
      ? Number(input.priority_score)
      : Number(existing.priority_score || 0),
    created_at: createdAt,
    updated_at: nowIso()
  };
}

async function ensureStore() {
  try {
    await fs.access(DATA_PATH);
  } catch {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
  }
}

async function readState() {
  await ensureStore();
  const raw = await fs.readFile(DATA_PATH, "utf8");
  const parsed = JSON.parse(raw || "{}");
  return {
    ...EMPTY_STATE,
    ...parsed,
    stockists: Array.isArray(parsed.stockists) ? parsed.stockists : [],
    agentRetailers: Array.isArray(parsed.agentRetailers) ? parsed.agentRetailers : [],
    agentSkuRange: Array.isArray(parsed.agentSkuRange) ? parsed.agentSkuRange : [],
    geocodeCache:
      parsed.geocodeCache && typeof parsed.geocodeCache === "object"
        ? parsed.geocodeCache
        : {}
  };
}

async function writeState(state) {
  writeChain = writeChain.then(async () => {
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(state, null, 2), "utf8");
  });
  await writeChain;
}

function withStateMutator(mutator) {
  return async (...args) => {
    const state = await readState();
    const result = await mutator(state, ...args);
    await writeState(state);
    return result;
  };
}

export async function getStockistState() {
  return readState();
}

export const upsertStockist = withStateMutator(async (state, payload) => {
  const normalizedPayload = normalizeStockist(payload);
  if (!normalizedPayload.name) throw new Error("Stockist name is required.");

  const existingIndex = state.stockists.findIndex(
    (item) => item.id === payload.id || item.shopify_customer_id === normalizedPayload.shopify_customer_id
  );

  if (existingIndex >= 0) {
    const merged = normalizeStockist(normalizedPayload, state.stockists[existingIndex]);
    state.stockists[existingIndex] = merged;
    return merged;
  }

  state.stockists.push(normalizedPayload);
  return normalizedPayload;
});

export const addAgentRetailer = withStateMutator(async (state, payload) => {
  const normalized = normalizeAgentRetailer(payload);
  if (!normalized.agent_id) throw new Error("agent_id is required.");
  if (!normalized.retailer_name) throw new Error("retailer_name is required.");

  const agent = state.stockists.find(
    (stockist) => stockist.id === normalized.agent_id && stockist.type === "AGENT"
  );
  if (!agent) throw new Error("Agent not found for this retailer entry.");

  state.agentRetailers.push(normalized);
  return normalized;
});

export const updateAgentRetailer = withStateMutator(async (state, retailerId, payload) => {
  const index = state.agentRetailers.findIndex((item) => item.id === retailerId);
  if (index < 0) return null;

  const merged = normalizeAgentRetailer(payload, state.agentRetailers[index]);
  if (!merged.agent_id) throw new Error("agent_id is required.");
  if (!merged.retailer_name) throw new Error("retailer_name is required.");

  state.agentRetailers[index] = merged;
  return merged;
});

export const removeAgentRetailer = withStateMutator(async (state, retailerId) => {
  const index = state.agentRetailers.findIndex((item) => item.id === retailerId);
  if (index < 0) return false;
  state.agentRetailers.splice(index, 1);
  return true;
});

export const replaceAgentSkuRange = withStateMutator(async (state, agentId, skuList) => {
  const agent = state.stockists.find((item) => item.id === agentId && item.type === "AGENT");
  if (!agent) throw new Error("Agent not found for sku range.");

  state.agentSkuRange = state.agentSkuRange.filter((entry) => entry.agent_id !== agentId);
  const normalizedList = (Array.isArray(skuList) ? skuList : []).map((entry) =>
    normalizeAgentSkuRange({ ...entry, agent_id: agentId })
  );
  state.agentSkuRange.push(...normalizedList);
  return normalizedList;
});

export const cacheGeocodeLookup = withStateMutator(async (state, key, value) => {
  state.geocodeCache[key] = {
    lat: normalizeNumber(value?.lat),
    lng: normalizeNumber(value?.lng),
    cached_at: nowIso()
  };
  return state.geocodeCache[key];
});

export async function getGeocodeLookup(key) {
  const state = await readState();
  return state.geocodeCache[key] || null;
}
