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

function resolveTierPrice(tiers, tier) {
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

async function fetchOrderParcelMetafield(base, orderId) {
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

async function fetchOrderParcelCount(base, orderId) {
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

function normalizeCustomer(customer, metafields = {}) {
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
    deliveryInstructions: metafields.delivery_instructions || null,
    companyName: metafields.company_name || null,
    vatNumber: metafields.vat_number || null
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

    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const url =
      `${base}/customers/search.json?limit=${limit}` +
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

    const metafieldsByCustomer = await Promise.all(
      customers.map(async (cust) => {
        try {
          const metaUrl = `${base}/customers/${cust.id}/metafields.json`;
          const metaResp = await shopifyFetch(metaUrl, { method: "GET" });
          if (!metaResp.ok) return null;
          const metaData = await metaResp.json();
          const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];
          const getValue = (key) =>
            metafields.find((mf) => mf.namespace === "custom" && mf.key === key)?.value || null;
          return {
            delivery_method: getValue("delivery_method"),
            delivery_instructions: getValue("delivery_instructions"),
            company_name: getValue("company_name"),
            vat_number: getValue("vat_number")
          };
        } catch {
          return null;
        }
      })
    );

    const normalized = customers
      .map((cust, idx) => normalizeCustomer(cust, metafieldsByCustomer[idx] || {}))
      .filter(Boolean);

    return res.json({ customers: normalized });
  } catch (err) {
    console.error("Shopify customer search error:", err);
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
      vatNumber,
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
    if (vatNumber) {
      metafields.push({
        namespace: "custom",
        key: "vat_number",
        type: "single_line_text_field",
        value: vatNumber
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

    const customer = normalizeCustomer(data.customer, {
      delivery_method: deliveryMethod || null,
      delivery_instructions: deliveryInstructions || null,
      company_name: company || null,
      vat_number: vatNumber || null
    });
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
      const tiersMap = new Map();
      await Promise.all(
        filtered.map(async (item) => {
          const tierData = await fetchVariantPriceTiers(item.variantId);
          if (tierData?.value) {
            tiersMap.set(String(item.variantId), tierData.value);
          }
        })
      );
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
      const tiersMap = new Map();
      await Promise.all(
        normalized.map(async (item) => {
          const tierData = await fetchVariantPriceTiers(item.variantId);
          if (tierData?.value) {
            tiersMap.set(String(item.variantId), tierData.value);
          }
        })
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

    const tiersByVariantId = {};
    await Promise.all(
      uniqueIds.map(async (variantId) => {
        const tierData = await fetchVariantPriceTiers(variantId);
        if (tierData?.value && typeof tierData.value === "object") {
          tiersByVariantId[String(variantId)] = tierData.value;
        }
      })
    );

    return res.json({ priceTiersByVariantId: tiersByVariantId });
  } catch (err) {
    console.error("Shopify price tier fetch error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

router.post("/shopify/draft-orders", async (req, res) => {
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
      billingAddress,
      shippingAddress,
      lineItems,
      customerTags,
      priceTier
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const noteParts = [];
    if (poNumber) noteParts.push(`PO: ${poNumber}`);
    if (shippingMethod) noteParts.push(`Delivery: ${shippingMethod}`);
    if (shippingQuoteNo) noteParts.push(`Quote: ${shippingQuoteNo}`);

    const normalizedTier = priceTier ? String(priceTier).toLowerCase() : null;
    const tierCache = new Map();
    const lineItemsWithPrice = await Promise.all(
      lineItems.map(async (li) => {
        if (!normalizedTier || li.price != null || !li.variantId) {
          return li;
        }
        const variantId = String(li.variantId);
        if (!tierCache.has(variantId)) {
          const tierData = await fetchVariantPriceTiers(variantId);
          tierCache.set(variantId, tierData?.value || null);
        }
        const tiers = tierCache.get(variantId);
        const resolved = resolveTierPrice(tiers, normalizedTier);
        if (resolved == null) return li;
        return { ...li, price: resolved };
      })
    );

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

    const payload = {
      draft_order: {
        customer: { id: customerId },
        note: noteParts.join(" | "),
        line_items: lineItemsWithPrice.map((li) => {
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
          ...(normalizedTier
            ? [{ name: "price_tier", value: normalizedTier }]
            : []),
          ...(shippingQuoteNo
            ? [{ name: "shipping_quote_no", value: String(shippingQuoteNo) }]
            : [])
        ],
        metafields: metafields.length ? metafields : undefined
      }
    };

    const tags = [];
    if (config.SHOPIFY_FLOW_TAG) {
      tags.push(config.SHOPIFY_FLOW_TAG);
    }
    if (shippingMethod && shippingMethod !== "shipping") {
      tags.push(`delivery_${shippingMethod}`);
    }
    if (shippingMethod === "local") {
      tags.push("local");
    }
    const normalizedCustomerTags = normalizeTagList(customerTags).map((tag) =>
      tag.toLowerCase()
    );
    if (normalizedCustomerTags.includes("local")) {
      tags.push("local");
    }
    if (normalizedCustomerTags.includes("export")) {
      tags.push("export");
    }
    if (tags.length) {
      payload.draft_order.tags = Array.from(new Set(tags)).join(", ");
    }

    if (shippingPrice != null && shippingMethod === "shipping") {
      payload.draft_order.shipping_line = {
        title: shippingService || "Courier",
        price: String(shippingPrice)
      };
    }

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
      }
    });
  } catch (err) {
    console.error("Shopify draft order create error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
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
    const noteParts = [];
    if (poNumber) noteParts.push(`PO: ${poNumber}`);
    if (shippingMethod) noteParts.push(`Delivery: ${shippingMethod}`);
    if (shippingQuoteNo) noteParts.push(`Quote: ${shippingQuoteNo}`);

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

    const orderTags = [];
    if (shippingMethod && shippingMethod !== "shipping") {
      orderTags.push(`delivery_${shippingMethod}`);
    }
    if (shippingMethod === "local") {
      orderTags.push("local");
    }
    const normalizedCustomerTags = normalizeTagList(customerTags).map((tag) =>
      tag.toLowerCase()
    );
    if (normalizedCustomerTags.includes("local")) {
      orderTags.push("local");
    }
    if (normalizedCustomerTags.includes("export")) {
      orderTags.push("export");
    }
    if (orderTags.length) {
      orderPayload.order.tags = Array.from(new Set(orderTags)).join(", ");
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
      return res.json({ ok: true, parcelCount: null });
    }

    const parsed = Number(parcelCount);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return badRequest(res, "parcelCount must be a non-negative integer");
    }

    const existing = await fetchOrderParcelMetafield(base, orderId);
    if (existing?.id) {
      const updateResp = await shopifyFetch(`${base}/metafields/${existing.id}.json`, {
        method: "PUT",
        body: JSON.stringify({
          metafield: {
            id: existing.id,
            type: "number_integer",
            value: String(parsed)
          }
        })
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
      return res.json({ ok: true, parcelCount: parsed });
    }

    const createResp = await shopifyFetch(`${base}/orders/${orderId}/metafields.json`, {
      method: "POST",
      body: JSON.stringify({
        metafield: {
          namespace: ORDER_PARCEL_NAMESPACE,
          key: ORDER_PARCEL_KEY,
          type: "number_integer",
          value: String(parsed)
        }
      })
    });
    if (!createResp.ok) {
      const body = await createResp.text();
      return res.status(createResp.status).json({
        error: "SHOPIFY_UPSTREAM",
        status: createResp.status,
        statusText: createResp.statusText,
        body
      });
    }

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
    const parcelCounts = await Promise.all(
      filteredOrders.map((o) => fetchOrderParcelCount(base, o.id))
    );
    const parcelCountMap = new Map(
      filteredOrders.map((o, idx) => [o.id, parcelCounts[idx]])
    );

    const orders = filteredOrders.map((o) => {
        const shipping = o.shipping_address || {};
        const customer = o.customer || {};

        let parcelCountFromTag = null;
        if (typeof o.tags === "string" && o.tags.trim()) {
          const parts = o.tags.split(",").map((t) => t.trim().toLowerCase());
          for (const t of parts) {
            const m = t.match(/^parcel_count_(\d+)$/);
            if (m) {
              parcelCountFromTag = parseInt(m[1], 10);
              break;
            }
          }
        }

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
