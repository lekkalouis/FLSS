import crypto from "node:crypto";
import { Router } from "express";

import { config } from "../config.js";
import { getSmtpTransport } from "../services/email.js";
import {
  NOTIFICATION_EVENT_KEYS
} from "../services/notificationTemplateRegistry.js";
import { sendNotificationEmail } from "../services/notificationRuntime.js";
import {
  adjustInventoryLevel,
  fetchInventoryItemIdsForVariants,
  fetchInventoryLevelsForItems,
  fetchPrimaryLocationId,
  fetchVariantBasePrices,
  fetchVariantPriceTiers,
  shopifyFetch,
  setInventoryLevel,
  upsertVariantPriceTiers,
  updateVariantPrice
} from "../services/shopify.js";
import { badRequest } from "../utils/http.js";
import {
  buildPricingHash,
  normalizeCustomerTier,
  normalizePriceTiers,
  resolveLinePrice,
  resolvePricingForLines,
  resolveCustomerTier
} from "../services/pricingResolver.js";

const router = Router();
const ORDER_STATUS_TAG_PREFIX = "stat:";
const ORDER_STATUS_TAG_DEFAULT = `${ORDER_STATUS_TAG_PREFIX}new`;

function normalizeTagList(tags) {
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

function dedupeTagsCaseInsensitive(tags = []) {
  const seen = new Set();
  const deduped = [];
  tags.forEach((tag) => {
    const cleaned = String(tag || "").trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(cleaned);
  });
  return deduped;
}

function isOrderStatusTag(tag) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .startsWith(ORDER_STATUS_TAG_PREFIX);
}

function upsertOrderStatusTag(tags = [], statusTag = ORDER_STATUS_TAG_DEFAULT) {
  const withoutStatus = dedupeTagsCaseInsensitive(tags).filter((tag) => !isOrderStatusTag(tag));
  const desired = String(statusTag || "").trim();
  if (desired) withoutStatus.push(desired);
  return dedupeTagsCaseInsensitive(withoutStatus);
}

function normalizeOrderAddress(address) {
  if (!address || typeof address !== "object") return undefined;

  const normalized = {
    first_name: address.first_name ?? address.firstName,
    last_name: address.last_name ?? address.lastName,
    company: address.company,
    address1: address.address1,
    address2: address.address2,
    city: address.city,
    province: address.province,
    province_code: address.province_code ?? address.provinceCode,
    zip: address.zip,
    country: address.country,
    country_code: address.country_code ?? address.countryCode,
    phone: address.phone,
    name: address.name
  };

  const hasValue = Object.values(normalized).some((value) => value != null && String(value).trim() !== "");
  if (!hasValue) return undefined;

  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([, value]) => value != null && String(value).trim() !== "")
      .map(([key, value]) => [key, String(value).trim()])
  );
}

