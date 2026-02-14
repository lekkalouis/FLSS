import { config } from "../../config.js";
import { shopifyFetch } from "../shopify.js";
import {
  addAgentRetailer,
  cacheGeocodeLookup,
  getGeocodeLookup,
  getStockistState,
  replaceAgentSkuRange,
  upsertStockist
} from "./store.js";

const LOCATOR_CACHE_TTL_MS = 15 * 60 * 1000;
const locatorCache = new Map();

function getCached(key) {
  const item = locatorCache.get(key);
  if (!item) return null;
  if (Date.now() - item.cachedAt > LOCATOR_CACHE_TTL_MS) {
    locatorCache.delete(key);
    return null;
  }
  return item.payload;
}

function setCached(key, payload) {
  locatorCache.set(key, { cachedAt: Date.now(), payload });
}

export function clearLocatorCache() {
  locatorCache.clear();
}

function normalizeLocationString(record = {}) {
  return [record.address_line1, record.suburb, record.city, record.province, record.postal_code, record.country]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(", ");
}

export async function geocodeDirectoryAddress(record) {
  const query = normalizeLocationString(record);
  if (!query) return null;

  const cached = await getGeocodeLookup(query);
  if (cached?.lat && cached?.lng) return cached;

  try {
    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const resp = await fetch(endpoint, {
      headers: {
        "User-Agent": "FLSS-Store-Locator/1.0"
      }
    });

    if (!resp.ok) return null;
    const json = await resp.json();
    const best = Array.isArray(json) ? json[0] : null;
    if (!best?.lat || !best?.lon) return null;

    const geocode = {
      lat: Number(best.lat),
      lng: Number(best.lon)
    };
    await cacheGeocodeLookup(query, geocode);
    return geocode;
  } catch {
    return null;
  }
}

function asAgentSummary(state, agent) {
  const retailers = state.agentRetailers.filter(
    (retailer) => retailer.agent_id === agent.id && retailer.active
  );

  return {
    ...agent,
    retailer_count: retailers.length
  };
}

export async function listLocatorAgents() {
  const cacheKey = "locator:agents";
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const state = await getStockistState();
  const payload = state.stockists
    .filter(
      (item) =>
        item.type === "AGENT" &&
        item.active &&
        item.show_in_locator !== false &&
        Number.isFinite(Number(item.lat)) &&
        Number.isFinite(Number(item.lng))
    )
    .map((agent) => asAgentSummary(state, agent));

  setCached(cacheKey, payload);
  return payload;
}


