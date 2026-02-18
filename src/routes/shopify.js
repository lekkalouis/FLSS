import { Router } from "express";

import { config } from "../config.js";
import { getSmtpTransport } from "../services/email.js";
import {
  adjustInventoryLevel,
  fetchInventoryItemIdsForVariants,
  fetchInventoryLevelsForItems,
  fetchPrimaryLocationId,
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
  resolveDraftLinePricing,
  resolvePricingForLines,
  resolveCustomerTier
} from "../services/pricingResolver.js";

const router = Router();

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
const CUSTOMER_META_NAMESPACE = "custom";
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

  return {
    delivery_method: getValue("delivery_method"),
    delivery_type: getValue("delivery_type"),
    tier: normalizeCustomerTier(getValue("tier")),
    delivery_instructions: getValue("delivery_instructions"),
    company_name: getValue("company_name"),
    vat_number: getValue("vat_number"),
    payment_terms: getValue("payment_terms")
  };
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
  const allowed = ["shipping", "pickup", "delivery", "local"];
  if (!allowed.includes(normalized)) return;

  const current = currentMetafields || (await fetchCustomerCustomMetafields(base, customerId));
  const existingDeliveryType = String(current?.delivery_type || "").trim();
  const existingDeliveryMethod = String(current?.delivery_method || "").trim();
  if (existingDeliveryType || existingDeliveryMethod) return;

  await shopifyFetch(`${base}/customers/${customerId}/metafields.json`, {
    method: "POST",
    body: JSON.stringify({
      metafield: {
        namespace: CUSTOMER_META_NAMESPACE,
        key: "delivery_type",
        type: "single_line_text_field",
        value: normalized
      }
    })
  });
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