function requireShopifyConfigured(res) {
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

function requireCustomerEmailConfigured(res) {
  if (!config.SMTP_HOST) {
    res.status(501).json({
      error: "EMAIL_NOT_CONFIGURED",
      message: "Set SMTP_HOST in .env to send customer emails."
    });
    return false;
  }
  return true;
}

function requireDeliveryCodeSecretConfigured(res) {
  if (!config.DELIVERY_CODE_SECRET) {
    res.status(501).json({
      error: "DELIVERY_CODE_SECRET_NOT_CONFIGURED",
      message: "Set DELIVERY_CODE_SECRET in .env to issue and verify delivery QR payloads."
    });
    return false;
  }
  return true;
}

function normalizeOrderNo(orderNo) {
  return String(orderNo || "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

function buildCollectionCredentials(orderNo) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  let hash = 0;
  for (let i = 0; i < normalizedOrderNo.length; i += 1) {
    hash = (hash * 33 + normalizedOrderNo.charCodeAt(i)) % 1000;
  }
  const pin = String(hash).padStart(3, "0");
  const barcodeValue = `FLSS-PICKUP-${normalizedOrderNo}-${pin}`;
  return { normalizedOrderNo, pin, barcodeValue };
}

const DELIVERY_CODE_VERSION = "v1";
const DELIVERY_CODE_MAX_AGE_SEC = 14 * 24 * 60 * 60;

function toBase64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function signDeliveryPayload(payload) {
  return crypto.createHmac("sha256", String(config.DELIVERY_CODE_SECRET)).update(payload).digest();
}

function buildDeliveryCredentials(orderNo) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  const iat = Math.floor(Date.now() / 1000);
  const tokenId = crypto.randomUUID();
  const payload = `${DELIVERY_CODE_VERSION}.${normalizedOrderNo}.${iat}.${tokenId}`;
  const signature = signDeliveryPayload(payload);
  const token = `${toBase64Url(payload)}.${toBase64Url(signature)}`;
  const code = `FLSS-DELIVERY-${token}`;
  return { normalizedOrderNo, iat, token, code, tokenId };
}

function parseCollectionCode(rawCode = "") {
  const cleaned = String(rawCode || "").trim().toUpperCase();
  const codeMatch = cleaned.match(/^FLSS-PICKUP-([0-9A-Z]+)-(\d{3})$/);
  if (codeMatch) {
    return { orderNo: codeMatch[1], pin: codeMatch[2] };
  }
  const compactMatch = cleaned.match(/^([0-9A-Z]+)[-: ]?(\d{3})$/);
  if (compactMatch) {
    return { orderNo: compactMatch[1], pin: compactMatch[2] };
  }
  return null;
}

function parseDeliveryCode(rawCode = "") {
  const cleaned = String(rawCode || "").trim();
  const prefixedMatch = cleaned.match(/^FLSS-DELIVERY-([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
  const token = prefixedMatch ? prefixedMatch[1] : cleaned;

  if (/^([0-9A-Z]+)[-: ]?(\d{4})$/i.test(cleaned)) {
    return { error: "LEGACY_CODE_NOT_SUPPORTED", message: "Legacy delivery PIN codes are no longer supported." };
  }

  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) {
    return { error: "INVALID_CODE_FORMAT", message: "Delivery code format is invalid." };
  }

  let payload;
  let providedSignature;
  try {
    payload = fromBase64Url(payloadPart).toString("utf8");
    providedSignature = fromBase64Url(signaturePart);
  } catch {
    return { error: "INVALID_CODE_FORMAT", message: "Delivery code payload is malformed." };
  }

  const expectedSignature = signDeliveryPayload(payload);
  if (
    expectedSignature.length !== providedSignature.length ||
    !crypto.timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return { error: "INVALID_SIGNATURE", message: "Delivery code signature is invalid." };
  }

  const [version, encodedOrderNo, issuedAtRaw, tokenIdRaw, ...rest] = payload.split(".");
  if (rest.length || version !== DELIVERY_CODE_VERSION) {
    return { error: "INVALID_CODE_VERSION", message: "Delivery code version is invalid." };
  }

  const orderNo = normalizeOrderNo(encodedOrderNo);
  const issuedAt = Number.parseInt(issuedAtRaw, 10);
  const tokenId = String(tokenIdRaw || "").trim();
  if (!orderNo || !Number.isFinite(issuedAt) || !tokenId) {
    return { error: "INVALID_CODE_PAYLOAD", message: "Delivery code payload is invalid." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 60) {
    return { error: "INVALID_CODE_PAYLOAD", message: "Delivery code issue time is invalid." };
  }
  if (now - issuedAt > DELIVERY_CODE_MAX_AGE_SEC) {
    return { error: "CODE_EXPIRED", message: "Delivery code has expired." };
  }

  return { orderNo, issuedAt, token, tokenId };
}

function orderNoteAttributeMap(order = {}) {
  const existingAttrs = Array.isArray(order.note_attributes)
    ? order.note_attributes.filter((attr) => attr && attr.name)
    : [];
  return new Map(existingAttrs.map((attr) => [String(attr.name), String(attr.value || "")]));
}

function serializeOrderNoteAttributes(attrMap) {
  return Array.from(attrMap.entries()).map(([name, value]) => ({ name, value: String(value || "") }));
}

function buildShippingLine({ shippingMethod, shippingPrice, shippingBaseTotal, shippingService }) {
  const method = String(shippingMethod || "").trim().toLowerCase();
  if (!method) return null;

  if (method === "shipping") {
    const quotedAmount = Number(shippingBaseTotal ?? shippingPrice);
    const roundedAmount = Number.isFinite(quotedAmount) ? Math.round(quotedAmount) : 0;
    return {
      title: shippingService ? `Shipping - ${String(shippingService).trim()}` : "Shipping",
      price: String(roundedAmount)
    };
  }

  if (method === "free-shipping") {
    return { title: "Free shipping", price: "0" };
  }

  if (method === "delivery") {
    return { title: "Delivery", price: "0" };
  }

  if (method === "pickup" || method === "collection") {
    return { title: "Pickup/Collection", price: "0" };
  }

  return null;
}

function resolveShippingSubtotalValue({ shippingMethod, shippingBaseTotal, shippingPrice }) {
  const method = String(shippingMethod || "").trim().toLowerCase();
  if (!method) return null;

  if (["free-shipping", "delivery", "pickup", "collection"].includes(method)) {
    return "0";
  }

  const rawValue = shippingBaseTotal ?? shippingPrice;
  if (rawValue == null || rawValue === "") {
    return method === "shipping" ? "0" : null;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
  }

  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? String(numericValue) : method === "shipping" ? "0" : null;
}

async function appendOrderTag(base, orderId, tagToApply) {
  const orderResp = await shopifyFetch(`${base}/orders/${orderId}.json?fields=id,tags`, {
    method: "GET"
  });
  if (!orderResp.ok) {
    const body = await orderResp.text();
    return {
      ok: false,
      status: orderResp.status,
      statusText: orderResp.statusText,
      body
    };
  }
  const orderData = await orderResp.json();
  const existingTags = String(orderData?.order?.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const normalizedTag = String(tagToApply || "").trim();
  let updatedTags = isOrderStatusTag(normalizedTag)
    ? upsertOrderStatusTag(existingTags, normalizedTag)
    : (() => {
        const next = [...existingTags];
        if (!next.map((tag) => tag.toLowerCase()).includes(normalizedTag.toLowerCase())) next.push(normalizedTag);
        return dedupeTagsCaseInsensitive(next);
      })();
  if (normalizedTag.toLowerCase() === "delivery_prepared") {
    updatedTags = upsertOrderStatusTag(updatedTags, "stat:prepared");
  }
  const updateResp = await shopifyFetch(`${base}/orders/${orderId}.json`, {
    method: "PUT",
    body: JSON.stringify({ order: { id: orderId, tags: updatedTags.join(", ") } })
  });
  if (!updateResp.ok) {
    const body = await updateResp.text();
    return {
      ok: false,
      status: updateResp.status,
      statusText: updateResp.statusText,
      body
    };
  }
  return { ok: true, tags: updatedTags };
}

async function fulfillOrderByOrderId(base, orderId, message = "Collected at dispatch station.") {
  const foUrl = `${base}/orders/${orderId}/fulfillment_orders.json`;
  const foResp = await shopifyFetch(foUrl, { method: "GET" });
  const foData = await foResp.json().catch(() => ({}));
  if (!foResp.ok) {
    return { ok: false, status: foResp.status, statusText: foResp.statusText, body: foData };
  }

  const fulfillmentOrders = Array.isArray(foData.fulfillment_orders) ? foData.fulfillment_orders : [];
  const fo =
    fulfillmentOrders.find((f) => f.status !== "closed" && f.status !== "cancelled") ||
    fulfillmentOrders[0];
  if (!fo?.id) {
    return { ok: false, status: 409, statusText: "NO_FULFILLMENT_ORDERS", body: foData };
  }

  const fulfillUrl = `${base}/fulfillments.json`;
  const payload = {
    fulfillment: {
      message,
      notify_customer: true,
      tracking_info: {
        number: "",
        company: "Collection"
      },
      line_items_by_fulfillment_order: [{ fulfillment_order_id: fo.id }]
    }
  };

  const upstream = await shopifyFetch(fulfillUrl, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, statusText: upstream.statusText, body: data };
  }
  return { ok: true, fulfillment: data };
}

const ORDER_PARCEL_NAMESPACE = "custom";
const ORDER_PARCEL_KEY = "parcel_count";
const CUSTOMER_META_NAMESPACE = "custom";
const CUSTOMER_PAYMENT_BEFORE_DELIVERY_KEY = "payment-before-delivery";
const CUSTOMER_PAYMENT_BEFORE_DELIVERY_FALLBACK_KEY = "payment_before_delivery";
const CUSTOMER_PAYMENT_BEFORE_SHIPPING_KEY = "payment-before-shipping";
const CUSTOMER_PAYMENT_BEFORE_SHIPPING_FALLBACK_KEY = "payment_before_shipping";
const CUSTOMER_PAYMENT_BEFORE_SHIPPING_KEYS = [
  CUSTOMER_PAYMENT_BEFORE_SHIPPING_KEY,
  CUSTOMER_PAYMENT_BEFORE_SHIPPING_FALLBACK_KEY,
  CUSTOMER_PAYMENT_BEFORE_DELIVERY_KEY,
  CUSTOMER_PAYMENT_BEFORE_DELIVERY_FALLBACK_KEY
];
const ORDER_PARCEL_CACHE_TTL_MS = 2 * 60 * 1000;
const ORDER_PARCEL_REST_FALLBACK_CAP = 20;
const SEARCH_TIER_ENRICHMENT_CAP = 80;
const orderParcelCountCache = new Map();
const pricingReconcileStatus = new Map();

function setPricingStatus(draftOrderId, status) {
  const key = String(draftOrderId || "").trim();
  if (!key) return;
  pricingReconcileStatus.set(key, {
    ...status,
    updatedAt: new Date().toISOString()
  });
}


function parseParcelCountFromTags(tags) {
  if (typeof tags !== "string" || !tags.trim()) return null;
  const parts = tags.split(",").map((t) => t.trim().toLowerCase());
  for (const t of parts) {
    const m = t.match(/^parcel_count_(\d+)$/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function getCachedOrderParcelCount(orderId) {
  const key = String(orderId || "");
  if (!key) return undefined;
  const cached = orderParcelCountCache.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    orderParcelCountCache.delete(key);
    return undefined;
  }
  return cached.value;
}

function cacheOrderParcelCount(orderId, value) {
  const key = String(orderId || "");
  if (!key) return;
  orderParcelCountCache.set(key, {
    value: value == null ? null : Number(value),
    expiresAt: Date.now() + ORDER_PARCEL_CACHE_TTL_MS
  });
}

function normalizeCustomerMetafields(metafields = []) {
  const getValue = (key) =>
    metafields.find((mf) => mf.namespace === CUSTOMER_META_NAMESPACE && mf.key === key)?.value || null;
  const getFirstValue = (keys = []) => keys.map((key) => getValue(key)).find((value) => value != null) || null;
  const resolvedDeliveryMethod = getFirstValue(["delivery_method", "delivery_type"]);
  const resolvedDeliveryType = getFirstValue(["delivery_type", "delivery_method"]);
  const paymentBeforeShipping = getFirstValue(CUSTOMER_PAYMENT_BEFORE_SHIPPING_KEYS);

  return {
    delivery_method: resolvedDeliveryMethod,
    delivery_type: resolvedDeliveryType,
    tier: normalizeCustomerTier(getValue("tier")),
    delivery_instructions: getValue("delivery_instructions"),
    company_name: getValue("company_name"),
    account_email: getValue("account_email"),
    account_contact: getValue("account_contact"),
    vat_number: getValue("vat_number"),
    payment_terms: getValue("payment_terms"),
    payment_before_shipping: paymentBeforeShipping,
    payment_before_delivery: paymentBeforeShipping
  };
}

function parseBooleanLike(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "y", "on", "required"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off", "not_required"].includes(normalized)) return false;
  return null;
}

function normalizeEmailValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !normalized.includes("@")) return null;
  return normalized;
}

async function fetchCustomerPaymentBeforeDeliveryMap(base, customerIds = []) {
  const ids = Array.from(new Set((customerIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
  const map = new Map();
  if (!ids.length) return map;

  await Promise.all(
    ids.map(async (customerId) => {
      try {
        const metaResp = await shopifyFetch(`${base}/customers/${customerId}/metafields.json`, { method: "GET" });
        if (!metaResp.ok) return;
        const metaData = await metaResp.json();
        const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];
        const paymentBeforeDelivery = metafields.find(
          (mf) =>
            mf?.namespace === CUSTOMER_META_NAMESPACE &&
            CUSTOMER_PAYMENT_BEFORE_SHIPPING_KEYS.includes(mf?.key)
        );
        map.set(String(customerId), parseBooleanLike(paymentBeforeDelivery?.value));
      } catch {
        // best-effort enrichment
      }
    })
  );

  return map;
}

async function fetchCustomerCustomMetafields(base, customerId) {
  if (!customerId) return {};
  const metaUrl = `${base}/customers/${customerId}/metafields.json`;
  const metaResp = await shopifyFetch(metaUrl, { method: "GET" });
  if (!metaResp.ok) return {};
  const metaData = await metaResp.json();
  const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];
  return normalizeCustomerMetafields(metafields);
}


async function ensureCustomerDeliveryType(base, customerId, deliveryType, currentMetafields = null) {
  const normalized = String(deliveryType || "").trim().toLowerCase();
  if (!customerId || !normalized) return;
  const allowed = ["shipping", "free-shipping", "pickup", "delivery", "local"];
  if (!allowed.includes(normalized)) return;

  const current = currentMetafields || (await fetchCustomerCustomMetafields(base, customerId));
  const existingDeliveryType = String(current?.delivery_type || "").trim();
  const existingDeliveryMethod = String(current?.delivery_method || "").trim();
  const upserts = [];
  if (!existingDeliveryMethod) {
    upserts.push(
      shopifyFetch(`${base}/customers/${customerId}/metafields.json`, {
        method: "POST",
        body: JSON.stringify({
          metafield: {
            namespace: CUSTOMER_META_NAMESPACE,
            key: "delivery_method",
            type: "single_line_text_field",
            value: normalized
          }
        })
      })
    );
  }
  if (!existingDeliveryType) {
    upserts.push(
      shopifyFetch(`${base}/customers/${customerId}/metafields.json`, {
        method: "POST",
        body: JSON.stringify({
          metafield: {
            namespace: CUSTOMER_META_NAMESPACE,
            key: "delivery_type",
            type: "single_line_text_field",
            value: normalized
          }
        })
      })
    );
  }
  if (!upserts.length) return;
  await Promise.all(upserts);
}

function buildWholesaleDiscount(lineItems = [], tier = "") {
  const normalizedTier = normalizeCustomerTier(tier);
  if (!normalizedTier || ["retail", "retailer"].includes(normalizedTier)) return null;

  const total = (lineItems || []).reduce((sum, li) => {
    const retail = Number(li?.retailPrice);
    const net = Number(li?.price);
    const qty = Math.max(0, Number(li?.quantity || 0));
    if (!Number.isFinite(retail) || !Number.isFinite(net) || !qty) return sum;
    const delta = retail - net;
    if (delta <= 0) return sum;
    return sum + delta * qty;
  }, 0);

  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    description: `Wholesale tier discount (${normalizedTier})`,
    value_type: "fixed_amount",
    value: total.toFixed(2),
    amount: total.toFixed(2),
    title: "Wholesale discount"
  };
}



function toMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function createPricingSummaryLine({ sku, variantId, basePrice, targetPrice, discountApplied, priceTier, ruleMatched }) {
  return {
    sku: sku || null,
    variantId: variantId || null,
    basePrice: toMoney(basePrice),
    targetPrice: toMoney(targetPrice),
    discountApplied: toMoney(discountApplied) || 0,
    priceTier: normalizeCustomerTier(priceTier) || null,
    ruleMatched: ruleMatched || null
  };
}

async function resolveDraftLineTargetPrice({ lineItem, tier, retailPriceMap }) {
  const variantId = Number(lineItem?.variantId || lineItem?.variant_id);
  const fallbackRetail = toMoney(lineItem?.retailPrice);
  const basePrice = Number.isFinite(variantId) ? toMoney(retailPriceMap.get(variantId)) : fallbackRetail;
  const explicitPrice = toMoney(lineItem?.price);

  if (explicitPrice != null && explicitPrice > 0) {
    return { targetPrice: explicitPrice, basePrice, ruleMatched: 'payload_price' };
  }

  const pricing = resolveLinePrice({
    lineItem: {
      ...lineItem,
      retailPrice: basePrice ?? fallbackRetail,
      product: {
        retailPrice: basePrice ?? fallbackRetail,
        price: basePrice ?? fallbackRetail,
        price_tiers: lineItem?.price_tiers,
        metafields: lineItem?.metafields
      }
    },
    tier
  });

  const candidate = toMoney(pricing?.unitPrice);
  if (candidate != null && candidate > 0) {
    return { targetPrice: candidate, basePrice, ruleMatched: pricing?.source || 'pricing_resolver' };
  }

  const parsedTiers = normalizePriceTiers(lineItem?.product || lineItem);
  const fallbackTier = normalizeCustomerTier(tier) || 'public';
  const tierMetafieldPrice = toMoney(parsedTiers?.[fallbackTier] ?? parsedTiers?.default ?? parsedTiers?.standard);
  if (tierMetafieldPrice != null && tierMetafieldPrice > 0) {
    return { targetPrice: tierMetafieldPrice, basePrice, ruleMatched: 'metafield_tier' };
  }

  return { targetPrice: basePrice ?? fallbackRetail ?? 0, basePrice: basePrice ?? fallbackRetail ?? 0, ruleMatched: 'base_price_fallback' };
}

const DRAFT_ORDER_CALCULATION_TIMEOUT_MS = 30_000;
const DRAFT_ORDER_POLL_INTERVAL_MS = 1_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseShopifyResponseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function readShopifyResponse(resp) {
  const text = await resp.text();
  return {
    text,
    data: parseShopifyResponseBody(text)
  };
}

function buildDraftOrderAdminUrl(draftOrderId) {
  const key = String(draftOrderId || "").trim();
  if (!key) return null;
  return `https://${config.SHOPIFY_STORE}.myshopify.com/admin/draft_orders/${key}`;
}

function buildOrderAdminUrl(orderId) {
  const key = String(orderId || "").trim();
  if (!key) return null;
  return `https://${config.SHOPIFY_STORE}.myshopify.com/admin/orders/${key}`;
}

function normalizeShopifyAdminPath(locationHeader) {
  const raw = String(locationHeader || "").trim();
  if (!raw) return null;
  try {
    const baseOrigin = `https://${config.SHOPIFY_STORE}.myshopify.com`;
    const parsed = new URL(raw, baseOrigin);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function extractDraftOrderIdFromPath(pathname) {
  const match = String(pathname || "").match(/\/draft_orders\/(\d+)(?:\.json)?/i);
  return match?.[1] || null;
}

function parseRetryAfterMs(resp, fallbackMs = DRAFT_ORDER_POLL_INTERVAL_MS) {
  const retryAfter = Number(resp?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.max(250, Math.ceil(retryAfter * 1000));
  }
  return fallbackMs;
}

async function buildShopifyDraftOrderPayload({
  customerId,
  lineItems,
  priceTier,
  billingAddress,
  shippingAddress,
  poNumber,
  shippingMethod,
  shippingPrice,
  shippingBaseTotal,
  shippingService,
  shippingQuoteNo,
  estimatedParcels,
  deliveryDate,
  invoiceEmail,
  customerTags,
  orderTags: requestOrderTags,
  tags: requestTags,
  vatNumber,
  companyName,
  paymentTerms
}) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const customerMetafields = await fetchCustomerCustomMetafields(base, customerId);
  const resolvedInvoiceEmail = normalizeEmailValue(invoiceEmail || customerMetafields?.account_email || null);
  const tierResolution = resolveCustomerTier({
    customerTier: customerMetafields?.tier || priceTier,
    customerTags: normalizeTagList(customerTags),
    defaultTier: "public"
  });
  const tier = tierResolution.tier;

  await ensureCustomerDeliveryType(base, customerId, shippingMethod, customerMetafields);

  const variantIds = lineItems
    .map((line) => Number(line?.variantId || line?.variant_id))
    .filter((id) => Number.isFinite(id));
  const retailPriceMap = await fetchVariantBasePrices(variantIds);

  const pricingSummary = [];
  let fallbackUsed = false;
  const resolvedLines = [];

  for (const lineItem of lineItems) {
    const quantity = Math.max(1, Math.floor(Number(lineItem?.quantity || 1)));
    const variantId = Number(lineItem?.variantId || lineItem?.variant_id);
    const sku = lineItem?.sku || null;

    const { targetPrice, basePrice, ruleMatched } = await resolveDraftLineTargetPrice({
      lineItem,
      tier,
      retailPriceMap
    });

    const safeBase = toMoney(basePrice);
    const safeTarget = toMoney(targetPrice);

    if (!Number.isFinite(variantId)) {
      fallbackUsed = true;
      resolvedLines.push({
        title: lineItem?.title || sku || "Custom item",
        quantity,
        price: String((safeTarget ?? safeBase ?? 0).toFixed(2))
      });
      pricingSummary.push(
        createPricingSummaryLine({
          sku,
          variantId: null,
          basePrice: safeBase,
          targetPrice: safeTarget ?? safeBase,
          discountApplied: 0,
          priceTier: tier,
          ruleMatched: "custom_line_item"
        })
      );
      continue;
    }

    const resolvedLine = {
      variant_id: variantId,
      quantity
    };

    let discountApplied = 0;
    if (safeBase != null && safeTarget != null && safeTarget < safeBase) {
      discountApplied = toMoney(safeBase - safeTarget) || 0;
      resolvedLine.applied_discount = {
        description: `Tier pricing (${tier})`,
        value: discountApplied.toFixed(2),
        value_type: "fixed_amount",
        amount: discountApplied.toFixed(2)
      };
    } else if (safeBase != null && safeTarget != null && safeTarget > safeBase) {
      fallbackUsed = true;
      console.warn("Draft order tier target exceeds base price; defaulting to Shopify base price", {
        variantId,
        tier,
        basePrice: safeBase,
        targetPrice: safeTarget
      });
    }

    resolvedLines.push(resolvedLine);
    pricingSummary.push(
      createPricingSummaryLine({
        sku,
        variantId,
        basePrice: safeBase,
        targetPrice: discountApplied > 0 ? safeTarget : safeBase ?? safeTarget,
        discountApplied,
        priceTier: tier,
        ruleMatched
      })
    );
  }

  const pricingHash = buildPricingHash({
    tier,
    currency: "ZAR",
    signatures: pricingSummary.map((line) => ({
      variant_id: line.variantId,
      quantity: Math.max(
        1,
        Math.floor(
          Number(
            (
              lineItems.find((entry) => Number(entry?.variantId || entry?.variant_id) === Number(line.variantId)) || {}
            ).quantity || 1
          )
        )
      ),
      resolved_unit_price: line.targetPrice || line.basePrice || 0,
      source: line.discountApplied > 0 ? "discount_fallback" : line.ruleMatched || "retail"
    }))
  });

  const extraOrderTags = [
    ...normalizeTagList(requestOrderTags),
    ...normalizeTagList(requestTags)
  ];
  const orderTags = buildOrderTags({
    shippingMethod,
    customerTags,
    extraTags: extraOrderTags
  });
  const mergedOrderTags = dedupeTagsCaseInsensitive(orderTags);

  const draftMetafields = [];
  if (deliveryDate) {
    draftMetafields.push({
      namespace: "custom",
      key: "delivery_date",
      type: "single_line_text_field",
      value: String(deliveryDate)
    });
  }
  if (shippingMethod) {
    draftMetafields.push({
      namespace: "custom",
      key: "delivery_type",
      type: "single_line_text_field",
      value: String(shippingMethod)
    });
  }
  if (vatNumber) {
    draftMetafields.push({
      namespace: "custom",
      key: "vat_number",
      type: "single_line_text_field",
      value: String(vatNumber)
    });
  }
  if (companyName) {
    draftMetafields.push({
      namespace: "custom",
      key: "company_name",
      type: "single_line_text_field",
      value: String(companyName)
    });
  }
  const resolvedPaymentTerms = paymentTerms || customerMetafields?.payment_terms || null;
  if (resolvedPaymentTerms) {
    draftMetafields.push({
      namespace: "custom",
      key: "payment_terms",
      type: "single_line_text_field",
      value: String(resolvedPaymentTerms)
    });
  }
  const paymentBeforeShippingRequired = parseBooleanLike(
    customerMetafields?.payment_before_shipping ?? customerMetafields?.payment_before_delivery
  );
  if (paymentBeforeShippingRequired != null) {
    draftMetafields.push({
      namespace: "custom",
      key: CUSTOMER_PAYMENT_BEFORE_DELIVERY_FALLBACK_KEY,
      type: "single_line_text_field",
      value: paymentBeforeShippingRequired ? "true" : "false"
    });
  }
  const shippingAmount = Number(shippingBaseTotal ?? shippingPrice);
  if (Number.isFinite(shippingAmount)) {
    draftMetafields.push({
      namespace: "custom",
      key: "shipping_amount",
      type: "number_decimal",
      value: String(shippingAmount)
    });
  }
  const estimatedParcelsValue = Number(estimatedParcels);
  if (Number.isFinite(estimatedParcelsValue)) {
    draftMetafields.push({
      namespace: "custom",
      key: "estimated_parcels",
      type: "number_integer",
      value: String(Math.round(estimatedParcelsValue))
    });
  }

  const shippingSubtotal = resolveShippingSubtotalValue({
    shippingMethod,
    shippingBaseTotal,
    shippingPrice
  });

  const noteParts = [];
  if (poNumber) noteParts.push(`PO: ${poNumber}`);

  const draftOrder = {
    customer: customerId ? { id: customerId } : undefined,
    email: resolvedInvoiceEmail || undefined,
    line_items: resolvedLines,
    note: noteParts.join(" | ") || undefined,
    billing_address: normalizeOrderAddress(billingAddress),
    shipping_address: normalizeOrderAddress(shippingAddress),
    note_attributes: [
      ...(poNumber ? [{ name: "po_number", value: String(poNumber) }] : []),
      ...(shippingQuoteNo ? [{ name: "shipping_quote_no", value: String(shippingQuoteNo) }] : []),
      ...(shippingSubtotal != null ? [{ name: "shipping_subtotal", value: shippingSubtotal }] : []),
      { name: "price_tier", value: tier || "public" },
      { name: "source", value: "FLSS" },
      { name: "flss_pricing_hash", value: pricingHash }
    ],
    metafields: draftMetafields.length ? draftMetafields : undefined
  };

  if (mergedOrderTags.length) {
    draftOrder.tags = mergedOrderTags.join(", ");
  }

  const shippingLine = buildShippingLine({
    shippingMethod,
    shippingPrice,
    shippingBaseTotal,
    shippingService
  });
  if (shippingLine) {
    draftOrder.shipping_line = shippingLine;
  }

  return {
    base,
    draftPayload: { draft_order: draftOrder },
    pricingSummary,
    pricing: {
      tier,
      fallbackUsed,
      hash: pricingHash,
      tierConflict: tierResolution.conflict
    },
    resolvedTier: tier,
    resolvedInvoiceEmail
  };
}

async function createDraftOrderAndWait({
  base,
  draftPayload,
  timeoutMs = DRAFT_ORDER_CALCULATION_TIMEOUT_MS,
  pollIntervalMs = DRAFT_ORDER_POLL_INTERVAL_MS
}) {
  const createResp = await shopifyFetch(`${base}/draft_orders.json`, {
    method: "POST",
    body: JSON.stringify(draftPayload)
  });
  const createResult = await readShopifyResponse(createResp);

  if (!createResp.ok) {
    const draftOrderId = createResult.data?.draft_order?.id || null;
    return {
      ok: false,
      stage: "create",
      status: createResp.status,
      statusText: createResp.statusText,
      body: createResult.data,
      draftOrderId,
      draftAdminUrl: buildDraftOrderAdminUrl(draftOrderId)
    };
  }

  const immediateDraft = createResult.data?.draft_order || null;
  const immediateDraftId = immediateDraft?.id ? String(immediateDraft.id) : null;
  if (createResp.status !== 202) {
    return {
      ok: true,
      draft: immediateDraft,
      draftOrderId: immediateDraftId,
      draftAdminUrl: buildDraftOrderAdminUrl(immediateDraftId)
    };
  }

  const locationPath =
    normalizeShopifyAdminPath(createResp.headers.get("location")) ||
    (immediateDraftId ? `${base}/draft_orders/${immediateDraftId}.json` : null);
  const draftOrderId = immediateDraftId || extractDraftOrderIdFromPath(locationPath);
  const draftAdminUrl = buildDraftOrderAdminUrl(draftOrderId);
  if (!locationPath) {
    return {
      ok: false,
      stage: "poll",
      status: 502,
      statusText: "MISSING_DRAFT_LOCATION",
      body: createResult.data,
      message: "Shopify draft calculation did not provide a poll location.",
      draftOrderId,
      draftAdminUrl
    };
  }

  const deadlineAt = Date.now() + Math.max(1_000, Number(timeoutMs) || DRAFT_ORDER_CALCULATION_TIMEOUT_MS);
  let lastBody = createResult.data;
  let nextDelayMs = parseRetryAfterMs(createResp, pollIntervalMs);

  while (Date.now() < deadlineAt) {
    await sleep(Math.min(nextDelayMs, Math.max(1, deadlineAt - Date.now())));
    const pollResp = await shopifyFetch(locationPath, { method: "GET" });
    const pollResult = await readShopifyResponse(pollResp);
    lastBody = pollResult.data;

    if (!pollResp.ok) {
      return {
        ok: false,
        stage: "poll",
        status: pollResp.status,
        statusText: pollResp.statusText,
        body: pollResult.data,
        draftOrderId,
        draftAdminUrl
      };
    }

    if (pollResp.status === 202) {
      nextDelayMs = parseRetryAfterMs(pollResp, pollIntervalMs);
      continue;
    }

    const draft = pollResult.data?.draft_order || null;
    const resolvedDraftId = draft?.id ? String(draft.id) : draftOrderId;
    return {
      ok: true,
      draft,
      draftOrderId: resolvedDraftId,
      draftAdminUrl: buildDraftOrderAdminUrl(resolvedDraftId)
    };
  }

  return {
    ok: false,
    stage: "poll_timeout",
    status: 504,
    statusText: "DRAFT_CALCULATION_TIMEOUT",
    body: lastBody,
    message: "Shopify draft tax and shipping calculation did not finish within 30 seconds.",
    draftOrderId,
    draftAdminUrl
  };
}

async function completeDraftOrder({ base, draftOrderId, paymentPending = true }) {
  const completionPath = `${base}/draft_orders/${draftOrderId}/complete.json${
    paymentPending ? "?payment_pending=true" : ""
  }`;
  const resp = await shopifyFetch(completionPath, {
    method: "POST",
    body: JSON.stringify({ draft_order: { id: draftOrderId } })
  });
  const result = await readShopifyResponse(resp);
  const order = result.data?.order || null;
  const orderId = order?.id ? String(order.id) : null;

  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
    body: result.data,
    order,
    orderAdminUrl: buildOrderAdminUrl(orderId)
  };
}

function buildOrderTags({ shippingMethod, customerTags, extraTags }) {
  const orderTags = ["FLSS", "Wholesale"];
  if (shippingMethod && shippingMethod !== "shipping") {
    orderTags.push(`delivery_${shippingMethod}`);
  }
  if (shippingMethod === "local") {
    orderTags.push("local");
  }
  const normalizedCustomerTags = normalizeTagList(customerTags).map((tag) => tag.toLowerCase());
  if (normalizedCustomerTags.includes("local")) orderTags.push("local");
  if (normalizedCustomerTags.includes("export")) orderTags.push("export");
  ["agent", "retail", "retailer", "private", "fkb"].forEach((tag) => {
    if (normalizedCustomerTags.includes(tag)) orderTags.push(tag);
  });
  const normalizedExtraTags = normalizeTagList(extraTags);
  const statusTagFromExtra = normalizedExtraTags.filter((tag) => isOrderStatusTag(tag)).slice(-1)[0] || null;
  normalizedExtraTags
    .filter((tag) => !isOrderStatusTag(tag))
    .forEach((tag) => orderTags.push(tag));
  const deduped = dedupeTagsCaseInsensitive(orderTags);
  return upsertOrderStatusTag(deduped, statusTagFromExtra || ORDER_STATUS_TAG_DEFAULT);
}

function selectOrderParcelMetafield(metafields = []) {
  if (!Array.isArray(metafields) || !metafields.length) return null;
  const matching = metafields.filter((mf) => mf?.key === ORDER_PARCEL_KEY);
  if (!matching.length) return null;
  return matching.find((mf) => mf?.namespace === ORDER_PARCEL_NAMESPACE) || matching[0] || null;
}

async function fetchOrderParcelMetafield(base, orderId) {
  if (!orderId) return null;
  const metaUrl = `${base}/orders/${orderId}/metafields.json`;
  const metaResp = await shopifyFetch(metaUrl, { method: "GET" });
  if (!metaResp.ok) return null;
  const metaData = await metaResp.json();
  const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];
  return selectOrderParcelMetafield(metafields);
}

async function fetchOrderParcelCount(base, orderId) {
  const cached = getCachedOrderParcelCount(orderId);
  if (cached !== undefined) return cached;
  try {
    const metafield = await fetchOrderParcelMetafield(base, orderId);
    if (!metafield || metafield.value == null) {
      cacheOrderParcelCount(orderId, null);
      return null;
    }
    const parsed = Number(metafield.value);
    const normalized = Number.isFinite(parsed) ? parsed : null;
    cacheOrderParcelCount(orderId, normalized);
    return normalized;
  } catch (err) {
    console.warn("Order parcel metafield fetch failed:", err);
    return null;
  }
}

async function upsertOrderParcelMetafield(base, orderId, parcelCount) {
  const ownerId = `gid://shopify/Order/${orderId}`;
  const resp = await shopifyFetch(`${base}/graphql.json`, {
    method: "POST",
    body: JSON.stringify({
      query: `
        mutation SetOrderParcelCount($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields {
              id
              namespace
              key
              value
              type
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
      variables: {
        metafields: [
          {
            ownerId,
            namespace: ORDER_PARCEL_NAMESPACE,
            key: ORDER_PARCEL_KEY,
            type: "number_integer",
            value: String(parcelCount)
          }
        ]
      }
    })
  });

  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      statusText: resp.statusText,
      body: JSON.stringify(payload)
    };
  }

  const topLevelErrors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (topLevelErrors.length) {
    return {
      ok: false,
      status: 422,
      statusText: "GRAPHQL_ERRORS",
      body: JSON.stringify(topLevelErrors)
    };
  }

  const userErrors = payload?.data?.metafieldsSet?.userErrors || [];
  if (Array.isArray(userErrors) && userErrors.length) {
    return {
      ok: false,
      status: 422,
      statusText: "METAFIELD_USER_ERRORS",
      body: JSON.stringify(userErrors)
    };
  }

  return { ok: true };
}

async function batchFetchVariantPriceTiers(base, variantIds = []) {
  const uniqueIds = Array.from(
    new Set(
      (variantIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  if (!uniqueIds.length) return new Map();

  const gids = uniqueIds.map((id) => `gid://shopify/ProductVariant/${id}`);
  const gqlResp = await shopifyFetch(`${base}/graphql.json`, {
    method: "POST",
    body: JSON.stringify({
      query: `
        query VariantTierMetafields($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              metafield(namespace: "custom", key: "price_tiers") {
                value
              }
            }
          }
        }
      `,
      variables: { ids: gids }
    })
  });

  const map = new Map();
  if (gqlResp.ok) {
    const gqlData = await gqlResp.json();
    const nodes = Array.isArray(gqlData?.data?.nodes) ? gqlData.data.nodes : [];
    nodes.forEach((node) => {
      const gid = String(node?.id || "");
      const id = gid.split("/").pop();
      const raw = node?.metafield?.value;
      if (!id || !raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") map.set(String(id), parsed);
      } catch {
        // ignore invalid metafield JSON
      }
    });
  }

  if (map.size === uniqueIds.length) return map;
  const unresolved = uniqueIds.filter((id) => !map.has(String(id)));
  await Promise.all(
    unresolved.map(async (variantId) => {
      const tierData = await fetchVariantPriceTiers(variantId);
      if (tierData?.value && typeof tierData.value === "object") {
        map.set(String(variantId), tierData.value);
      }
    })
  );
  return map;
}

async function batchFetchOrderParcelCounts(base, orderIds = []) {
  const uniqueIds = Array.from(
    new Set(
      (orderIds || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  const parcelCountMap = new Map();
  if (!uniqueIds.length) return parcelCountMap;

  const unresolved = [];
  uniqueIds.forEach((orderId) => {
    const cached = getCachedOrderParcelCount(orderId);
    if (cached !== undefined) {
      parcelCountMap.set(String(orderId), cached);
    } else {
      unresolved.push(orderId);
    }
  });
  if (!unresolved.length) return parcelCountMap;

  const gqlResp = await shopifyFetch(`${base}/graphql.json`, {
    method: "POST",
    body: JSON.stringify({
      query: `
        query OrderParcelCounts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Order {
              id
              metafield(namespace: "${ORDER_PARCEL_NAMESPACE}", key: "${ORDER_PARCEL_KEY}") {
                value
              }
            }
          }
        }
      `,
      variables: {
        ids: unresolved.map((id) => `gid://shopify/Order/${id}`)
      }
    })
  });

  if (gqlResp.ok) {
    const gqlData = await gqlResp.json();
    const nodes = Array.isArray(gqlData?.data?.nodes) ? gqlData.data.nodes : [];
    nodes.forEach((node) => {
      const orderId = String(node?.id || "").split("/").pop();
      const raw = node?.metafield?.value;
      if (!orderId || raw == null) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      parcelCountMap.set(orderId, parsed);
      cacheOrderParcelCount(orderId, parsed);
    });
  }

  const unresolvedAfterGraphql = unresolved.filter((orderId) => !parcelCountMap.has(orderId));
  const fallbackIds = unresolvedAfterGraphql.slice(0, ORDER_PARCEL_REST_FALLBACK_CAP);
  await Promise.all(
    fallbackIds.map(async (orderId) => {
      const parcelCount = await fetchOrderParcelCount(base, orderId);
      parcelCountMap.set(String(orderId), parcelCount);
    })
  );

  return parcelCountMap;
}

function normalizeCustomer(customer, metafields = {}, options = {}) {
  if (!customer) return null;
  const first = (customer.first_name || "").trim();
  const last = (customer.last_name || "").trim();
  const fullName =
    customer.name ||
    `${first} ${last}`.trim() ||
    customer.email ||
    customer.phone ||
    "Unnamed customer";

  return {
    id: customer.id,
    name: fullName,
    email: customer.email || "",
    phone: customer.phone || "",
    tags: customer.tags || "",
    addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
    default_address: customer.default_address || null,
    delivery_method: metafields.delivery_method || null,
    delivery_type: metafields.delivery_type || null,
    tier: normalizeCustomerTier(metafields.tier),
    deliveryInstructions: metafields.delivery_instructions || null,
    companyName: metafields.company_name || null,
    accountEmail: metafields.account_email || null,
    accountContact: metafields.account_contact || null,
    vatNumber: metafields.vat_number || null,
    paymentTerms: metafields.payment_terms || null,
    paymentBeforeShippingRequired: parseBooleanLike(
      metafields.payment_before_shipping ?? metafields.payment_before_delivery
    ),
    customFieldsLoaded: Boolean(options.customFieldsLoaded)
  };
}

function toKg(weight, unit) {
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

function parsePageInfo(linkHeader) {
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

router.get("/shopify/customers/search", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const q = String(req.query.q || "").trim();
    if (!q) return badRequest(res, "Missing search query (?q=...)");

    const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 250);
    const pageInfo = String(req.query.pageInfo || "").trim();
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const url = pageInfo
      ? `${base}/customers/search.json?limit=${limit}&page_info=${encodeURIComponent(pageInfo)}` +
        `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`
      : `${base}/customers/search.json?limit=${limit}` +
        `&query=${encodeURIComponent(q)}` +
        `&order=orders_count desc` +
        `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`;

    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const customers = Array.isArray(data.customers) ? data.customers : [];
    customers.sort(
      (a, b) => Number(b.orders_count || 0) - Number(a.orders_count || 0)
    );

    const normalized = customers
      .map((cust) => normalizeCustomer(cust, {}, { customFieldsLoaded: false }))
      .filter(Boolean);

    const pageMeta = parsePageInfo(resp.headers.get("link"));
    return res.json({ customers: normalized, nextPageInfo: pageMeta.next || null });
  } catch (err) {
    console.error("Shopify customer search error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/customers/recent", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 250);
    const pageInfo = String(req.query.pageInfo || "").trim();
    const segment = String(req.query.segment || "").trim().toLowerCase();
    const segmentQueryMap = {
      agent: "tag:agent",
      retail: "tag:retail OR tag:retailer",
      export: "tag:export"
    };
    const segmentQuery = segmentQueryMap[segment] || "";
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const url = segmentQuery
      ? pageInfo
        ? `${base}/customers/search.json?limit=${limit}&page_info=${encodeURIComponent(pageInfo)}` +
          `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`
        : `${base}/customers/search.json?limit=${limit}` +
          `&query=${encodeURIComponent(segmentQuery)}` +
          `&order=orders_count desc` +
          `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`
      : pageInfo
      ? `${base}/customers.json?limit=${limit}&page_info=${encodeURIComponent(pageInfo)}` +
        `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`
      : `${base}/customers.json?limit=${limit}` +
        `&order=orders_count desc` +
        `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`;

    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const customers = Array.isArray(data.customers) ? data.customers : [];
    customers.sort((a, b) => Number(b.orders_count || 0) - Number(a.orders_count || 0));

    const normalized = customers
      .map((cust) => normalizeCustomer(cust, {}, { customFieldsLoaded: false }))
      .filter(Boolean);

    const pageMeta = parsePageInfo(resp.headers.get("link"));
    return res.json({ customers: normalized, nextPageInfo: pageMeta.next || null });
  } catch (err) {
    console.error("Shopify recent customers error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/customers/:id/metafields", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const customerId = String(req.params.id || "").trim();
    if (!customerId) return badRequest(res, "Missing customer id");

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const metafields = await fetchCustomerCustomMetafields(base, customerId);

    return res.json({
      customerId,
      metafields,
      customFieldsLoaded: true
    });
  } catch (err) {
    console.error("Shopify customer metafields error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/payment-terms/options", async (_req, res) => {
  const defaults = ["Due on delivery", "7 days", "30 days", "60 days", "90 days"];
  return res.json({ options: defaults });
});

router.get("/shopify/customers/by-access-code", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const rawCode = String(req.query.code || "").trim();
    if (!rawCode) return badRequest(res, "Missing customer access code (?code=...)");
    const safeCode = rawCode.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!safeCode) return badRequest(res, "Invalid access code format");

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const searchQuery = `tag:access_code_${safeCode}`;
    const url = `${base}/customers/search.json?limit=5&query=${encodeURIComponent(searchQuery)}` +
      `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags,orders_count`;
    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const customers = Array.isArray(data.customers) ? data.customers : [];
    const customer = customers.map((entry) => normalizeCustomer(entry, {}, { customFieldsLoaded: false })).find(Boolean);
    if (!customer) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Access code not found." });
    }

    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("Shopify customer access code lookup error:", err);
    return res.status(502).json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/customers", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      accountEmail,
      accountContact,
      tier,
      vatNumber,
      paymentTerms,
      paymentBeforeShippingRequired,
      deliveryInstructions,
      deliveryMethod,
      address
    } =
      req.body || {};

    if (!firstName && !lastName && !email && !phone) {
      return badRequest(res, "Provide at least a name, email, or phone number");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const normalizedAccountEmail = normalizeEmailValue(accountEmail);
    const normalizedAccountContact = String(accountContact || "").trim() || null;
    const metafields = [];
    if (deliveryMethod) {
      metafields.push({
        namespace: "custom",
        key: "delivery_method",
        type: "single_line_text_field",
        value: deliveryMethod
      });
    }
    if (deliveryInstructions) {
      metafields.push({
        namespace: "custom",
        key: "delivery_instructions",
        type: "multi_line_text_field",
        value: deliveryInstructions
      });
    }
    if (company) {
      metafields.push({
        namespace: "custom",
        key: "company_name",
        type: "single_line_text_field",
        value: company
      });
    }
    if (normalizedAccountEmail) {
      metafields.push({
        namespace: "custom",
        key: "account_email",
        type: "single_line_text_field",
        value: normalizedAccountEmail
      });
    }
    if (normalizedAccountContact) {
      metafields.push({
        namespace: "custom",
        key: "account_contact",
        type: "single_line_text_field",
        value: normalizedAccountContact
      });
    }
    if (tier) {
      metafields.push({
        namespace: "custom",
        key: "tier",
        type: "single_line_text_field",
        value: String(tier)
      });
    }
    if (vatNumber) {
      metafields.push({
        namespace: "custom",
        key: "vat_number",
        type: "single_line_text_field",
        value: vatNumber
      });
    }
    if (paymentTerms) {
      metafields.push({
        namespace: "custom",
        key: "payment_terms",
        type: "single_line_text_field",
        value: String(paymentTerms)
      });
    }
    const paymentBeforeShipping = parseBooleanLike(paymentBeforeShippingRequired);
    if (paymentBeforeShipping != null) {
      CUSTOMER_PAYMENT_BEFORE_SHIPPING_KEYS.forEach((key) => {
        metafields.push({
          namespace: "custom",
          key,
          type: "boolean",
          value: paymentBeforeShipping ? "true" : "false"
        });
      });
    }

    const payload = {
      customer: {
        first_name: firstName || "",
        last_name: lastName || "",
        email: email || "",
        phone: phone || "",
        addresses: address
          ? [
              {
                address1: address.address1 || "",
                address2: address.address2 || "",
                city: address.city || "",
                province: address.province || "",
                zip: address.zip || "",
                country: address.country || "",
                company: company || "",
                first_name: firstName || "",
                last_name: lastName || "",
                phone: phone || ""
              }
            ]
          : [],
        note: vatNumber ? `VAT ID: ${vatNumber}` : undefined,
        metafields
      }
    };

    const resp = await shopifyFetch(`${base}/customers.json`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body: data
      });
    }

    const customer = normalizeCustomer(
      data.customer,
      {
        delivery_method: deliveryMethod || null,
        delivery_instructions: deliveryInstructions || null,
        company_name: company || null,
        account_email: normalizedAccountEmail,
        account_contact: normalizedAccountContact,
        vat_number: vatNumber || null,
        payment_terms: paymentTerms || null,
        payment_before_shipping: paymentBeforeShipping == null ? null : paymentBeforeShipping,
        payment_before_delivery: paymentBeforeShipping == null ? null : paymentBeforeShipping,
        tier: tier || null
      },
      { customFieldsLoaded: true }
    );
    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("Shopify customer create error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/products/search", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const q = String(req.query.q || "").trim();
    if (!q) return badRequest(res, "Missing search query (?q=...)");
    const includePriceTiers =
      String(req.query.includePriceTiers || "").toLowerCase() === "true" ||
      String(req.query.includePriceTiers || "") === "1";
    const productCode = String(req.query.productCode || "").trim();
    const productPageInfo = String(req.query.productPageInfo || "").trim();
    const variantPageInfo = String(req.query.variantPageInfo || "").trim();

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;

    const productParams = new URLSearchParams({
      limit: String(limit),
      fields: "id,title,variants"
    });
    if (productPageInfo) {
      productParams.set("page_info", productPageInfo);
    } else {
      productParams.set("title", q);
    }
    const productUrl = `${base}/products.json?${productParams.toString()}`;

    const variantParams = new URLSearchParams({
      limit: String(limit),
      fields: "id,product_id,title,sku,price,weight,weight_unit"
    });
    if (variantPageInfo) {
      variantParams.set("page_info", variantPageInfo);
    } else {
      variantParams.set("sku", q);
    }
    const variantUrl = `${base}/variants.json?${variantParams.toString()}`;

    const [prodResp, varResp] = await Promise.all([
      shopifyFetch(productUrl, { method: "GET" }),
      shopifyFetch(variantUrl, { method: "GET" })
    ]);

    if (!prodResp.ok || !varResp.ok) {
      const prodText = await prodResp.text();
      const varText = await varResp.text();
      return res.status(502).json({
        error: "SHOPIFY_UPSTREAM",
        statusText: `${prodResp.statusText} / ${varResp.statusText}`,
        body: { products: prodText, variants: varText }
      });
    }

    const prodData = await prodResp.json();
    const varData = await varResp.json();
    const products = Array.isArray(prodData.products) ? prodData.products : [];
    const variants = Array.isArray(varData.variants) ? varData.variants : [];

    const productPaging = parsePageInfo(prodResp.headers.get("link"));
    const variantPaging = parsePageInfo(varResp.headers.get("link"));

    const productTitleById = new Map(products.map((p) => [p.id, p.title]));

    const missingProductIds = [
      ...new Set(
        variants
          .map((v) => v.product_id)
          .filter((id) => id && !productTitleById.has(id))
      )
    ];

    if (missingProductIds.length) {
      const idsParam = missingProductIds.slice(0, 250).join(",");
      const idUrl = `${base}/products.json?ids=${idsParam}&fields=id,title`;
      const idResp = await shopifyFetch(idUrl, { method: "GET" });
      if (idResp.ok) {
        const idData = await idResp.json();
        const idProducts = Array.isArray(idData.products) ? idData.products : [];
        idProducts.forEach((p) => {
          productTitleById.set(p.id, p.title);
        });
      }
    }

    const normalized = [];
    const seen = new Set();

    products.forEach((p) => {
      const variantsList = Array.isArray(p.variants) ? p.variants : [];
      variantsList.forEach((v) => {
        const title =
          v.title && v.title !== "Default Title" ? `${p.title} – ${v.title}` : p.title;
        const entry = {
          variantId: v.id,
          sku: v.sku || "",
          title,
          price: v.price != null ? Number(v.price) : null,
          weightKg: toKg(v.weight, v.weight_unit)
        };
        const key = String(entry.variantId);
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(entry);
        }
      });
    });

    variants.forEach((v) => {
      const baseTitle = productTitleById.get(v.product_id) || "Variant";
      const title =
        v.title && v.title !== "Default Title" ? `${baseTitle} – ${v.title}` : baseTitle;
      const entry = {
        variantId: v.id,
        sku: v.sku || "",
        title,
        price: v.price != null ? Number(v.price) : null,
        weightKg: toKg(v.weight, v.weight_unit)
      };
      const key = String(entry.variantId);
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(entry);
      }
    });

    let filtered = normalized;
    if (productCode) {
      const code = productCode.toLowerCase();
      filtered = normalized.filter((item) => {
        if (String(item.variantId) === productCode) return true;
        const sku = String(item.sku || "").toLowerCase();
        return sku === code;
      });
    }

    if (includePriceTiers && filtered.length) {
      const enrichCandidates = filtered
        .map((item) => String(item.variantId || "").trim())
        .filter(Boolean)
        .slice(0, SEARCH_TIER_ENRICHMENT_CAP);
      const tiersMap = await batchFetchVariantPriceTiers(base, enrichCandidates);
      filtered.forEach((item) => {
        const tiers = tiersMap.get(String(item.variantId));
        if (tiers) item.priceTiers = tiers;
      });
    }

    return res.json({
      products: filtered,
      pageInfo: { products: productPaging, variants: variantPaging }
    });
  } catch (err) {
    console.error("Shopify product search error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/products/collection", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const handle = String(req.query.handle || "").trim();
    if (!handle) {
      return badRequest(res, "Missing collection handle (?handle=...)");
    }
    const includePriceTiers =
      String(req.query.includePriceTiers || "").toLowerCase() === "true" ||
      String(req.query.includePriceTiers || "") === "1";

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const customUrl = `${base}/custom_collections.json?handle=${encodeURIComponent(
      handle
    )}&fields=id,title`;
    const smartUrl = `${base}/smart_collections.json?handle=${encodeURIComponent(
      handle
    )}&fields=id,title`;

    const [customResp, smartResp] = await Promise.all([
      shopifyFetch(customUrl, { method: "GET" }),
      shopifyFetch(smartUrl, { method: "GET" })
    ]);

    let collectionId = null;
    if (customResp.ok) {
      const data = await customResp.json();
      const list = Array.isArray(data.custom_collections) ? data.custom_collections : [];
      if (list.length) collectionId = list[0].id;
    }
    if (!collectionId && smartResp.ok) {
      const data = await smartResp.json();
      const list = Array.isArray(data.smart_collections) ? data.smart_collections : [];
      if (list.length) collectionId = list[0].id;
    }

    if (!collectionId) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Collection not found" });
    }

    const productUrl = `${base}/collections/${collectionId}/products.json?limit=100&fields=id,title,variants`;
    const prodResp = await shopifyFetch(productUrl, { method: "GET" });
    if (!prodResp.ok) {
      const body = await prodResp.text();
      return res.status(502).json({
        error: "SHOPIFY_UPSTREAM",
        status: prodResp.status,
        statusText: prodResp.statusText,
        body
      });
    }

    const prodData = await prodResp.json();
    const products = Array.isArray(prodData.products) ? prodData.products : [];
    const normalized = [];
    const seen = new Set();

    products.forEach((p) => {
      const variantsList = Array.isArray(p.variants) ? p.variants : [];
      variantsList.forEach((v) => {
        const title =
          v.title && v.title !== "Default Title" ? `${p.title} – ${v.title}` : p.title;
        const entry = {
          variantId: v.id,
          sku: v.sku || "",
          title,
          price: v.price != null ? Number(v.price) : null,
          weightKg: toKg(v.weight, v.weight_unit)
        };
        const key = String(entry.variantId);
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(entry);
        }
      });
    });

    if (includePriceTiers && normalized.length) {
      const tiersMap = await batchFetchVariantPriceTiers(
        base,
        normalized.map((item) => item.variantId)
      );
      normalized.forEach((item) => {
        const tiers = tiersMap.get(String(item.variantId));
        if (tiers) item.priceTiers = tiers;
      });
    }

    return res.json({ products: normalized });
  } catch (err) {
    console.error("Shopify collection products error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/variants/price-tiers", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const body = req.body || {};
    const updates = Array.isArray(body.updates) ? body.updates : body.variantId ? [body] : [];

    if (!updates.length) {
      return badRequest(res, "Provide updates array or variantId payload");
    }

    const results = await Promise.all(
      updates.map(async (update) => {
        const variantId = update?.variantId;
        if (!variantId) {
          return {
            ok: false,
            error: "MISSING_VARIANT_ID"
          };
        }

        const rawTiers =
          update?.priceTiers && typeof update.priceTiers === "object"
            ? update.priceTiers
            : null;
        if (!rawTiers) {
          return {
            ok: false,
            variantId,
            error: "MISSING_PRICE_TIERS"
          };
        }

        const cleaned = {};
        Object.entries(rawTiers).forEach(([key, value]) => {
          if (value == null || value === "") return;
          const num = Number(value);
          if (Number.isFinite(num)) cleaned[key] = num;
        });

        const metaResp = await upsertVariantPriceTiers(variantId, cleaned);
        const metaOk = metaResp.ok;

        let publicPriceUpdated = false;
        if (update?.updatePublicPrice) {
          const publicPrice =
            update?.publicPrice != null ? Number(update.publicPrice) : cleaned.default;
          if (Number.isFinite(publicPrice)) {
            const priceResp = await updateVariantPrice(variantId, publicPrice);
            publicPriceUpdated = priceResp.ok;
          }
        }

        return {
          ok: metaOk,
          variantId,
          metafieldUpdated: metaOk,
          publicPriceUpdated
        };
      })
    );

    const anyFailed = results.some((r) => !r.ok);
    return res.status(anyFailed ? 207 : 200).json({ results });
  } catch (err) {
    console.error("Shopify price tier update error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/variants/price-tiers/fetch", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const body = req.body || {};
    const variantIds = Array.isArray(body.variantIds) ? body.variantIds : [];
    if (!variantIds.length) {
      return badRequest(res, "Missing variantIds");
    }

    const uniqueIds = Array.from(
      new Set(
        variantIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    ).slice(0, 250);

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const tiersMap = await batchFetchVariantPriceTiers(base, uniqueIds);
    const tiersByVariantId = {};
    uniqueIds.forEach((variantId) => {
      const tiers = tiersMap.get(String(variantId));
      if (tiers && typeof tiers === "object") {
        tiersByVariantId[String(variantId)] = tiers;
      }
    });

    return res.json({ priceTiersByVariantId: tiersByVariantId });
  } catch (err) {
    console.error("Shopify price tier fetch error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});


function parseNoteAttributes(noteAttributes = []) {
  const map = new Map();
  (Array.isArray(noteAttributes) ? noteAttributes : []).forEach((entry) => {
    const name = String(entry?.name || "").trim();
    if (!name) return;
    map.set(name, String(entry?.value ?? ""));
  });
  return map;
}

async function fetchDraftOrder(base, draftOrderId) {
  const resp = await shopifyFetch(`${base}/draft_orders/${draftOrderId}.json`, { method: "GET" });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Draft order fetch failed (${resp.status}): ${body}`);
  }
  const data = await resp.json();
  return data?.draft_order || null;
}

function toPricingHashLineItems(draftOrder) {
  return (Array.isArray(draftOrder?.line_items) ? draftOrder.line_items : []).map((line) => {
    const discountAmount = Number(line?.applied_discount?.value || 0);
    const price = Number(line?.price || 0);
    const unitPrice = Number.isFinite(discountAmount) && discountAmount > 0 ? price - discountAmount : price;
    return {
      variant_id: line?.variant_id,
      quantity: line?.quantity,
      resolved_unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
      source: Number.isFinite(discountAmount) && discountAmount > 0 ? "discount_fallback" : "fixed_tier"
    };
  });
}

async function reconcileDraftOrderPricing({ base, draftOrderId, tierDiscounts = {} }) {
  const draftOrder = await fetchDraftOrder(base, draftOrderId);
  if (!draftOrder) throw new Error("Draft order not found.");
  const customerId = draftOrder?.customer?.id;
  const customerMetafields = await fetchCustomerCustomMetafields(base, customerId);
  const customerTags = normalizeTagList(draftOrder?.customer?.tags || "");
  const tierResolution = resolveCustomerTier({
    customerTier: customerMetafields?.tier,
    customerTags,
    defaultTier: "public"
  });

  const expected = resolvePricingForLines({
    lineItems: (draftOrder.line_items || []).map((line) => ({
      variant_id: line.variant_id,
      quantity: line.quantity,
      retailPrice: line.price,
      product: { price_tiers: line?.properties?.price_tiers }
    })),
    tier: tierResolution.tier,
    tierDiscounts
  });

  const expectedHash = expected.hash;
  const existingAttributes = parseNoteAttributes(draftOrder.note_attributes);
  const incomingHash = existingAttributes.get("flss_pricing_hash") || "";
  const currentHash = buildPricingHash({
    tier: tierResolution.tier,
    currency: draftOrder.currency || "ZAR",
    signatures: toPricingHashLineItems(draftOrder)
  });

  if (incomingHash && incomingHash === expectedHash && currentHash === expectedHash) {
    setPricingStatus(draftOrderId, {
      draftOrderId: String(draftOrderId),
      tier: tierResolution.tier,
      hash: expectedHash,
      corrected: false,
      mismatch: false,
      message: "Already aligned"
    });
    return { corrected: false, expectedHash, currentHash, tier: tierResolution.tier, linesChecked: expected.lines.length };
  }

  const line_items = expected.lines.map((line) => ({
    variant_id: Number(line.variant_id),
    quantity: line.quantity,
    price: Number(line.resolved_unit_price).toFixed(2)
  }));
  const updatedAttrs = [
    ...Array.from(existingAttributes.entries())
      .filter(([name]) => name !== "flss_pricing_hash")
      .map(([name, value]) => ({ name, value })),
    { name: "flss_pricing_hash", value: expectedHash }
  ];

  const updateResp = await shopifyFetch(`${base}/draft_orders/${draftOrderId}.json`, {
    method: "PUT",
    body: JSON.stringify({
      draft_order: {
        id: draftOrderId,
        line_items,
        note_attributes: updatedAttrs
      }
    })
  });
  if (!updateResp.ok) {
    const body = await updateResp.text();
    throw new Error(`Draft order pricing reconcile failed (${updateResp.status}): ${body}`);
  }

  const verified = await fetchDraftOrder(base, draftOrderId);
  const verifiedHash = buildPricingHash({
    tier: tierResolution.tier,
    currency: verified?.currency || "ZAR",
    signatures: toPricingHashLineItems(verified)
  });
  const mismatch = verifiedHash !== expectedHash;

  setPricingStatus(draftOrderId, {
    draftOrderId: String(draftOrderId),
    tier: tierResolution.tier,
    hash: expectedHash,
    corrected: true,
    mismatch,
    message: mismatch ? "Reconciled but verification hash mismatch" : "Pricing corrected"
  });

  return {
    corrected: true,
    mismatch,
    expectedHash,
    verifiedHash,
    tier: tierResolution.tier,
    linesChecked: expected.lines.length
  };
}

router.post("/shopify/draft-orders", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      customerId,
      lineItems,
      priceTier,
      billingAddress,
      shippingAddress,
      poNumber,
      shippingMethod,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      deliveryDate,
      invoiceEmail,
      customerTags,
      orderTags: requestOrderTags,
      tags: requestTags,
      vatNumber,
      companyName,
      paymentTerms
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const draftRequest = await buildShopifyDraftOrderPayload({
      customerId,
      lineItems,
      priceTier,
      billingAddress,
      shippingAddress,
      poNumber,
      shippingMethod,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      deliveryDate,
      invoiceEmail,
      customerTags,
      orderTags: requestOrderTags,
      tags: requestTags,
      vatNumber,
      companyName,
      paymentTerms
    });
    const draftResult = await createDraftOrderAndWait({
      base: draftRequest.base,
      draftPayload: draftRequest.draftPayload
    });

    if (!draftResult.ok) {
      return res.status(draftResult.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: draftResult.status,
        statusText: draftResult.statusText,
        message: draftResult.message || "Draft order creation failed.",
        body: draftResult.body,
        draftOrderId: draftResult.draftOrderId,
        draftAdminUrl: draftResult.draftAdminUrl,
        pricingSummary: draftRequest.pricingSummary
      });
    }

    const d = draftResult.draft || {};

    return res.json({
      ok: true,
      draftOrder: {
        id: d.id,
        name: d.name,
        invoiceUrl: d.invoice_url || null,
        adminUrl: draftResult.draftAdminUrl
      },
      pricing: draftRequest.pricing,
      pricingSummary: draftRequest.pricingSummary
    });
  } catch (err) {
    console.error("Shopify draft order create error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

const createPurchaseOrderDraft = async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { supplierName, note, lines } = req.body || {};
    const requestedLines = Array.isArray(lines) ? lines : [];
    const normalizedLines = requestedLines
      .map((line) => {
        const quantity = Math.max(0, Math.floor(Number(line?.quantity || 0)));
        const variantId = Number(line?.variantId || line?.variant_id);
        const title = String(line?.title || line?.name || line?.sku || "").trim();
        const sku = String(line?.sku || "").trim();
        if (!quantity || !title) return null;

        if (Number.isFinite(variantId)) {
          return {
            variant_id: variantId,
            quantity,
            sku,
            title
          };
        }

        return {
          title,
          sku,
          quantity,
          price: "0.00"
        };
      })
      .filter(Boolean);

    if (!normalizedLines.length) {
      return badRequest(res, "At least one line with quantity is required");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const tags = ["purchase-order", "FLSS"].join(", ");
    const supplierLabel = String(supplierName || "").trim();

    const payload = {
      draft_order: {
        line_items: normalizedLines.map((line) => {
          if (line.variant_id) return { variant_id: line.variant_id, quantity: line.quantity };
          return {
            title: line.title,
            quantity: line.quantity,
            price: String(line.price || "0.00")
          };
        }),
        tags,
        note: [supplierLabel ? `Supplier: ${supplierLabel}` : "", String(note || "").trim()]
          .filter(Boolean)
          .join("\n"),
        note_attributes: [
          { name: "source", value: "FLSS purchase-order" },
          ...(supplierLabel ? [{ name: "supplier", value: supplierLabel }] : [])
        ]
      }
    };

    const resp = await shopifyFetch(`${base}/draft_orders.json`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body: data
      });
    }

    const draftOrder = data?.draft_order || {};
    return res.json({
      ok: true,
      draftOrder: {
        id: draftOrder.id,
        name: draftOrder.name,
        invoiceUrl: draftOrder.invoice_url || null,
        adminUrl: draftOrder.id
          ? `https://${config.SHOPIFY_STORE}.myshopify.com/admin/draft_orders/${draftOrder.id}`
          : null
      },
      lineCount: normalizedLines.length
    });
  } catch (err) {
    console.error("Shopify purchase-order draft create error:", err);
    return res.status(502).json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
};

router.post("/shopify/draft-orders/purchase-order", createPurchaseOrderDraft);
router.post("/draft-orders/purchase-order", createPurchaseOrderDraft);
router.post("/shopify/purchase-orders", createPurchaseOrderDraft);

router.get("/shopify/purchase-orders/open", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const query = new URLSearchParams();
    query.set("status", "open");
    query.set("limit", "100");
    query.set("fields", "id,name,created_at,tags,line_items,note_attributes,note,status");
    query.set("since_id", String(req.query.since_id || ""));

    const resp = await shopifyFetch(`${base}/draft_orders.json?${query.toString()}`, {
      method: "GET"
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body: data
      });
    }

    const draftOrders = Array.isArray(data?.draft_orders) ? data.draft_orders : [];
    const purchaseOrders = draftOrders
      .filter((draft) => String(draft?.tags || "").toLowerCase().includes("purchase-order"))
      .map((draft) => ({
        id: draft.id,
        name: draft.name,
        created_at: draft.created_at,
        note: draft.note || "",
        tags: draft.tags || "",
        line_items: Array.isArray(draft.line_items)
          ? draft.line_items.map((line) => ({
              title: line.title || "",
              sku: line.sku || "",
              quantity: Number(line.quantity || 0)
            }))
          : [],
        adminUrl: draft.id
          ? `https://${config.SHOPIFY_STORE}.myshopify.com/admin/draft_orders/${draft.id}`
          : null
      }));

    return res.json({ ok: true, purchaseOrders });
  } catch (err) {
    console.error("Shopify purchase-order open list error:", err);
    return res.status(502).json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/purchase-orders/raw-materials", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const query = new URLSearchParams({
      status: "draft",
      limit: "250",
      fields: "id,title,tags,variants"
    });
    const resp = await shopifyFetch(`${base}/products.json?${query.toString()}`, {
      method: "GET"
    });

    if (!resp.ok) {
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
      return res.status(502).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body: data
      });
    }

    const body = await resp.json();
    const products = Array.isArray(body?.products) ? body.products : [];
    const looksLikeRawMaterial = (product) => {
      const blob = `${product?.title || ""} ${product?.tags || ""}`.toLowerCase();
      return ["raw", "material", "spice", "herb", "blend"].some((token) => blob.includes(token));
    };

    const items = products
      .filter(looksLikeRawMaterial)
      .flatMap((product) => {
        const productTitle = String(product?.title || "").trim() || "Untitled";
        const variants = Array.isArray(product?.variants) ? product.variants : [];
        return variants.map((variant) => {
          const variantTitle = String(variant?.title || "").trim();
          const title = variantTitle && variantTitle !== "Default Title"
            ? `${productTitle} – ${variantTitle}`
            : productTitle;
          const rawUom = String(variant?.weight_unit || "").trim().toLowerCase();
          const uom = rawUom || "unit";
          return {
            sku: String(variant?.sku || "").trim(),
            title,
            uom,
            category: "Other raw materials (From Shopify)",
            flavour: "",
            icon: "🧪"
          };
        });
      })
      .filter((item) => item.sku || item.title);

    return res.json({ items });
  } catch (err) {
    console.error("Shopify purchase-order raw-material list error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});



router.post("/pricing/resolve", async (req, res) => {
  try {
    const { customerTier, customerTags, variantLines, tierDiscounts, currency } = req.body || {};
    const tierResolution = resolveCustomerTier({
      customerTier,
      customerTags: normalizeTagList(customerTags),
      defaultTier: "public"
    });
    const result = resolvePricingForLines({
      lineItems: Array.isArray(variantLines) ? variantLines : [],
      tier: tierResolution.tier,
      currency: currency || "ZAR",
      tierDiscounts: tierDiscounts || {}
    });
    return res.json({ ok: true, tierResolution, ...result });
  } catch (err) {
    console.error("Pricing resolve error:", err);
    return res.status(500).json({ error: "PRICING_RESOLVE_ERROR", message: String(err?.message || err) });
  }
});

router.post("/pricing/reconcile-draft-order", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const { draftOrderId, tierDiscounts } = req.body || {};
    if (!draftOrderId) return badRequest(res, "Missing draftOrderId");
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const result = await reconcileDraftOrderPricing({ base, draftOrderId, tierDiscounts: tierDiscounts || {} });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Pricing reconcile error:", err);
    return res.status(502).json({ error: "PRICING_RECONCILE_ERROR", message: String(err?.message || err) });
  }
});

router.get("/pricing/status/:draftOrderId", async (req, res) => {
  const key = String(req.params?.draftOrderId || "").trim();
  if (!key) return badRequest(res, "Missing draftOrderId");
  const status = pricingReconcileStatus.get(key);
  if (!status) {
    return res.status(404).json({ error: "NOT_FOUND", message: "No pricing status available for draft order" });
  }
  return res.json({ ok: true, ...status });
});

router.post("/shopify/draft-orders/complete", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { draftOrderId } = req.body || {};
    if (!draftOrderId) {
      return badRequest(res, "Missing draftOrderId");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const completion = await completeDraftOrder({
      base,
      draftOrderId,
      paymentPending: true
    });

    if (!completion.ok) {
      return res.status(completion.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: completion.status,
        statusText: completion.statusText,
        body: completion.body
      });
    }

    const order = completion.order || null;
    return res.json({
      ok: true,
      order: order
        ? {
            id: order.id,
            name: order.name,
            orderNumber: order.order_number,
            adminUrl: completion.orderAdminUrl
          }
        : null
    });
  } catch (err) {
    console.error("Shopify draft order complete error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/orders", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      customerId,
      poNumber,
      deliveryDate,
      shippingMethod,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      vatNumber,
      companyName,
      paymentTerms,
      invoiceEmail,
      billingAddress,
      shippingAddress,
      lineItems,
      priceTier,
      customerTags,
      orderTags: requestOrderTags,
      tags: requestTags
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const draftRequest = await buildShopifyDraftOrderPayload({
      customerId,
      lineItems,
      priceTier,
      billingAddress,
      shippingAddress,
      poNumber,
      shippingMethod,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      deliveryDate,
      invoiceEmail,
      customerTags,
      orderTags: requestOrderTags,
      tags: requestTags,
      vatNumber,
      companyName,
      paymentTerms
    });
    const draftResult = await createDraftOrderAndWait({
      base: draftRequest.base,
      draftPayload: draftRequest.draftPayload
    });

    if (!draftResult.ok) {
      console.error("Shopify live order draft preparation failed:", {
        customerId,
        draftOrderId: draftResult.draftOrderId,
        tier: draftRequest.resolvedTier,
        pricingSummary: draftRequest.pricingSummary,
        stage: draftResult.stage,
        status: draftResult.status,
        message: draftResult.message || draftResult.statusText
      });
      return res.status(draftResult.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: draftResult.status,
        statusText: draftResult.statusText,
        message: draftResult.message || "Shopify draft calculation failed before order completion.",
        body: draftResult.body,
        draftOrderId: draftResult.draftOrderId,
        draftAdminUrl: draftResult.draftAdminUrl,
        creationMode: "draft_auto_complete",
        pricing: draftRequest.pricing,
        pricingSummary: draftRequest.pricingSummary
      });
    }

    const completion = await completeDraftOrder({
      base: draftRequest.base,
      draftOrderId: draftResult.draftOrderId,
      paymentPending: true
    });

    if (!completion.ok) {
      console.error("Shopify live order draft completion failed:", {
        customerId,
        draftOrderId: draftResult.draftOrderId,
        tier: draftRequest.resolvedTier,
        pricingSummary: draftRequest.pricingSummary,
        status: completion.status,
        body: completion.body
      });
      return res.status(completion.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: completion.status,
        statusText: completion.statusText,
        message: "Draft order was created but could not be completed automatically.",
        body: completion.body,
        draftOrderId: draftResult.draftOrderId,
        draftAdminUrl: draftResult.draftAdminUrl,
        creationMode: "draft_auto_complete",
        pricing: draftRequest.pricing,
        pricingSummary: draftRequest.pricingSummary
      });
    }

    const order = completion.order || {};
    return res.json({
      ok: true,
      creationMode: "draft_auto_complete",
      draftOrderId: draftResult.draftOrderId,
      draftAdminUrl: draftResult.draftAdminUrl,
      order: {
        id: order.id,
        name: order.name,
        orderNumber: order.order_number,
        adminUrl: completion.orderAdminUrl
      },
      pricing: draftRequest.pricing,
      pricingSummary: draftRequest.pricingSummary
    });
  } catch (err) {
    console.error("Shopify order create error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/orders/cash", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { lineItems, note, cashier } = req.body || {};

    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const orderPayload = {
      order: {
        line_items: lineItems.map((li) => {
          const entry = {
            quantity: li.quantity || 1
          };
          if (li.variantId) {
            entry.variant_id = li.variantId;
          } else {
            entry.title = li.title || li.sku || "Custom item";
            if (li.price != null) entry.price = String(li.price);
          }
          if (li.sku) entry.sku = li.sku;
          if (li.price != null && !entry.price) entry.price = String(li.price);
          return entry;
        }),
        financial_status: "paid",
        tags: "pos_cash",
        note: note || "POS cash sale",
        source_name: "pos",
        note_attributes: cashier ? [{ name: "cashier", value: String(cashier) }] : [],
        payment_gateway_names: ["Cash"]
      }
    };

    const resp = await shopifyFetch(`${base}/orders.json`, {
      method: "POST",
      body: JSON.stringify(orderPayload)
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body: data
      });
    }

    const order = data.order || null;
    return res.json({
      ok: true,
      order: order ? { id: order.id, name: order.name, orderNumber: order.order_number } : null
    });
  } catch (err) {
    console.error("Shopify cash order error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.get("/shopify/orders/by-name/:name", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    let name = req.params.name || "";
    if (!name.startsWith("#")) name = `#${name}`;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;

    const orderUrl = `${base}/orders.json?status=any&name=${encodeURIComponent(name)}`;
    const orderResp = await shopifyFetch(orderUrl, { method: "GET" });

    if (!orderResp.ok) {
      const body = await orderResp.text();
      return res.status(orderResp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: orderResp.status,
        statusText: orderResp.statusText,
        body
      });
    }

    const orderData = await orderResp.json();
    const order =
      Array.isArray(orderData.orders) && orderData.orders.length ? orderData.orders[0] : null;

    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Order not found" });
    }

    let customerPlaceCode = null;
    let parcelCountMeta = null;
    try {
      if (order.customer && order.customer.id) {
        const metaUrl = `${base}/customers/${order.customer.id}/metafields.json`;
        const metaResp = await shopifyFetch(metaUrl, { method: "GET" });

        if (metaResp.ok) {
          const metaData = await metaResp.json();
          const m = (metaData.metafields || []).find(
            (mf) => mf.namespace === "custom" && mf.key === "parcelperfect_place_code"
          );
          if (m && m.value) customerPlaceCode = m.value;
        } else {
          const body = await metaResp.text();
          console.warn("Customer metafields fetch failed:", metaResp.status, body);
        }
      }
    } catch (e) {
      console.warn("Customer metafields error:", e);
    }

    try {
      parcelCountMeta = await fetchOrderParcelCount(base, order.id);
    } catch (e) {
      console.warn("Order parcel metafield error:", e);
    }

    return res.json({ order, customerPlaceCode, parcelCountMeta });
  } catch (err) {
    console.error("Shopify proxy error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/orders/parcel-count", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { orderId, parcelCount } = req.body || {};
    if (!orderId) return badRequest(res, "Missing orderId");

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const shouldClear =
      parcelCount === null || parcelCount === "" || typeof parcelCount === "undefined";

    if (shouldClear) {
      const existing = await fetchOrderParcelMetafield(base, orderId);
      if (existing?.id) {
        const delResp = await shopifyFetch(`${base}/metafields/${existing.id}.json`, {
          method: "DELETE"
        });
        if (!delResp.ok) {
          const body = await delResp.text();
          return res.status(delResp.status).json({
            error: "SHOPIFY_UPSTREAM",
            status: delResp.status,
            statusText: delResp.statusText,
            body
          });
        }
      }
      cacheOrderParcelCount(orderId, null);
      return res.json({ ok: true, parcelCount: null });
    }

    const parsed = Number(parcelCount);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return badRequest(res, "parcelCount must be a non-negative integer");
    }

    const setMetaResult = await upsertOrderParcelMetafield(base, orderId, parsed);
    if (!setMetaResult.ok) {
      return res.status(setMetaResult.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: setMetaResult.status,
        statusText: setMetaResult.statusText,
        body: setMetaResult.body
      });
    }

    cacheOrderParcelCount(orderId, parsed);
    return res.json({ ok: true, parcelCount: parsed });
  } catch (err) {
    console.error("Shopify parcel-count error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/orders/open", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const limit = 250;
    const maxPages = Math.min(Math.max(Number(req.query.max_pages || 10), 1), 25);

    const firstPath =
      `${base}/orders.json?status=open` +
      `&fulfillment_status=unfulfilled,in_progress,partial` +
      `&limit=${limit}&order=created_at+desc`;

    const ordersRaw = [];
    let nextPath = firstPath;
    let pageCount = 0;

    const getNextPath = (linkHeader) => {
      if (!linkHeader) return null;
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (!match) return null;
      try {
        const url = new URL(match[1]);
        return `${url.pathname}${url.search}`;
      } catch (err) {
        return match[1].replace(/^https?:\/\/[^/]+/, "");
      }
    };

    while (nextPath && pageCount < maxPages) {
      const resp = await shopifyFetch(nextPath, { method: "GET" });

      if (!resp.ok) {
        const body = await resp.text();
        return res.status(resp.status).json({
          error: "SHOPIFY_UPSTREAM",
          status: resp.status,
          statusText: resp.statusText,
          body
        });
      }

      const data = await resp.json();
      if (Array.isArray(data.orders)) ordersRaw.push(...data.orders);
      nextPath = getNextPath(resp.headers.get("link"));
      pageCount += 1;
    }

    const filteredOrders = ordersRaw.filter((o) => !o.cancelled_at);
    const getQuantityRemaining = (lineItem = {}) => {
      const fulfillableQuantity = Number(lineItem.fulfillable_quantity);
      if (Number.isFinite(fulfillableQuantity)) {
        return Math.max(0, fulfillableQuantity);
      }

      const quantityRemainingRaw = Number(lineItem.current_quantity ?? lineItem.quantity ?? 0) - Number(lineItem.fulfilled_quantity ?? 0);
      if (Number.isFinite(quantityRemainingRaw)) {
        return Math.max(0, quantityRemainingRaw);
      }
      return Math.max(0, Number(lineItem.quantity ?? 0));
    };

    const openVariantIds = Array.from(
      new Set(
        filteredOrders
          .flatMap((order) => (Array.isArray(order?.line_items) ? order.line_items : []))
          .filter((lineItem) => getQuantityRemaining(lineItem) > 0)
          .map((lineItem) => Number(lineItem?.variant_id))
          .filter((variantId) => Number.isFinite(variantId))
      )
    );

    const variantInventoryAvailable = new Map();
    if (openVariantIds.length) {
      try {
        const locationId = await fetchPrimaryLocationId();
        const variantToInventoryItem = await fetchInventoryItemIdsForVariants(openVariantIds);
        const inventoryItemIds = Array.from(new Set(Array.from(variantToInventoryItem.values())));
        const inventoryLevels = await fetchInventoryLevelsForItems(inventoryItemIds, locationId);

        variantToInventoryItem.forEach((inventoryItemId, variantId) => {
          if (!inventoryLevels.has(inventoryItemId)) return;
          variantInventoryAvailable.set(variantId, Number(inventoryLevels.get(inventoryItemId) || 0));
        });
      } catch (inventoryErr) {
        console.warn("Shopify open-orders inventory enrichment skipped:", inventoryErr?.message || inventoryErr);
      }
    }

    const orderIds = filteredOrders.map((o) => o.id);
    const customerIds = filteredOrders.map((o) => o?.customer?.id).filter(Boolean);
    const parcelCountMap = await batchFetchOrderParcelCounts(base, orderIds);
    const customerPaymentBeforeDeliveryMap = await fetchCustomerPaymentBeforeDeliveryMap(base, customerIds);

    const orders = filteredOrders.map((o) => {
        const shipping = o.shipping_address || {};
        const customer = o.customer || {};

        const parcelCountFromTag = parseParcelCountFromTags(o.tags);

        const totalGrams = (o.line_items || []).reduce((sum, li) => {
          const grams = Number(li.grams || 0);
          const qty = Number(li.quantity || 1);
          return sum + grams * qty;
        }, 0);
        const totalWeightKg = totalGrams / 1000;

        const companyName =
          (shipping.company && shipping.company.trim()) ||
          (customer?.default_address?.company && customer.default_address.company.trim());

        const customer_name =
          companyName ||
          shipping.name ||
          `${(customer.first_name || "").trim()} ${(customer.last_name || "").trim()}`.trim() ||
          (o.name ? o.name.replace(/^#/, "") : "");

        const parcelCountFromMeta = parcelCountMap.get(String(o.id)) ?? null;

        const fulfillments = (o.fulfillments || []).map((fulfillment, index) => {
          const trackingNumbers = Array.isArray(fulfillment?.tracking_numbers)
            ? fulfillment.tracking_numbers.filter(Boolean)
            : [];
          if (!trackingNumbers.length && fulfillment?.tracking_number) {
            trackingNumbers.push(fulfillment.tracking_number);
          }
          const lineItems = Array.isArray(fulfillment?.line_items)
            ? fulfillment.line_items.map((li) => ({
                id: li.id,
                line_item_id: li.line_item_id,
                quantity: Number(li.quantity) || 0
              }))
            : [];
          return {
            id: fulfillment?.id,
            name: fulfillment?.name || `F${index + 1}`,
            status: fulfillment?.status || "",
            shipment_status: fulfillment?.shipment_status || "",
            cancelled_at: fulfillment?.cancelled_at || null,
            tracking_numbers: trackingNumbers,
            created_at: fulfillment?.created_at || null,
            line_items: lineItems
          };
        });

        const paymentBeforeDeliveryRequired = customer?.id
          ? customerPaymentBeforeDeliveryMap.get(String(customer.id))
          : null;

        return {
          id: o.id,
          name: o.name,
          customer_name,
          email: o.email || customer.email || "",
          created_at: o.processed_at || o.created_at,
          delivery_date:
            Array.isArray(o.note_attributes)
              ? o.note_attributes.find((attr) => String(attr?.name || "").toLowerCase() === "delivery_date")?.value || null
              : null,
          fulfillment_status: o.fulfillment_status,
          financial_status: o.financial_status || "",
          payment_before_delivery: paymentBeforeDeliveryRequired,
          tags: o.tags || "",
          total_weight_kg: totalWeightKg,
          shipping_lines: (o.shipping_lines || []).map((line) => ({
            title: line.title || "",
            code: line.code || "",
            price: line.price || ""
          })),
          shipping_city: shipping.city || "",
          shipping_postal: shipping.zip || "",
          shipping_address1: shipping.address1 || "",
          shipping_address2: shipping.address2 || "",
          shipping_province: shipping.province || "",
          shipping_country: shipping.country || "",
          shipping_phone: shipping.phone || "",
          shipping_name: shipping.name || customer_name,
          parcel_count: parcelCountFromMeta ?? parcelCountFromTag,
          parcel_count_from_meta: parcelCountFromMeta,
          parcel_count_from_tag: parcelCountFromTag,
          fulfillments,
          line_items: (o.line_items || [])
            .map((li) => {
              const quantityRemaining = getQuantityRemaining(li);
              const variantId = Number(li.variant_id);
              const inventoryAvailable = Number.isFinite(variantId) && variantInventoryAvailable.has(variantId)
                ? Number(variantInventoryAvailable.get(variantId))
                : null;
              return {
                id: li.id,
                variant_id: Number.isFinite(variantId) ? variantId : null,
                title: li.title,
                variant_title: li.variant_title,
                quantity: li.quantity,
                fulfillable_quantity: li.fulfillable_quantity,
                fulfilled_quantity: li.fulfilled_quantity,
                quantity_remaining: quantityRemaining,
                inventory_available: inventoryAvailable
              };
            })
        };
      });

    return res.json({ orders });
  } catch (err) {
    console.error("Shopify open-orders error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/orders/list", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 250);
    const createdAtMin = req.query.from ? `&created_at_min=${encodeURIComponent(req.query.from)}` : "";
    const createdAtMax = req.query.to ? `&created_at_max=${encodeURIComponent(req.query.to)}` : "";

    const url =
      `${base}/orders.json?status=any` +
      `&order=created_at+desc` +
      `&limit=${limit}` +
      `&fields=id,name,order_number,created_at,processed_at,customer,email,shipping_address` +
      createdAtMin +
      createdAtMax;

    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const ordersRaw = Array.isArray(data.orders) ? data.orders : [];
    const orders = ordersRaw
      .filter((o) => !o.cancelled_at)
      .map((o) => {
        const shipping = o.shipping_address || {};
        const customer = o.customer || {};
        const companyName =
          (shipping.company && shipping.company.trim()) ||
          (customer?.default_address?.company && customer.default_address.company.trim());

        const customer_name =
          companyName ||
          shipping.name ||
          `${(customer.first_name || "").trim()} ${(customer.last_name || "").trim()}`.trim() ||
          (o.name ? o.name.replace(/^#/, "") : "");

        return {
          id: o.id,
          name: o.name,
          order_number: o.order_number,
          customer_name,
          email: o.email || customer.email || "",
          created_at: o.processed_at || o.created_at
        };
      });

    return res.json({ orders });
  } catch (err) {
    console.error("Shopify order-list error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/orders/run-flow", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const { orderId, flowTag } = req.body || {};
    if (!orderId) return badRequest(res, "Missing orderId");
    const tagToApply = String(flowTag || config.SHOPIFY_FLOW_TAG || "dispatch_flow")
      .trim()
      .replace(/^,+|,+$/g, "");
    if (!tagToApply) return badRequest(res, "Missing flow tag");

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const result = await appendOrderTag(base, orderId, tagToApply);
    if (!result.ok) {
      return res.status(result.status || 502).json({
        error: "SHOPIFY_UPSTREAM",
        status: result.status || 502,
        statusText: result.statusText || "Tag update failed",
        body: result.body
      });
    }

    return res.json({ ok: true, tag: tagToApply, tags: (result.tags || []).join(", ") });
  } catch (err) {
    console.error("Shopify run-flow error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/shipments/recent", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;

    const url =
      `${base}/orders.json?status=any` +
      `&fulfillment_status=fulfilled` +
      `&limit=50&order=updated_at+desc`;

    const resp = await shopifyFetch(url, { method: "GET" });

    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const ordersRaw = Array.isArray(data.orders) ? data.orders : [];
    const shipments = [];

    ordersRaw.forEach((o) => {
      if (o.cancelled_at) return;
      const shipping = o.shipping_address || {};
      const customer = o.customer || {};
      const fulfillments = Array.isArray(o.fulfillments) ? o.fulfillments : [];

      const companyName =
        (shipping.company && shipping.company.trim()) ||
        (customer?.default_address?.company && customer.default_address.company.trim());

      const customer_name =
        companyName ||
        shipping.name ||
        `${(customer.first_name || "").trim()} ${(customer.last_name || "").trim()}`.trim() ||
        (o.name ? o.name.replace(/^#/, "") : "");

      fulfillments.forEach((fulfillment) => {
        const shipmentStatus = String(
          fulfillment.shipment_status || fulfillment.status || ""
        ).toLowerCase();
        if (shipmentStatus === "delivered") return;

        const trackingNumbers = Array.isArray(fulfillment.tracking_numbers)
          ? fulfillment.tracking_numbers.filter(Boolean)
          : [];
        if (!trackingNumbers.length && fulfillment.tracking_number) {
          trackingNumbers.push(fulfillment.tracking_number);
        }

        const trackingInfo = Array.isArray(fulfillment.tracking_info)
          ? fulfillment.tracking_info
          : [];
        const trackingUrl =
          trackingInfo.find((info) => info.url)?.url || fulfillment.tracking_url || "";
        const trackingCompany =
          trackingInfo.find((info) => info.company)?.company ||
          fulfillment.tracking_company ||
          "";

        const shippedAt =
          fulfillment.created_at || fulfillment.updated_at || o.processed_at || o.created_at;

        if (trackingNumbers.length) {
          trackingNumbers.forEach((trackingNumber) => {
            shipments.push({
              order_id: o.id,
              order_name: o.name,
              customer_name,
              tracking_number: trackingNumber,
              tracking_url: trackingUrl,
              tracking_company: trackingCompany,
              fulfillment_id: fulfillment.id,
              shipment_status: shipmentStatus || "shipped",
              shipped_at: shippedAt
            });
          });
        } else {
          shipments.push({
            order_id: o.id,
            order_name: o.name,
            customer_name,
            tracking_number: "",
            tracking_url: trackingUrl,
            tracking_company: trackingCompany,
            fulfillment_id: fulfillment.id,
            shipment_status: shipmentStatus || "shipped",
            shipped_at: shippedAt
          });
        }
      });
    });

    shipments.sort(
      (a, b) => new Date(b.shipped_at || 0).getTime() - new Date(a.shipped_at || 0).getTime()
    );

    return res.json({ shipments });
  } catch (err) {
    console.error("Shopify shipments error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/orders/fulfilled/recent", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 250);
    const url =
      `${base}/orders.json?status=any` +
      `&fulfillment_status=fulfilled` +
      `&limit=${limit}&order=updated_at+desc`;

    const resp = await shopifyFetch(url, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const ordersRaw = Array.isArray(data.orders) ? data.orders : [];
    const orderIds = ordersRaw.filter((order) => !order?.cancelled_at).map((order) => order.id);
    const parcelCountMap = await batchFetchOrderParcelCounts(base, orderIds);

    const orders = ordersRaw
      .filter((order) => !order.cancelled_at)
      .map((order) => {
        const shipping = order.shipping_address || {};
        const customer = order.customer || {};
        const parcelCountFromTag = parseParcelCountFromTags(order.tags);
        const parcelCountFromMeta = parcelCountMap.get(String(order.id)) ?? null;
        const companyName =
          (shipping.company && shipping.company.trim()) ||
          (customer?.default_address?.company && customer.default_address.company.trim());
        const customerName =
          companyName ||
          shipping.name ||
          `${(customer.first_name || "").trim()} ${(customer.last_name || "").trim()}`.trim() ||
          (order.name ? order.name.replace(/^#/, "") : "");

        const lineItems = Array.isArray(order.line_items)
          ? order.line_items.map((lineItem) => ({
              id: lineItem.id,
              title: lineItem.title || "",
              variant_title: lineItem.variant_title || "",
              quantity: Number(lineItem.quantity) || 0,
              fulfilled_quantity: Number(lineItem.fulfilled_quantity) || Number(lineItem.quantity) || 0
            }))
          : [];

        const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
        const normalizedFulfillments = fulfillments.map((fulfillment, index) => {
          const trackingNumbers = Array.isArray(fulfillment?.tracking_numbers)
            ? fulfillment.tracking_numbers.filter(Boolean)
            : [];
          if (!trackingNumbers.length && fulfillment?.tracking_number) {
            trackingNumbers.push(fulfillment.tracking_number);
          }
          const trackingInfo = Array.isArray(fulfillment?.tracking_info)
            ? fulfillment.tracking_info
            : [];
          const trackingUrl =
            trackingInfo.find((info) => info.url)?.url || fulfillment?.tracking_url || "";
          const trackingCompany =
            trackingInfo.find((info) => info.company)?.company ||
            fulfillment?.tracking_company ||
            "";
          const fulfillmentLineItems = Array.isArray(fulfillment?.line_items)
            ? fulfillment.line_items.map((lineItem) => ({
                id: lineItem?.id ?? null,
                line_item_id: lineItem?.line_item_id ?? null,
                quantity: Number(lineItem?.quantity) || 0
              }))
            : [];
          return {
            id: fulfillment?.id ?? null,
            name: fulfillment?.name || `F${index + 1}`,
            status: fulfillment?.status || "",
            shipment_status: fulfillment?.shipment_status || "",
            cancelled_at: fulfillment?.cancelled_at || null,
            created_at: fulfillment?.created_at || null,
            updated_at: fulfillment?.updated_at || null,
            tracking_numbers: trackingNumbers,
            tracking_url: trackingUrl,
            tracking_company: trackingCompany,
            line_items: fulfillmentLineItems
          };
        });
        const latestFulfillment = fulfillments
          .slice()
          .sort(
            (a, b) =>
              new Date(b.created_at || b.updated_at || 0).getTime() -
              new Date(a.created_at || a.updated_at || 0).getTime()
          )[0];

        const trackingNumbers = Array.isArray(latestFulfillment?.tracking_numbers)
          ? latestFulfillment.tracking_numbers.filter(Boolean)
          : [];
        if (!trackingNumbers.length && latestFulfillment?.tracking_number) {
          trackingNumbers.push(latestFulfillment.tracking_number);
        }

        const trackingInfo = Array.isArray(latestFulfillment?.tracking_info)
          ? latestFulfillment.tracking_info
          : [];
        const trackingUrl =
          trackingInfo.find((info) => info.url)?.url || latestFulfillment?.tracking_url || "";
        const trackingCompany =
          trackingInfo.find((info) => info.company)?.company ||
          latestFulfillment?.tracking_company ||
          "";

        const fulfilledAt =
          latestFulfillment?.created_at ||
          latestFulfillment?.updated_at ||
          order.updated_at ||
          order.closed_at ||
          order.processed_at ||
          order.created_at ||
          null;

        return {
          id: order.id,
          name: order.name,
          order_number: order.name ? String(order.name).replace(/^#/, "") : "",
          customer_name: customerName,
          created_at: order.processed_at || order.created_at || null,
          updated_at: order.updated_at || null,
          tags: order.tags || "",
          delivery_date:
            Array.isArray(order.note_attributes)
              ? order.note_attributes.find((attr) => String(attr?.name || "").toLowerCase() === "delivery_date")?.value || null
              : null,
          fulfilled_at: fulfilledAt,
          parcel_count: parcelCountFromMeta ?? parcelCountFromTag,
          parcel_count_from_meta: parcelCountFromMeta,
          parcel_count_from_tag: parcelCountFromTag,
          shipping_address: {
            name: shipping.name || customerName,
            company: shipping.company || companyName || "",
            address1: shipping.address1 || "",
            address2: shipping.address2 || "",
            city: shipping.city || "",
            province: shipping.province || "",
            zip: shipping.zip || "",
            country: shipping.country || "",
            phone: shipping.phone || ""
          },
          shipping_city: shipping.city || "",
          shipping_postal: shipping.zip || "",
          shipping_address1: shipping.address1 || "",
          shipping_address2: shipping.address2 || "",
          shipping_province: shipping.province || "",
          shipping_country: shipping.country || "",
          shipping_phone: shipping.phone || "",
          shipping_lines: (order.shipping_lines || []).map((line) => ({
            title: line.title || "",
            code: line.code || "",
            price: line.price || ""
          })),
          line_items: lineItems,
          fulfillments: normalizedFulfillments,
          fulfillment: latestFulfillment
            ? {
                id: latestFulfillment.id,
                status: latestFulfillment.status || "",
                shipment_status: latestFulfillment.shipment_status || "",
                tracking_numbers: trackingNumbers,
                tracking_url: trackingUrl,
                tracking_company: trackingCompany,
                created_at: latestFulfillment.created_at || null,
                updated_at: latestFulfillment.updated_at || null
              }
            : null
        };
      })
      .sort((a, b) => new Date(b.fulfilled_at || 0).getTime() - new Date(a.fulfilled_at || 0).getTime());

    return res.json({ orders });
  } catch (err) {
    console.error("Shopify recent fulfilled orders error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/fulfillment-events", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { orderId, fulfillmentId } = req.query || {};
    if (!orderId || !fulfillmentId) {
      return res.status(400).json({ error: "MISSING_IDS" });
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const url = `${base}/orders/${orderId}/fulfillments/${fulfillmentId}/events.json`;
    const resp = await shopifyFetch(url, { method: "GET" });

    if (!resp.ok) {
      const body = await resp.text();
      return res.status(resp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: resp.status,
        statusText: resp.statusText,
        body
      });
    }

    const data = await resp.json();
    const events = Array.isArray(data.fulfillment_events) ? data.fulfillment_events : [];
    return res.json({ events });
  } catch (err) {
    console.error("Shopify fulfillment-events error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/fulfill", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { orderId, lineItems, trackingNumber, trackingUrl, trackingCompany, message } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: "MISSING_ORDER_ID", body: req.body });
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const trackingCompanyFinal =
      trackingCompany || process.env.TRACKING_COMPANY || "SWE / ParcelPerfect";

    const foUrl = `${base}/orders/${orderId}/fulfillment_orders.json`;
    const foResp = await shopifyFetch(foUrl, { method: "GET" });

    const foText = await foResp.text();
    let foData;
    try {
      foData = JSON.parse(foText);
    } catch {
      foData = { raw: foText };
    }

    if (!foResp.ok) {
      return res.status(foResp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: foResp.status,
        statusText: foResp.statusText,
        body: foData
      });
    }

    const fulfillmentOrders = Array.isArray(foData.fulfillment_orders)
      ? foData.fulfillment_orders
      : [];

    if (!fulfillmentOrders.length) {
      return res.status(409).json({
        error: "NO_FULFILLMENT_ORDERS",
        message: "No fulfillment_orders found for this order (cannot fulfill)",
        body: foData
      });
    }

    const fo =
      fulfillmentOrders.find((f) => f.status !== "closed" && f.status !== "cancelled") ||
      fulfillmentOrders[0];

    const fulfillment_order_id = fo.id;
    const requestLineItems = Array.isArray(lineItems)
      ? lineItems
          .map((item) => ({
            id: Number(item?.id),
            quantity: Math.floor(Number(item?.quantity || 0))
          }))
          .filter((item) => Number.isFinite(item.id) && item.quantity > 0)
      : [];
    const fulfillmentOrderLineItems = Array.isArray(fo.line_items) ? fo.line_items : [];
    const quantityByLineItemId = new Map(requestLineItems.map((item) => [item.id, item.quantity]));
    const fulfillment_order_line_items = fulfillmentOrderLineItems
      .map((item) => {
        const lineItemId = Number(item?.line_item_id);
        if (!Number.isFinite(lineItemId) || !quantityByLineItemId.has(lineItemId)) return null;
        const remaining = Number(item?.fulfillable_quantity ?? 0);
        const requested = quantityByLineItemId.get(lineItemId) || 0;
        const quantity = Math.max(0, Math.min(requested, Number.isFinite(remaining) ? remaining : requested));
        if (!quantity) return null;
        return { id: item.id, quantity };
      })
      .filter(Boolean);

    if (requestLineItems.length && !fulfillment_order_line_items.length) {
      return res.status(409).json({
        error: "NO_FULFILLABLE_LINE_ITEMS",
        message: "Requested line items are already fulfilled or not available on this fulfillment order."
      });
    }

    const fulfillUrl = `${base}/fulfillments.json`;
    const trackingNote = trackingNumber ? ` Tracking: ${trackingNumber}` : "";
    const fulfillmentMessage = message || `Shipped via Scan Station.${trackingNote}`;
    const fulfillmentLineItemPayload = { fulfillment_order_id };
    if (fulfillment_order_line_items.length) {
      fulfillmentLineItemPayload.fulfillment_order_line_items = fulfillment_order_line_items;
    }
    const fulfillmentPayload = {
      fulfillment: {
        message: fulfillmentMessage,
        notify_customer: true,
        tracking_info: {
          number: trackingNumber || "",
          url: trackingUrl || undefined,
          company: trackingCompanyFinal
        },
        line_items_by_fulfillment_order: [fulfillmentLineItemPayload]
      }
    };

    const upstream = await shopifyFetch(fulfillUrl, {
      method: "POST",
      body: JSON.stringify(fulfillmentPayload)
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: upstream.status,
        statusText: upstream.statusText,
        body: data
      });
    }

    return res.json({ ok: true, fulfillment: data });
  } catch (err) {
    console.error("Shopify fulfill error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/ready-for-pickup", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: "MISSING_ORDER_ID", body: req.body });
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const foUrl = `${base}/orders/${orderId}/fulfillment_orders.json`;
    const foResp = await shopifyFetch(foUrl, { method: "GET" });

    const foText = await foResp.text();
    let foData;
    try {
      foData = JSON.parse(foText);
    } catch {
      foData = { raw: foText };
    }

    if (!foResp.ok) {
      return res.status(foResp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: foResp.status,
        statusText: foResp.statusText,
        body: foData
      });
    }

    const fulfillmentOrders = Array.isArray(foData.fulfillment_orders)
      ? foData.fulfillment_orders
      : [];

    if (!fulfillmentOrders.length) {
      return res.status(409).json({
        error: "NO_FULFILLMENT_ORDERS",
        message: "No fulfillment_orders found for this order (cannot mark ready)",
        body: foData
      });
    }

    const pickupFulfillmentOrder = fulfillmentOrders.find((f) => {
      const methodType = String(f?.delivery_method?.method_type || "").toLowerCase();
      return methodType === "pickup";
    });
    const openFulfillmentOrder =
      fulfillmentOrders.find((f) => f.status !== "closed" && f.status !== "cancelled") ||
      fulfillmentOrders[0];
    const fo = pickupFulfillmentOrder || openFulfillmentOrder;

    const fulfillmentOrderGid = `gid://shopify/FulfillmentOrder/${fo.id}`;
    const gqlUrl = `${base}/graphql.json`;
    const query = `
      mutation MarkReadyForPickup($id: ID!, $notifyCustomer: Boolean!) {
        fulfillmentOrderMarkReadyForPickup(id: $id, notifyCustomer: $notifyCustomer) {
          fulfillmentOrder { id status }
          userErrors { field message }
        }
      }
    `;

    const gqlResp = await shopifyFetch(gqlUrl, {
      method: "POST",
      body: JSON.stringify({
        query,
        variables: { id: fulfillmentOrderGid, notifyCustomer: true }
      })
    });

    const gqlText = await gqlResp.text();
    let gqlData;
    try {
      gqlData = JSON.parse(gqlText);
    } catch {
      gqlData = { raw: gqlText };
    }

    if (!gqlResp.ok) {
      return res.status(gqlResp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: gqlResp.status,
        statusText: gqlResp.statusText,
        body: gqlData
      });
    }

    if (Array.isArray(gqlData?.errors) && gqlData.errors.length) {
      return res.status(409).json({
        error: "READY_FOR_PICKUP_FAILED",
        message: "Shopify returned GraphQL errors for ready-for-pickup.",
        errors: gqlData.errors
      });
    }

    const mutationPayload = gqlData?.data?.fulfillmentOrderMarkReadyForPickup;
    const userErrors = mutationPayload?.userErrors || [];
    if (userErrors.length) {
      return res.status(409).json({
        error: "READY_FOR_PICKUP_FAILED",
        message: "Shopify rejected ready-for-pickup request.",
        userErrors
      });
    }

    if (!mutationPayload?.fulfillmentOrder) {
      return res.status(409).json({
        error: "READY_FOR_PICKUP_FAILED",
        message: "Shopify returned no fulfillment order for ready-for-pickup.",
        response: gqlData
      });
    }

    return res.json({ ok: true, fulfillmentOrder: mutationPayload.fulfillmentOrder });
  } catch (err) {
    console.error("Shopify ready-for-pickup error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/inventory-levels", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const rawIds = String(req.query.variantIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (!rawIds.length) {
      return badRequest(res, "Missing variantIds query parameter.");
    }

    const variantIds = rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!variantIds.length) {
      return badRequest(res, "No valid variantIds provided.");
    }

    const locationId =
      req.query.locationId != null
        ? Number(req.query.locationId)
        : await fetchPrimaryLocationId();

    const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants(variantIds);
    const inventoryItemIds = [...inventoryItemIdsByVariant.values()];
    const levelsByItem = await fetchInventoryLevelsForItems(inventoryItemIds, locationId);

    const levels = variantIds.map((variantId) => {
      const inventoryItemId = inventoryItemIdsByVariant.get(variantId) || null;
      const available =
        inventoryItemId != null ? levelsByItem.get(inventoryItemId) ?? 0 : null;
      return { variantId, inventoryItemId, locationId, available };
    });

    return res.json({ ok: true, locationId, levels });
  } catch (err) {
    console.error("Shopify inventory levels fetch failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/locations", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const resp = await shopifyFetch(`${base}/locations.json`, { method: "GET" });
    if (!resp.ok) {
      const body = await resp.text();
      return res.status(502).json({
        error: "UPSTREAM_ERROR",
        message: `Shopify locations fetch failed (${resp.status}): ${body}`
      });
    }
    const data = await resp.json();
    const locations = Array.isArray(data.locations) ? data.locations : [];
    const normalized = locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      active: loc.active !== false
    }));
    return res.json({ ok: true, locations: normalized });
  } catch (err) {
    console.error("Shopify locations fetch failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/inventory-levels/set", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const { variantId, value, mode = "take", locationId: rawLocationId } = req.body || {};

    const safeVariantId = Number(variantId);
    if (!Number.isFinite(safeVariantId)) {
      return badRequest(res, "Missing variantId in request body.");
    }

    const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants([
      safeVariantId
    ]);
    const inventoryItemId = inventoryItemIdsByVariant.get(safeVariantId);
    if (!inventoryItemId) {
      return res.status(404).json({
        error: "INVENTORY_ITEM_NOT_FOUND",
        message: "Unable to resolve inventory item for variant."
      });
    }

    const locationId = Number.isFinite(Number(rawLocationId))
      ? Number(rawLocationId)
      : await fetchPrimaryLocationId();

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return badRequest(res, "Missing inventory value.");
    }

    let inventoryLevel;
    if (String(mode).toLowerCase() === "receive") {
      inventoryLevel = await adjustInventoryLevel({
        inventoryItemId,
        locationId,
        adjustment: Math.floor(numericValue)
      });
    } else {
      inventoryLevel = await setInventoryLevel({
        inventoryItemId,
        locationId,
        available: Math.floor(numericValue)
      });
    }

    const available = Number(inventoryLevel?.available ?? numericValue);
    return res.json({
      ok: true,
      level: {
        variantId: safeVariantId,
        inventoryItemId,
        locationId,
        available: Number.isFinite(available) ? available : 0
      }
    });
  } catch (err) {
    console.error("Shopify inventory level update failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/inventory-levels/transfer", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const {
      variantId,
      fromLocationId,
      toLocationId,
      quantity
    } = req.body || {};

    const safeVariantId = Number(variantId);
    if (!Number.isFinite(safeVariantId)) {
      return badRequest(res, "Missing variantId in request body.");
    }

    const fromId = Number(fromLocationId);
    const toId = Number(toLocationId);
    if (!Number.isFinite(fromId) || !Number.isFinite(toId)) {
      return badRequest(res, "Missing from/to location IDs.");
    }
    if (fromId === toId) {
      return badRequest(res, "Source and destination locations must differ.");
    }

    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      return badRequest(res, "Missing transfer quantity.");
    }

    const inventoryItemIdsByVariant = await fetchInventoryItemIdsForVariants([
      safeVariantId
    ]);
    const inventoryItemId = inventoryItemIdsByVariant.get(safeVariantId);
    if (!inventoryItemId) {
      return res.status(404).json({
        error: "INVENTORY_ITEM_NOT_FOUND",
        message: "Unable to resolve inventory item for variant."
      });
    }

    const fromLevel = await adjustInventoryLevel({
      inventoryItemId,
      locationId: fromId,
      adjustment: -qty
    });
    const toLevel = await adjustInventoryLevel({
      inventoryItemId,
      locationId: toId,
      adjustment: qty
    });

    return res.json({
      ok: true,
      from: {
        locationId: fromId,
        available: Number(fromLevel?.available ?? 0)
      },
      to: {
        locationId: toId,
        available: Number(toLevel?.available ?? 0)
      }
    });
  } catch (err) {
    console.error("Shopify inventory transfer failed:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/notify-collection", async (req, res) => {
  try {
    if (!requireCustomerEmailConfigured(res)) return;
    if (!requireShopifyConfigured(res)) return;
    const { orderNo, orderId, email, customerName, parcelCount = 0, weightKg = 0 } = req.body || {};

    if (!orderId) {
      return badRequest(res, "Missing orderId");
    }

    const { normalizedOrderNo, pin, barcodeValue } = buildCollectionCredentials(orderNo);
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;

    const orderResp = await shopifyFetch(`${base}/orders/${orderId}.json?fields=id,email,customer,tags,name`, { method: "GET" });
    const orderData = await orderResp.json().catch(() => ({}));
    if (!orderResp.ok || !orderData?.order?.id) {
      return res.status(orderResp.status || 502).json({
        error: "ORDER_LOOKUP_FAILED",
        message: "Unable to load order for notification.",
        body: orderData
      });
    }

    const orderRecord = orderData.order;
    const customerEmail = String(email || orderRecord.email || orderRecord.customer?.email || "").trim();
    const safeOrderNo = orderNo ? `#${String(orderNo).replace("#", "")}` : "your order";
    const safeName = customerName || "there";
    const weightLabel = Number(weightKg || 0).toFixed(2);
    const parcelsLabel = Number(parcelCount || 0);
    const barcodeImageUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(
      barcodeValue
    )}&code=Code128&dpi=120`;

    const transport = getSmtpTransport();
    const result = await sendNotificationEmail({
      transport,
      eventKey: NOTIFICATION_EVENT_KEYS.PICKUP_READY,
      fallbackFrom: config.SMTP_FROM,
      context: {
        shop: {
          name: "Flippen Lekka Spices"
        },
        customer: {
          name: safeName,
          email: customerEmail
        },
        order: {
          id: orderRecord.id,
          name: safeOrderNo,
          email: customerEmail,
          customer: orderRecord.customer || null
        },
        pickup: {
          barcode_value: barcodeValue,
          barcode_image_url: barcodeImageUrl,
          pin
        },
        metrics: {
          parcel_count: parcelsLabel,
          weight_kg: weightLabel
        }
      }
    });

    const usedFallbackRecipient = !customerEmail || !result.to.some((entry) => entry.toLowerCase() === customerEmail.toLowerCase());

    await appendOrderTag(base, orderId, "pickup_notified");
    await appendOrderTag(base, orderId, "stat:notified");

    return res.json({
      ok: true,
      barcodeValue,
      pin,
      orderNo: normalizedOrderNo,
      sentTo: result.to,
      subject: result.subject,
      templateId: result.template?.id || null,
      usedFallbackRecipient,
      fallbackNotifiedAdmin: usedFallbackRecipient
    });
  } catch (err) {
    if (err?.code === "EMAIL_NOT_CONFIGURED") {
      return res.status(501).json({
        error: "EMAIL_NOT_CONFIGURED",
        message: "Configure a sender in settings or set SMTP_FROM in .env before notifying collection."
      });
    }
    if (err?.code === "NO_NOTIFICATION_RECIPIENTS") {
      return res.status(400).json({
        error: "NOTIFICATION_RECIPIENTS_MISSING",
        message: err.message
      });
    }
    console.error("Notify collection error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/orders/tag", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;
    const { orderId, tag } = req.body || {};
    if (!orderId) return badRequest(res, "Missing orderId");
    const tagToApply = String(tag || "").trim();
    if (!tagToApply) return badRequest(res, "Missing tag");

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const result = await appendOrderTag(base, orderId, tagToApply);
    if (!result.ok) {
      return res.status(result.status || 502).json({
        error: "TAG_APPLY_FAILED",
        statusText: result.statusText,
        body: result.body
      });
    }
    return res.json({ ok: true, tag: tagToApply, tags: result.tags || [] });
  } catch (err) {
    console.error("Order tag error:", err);
    return res.status(502).json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/orders/delivery-qr-payload", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res) || !requireDeliveryCodeSecretConfigured(res)) return;
    const { orderId, orderNo, confirmUrl } = req.body || {};
    if (!orderId) return badRequest(res, "Missing orderId");

    const { normalizedOrderNo, code, token, iat, tokenId } = buildDeliveryCredentials(orderNo);
    const fallbackOrigin = String(config.FRONTEND_ORIGIN || "").split(",").map((part) => part.trim()).find(Boolean);
    const resolvedConfirmBase = String(confirmUrl || fallbackOrigin || "").trim();
    if (!resolvedConfirmBase) {
      return badRequest(res, "Missing confirmUrl and FRONTEND_ORIGIN is not configured");
    }

    let confirmTarget;
    try {
      const baseUrl = new URL(resolvedConfirmBase);
      const basePath = String(baseUrl.pathname || "").replace(/\/+$/g, "");
      const normalizedBasePath = basePath && basePath !== "/" ? basePath : "";
      baseUrl.pathname = `${normalizedBasePath}/deliver`;
      baseUrl.search = "";
      baseUrl.hash = "";
      confirmTarget = `${baseUrl.toString()}?code=${encodeURIComponent(code)}`;
    } catch {
      return badRequest(res, "Invalid confirmUrl");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const orderResp = await shopifyFetch(`${base}/orders/${orderId}.json?fields=id,note_attributes`, {
      method: "GET"
    });
    const orderData = await orderResp.json().catch(() => ({}));
    if (!orderResp.ok || !orderData?.order?.id) {
      return res.status(orderResp.status || 502).json({
        error: "ORDER_LOOKUP_FAILED",
        message: "Unable to load order for delivery QR payload update.",
        body: orderData
      });
    }

    const attrMap = orderNoteAttributeMap(orderData.order);
    attrMap.set("Delivery QR Payload", code);
    attrMap.set("Delivery QR Token", token);
    attrMap.set("Delivery QR Issued At", new Date(iat * 1000).toISOString());
    attrMap.set("Delivery Token ID", tokenId);
    attrMap.set("Delivery Token Used", "false");
    attrMap.delete("Delivery Confirmed At");
    attrMap.delete("Delivery QR PIN");
    attrMap.set("Delivery Confirm URL", confirmTarget);

    const noteAttributes = serializeOrderNoteAttributes(attrMap);
    const updateResp = await shopifyFetch(`${base}/orders/${orderId}.json`, {
      method: "PUT",
      body: JSON.stringify({ order: { id: orderId, note_attributes: noteAttributes } })
    });
    const updateBody = await updateResp.text();
    if (!updateResp.ok) {
      return res.status(updateResp.status || 502).json({
        error: "ORDER_UPDATE_FAILED",
        statusText: updateResp.statusText,
        body: updateBody
      });
    }

    return res.json({ ok: true, orderNo: normalizedOrderNo, code, confirmUrl: confirmTarget, noteAttributes });
  } catch (err) {
    console.error("Delivery QR payload update error:", err);
    return res.status(502).json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/collection/fulfill-from-code", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { code, orderNo, pin } = req.body || {};
    const parsed = parseCollectionCode(code) || parseCollectionCode(`${orderNo || ""}${pin || ""}`);
    if (!parsed) return badRequest(res, "Invalid collection barcode or PIN payload.");

    const expected = buildCollectionCredentials(parsed.orderNo);
    if (parsed.pin !== expected.pin) {
      return res.status(401).json({ error: "INVALID_PIN", message: "Collection PIN mismatch." });
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const orderLookup = await shopifyFetch(
      `${base}/orders.json?status=open&name=${encodeURIComponent(`#${parsed.orderNo}`)}&limit=1&fields=id,name`,
      { method: "GET" }
    );
    const lookupData = await orderLookup.json().catch(() => ({}));
    const order = Array.isArray(lookupData.orders) ? lookupData.orders[0] : null;
    if (!order?.id) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND", message: "No open order found for collection code." });
    }

    const fulfillResult = await fulfillOrderByOrderId(base, order.id, "Collected at dispatch station.");
    if (!fulfillResult.ok) {
      return res.status(fulfillResult.status || 502).json({
        error: "FULFILL_FAILED",
        statusText: fulfillResult.statusText,
        body: fulfillResult.body
      });
    }

    await appendOrderTag(base, order.id, "stat:pickedup");
    return res.json({ ok: true, orderId: order.id, orderNo: parsed.orderNo, fulfillment: fulfillResult.fulfillment });
  } catch (err) {
    console.error("Collection fulfill-from-code error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/delivery/complete-from-code", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res) || !requireDeliveryCodeSecretConfigured(res)) return;

    const { code, orderNo, pin } = req.body || {};
    if (!code) {
      if (orderNo || pin) {
        return res.status(400).json({
          error: "LEGACY_CODE_NOT_SUPPORTED",
          message: "Legacy delivery PIN submission is no longer supported. Provide signed delivery code."
        });
      }
      return badRequest(res, "Missing delivery code.");
    }

    const parsed = parseDeliveryCode(code);
    if (!parsed || parsed.error) {
      const error = parsed?.error || "INVALID_DELIVERY_CODE";
      const message = parsed?.message || "Invalid delivery QR payload.";
      const status = error === "CODE_EXPIRED" ? 410 : error === "INVALID_SIGNATURE" ? 401 : 400;
      return res.status(status).json({ error, message });
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const orderLookup = await shopifyFetch(
      `${base}/orders.json?name=${encodeURIComponent(`#${parsed.orderNo}`)}&limit=1&fields=id,name,financial_status,fulfillment_status,closed_at,note_attributes`,
      { method: "GET" }
    );
    const lookupData = await orderLookup.json().catch(() => ({}));
    const order = Array.isArray(lookupData.orders) ? lookupData.orders[0] : null;
    if (!order?.id) {
      return res.status(404).json({ error: "ORDER_NOT_FOUND", message: "No order found for delivery code." });
    }

    const attrMap = orderNoteAttributeMap(order);
    const expectedTokenId = String(attrMap.get("Delivery Token ID") || "").trim();
    const tokenUsed = String(attrMap.get("Delivery Token Used") || "").trim().toLowerCase() === "true";
    const confirmedAt = String(attrMap.get("Delivery Confirmed At") || "").trim();

    if (!expectedTokenId || expectedTokenId !== parsed.tokenId) {
      return res.status(409).json({
        ok: false,
        error: "DELIVERY_TOKEN_MISMATCH",
        message: "Delivery code is not valid for the latest confirmation token."
      });
    }

    if (tokenUsed || confirmedAt) {
      return res.json({
        ok: true,
        alreadyConfirmed: true,
        orderId: order.id,
        orderNo: parsed.orderNo,
        message: "Delivery already confirmed.",
        confirmedAt: confirmedAt || null
      });
    }

    const fulfillResult = await fulfillOrderByOrderId(base, order.id, "Delivered to customer (QR scan confirmation).");
    if (!fulfillResult.ok) {
      return res.status(fulfillResult.status || 502).json({
        error: "FULFILL_FAILED",
        statusText: fulfillResult.statusText,
        body: fulfillResult.body
      });
    }

    const consumedAt = new Date().toISOString();
    attrMap.set("Delivery Token Used", "true");
    attrMap.set("Delivery Confirmed At", consumedAt);
    const noteAttributes = serializeOrderNoteAttributes(attrMap);
    const orderUpdateResp = await shopifyFetch(`${base}/orders/${order.id}.json`, {
      method: "PUT",
      body: JSON.stringify({ order: { id: order.id, note_attributes: noteAttributes } })
    });
    const orderUpdateBody = await orderUpdateResp.text();
    if (!orderUpdateResp.ok) {
      return res.status(orderUpdateResp.status || 502).json({
        error: "ORDER_UPDATE_FAILED",
        statusText: orderUpdateResp.statusText,
        body: orderUpdateBody
      });
    }

    await appendOrderTag(base, order.id, "stat:delivered");
    return res.json({
      ok: true,
      alreadyConfirmed: false,
      orderId: order.id,
      orderNo: parsed.orderNo,
      message: "Delivery confirmed.",
      confirmedAt: consumedAt,
      fulfillment: fulfillResult.fulfillment
    });
  } catch (err) {
    console.error("Delivery complete-from-code error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

export default router;
