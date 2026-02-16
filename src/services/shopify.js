import { config } from "../config.js";
import { fetchWithTimeout } from "../utils/http.js";

let cachedToken = null;
let tokenExpiresAtMs = 0;
const SHOPIFY_MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNumberConfig(value, fallback, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

const SHOPIFY_THROTTLE_MAX_CONCURRENCY = Math.max(
  1,
  Math.floor(getNumberConfig(config.SHOPIFY_THROTTLE_MAX_CONCURRENCY, 4, 1))
);
const SHOPIFY_THROTTLE_BASE_DELAY_MS = getNumberConfig(config.SHOPIFY_THROTTLE_BASE_DELAY_MS, 250, 0);
const SHOPIFY_THROTTLE_MAX_DELAY_MS = Math.max(
  SHOPIFY_THROTTLE_BASE_DELAY_MS,
  getNumberConfig(config.SHOPIFY_THROTTLE_MAX_DELAY_MS, 5000, SHOPIFY_THROTTLE_BASE_DELAY_MS)
);
const SHOPIFY_THROTTLE_CALL_LIMIT_RATIO = Math.min(
  1,
  getNumberConfig(config.SHOPIFY_THROTTLE_CALL_LIMIT_RATIO, 0.85, 0)
);

let shopifyActiveRequests = 0;
const shopifyPendingQueue = [];
let shopifyBackoffUntilMs = 0;

function parseRetryAfterMs(resp) {
  const retryAfter = Number(resp.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.max(SHOPIFY_THROTTLE_BASE_DELAY_MS, Math.ceil(retryAfter * 1000));
  }
  return 0;
}

function getRetryDelayMs(resp, attempt) {
  const retryAfterMs = parseRetryAfterMs(resp);
  if (retryAfterMs > 0) return Math.min(SHOPIFY_THROTTLE_MAX_DELAY_MS, retryAfterMs);
  const exponentialMs = SHOPIFY_THROTTLE_BASE_DELAY_MS * 2 ** attempt;
  return Math.min(SHOPIFY_THROTTLE_MAX_DELAY_MS, exponentialMs);
}

function getCallLimitRatio(resp) {
  const value = resp.headers.get("x-shopify-shop-api-call-limit");
  if (!value) return null;
  const [usedRaw, capRaw] = value.split("/");
  const used = Number(usedRaw);
  const cap = Number(capRaw);
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return null;
  return used / cap;
}

function getPressureDelayMs(resp, attempt) {
  if (resp.status === 429) {
    return getRetryDelayMs(resp, attempt);
  }
  const ratio = getCallLimitRatio(resp);
  if (ratio == null || ratio < SHOPIFY_THROTTLE_CALL_LIMIT_RATIO) {
    return 0;
  }
  const pressureWeight = (ratio - SHOPIFY_THROTTLE_CALL_LIMIT_RATIO) / Math.max(0.01, 1 - SHOPIFY_THROTTLE_CALL_LIMIT_RATIO);
  const scaledDelay = SHOPIFY_THROTTLE_BASE_DELAY_MS * (1 + pressureWeight * 2);
  return Math.min(SHOPIFY_THROTTLE_MAX_DELAY_MS, Math.ceil(scaledDelay));
}

function registerShopifyPressure(delayMs) {
  if (delayMs <= 0) return;
  shopifyBackoffUntilMs = Math.max(shopifyBackoffUntilMs, Date.now() + delayMs);
}

async function waitForShopifyBackoff() {
  const waitMs = Math.max(0, shopifyBackoffUntilMs - Date.now());
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  return waitMs;
}

function drainShopifyQueue() {
  while (shopifyActiveRequests < SHOPIFY_THROTTLE_MAX_CONCURRENCY && shopifyPendingQueue.length > 0) {
    const next = shopifyPendingQueue.shift();
    if (!next) break;
    shopifyActiveRequests += 1;
    const queueWaitMs = Date.now() - next.enqueuedAtMs;

    Promise.resolve()
      .then(async () => {
        const pressureWaitMs = await waitForShopifyBackoff();
        next.onScheduled?.({ queueWaitMs, pressureWaitMs });
        return next.task();
      })
      .then(next.resolve, next.reject)
      .finally(() => {
        shopifyActiveRequests = Math.max(0, shopifyActiveRequests - 1);
        drainShopifyQueue();
      });
  }
}

function withShopifyThrottle(task, options = {}) {
  return new Promise((resolve, reject) => {
    shopifyPendingQueue.push({
      task,
      resolve,
      reject,
      onScheduled: options.onScheduled,
      enqueuedAtMs: Date.now()
    });
    drainShopifyQueue();
  });
}

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

  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    },
    config.SHOPIFY_TIMEOUT_MS,
    {
      upstream: "shopify",
      route: "shopify-token",
      target: url
    }
  );

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
  const url = `https://${config.SHOPIFY_STORE}.myshopify.com${pathname}`;
  const metric = {
    queueWaitMs: 0,
    pressureWaitMs: 0,
    attempts: 0
  };
  const requestStartedAtMs = Date.now();

  const executeFetch = async () => {
    let token = await getShopifyAdminToken();

    for (let attempt = 0; attempt < SHOPIFY_MAX_RETRIES; attempt += 1) {
      metric.attempts = attempt + 1;
      const resp = await fetchWithTimeout(
        url,
        {
          method,
          headers: {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...headers
          },
          body
        },
        config.SHOPIFY_TIMEOUT_MS,
        {
          upstream: "shopify",
          route: `shopifyFetch ${method} ${pathname}`,
          target: url
        }
      );

      const pressureDelayMs = getPressureDelayMs(resp, attempt);
      if (pressureDelayMs > 0) {
        registerShopifyPressure(pressureDelayMs);
      }

      if (resp.status === 401 || resp.status === 403) {
        if (attempt >= SHOPIFY_MAX_RETRIES - 1) return resp;
        cachedToken = null;
        tokenExpiresAtMs = 0;
        token = await getShopifyAdminToken();
        continue;
      }

      if (resp.status === 429) {
        if (attempt >= SHOPIFY_MAX_RETRIES - 1) return resp;
        const retryDelayMs = getRetryDelayMs(resp, attempt);
        registerShopifyPressure(retryDelayMs);
        await sleep(retryDelayMs);
        continue;
      }

      return resp;
    }

    return fetchWithTimeout(
      url,
      {
        method,
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...headers
        },
        body
      },
      config.SHOPIFY_TIMEOUT_MS,
      {
        upstream: "shopify",
        route: `shopifyFetch ${method} ${pathname}`,
        target: url
      }
    );
  };

  let resp;
  try {
    resp = await withShopifyThrottle(executeFetch, {
      onScheduled: ({ queueWaitMs, pressureWaitMs }) => {
        metric.queueWaitMs = queueWaitMs;
        metric.pressureWaitMs = pressureWaitMs;
      }
    });
  } finally {
    const totalMs = Date.now() - requestStartedAtMs;
    const status = resp?.status ?? "error";
    console.info(
      `[shopifyFetch] ${method} ${pathname} status=${status} attempts=${metric.attempts} totalMs=${totalMs} queueWaitMs=${metric.queueWaitMs} pressureWaitMs=${metric.pressureWaitMs}`
    );
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

export async function fetchVariantRetailPrices(variantIds = []) {
  const ids = Array.from(
    new Set(
      (variantIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  if (!ids.length) return new Map();

  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const retailPrices = new Map();
  const chunks = chunkArray(ids, 50);
  for (const chunk of chunks) {
    const params = new URLSearchParams();
    params.set("ids", chunk.join(","));
    params.set("fields", "id,price");
    const resp = await shopifyFetch(`${base}/variants.json?${params.toString()}`, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Shopify variant retail fetch failed (${resp.status}): ${body}`);
    }
    const data = await resp.json();
    const variants = Array.isArray(data.variants) ? data.variants : [];
    variants.forEach((variant) => {
      if (!variant?.id) return;
      retailPrices.set(String(variant.id), Number(variant.price));
    });
  }
  return retailPrices;
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