function buildOrderTags({ shippingMethod, customerTags }) {
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
  return Array.from(new Set(orderTags));
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
    vatNumber: metafields.vat_number || null,
    paymentTerms: metafields.payment_terms || null,
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
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const url = pageInfo
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
      deliveryInstructions,
      deliveryMethod,
      address
    } =
      req.body || {};

    if (!firstName && !lastName && !email && !phone) {
      return badRequest(res, "Provide at least a name, email, or phone number");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
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
    if (accountEmail) {
      metafields.push({
        namespace: "custom",
        key: "account_email",
        type: "single_line_text_field",
        value: String(accountEmail)
      });
    }
    if (accountContact) {
      metafields.push({
        namespace: "custom",
        key: "account_contact",
        type: "single_line_text_field",
        value: String(accountContact)
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
        vat_number: vatNumber || null,
        payment_terms: paymentTerms || null,
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
      poNumber,
      shippingMethod,
      deliveryDate,
      customerTags
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const customerMetafields = await fetchCustomerCustomMetafields(base, customerId);
    const tierResolution = resolveCustomerTier({
      customerTier: customerMetafields?.tier || priceTier,
      customerTags: normalizeTagList(customerTags),
      defaultTier: "public"
    });
    const tier = tierResolution.tier;

    await ensureCustomerDeliveryType(base, customerId, shippingMethod, customerMetafields);

    const resolvedPricing = resolveDraftLinePricing({
      cartItems: lineItems,
      state: { priceTier: tier }
    });
    const pricingHash = buildPricingHash({
      tier,
      currency: "ZAR",
      signatures: resolvedPricing.lineItems.map((line) => ({
        variant_id: line.variant_id,
        quantity: line.quantity,
        resolved_unit_price: Number(line.price || 0),
        source: line.applied_discount ? "discount_fallback" : "fixed_tier"
      }))
    });

    const orderTags = buildOrderTags({
      shippingMethod,
      customerTags
    });

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
    if (customerMetafields?.payment_terms) {
      draftMetafields.push({
        namespace: "custom",
        key: "payment_terms",
        type: "single_line_text_field",
        value: String(customerMetafields.payment_terms)
      });
    }

    const payload = {
      draft_order: {
        customer: customerId ? { id: customerId } : undefined,
        line_items: resolvedPricing.lineItems,
        tags: orderTags.join(", "),
        note: poNumber ? `PO: ${poNumber}` : undefined,
        note_attributes: [
          ...(poNumber ? [{ name: "po_number", value: String(poNumber) }] : []),
          { name: "flss_pricing_hash", value: pricingHash }
        ],
        metafields: draftMetafields.length ? draftMetafields : undefined
      }
    };

    const resp = await shopifyFetch(`${base}/draft_orders.json`, {
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

    const d = data.draft_order || {};
    const adminUrl = d.id
      ? `https://${config.SHOPIFY_STORE}.myshopify.com/admin/draft_orders/${d.id}`
      : null;

    return res.json({
      ok: true,
      draftOrder: {
        id: d.id,
        name: d.name,
        invoiceUrl: d.invoice_url || null,
        adminUrl
      },
      pricing: {
        tier,
        fallbackUsed: resolvedPricing.fallbackUsed,
        hash: pricingHash,
        tierConflict: tierResolution.conflict
      }
    });
  } catch (err) {
    console.error("Shopify draft order create error:", err);
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
    const resp = await shopifyFetch(`${base}/draft_orders/${draftOrderId}/complete.json`, {
      method: "POST",
      body: JSON.stringify({ draft_order: { id: draftOrderId } })
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
      billingAddress,
      shippingAddress,
      lineItems,
      customerTags
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const customerMetafields = await fetchCustomerCustomMetafields(base, customerId);
    await ensureCustomerDeliveryType(base, customerId, shippingMethod, customerMetafields);

    const noteParts = [];
    if (poNumber) noteParts.push(`PO: ${poNumber}`);

    const metafields = [];
    if (deliveryDate) {
      metafields.push({
        namespace: "custom",
        key: "delivery_date",
        type: "single_line_text_field",
        value: String(deliveryDate)
      });
    }
    if (shippingMethod) {
      metafields.push({
        namespace: "custom",
        key: "delivery_type",
        type: "single_line_text_field",
        value: String(shippingMethod)
      });
    }
    if (vatNumber) {
      metafields.push({
        namespace: "custom",
        key: "vat_number",
        type: "single_line_text_field",
        value: String(vatNumber)
      });
    }
    if (companyName) {
      metafields.push({
        namespace: "custom",
        key: "company_name",
        type: "single_line_text_field",
        value: String(companyName)
      });
    }
    const resolvedPaymentTerms = paymentTerms || customerMetafields?.payment_terms || null;
    if (resolvedPaymentTerms) {
      metafields.push({
        namespace: "custom",
        key: "payment_terms",
        type: "single_line_text_field",
        value: String(resolvedPaymentTerms)
      });
    }
    const shippingAmount = Number(shippingBaseTotal ?? shippingPrice);
    if (Number.isFinite(shippingAmount)) {
      metafields.push({
        namespace: "custom",
        key: "shipping_amount",
        type: "number_decimal",
        value: String(shippingAmount)
      });
    }
    const estimatedParcelsValue = Number(estimatedParcels);
    if (Number.isFinite(estimatedParcelsValue)) {
      metafields.push({
        namespace: "custom",
        key: "estimated_parcels",
        type: "number_integer",
        value: String(Math.round(estimatedParcelsValue))
      });
    }

    const orderPayload = {
      order: {
        customer: { id: customerId },
        note: noteParts.join(" | "),
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
        billing_address: billingAddress || undefined,
        shipping_address: shippingAddress || undefined,
        note_attributes: [
          ...(poNumber ? [{ name: "po_number", value: String(poNumber) }] : []),
          ...(shippingQuoteNo
            ? [{ name: "shipping_quote_no", value: String(shippingQuoteNo) }]
            : [])
        ],
        metafields: metafields.length ? metafields : undefined,
        financial_status: "pending"
      }
    };

    const orderTags = buildOrderTags({
      shippingMethod,
      customerTags
    });
    if (orderTags.length) {
      orderPayload.order.tags = orderTags.join(", ");
    }

    if (shippingPrice != null && shippingMethod === "shipping") {
      orderPayload.order.shipping_lines = [
        {
          title: shippingService || "Courier",
          price: String(shippingPrice)
        }
      ];
    }

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

    const order = data.order || {};
    return res.json({
      ok: true,
      order: {
        id: order.id,
        name: order.name,
        orderNumber: order.order_number
      }
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
    const limit = 100;
    const maxPages = Math.min(Math.max(Number(req.query.max_pages || 5), 1), 10);

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
    const orderIds = filteredOrders.map((o) => o.id);
    const parcelCountMap = await batchFetchOrderParcelCounts(base, orderIds);

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

        const parcelCountFromMeta = parcelCountMap.get(o.id) ?? null;

        return {
          id: o.id,
          name: o.name,
          customer_name,
          email: o.email || customer.email || "",
          created_at: o.processed_at || o.created_at,
          fulfillment_status: o.fulfillment_status,
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
          parcel_count_from_tag: parcelCountFromTag,
          line_items: (o.line_items || []).map((li) => ({
            title: li.title,
            variant_title: li.variant_title,
            quantity: li.quantity
          }))
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
    const orderResp = await shopifyFetch(`${base}/orders/${orderId}.json?fields=id,tags`, {
      method: "GET"
    });
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
    const existingTags = String(orderData?.order?.tags || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (!existingTags.includes(tagToApply)) {
      existingTags.push(tagToApply);
    }

    const tagString = existingTags.join(", ");
    const updateResp = await shopifyFetch(`${base}/orders/${orderId}.json`, {
      method: "PUT",
      body: JSON.stringify({ order: { id: orderId, tags: tagString } })
    });

    if (!updateResp.ok) {
      const body = await updateResp.text();
      return res.status(updateResp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: updateResp.status,
        statusText: updateResp.statusText,
        body
      });
    }

    return res.json({ ok: true, tag: tagToApply, tags: tagString });
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

    const { orderId, trackingNumber, trackingUrl, trackingCompany, message } = req.body || {};
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

    const fulfillUrl = `${base}/fulfillments.json`;
    const trackingNote = trackingNumber ? ` Tracking: ${trackingNumber}` : "";
    const fulfillmentMessage = message || `Shipped via Scan Station.${trackingNote}`;
    const fulfillmentPayload = {
      fulfillment: {
        message: fulfillmentMessage,
        notify_customer: true,
        tracking_info: {
          number: trackingNumber || "",
          url: trackingUrl || undefined,
          company: trackingCompanyFinal
        },
        line_items_by_fulfillment_order: [{ fulfillment_order_id }]
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
    const { orderNo, email, customerName, parcelCount = 0, weightKg = 0 } = req.body || {};

    if (!email) {
      return badRequest(res, "Missing customer email address");
    }

    const safeOrderNo = orderNo ? `#${String(orderNo).replace("#", "")}` : "your order";
    const safeName = customerName || "there";
    const weightLabel = Number(weightKg || 0).toFixed(2);
    const parcelsLabel = Number(parcelCount || 0);
    const subject = `Order ${safeOrderNo} ready for collection`;
    const text = `Hi ${safeName},

Your order ${safeOrderNo} is ready for collection by your courier.

Order weight: ${weightLabel} kg
Parcels packed: ${parcelsLabel}

Thank you.`;

    const transport = getSmtpTransport();
    await transport.sendMail({
      from: config.SMTP_FROM,
      to: email,
      subject,
      text
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Notify collection error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

export default router;
