import { Router } from "express";

import { config } from "../../config.js";
import { shopifyFetch } from "../../services/shopify.js";
import { badRequest } from "../../utils/http.js";
import { requireShopifyConfigured } from "./shared.js";

const router = Router();
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


export default router;
