import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";

import { config } from "../../config.js";
import { fetchVariantPriceTiers, shopifyFetch } from "../../services/shopify.js";
import { badRequest } from "../../utils/http.js";
import {
  fetchOrderParcelCount,
  fetchOrderParcelMetafield,
  normalizeTagList,
  requireShopifyConfigured,
  resolveTierPrice
} from "./shared.js";

const router = Router();

const COMMISSION_TAG = "flsl";
const COMMISSION_RATE = 0.17;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMMISSION_PAID_FILE = path.resolve(__dirname, "../../../data/commission-paid-months.json");

function normalizeMonthKey(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function hasTag(tags, expectedTag) {
  const target = String(expectedTag || "").trim().toLowerCase();
  if (!target) return false;
  return normalizeTagList(tags).some((tag) => String(tag).trim().toLowerCase() === target);
}

function parseMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveNetAmountBeforeShippingAndTax(order) {
  const subtotal = parseMoney(order?.current_subtotal_price ?? order?.subtotal_price);
  if (subtotal != null) return subtotal;

  const total = parseMoney(order?.current_total_price ?? order?.total_price) ?? 0;
  const shipping =
    parseMoney(order?.total_shipping_price_set?.shop_money?.amount) ??
    parseMoney(order?.current_total_shipping_price_set?.shop_money?.amount) ??
    (Array.isArray(order?.shipping_lines)
      ? order.shipping_lines.reduce((sum, line) => sum + (parseMoney(line?.price) ?? 0), 0)
      : 0);
  const tax = parseMoney(order?.current_total_tax ?? order?.total_tax) ?? 0;
  return Math.max(total - shipping - tax, 0);
}

async function readCommissionPaidMonths() {
  try {
    const raw = await fs.readFile(COMMISSION_PAID_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

async function writeCommissionPaidMonths(payload) {
  await fs.mkdir(path.dirname(COMMISSION_PAID_FILE), { recursive: true });
  await fs.writeFile(COMMISSION_PAID_FILE, JSON.stringify(payload, null, 2), "utf8");
}

async function fetchCustomerTags(base, customerId, cache) {
  const key = String(customerId || "").trim();
  if (!key) return [];
  if (cache.has(key)) return cache.get(key);

  const resp = await shopifyFetch(`${base}/customers/${key}.json?fields=id,tags`, {
    method: "GET"
  });
  if (!resp.ok) {
    cache.set(key, []);
    return [];
  }
  const data = await resp.json();
  const tags = normalizeTagList(data?.customer?.tags);
  cache.set(key, tags);
  return tags;
}

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

router.get("/shopify/commissions/flsl", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const limit = 250;
    const maxPages = Math.min(Math.max(Number(req.query.max_pages || 12), 1), 24);
    const firstPath =
      `${base}/orders.json?status=any` +
      `&limit=${limit}` +
      `&order=processed_at+desc` +
      `&fields=id,name,email,cancelled_at,created_at,processed_at,tags,subtotal_price,current_subtotal_price,total_price,current_total_price,total_tax,current_total_tax,shipping_lines,total_shipping_price_set,current_total_shipping_price_set,currency,customer`;

    const getNextPath = (linkHeader) => {
      if (!linkHeader) return null;
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (!match) return null;
      try {
        const url = new URL(match[1]);
        return `${url.pathname}${url.search}`;
      } catch (_err) {
        return match[1].replace(/^https?:\/\/[^/]+/, "");
      }
    };

    const paidMonths = await readCommissionPaidMonths();
    const customerTagCache = new Map();
    let nextPath = firstPath;
    let pageCount = 0;
    const monthlyMap = new Map();

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
      const orders = Array.isArray(data.orders) ? data.orders : [];

      for (const order of orders) {
        if (order.cancelled_at) continue;

        const customer = order.customer || {};
        const orderTagged = hasTag(order.tags, COMMISSION_TAG);
        const customerTags = hasTag(customer.tags, COMMISSION_TAG)
          ? normalizeTagList(customer.tags)
          : await fetchCustomerTags(base, customer.id, customerTagCache);
        const customerTagged = hasTag(customerTags, COMMISSION_TAG);
        if (!orderTagged && !customerTagged) continue;

        const eventDate = order.processed_at || order.created_at;
        const parsedDate = eventDate ? new Date(eventDate) : null;
        if (!parsedDate || Number.isNaN(parsedDate.getTime())) continue;

        const monthKey = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;
        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: monthKey,
            paid: Boolean(paidMonths[monthKey]?.paid),
            paid_at: paidMonths[monthKey]?.paid_at || null,
            currency: order.currency || "ZAR",
            total_net_amount: 0,
            total_commission: 0,
            customers: new Map(),
            orders: []
          });
        }

        const monthEntry = monthlyMap.get(monthKey);
        const netAmount = resolveNetAmountBeforeShippingAndTax(order);
        const commissionAmount = netAmount * COMMISSION_RATE;
        const customerName =
          `${String(customer.first_name || "").trim()} ${String(customer.last_name || "").trim()}`.trim() ||
          customer.email ||
          order.email ||
          "Unknown customer";

        monthEntry.total_net_amount += netAmount;
        monthEntry.total_commission += commissionAmount;
        monthEntry.orders.push({
          order_id: order.id,
          order_name: order.name || "",
          created_at: eventDate,
          customer_name: customerName,
          customer_id: customer.id || null,
          customer_email: customer.email || order.email || "",
          customer_tags: customerTags,
          order_tags: normalizeTagList(order.tags),
          commission_trigger: customerTagged ? "customer_tag" : "order_tag",
          net_amount: netAmount,
          commission_amount: commissionAmount
        });

        const customerKey = customer.id ? String(customer.id) : customerName.toLowerCase();
        if (!monthEntry.customers.has(customerKey)) {
          monthEntry.customers.set(customerKey, {
            customer_id: customer.id || null,
            customer_name: customerName,
            customer_email: customer.email || order.email || "",
            order_count: 0,
            total_net_amount: 0,
            total_commission: 0
          });
        }
        const customerEntry = monthEntry.customers.get(customerKey);
        customerEntry.order_count += 1;
        customerEntry.total_net_amount += netAmount;
        customerEntry.total_commission += commissionAmount;
      }

      nextPath = getNextPath(resp.headers.get("link"));
      pageCount += 1;
    }

    const months = Array.from(monthlyMap.values())
      .map((entry) => ({
        ...entry,
        customer_count: entry.customers.size,
        customers: Array.from(entry.customers.values())
          .map((customerEntry) => ({
            ...customerEntry,
            total_net_amount: Number(customerEntry.total_net_amount.toFixed(2)),
            total_commission: Number(customerEntry.total_commission.toFixed(2))
          }))
          .sort((a, b) => b.total_commission - a.total_commission),
        total_net_amount: Number(entry.total_net_amount.toFixed(2)),
        total_commission: Number(entry.total_commission.toFixed(2)),
        orders: entry.orders
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
          .map((orderEntry) => ({
            ...orderEntry,
            net_amount: Number(orderEntry.net_amount.toFixed(2)),
            commission_amount: Number(orderEntry.commission_amount.toFixed(2))
          }))
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return res.json({
      commission_tag: COMMISSION_TAG,
      commission_rate: COMMISSION_RATE,
      months
    });
  } catch (err) {
    console.error("Shopify commission list error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/shopify/commissions/flsl/months/:month/paid", async (req, res) => {
  try {
    const month = normalizeMonthKey(req.params.month);
    if (!month) return badRequest(res, "Invalid month. Expected YYYY-MM");

    const paid = req.body?.paid !== false;
    const paidMonths = await readCommissionPaidMonths();
    paidMonths[month] = {
      paid,
      paid_at: paid ? new Date().toISOString() : null
    };
    await writeCommissionPaidMonths(paidMonths);

    return res.json({ ok: true, month, ...paidMonths[month] });
  } catch (err) {
    console.error("Commission paid toggle error:", err);
    return res.status(500).json({
      error: "WRITE_FAILED",
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


export default router;
