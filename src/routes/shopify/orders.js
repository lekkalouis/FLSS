import { Router } from "express";

import { config } from "../../config.js";
import { fetchVariantPriceTiers, shopifyFetch } from "../../services/shopify.js";
import { badRequest } from "../../utils/http.js";
import {
  fetchOrderEstimatedParcels,
  fetchOrderParcelCount,
  fetchOrderParcelMetafield,
  normalizeTagList,
  requireShopifyConfigured,
  resolveTierPrice
} from "./shared.js";

const ORDER_PARCEL_NAMESPACE = "custom";
const ORDER_PARCEL_KEY = "parcel_count";
const CUSTOMER_DELIVERY_KEY = "delivery_method";

const router = Router();

async function ensureCustomerDeliveryType({ base, customerId, shippingMethod }) {
  const method = String(shippingMethod || "").trim().toLowerCase();
  if (!customerId || !method) return;

  const allowed = new Set(["shipping", "pickup", "local", "delivery", "collection"]);
  if (!allowed.has(method)) return;

  const metaResp = await shopifyFetch(`${base}/customers/${customerId}/metafields.json`, {
    method: "GET"
  });
  if (!metaResp.ok) return;
  const metaData = await metaResp.json();
  const metafields = Array.isArray(metaData.metafields) ? metaData.metafields : [];
  const existing = metafields.find(
    (mf) => mf.namespace === "custom" && mf.key === CUSTOMER_DELIVERY_KEY
  );
  if (existing?.value) return;

  await shopifyFetch(`${base}/customers/${customerId}/metafields.json`, {
    method: "POST",
    body: JSON.stringify({
      metafield: {
        namespace: "custom",
        key: CUSTOMER_DELIVERY_KEY,
        type: "single_line_text_field",
        value: method
      }
    })
  });
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
    await ensureCustomerDeliveryType({ base, customerId, shippingMethod });
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
        note: poNumber ? `PO: ${poNumber}` : "",
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
        note: poNumber ? `PO: ${poNumber}` : "",
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
    if (config.SHOPIFY_FLOW_TAG) {
      orderTags.push(config.SHOPIFY_FLOW_TAG);
    }
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
    const now = Date.now();
    const eligibleAgeMs = 90 * 24 * 60 * 60 * 1000;
    const createdAtCutoffMs = now - eligibleAgeMs;

    const firstPath =
      `${base}/orders.json?status=any` +
      `&fulfillment_status=unfulfilled,in_progress,partial` +
      `&limit=${limit}&order=created_at+desc`;

    const ordersRaw = [];
    let nextPath = firstPath;
    const visitedPaths = new Set();

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

    while (nextPath && !visitedPaths.has(nextPath)) {
      visitedPaths.add(nextPath);
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
    }

    const isOrderEligibleForDispatch = (order) => {
      if (order.cancelled_at) return false;

      const fulfillmentStatus = String(order.fulfillment_status || "").toLowerCase();
      const isFulfilled = fulfillmentStatus === "fulfilled";

      const isExplicitlyOpen =
        String(order.status || "").toLowerCase() === "open" || !order.closed_at;

      if (isExplicitlyOpen) return true;
      if (isFulfilled) return false;

      const createdAtMs = new Date(order.created_at || 0).getTime();
      if (!Number.isFinite(createdAtMs)) return false;

      return createdAtMs >= createdAtCutoffMs;
    };

    const resolveDispatchLane = (order) => {
      const tags = String(order?.tags || "").toLowerCase();
      const shippingTitles = (order?.shipping_lines || [])
        .map((line) => String(line?.title || "").toLowerCase())
        .join(" ")
        .trim();
      const combined = `${tags} ${shippingTitles}`.trim();

      if (!combined) return null;
      if (/(warehouse|collect|collection|click\s*&\s*collect)/.test(combined)) return "pickup";
      if (/(same\s*day|delivery)/.test(combined)) return "delivery";
      return "shipping";
    };

    const filteredOrders = ordersRaw.filter((o) => {
      return isOrderEligibleForDispatch(o);
    });
    const parcelCounts = await Promise.all(filteredOrders.map((o) => fetchOrderParcelCount(base, o.id)));
    const estimatedParcelCounts = await Promise.all(
      filteredOrders.map((o) => fetchOrderEstimatedParcels(base, o.id))
    );
    const parcelCountMap = new Map(
      filteredOrders.map((o, idx) => [o.id, parcelCounts[idx]])
    );
    const estimatedParcelCountMap = new Map(
      filteredOrders.map((o, idx) => [o.id, estimatedParcelCounts[idx]])
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
        const estimatedParcelsFromMeta = estimatedParcelCountMap.get(o.id) ?? null;

        const eligibleForDispatch = isOrderEligibleForDispatch(o);
        let assignedLane = resolveDispatchLane(o);
        if (eligibleForDispatch && !assignedLane) {
          assignedLane = "UNASSIGNED";
          console.warn("Eligible dispatch order missing lane assignment", {
            orderId: o.id,
            orderName: o.name
          });
        }

        return {
          id: o.id,
          name: o.name,
          eligible_for_dispatch: eligibleForDispatch,
          assigned_lane: assignedLane,
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
          estimated_parcels: estimatedParcelsFromMeta,
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

function toHistoryShipmentEntries(order, fulfillment) {
  const shipping = order.shipping_address || {};
  const customer = order.customer || {};

  const companyName =
    (shipping.company && shipping.company.trim()) ||
    (customer?.default_address?.company && customer.default_address.company.trim());

  const customer_name =
    companyName ||
    shipping.name ||
    `${(customer.first_name || "").trim()} ${(customer.last_name || "").trim()}`.trim() ||
    (order.name ? order.name.replace(/^#/, "") : "");

  const trackingNumbers = Array.isArray(fulfillment.tracking_numbers)
    ? fulfillment.tracking_numbers.filter(Boolean)
    : [];
  if (!trackingNumbers.length && fulfillment.tracking_number) {
    trackingNumbers.push(fulfillment.tracking_number);
  }

  const trackingInfo = Array.isArray(fulfillment.tracking_info) ? fulfillment.tracking_info : [];
  const trackingUrl =
    trackingInfo.find((info) => info.url)?.url || fulfillment.tracking_url || "";
  const trackingCompany =
    trackingInfo.find((info) => info.company)?.company || fulfillment.tracking_company || "";
  const shippedAt =
    fulfillment.created_at || fulfillment.updated_at || order.processed_at || order.created_at;

  if (!trackingNumbers.length) {
    return [
      {
        order_id: order.id,
        order_name: order.name,
        customer_name,
        tracking_number: "",
        tracking_url: trackingUrl,
        tracking_company: trackingCompany,
        fulfillment_id: fulfillment.id,
        shipment_status: String(fulfillment.shipment_status || fulfillment.status || "").toLowerCase() || "shipped",
        shipped_at: shippedAt
      }
    ];
  }

  return trackingNumbers.map((trackingNumber) => ({
    order_id: order.id,
    order_name: order.name,
    customer_name,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    tracking_company: trackingCompany,
    fulfillment_id: fulfillment.id,
    shipment_status: String(fulfillment.shipment_status || fulfillment.status || "").toLowerCase() || "shipped",
    shipped_at: shippedAt
  }));
}

async function fetchFulfillmentHistoryStream({ stream, query }) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const normalizedQuery = String(query || "").trim().replace(/^#/, "").toLowerCase();
  const sourceUrl =
    `${base}/orders.json?status=any` +
    `&fulfillment_status=fulfilled` +
    `&limit=250&order=updated_at+desc`;

  const resp = await shopifyFetch(sourceUrl, { method: "GET" });
  if (!resp.ok) {
    const body = await resp.text();
    const err = new Error("SHOPIFY_UPSTREAM");
    err.status = resp.status;
    err.statusText = resp.statusText;
    err.body = body;
    throw err;
  }

  const data = await resp.json();
  const ordersRaw = Array.isArray(data.orders) ? data.orders : [];
  const shipments = [];

  ordersRaw.forEach((order) => {
    if (order.cancelled_at) return;

    const orderNo = String(order.name || "").replace(/^#/, "").trim().toLowerCase();
    if (normalizedQuery && !orderNo.includes(normalizedQuery)) return;

    const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
    fulfillments.forEach((fulfillment) => {
      const shipmentStatus = String(fulfillment.shipment_status || fulfillment.status || "").toLowerCase();
      const shippedAtRaw =
        fulfillment.created_at || fulfillment.updated_at || order.processed_at || order.created_at;
      const shippedAtTs = new Date(shippedAtRaw || 0).getTime();
      if (!Number.isFinite(shippedAtTs) || shippedAtTs < cutoff) return;

      const isDelivered = shipmentStatus === "delivered";
      const isCollected = shipmentStatus === "ready_for_pickup" || shipmentStatus === "confirmed";
      const include =
        stream === "delivered"
          ? isDelivered
          : stream === "collected"
            ? isCollected
            : !isDelivered && !isCollected;
      if (!include) return;

      shipments.push(...toHistoryShipmentEntries(order, fulfillment));
    });
  });

  shipments.sort(
    (a, b) => new Date(b.shipped_at || 0).getTime() - new Date(a.shipped_at || 0).getTime()
  );
  return shipments;
}

router.get("/shopify/fulfillment-history-bundle", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const [shipped, delivered, collected] = await Promise.all([
      fetchFulfillmentHistoryStream({ stream: "shipped", query: req.query.q }),
      fetchFulfillmentHistoryStream({ stream: "delivered", query: req.query.q }),
      fetchFulfillmentHistoryStream({ stream: "collected", query: req.query.q })
    ]);

    return res.json({
      streams: {
        shipped,
        delivered,
        collected
      }
    });
  } catch (err) {
    if (err?.message === "SHOPIFY_UPSTREAM") {
      return res.status(err.status || 502).json({
        error: "SHOPIFY_UPSTREAM",
        status: err.status,
        statusText: err.statusText,
        body: err.body
      });
    }
    console.error("Shopify fulfillment-history-bundle error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/fulfillment-history", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const stream = String(req.query.stream || "shipped").toLowerCase();
    if (!["shipped", "delivered", "collected"].includes(stream)) {
      return badRequest(res, "Invalid stream. Use shipped, delivered, or collected.");
    }

    const shipments = await fetchFulfillmentHistoryStream({ stream, query: req.query.q });
    return res.json({ stream, shipments });
  } catch (err) {
    if (err?.message === "SHOPIFY_UPSTREAM") {
      return res.status(err.status || 502).json({
        error: "SHOPIFY_UPSTREAM",
        status: err.status,
        statusText: err.statusText,
        body: err.body
      });
    }
    console.error("Shopify fulfillment-history error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.get("/shopify/shipments/recent", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const shipments = await fetchFulfillmentHistoryStream({ stream: "shipped", query: req.query.q });
    return res.json({ shipments });
  } catch (err) {
    if (err?.message === "SHOPIFY_UPSTREAM") {
      return res.status(err.status || 502).json({
        error: "SHOPIFY_UPSTREAM",
        status: err.status,
        statusText: err.statusText,
        body: err.body
      });
    }
    console.error("Shopify shipments error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});


export default router;