export async function listAdminAgents() {
  const state = await getStockistState();
  return state.stockists
    .filter((item) => item.type === "AGENT")
    .map((agent) => ({
      ...agent,
      retailer_count: state.agentRetailers.filter((retailer) => retailer.agent_id === agent.id && retailer.active).length
    }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

export async function getAgentLocatorDetail(agentId) {
  const cacheKey = `locator:agent:${agentId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const state = await getStockistState();
  const agent = state.stockists.find((item) => item.id === agentId && item.type === "AGENT");
  if (!agent) return null;

  const retailers = state.agentRetailers.filter(
    (item) => item.agent_id === agentId && item.active
  );
  const skuRange = state.agentSkuRange
    .filter((item) => item.agent_id === agentId)
    .sort((a, b) => Number(b.priority_score || 0) - Number(a.priority_score || 0));

  const payload = {
    agent,
    retailers,
    sku_range: skuRange
  };

  setCached(cacheKey, payload);
  return payload;
}

export async function listRetailersByAgent(agentId) {
  const state = await getStockistState();
  return state.agentRetailers.filter(
    (item) => item.agent_id === agentId && item.active
  );
}

function getMetaValue(metafields = [], key) {
  return metafields.find((entry) => entry.namespace === "flss" && entry.key === key)?.value || null;
}

function parseShowInLocator(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function parseCustomerTags(tags) {
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function customerHasAnyTag(customer, expectedTags = []) {
  const tags = parseCustomerTags(customer?.tags);
  return expectedTags.some((tag) => tags.includes(String(tag || "").trim().toLowerCase()));
}

async function fetchCustomersByTag(base, tag) {
  const resp = await shopifyFetch(
    `${base}/customers/search.json?limit=250&query=${encodeURIComponent(`tag:${tag}`)}`,
    { method: "GET" }
  );
  if (!resp.ok) {
    throw new Error(`Shopify customer search failed for tag ${tag} with status ${resp.status}`);
  }

  const data = await resp.json();
  return Array.isArray(data.customers) ? data.customers : [];
}

export async function syncAgentsFromShopify() {
  if (!config.SHOPIFY_STORE || !config.SHOPIFY_CLIENT_SECRET) {
    throw new Error("Shopify is not configured.");
  }

  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const tagQueries = ["STOCKIST_AGENT", "AGENT", "RETAILER", "STOCKIST_RETAILER"];
  const customerById = new Map();
  for (const tag of tagQueries) {
    const customers = await fetchCustomersByTag(base, tag);
    for (const customer of customers) {
      if (customer?.id) customerById.set(String(customer.id), customer);
    }
  }

  const customers = [...customerById.values()];
  const synced = [];

  for (const customer of customers) {
    const metaResp = await shopifyFetch(`${base}/customers/${customer.id}/metafields.json`, {
      method: "GET"
    });
    const metaData = metaResp.ok ? await metaResp.json() : { metafields: [] };
    const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];

    const tags = parseCustomerTags(customer.tags);
    const isAgentProfile = customerHasAnyTag(customer, ["stockist_agent", "agent"]);
    const isRetailerProfile = customerHasAnyTag(customer, ["stockist_retailer", "retailer"]);
    if (!isAgentProfile && !isRetailerProfile) continue;

    const defaultAddress = customer.default_address || customer.addresses?.[0] || {};
    const stockist = await upsertStockist({
      name: customer.first_name || customer.last_name
        ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
        : customer.email || customer.phone || `Agent ${customer.id}`,
      type: isRetailerProfile && !isAgentProfile ? "RETAILER" : "AGENT",
      active: tags.includes("stockist_active") || tags.includes("active"),
      is_shopify_customer: true,
      shopify_customer_id: String(customer.id),
      phone: customer.phone || null,
      email: customer.email || null,
      address_line1: defaultAddress.address1 || "",
      suburb: defaultAddress.address2 || "",
      city: defaultAddress.city || "",
      province: defaultAddress.province || "",
      postal_code: defaultAddress.zip || "",
      country: defaultAddress.country_code || "ZA",
      lat: defaultAddress.latitude ?? null,
      lng: defaultAddress.longitude ?? null,
      coverage_area: getMetaValue(metafields, "coverage_area"),
      agent_code: getMetaValue(metafields, "agent_code"),
      show_in_locator: parseShowInLocator(getMetaValue(metafields, "show_in_locator"))
    });
    synced.push(stockist);
  }

  clearLocatorCache();
  return { synced_count: synced.length, synced_agents: synced };
}

export async function addRetailerWithGeocode(payload) {
  let enriched = { ...payload };
  if (!enriched.lat || !enriched.lng) {
    const geocoded = await geocodeDirectoryAddress(payload);
    if (geocoded?.lat && geocoded?.lng) {
      enriched = { ...enriched, lat: geocoded.lat, lng: geocoded.lng };
    }
  }

  const saved = await addAgentRetailer(enriched);
  clearLocatorCache();
  return saved;
}

export async function replaceSkuRange(agentId, skuRange) {
  const list = await replaceAgentSkuRange(agentId, skuRange);
  clearLocatorCache();
  return list;
}

export function parseRetailerBulkRows(rawInput) {
  const text = String(rawInput || "").trim();
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [retailer_name, city = "", province = ""] = line.split(",").map((part) => part.trim());
      return {
        retailer_name,
        city,
        province
      };
    })
    .filter((entry) => entry.retailer_name);
}
