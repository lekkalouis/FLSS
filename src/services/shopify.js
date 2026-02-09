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

export async function shopifyGraphQL(query, variables = {}) {
  const url = `https://${config.SHOPIFY_STORE}.myshopify.com/admin/api/${config.SHOPIFY_API_VERSION}/graphql.json`;
  const body = JSON.stringify({ query, variables });
  const token = await getShopifyAdminToken();

  const makeRequest = async (accessToken) =>
    fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body
    });

  let resp = await makeRequest(token);
  if (resp.status === 401 || resp.status === 403) {
    cachedToken = null;
    tokenExpiresAtMs = 0;
    const freshToken = await getShopifyAdminToken();
    resp = await makeRequest(freshToken);
  }

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    throw new Error(`Shopify GraphQL error (${resp.status}): ${text}`);
  }

  if (Array.isArray(data?.errors) && data.errors.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data?.data;
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
