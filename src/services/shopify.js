import { config } from "../config.js";

let cachedToken = null;
let tokenExpiresAtMs = 0;

function parsePriceTiers(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchNewShopifyAdminToken() {
  const url = `https://${config.SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`;

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", config.SHOPIFY_CLIENT_ID);
  body.set("client_secret", config.SHOPIFY_CLIENT_SECRET);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Shopify token request failed (${resp.status}): ${text}`);
  }

  const data = JSON.parse(text);
  if (!data.access_token) {
    throw new Error(`Shopify token response missing access_token: ${text}`);
  }

  const expiresInSec = Number(data.expires_in || 0);
  const bufferMs = 60_000;
  cachedToken = data.access_token;
  tokenExpiresAtMs = Date.now() + Math.max(0, expiresInSec * 1000 - bufferMs);

  return cachedToken;
}

export async function getShopifyAdminToken() {
  if (cachedToken && Date.now() < tokenExpiresAtMs) return cachedToken;
  return fetchNewShopifyAdminToken();
}

export async function shopifyFetch(pathname, { method = "GET", headers = {}, body } = {}) {
  const token = await getShopifyAdminToken();
  const url = `https://${config.SHOPIFY_STORE}.myshopify.com${pathname}`;

  const resp = await fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers
    },
    body
  });

  if (resp.status === 401 || resp.status === 403) {
    cachedToken = null;
    tokenExpiresAtMs = 0;
    const token2 = await getShopifyAdminToken();
    return fetch(url, {
      method,
      headers: {
        "X-Shopify-Access-Token": token2,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers
      },
      body
    });
  }

  return resp;
}

export async function fetchVariantPriceTiers(variantId) {
  if (!variantId) return null;
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const url = `${base}/variants/${variantId}/metafields.json?namespace=custom&key=price_tiers`;
  const resp = await shopifyFetch(url, { method: "GET" });
  if (!resp.ok) return null;
  const data = await resp.json();
  const meta = Array.isArray(data.metafields) ? data.metafields[0] : null;
  if (!meta) return null;
  return {
    id: meta.id,
    value: parsePriceTiers(meta.value)
  };
}

export async function fetchVariantPrice(variantId) {
  if (!variantId) return null;
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const url = `${base}/variants/${variantId}.json?fields=id,price`;
  const resp = await shopifyFetch(url, { method: "GET" });
  if (!resp.ok) return null;
  const data = await resp.json();
  const price = Number(data?.variant?.price);
  return Number.isFinite(price) ? price : null;
}

export async function upsertVariantPriceTiers(variantId, priceTiers) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const existing = await fetchVariantPriceTiers(variantId);
  const payload = {
    metafield: {
      namespace: "custom",
      key: "price_tiers",
      type: "json",
      value: JSON.stringify(priceTiers || {})
    }
  };
  if (existing?.id) {
    return shopifyFetch(`${base}/metafields/${existing.id}.json`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }
  return shopifyFetch(`${base}/variants/${variantId}/metafields.json`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateVariantPrice(variantId, price) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const payload = {
    variant: {
      id: variantId,
      price: String(price)
    }
  };
  return shopifyFetch(`${base}/variants/${variantId}.json`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

let cachedLocationId = null;
let locationFetchedAtMs = 0;

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

export async function fetchPrimaryLocationId() {
  const cacheTtlMs = 5 * 60 * 1000;
  if (cachedLocationId && Date.now() - locationFetchedAtMs < cacheTtlMs) {
    return cachedLocationId;
  }

  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const resp = await shopifyFetch(`${base}/locations.json`, { method: "GET" });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Shopify locations fetch failed (${resp.status}): ${body}`);
  }
  const data = await resp.json();
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const primary = locations.find((loc) => loc.active !== false) || locations[0];
  if (!primary?.id) {
    throw new Error("No Shopify locations available.");
  }
  cachedLocationId = primary.id;
  locationFetchedAtMs = Date.now();
  return cachedLocationId;
}

export async function fetchInventoryItemIdsForVariants(variantIds = []) {
  const ids = variantIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  if (!ids.length) return new Map();

  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const idMap = new Map();
  const chunks = chunkArray(ids, 50);
  for (const chunk of chunks) {
    const url = `${base}/variants.json?ids=${chunk.join(",")}&fields=id,inventory_item_id`;
    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Shopify variants fetch failed (${resp.status}): ${body}`);
    }
    const data = await resp.json();
    const variants = Array.isArray(data.variants) ? data.variants : [];
    variants.forEach((variant) => {
      if (variant?.id && variant?.inventory_item_id) {
        idMap.set(Number(variant.id), Number(variant.inventory_item_id));
      }
    });
  }
  return idMap;
}

export async function fetchInventoryLevelsForItems(inventoryItemIds = [], locationId) {
  const ids = inventoryItemIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  if (!ids.length) return new Map();

  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const levelMap = new Map();
  const chunks = chunkArray(ids, 50);
  for (const chunk of chunks) {
    const params = new URLSearchParams();
    params.set("inventory_item_ids", chunk.join(","));
    if (locationId) params.set("location_ids", String(locationId));
    const url = `${base}/inventory_levels.json?${params.toString()}`;
    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Shopify inventory levels fetch failed (${resp.status}): ${body}`);
    }
    const data = await resp.json();
    const levels = Array.isArray(data.inventory_levels) ? data.inventory_levels : [];
    levels.forEach((level) => {
      if (level?.inventory_item_id != null) {
        levelMap.set(Number(level.inventory_item_id), Number(level.available || 0));
      }
    });
  }
  return levelMap;
}

export async function setInventoryLevel({ inventoryItemId, locationId, available }) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const resp = await shopifyFetch(`${base}/inventory_levels/set.json`, {
    method: "POST",
    body: JSON.stringify({
      location_id: Number(locationId),
      inventory_item_id: Number(inventoryItemId),
      available: Math.max(0, Math.floor(Number(available)))
    })
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Shopify inventory set failed (${resp.status}): ${body}`);
  }
  const data = await resp.json();
  return data?.inventory_level || null;
}

export async function adjustInventoryLevel({ inventoryItemId, locationId, adjustment }) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const resp = await shopifyFetch(`${base}/inventory_levels/adjust.json`, {
    method: "POST",
    body: JSON.stringify({
      location_id: Number(locationId),
      inventory_item_id: Number(inventoryItemId),
      available_adjustment: Math.floor(Number(adjustment || 0))
    })
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Shopify inventory adjust failed (${resp.status}): ${body}`);
  }
  const data = await resp.json();
  return data?.inventory_level || null;
}
