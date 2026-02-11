import { config } from "../../config.js";
import { shopifyFetch } from "../../services/shopify.js";

export function normalizeTagList(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

export function resolveTierPrice(tiers, tier) {
  if (!tiers || typeof tiers !== "object") return null;
  const normalizedTier = tier ? String(tier).toLowerCase() : null;
  if (normalizedTier && tiers[normalizedTier] != null) {
    const tierPrice = Number(tiers[normalizedTier]);
    return Number.isFinite(tierPrice) ? tierPrice : null;
  }
  const fallback =
    tiers.default != null
      ? tiers.default
      : tiers.standard != null
      ? tiers.standard
      : null;
  if (fallback == null) return null;
  const fallbackPrice = Number(fallback);
  return Number.isFinite(fallbackPrice) ? fallbackPrice : null;
}

export function requireShopifyConfigured(res) {
  if (!config.SHOPIFY_STORE || !config.SHOPIFY_CLIENT_ID || !config.SHOPIFY_CLIENT_SECRET) {
    res.status(501).json({
      error: "SHOPIFY_NOT_CONFIGURED",
      message:
        "Set SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET in .env (Dev Dashboard app credentials)"
    });
    return false;
  }
  return true;
}

export function requireCustomerEmailConfigured(res) {
  if (!config.SMTP_HOST || !config.SMTP_FROM) {
    res.status(501).json({
      error: "EMAIL_NOT_CONFIGURED",
      message: "Set SMTP_HOST and SMTP_FROM in .env to send customer emails."
    });
    return false;
  }
  return true;
}

const ORDER_PARCEL_NAMESPACE = "custom";
const ORDER_PARCEL_KEY = "parcel_count";

export async function fetchOrderParcelMetafield(base, orderId) {
  if (!orderId) return null;
  const metaUrl = `${base}/orders/${orderId}/metafields.json?namespace=${ORDER_PARCEL_NAMESPACE}&key=${ORDER_PARCEL_KEY}`;
  const metaResp = await shopifyFetch(metaUrl, { method: "GET" });
  if (!metaResp.ok) return null;
  const metaData = await metaResp.json();
  const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];
  return metafields.find(
    (mf) => mf.namespace === ORDER_PARCEL_NAMESPACE && mf.key === ORDER_PARCEL_KEY
  ) || null;
}

export async function fetchOrderParcelCount(base, orderId) {
  try {
    const metafield = await fetchOrderParcelMetafield(base, orderId);
    if (!metafield || metafield.value == null) return null;
    const parsed = Number(metafield.value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (err) {
    console.warn("Order parcel metafield fetch failed:", err);
    return null;
  }
}

export function toKg(weight, unit) {
  const val = Number(weight || 0);
  if (!val) return 0;
  switch (String(unit || "").toLowerCase()) {
    case "g":
      return val / 1000;
    case "kg":
      return val;
    case "lb":
      return val * 0.45359237;
    case "oz":
      return val * 0.0283495;
    default:
      return val;
  }
}

export function parsePageInfo(linkHeader) {
  if (!linkHeader) return { next: null, previous: null };
  const parts = linkHeader.split(",").map((part) => part.trim());
  const info = { next: null, previous: null };
  parts.forEach((part) => {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (!match) return;
    const url = match[1];
    const rel = match[2];
    try {
      const parsed = new URL(url);
      const pageInfo = parsed.searchParams.get("page_info");
      if (pageInfo) info[rel] = pageInfo;
    } catch {
      const pageMatch = url.match(/[?&]page_info=([^&]+)/);
      if (pageMatch && pageMatch[1]) info[rel] = pageMatch[1];
    }
  });
  return info;
}
