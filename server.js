// server.js – Flippen Lekka Scan Station backend (UPDATED for Shopify Dev Dashboard OAuth)
// - /pp                 : secure proxy to ParcelPerfect (SWE v28)
// - /shopify/orders/... : Shopify Admin proxy using client_credentials (24h token cache)
// - /printnode/print     : PrintNode proxy
//
// Requires Node 18+ (global fetch). If you must stay on node-fetch, see note at bottom.

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// ===== Config (env) =====
const {
  PORT = 3000,
  NODE_ENV = "development",
  FRONTEND_ORIGIN = "http://localhost:3000",

  PP_BASE_URL = "",
  PP_TOKEN = "",
  PP_REQUIRE_TOKEN = "true",
  PP_ACCNUM,
  PP_PLACE_ID,

  // Shopify (NEW)
  SHOPIFY_STORE,                 // subdomain only
  SHOPIFY_CLIENT_ID,             // Dev Dashboard app client id
  SHOPIFY_CLIENT_SECRET,         // Dev Dashboard app client secret
  SHOPIFY_API_VERSION = "2025-10",

  PRINTNODE_API_KEY,
  PRINTNODE_PRINTER_ID
} = process.env;

// ===== Middleware =====
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "1mb" }));

const allowedOrigins = new Set(
  String(FRONTEND_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error("CORS: origin not allowed"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400
  })
);
app.options("*", (_, res) => res.sendStatus(204));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// ===== Helpers =====
function badRequest(res, message, detail) {
  return res.status(400).json({ error: "BAD_REQUEST", message, detail });
}

function requireShopifyConfigured(res) {
  if (!SHOPIFY_STORE || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    res.status(501).json({
      error: "SHOPIFY_NOT_CONFIGURED",
      message:
        "Set SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET in .env (Dev Dashboard app credentials)"
    });
    return false;
  }
  return true;
}

// ===== Shopify token cache (client_credentials) =====
let cachedToken = null;
let tokenExpiresAtMs = 0;

async function fetchNewShopifyAdminToken() {
  const url = `https://${SHOPIFY_STORE}.myshopify.com/admin/oauth/access_token`;

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", SHOPIFY_CLIENT_ID);
  body.set("client_secret", SHOPIFY_CLIENT_SECRET);

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

async function getShopifyAdminToken() {
  if (cachedToken && Date.now() < tokenExpiresAtMs) return cachedToken;
  return fetchNewShopifyAdminToken();
}

async function shopifyFetch(pathname, { method = "GET", headers = {}, body } = {}) {
  const token = await getShopifyAdminToken();
  const url = `https://${SHOPIFY_STORE}.myshopify.com${pathname}`;

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

  // If token got invalidated early, refresh once and retry
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

// ===== 1) ParcelPerfect proxy (v28, POST form) =====
app.post("/pp", async (req, res) => {
  try {
    const { method, classVal, params } = req.body || {};

    if (!method || !classVal || typeof params !== "object") {
      return badRequest(res, "Expected { method, classVal, params } in body");
    }

    if (!PP_BASE_URL || !PP_BASE_URL.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    const form = new URLSearchParams();
    form.set("method", String(method));
    form.set("class", String(classVal));
    form.set("params", JSON.stringify(params));

    const mustUseToken = String(PP_REQUIRE_TOKEN) === "true";
    const tokenToUse = mustUseToken ? PP_TOKEN : "";
    if (tokenToUse) form.set("token_id", tokenToUse);

    const upstream = await fetch(PP_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const text = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json; charset=utf-8";
    res.set("content-type", contentType);

    try {
      const json = JSON.parse(text);
      return res.status(upstream.status).json(json);
    } catch {
      return res.status(upstream.status).send(text);
    }
  } catch (err) {
    console.error("PP proxy error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

// ===== 2) Shopify: find order by name =====
app.get("/shopify/orders/by-name/:name", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    let name = req.params.name || "";
    if (!name.startsWith("#")) name = `#${name}`;

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;

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
      Array.isArray(orderData.orders) && orderData.orders.length
        ? orderData.orders[0]
        : null;

    if (!order) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Order not found" });
    }

    // Customer metafields for place code
    let customerPlaceCode = null;
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

    return res.json({ order, customerPlaceCode });
  } catch (err) {
    console.error("Shopify proxy error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

// ===== 2b) Shopify: list open orders for dispatch board =====
app.get("/shopify/orders/open", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;

    const url =
      `${base}/orders.json?status=any` +
      `&fulfillment_status=unfulfilled,in_progress` +
      `&limit=50&order=created_at+desc`;

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

    const orders = ordersRaw.map((o) => {
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
        customer_name,
        created_at: o.processed_at || o.created_at,
        fulfillment_status: o.fulfillment_status,
        shipping_city: shipping.city || "",
        shipping_postal: shipping.zip || "",
        shipping_address1: shipping.address1 || "",
        shipping_address2: shipping.address2 || "",
        shipping_province: shipping.province || "",
        shipping_country: shipping.country || "",
        shipping_phone: shipping.phone || "",
        shipping_name: shipping.name || customer_name,
        parcel_count: parcelCountFromTag,
        line_items: (o.line_items || []).map((li) => ({
          title: li.title,
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

// ===== 2c) Shopify: fulfill (keeps your existing endpoint + payload) =====
app.post("/shopify/fulfill", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { orderId, trackingNumber, trackingUrl, trackingCompany } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: "MISSING_ORDER_ID", body: req.body });
    }

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;
    const trackingCompanyFinal =
      trackingCompany || process.env.TRACKING_COMPANY || "SWE / ParcelPerfect";

    // Fetch fulfillment orders
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
    const fulfillmentPayload = {
      fulfillment: {
        message: "Shipped via Scan Station",
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

// ===== ParcelPerfect place lookup (Waybill.getPlace) =====
app.get("/pp/place", async (req, res) => {
  try {
    const query = (req.query.q || req.query.query || "").trim();
    if (!query) return badRequest(res, "Missing ?q= query string for place search");

    if (!PP_BASE_URL || !PP_BASE_URL.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    if (!PP_TOKEN) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_TOKEN is required for getPlace"
      });
    }

    const paramsObj = {
      id: PP_PLACE_ID || "ShopifyScanStation",
      accnum: PP_ACCNUM || "",
      ppcust: ""
    };

    const qs = new URLSearchParams();
    qs.set("Class", "Waybill");
    qs.set("method", "getPlace");
    qs.set("token_id", PP_TOKEN);
    qs.set("params", JSON.stringify(paramsObj));
    qs.set("query", query);

    const base = PP_BASE_URL.endsWith("/") ? PP_BASE_URL : PP_BASE_URL + "/";
    const url = `${base}?${qs.toString()}`;

    const upstream = await fetch(url, { method: "GET" });
    const text = await upstream.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(upstream.status).send(text);
    }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error("PP getPlace error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

// ===== PrintNode proxy =====
app.post("/printnode/print", async (req, res) => {
  try {
    const { pdfBase64, title } = req.body || {};

    if (!pdfBase64) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing pdfBase64" });
    }

    if (!PRINTNODE_API_KEY || !PRINTNODE_PRINTER_ID) {
      return res.status(500).json({
        error: "PRINTNODE_NOT_CONFIGURED",
        message: "Set PRINTNODE_API_KEY and PRINTNODE_PRINTER_ID in your .env file"
      });
    }

    const auth = Buffer.from(PRINTNODE_API_KEY + ":").toString("base64");

    const payload = {
      printerId: Number(PRINTNODE_PRINTER_ID),
      title: title || "Parcel Label",
      contentType: "pdf_base64",
      content: pdfBase64.replace(/\s/g, ""),
      source: "Flippen Lekka Scan Station"
    };

    const upstream = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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
        error: "PRINTNODE_UPSTREAM",
        status: upstream.status,
        statusText: upstream.statusText,
        body: data
      });
    }

    return res.json({ ok: true, printJob: data });
  } catch (err) {
    console.error("PrintNode proxy error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

// ===== Health check =====
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, "public")));
app.get("/flops", (req, res) => res.sendFile(path.join(__dirname, "public", "flops.html")));

// SPA fallback
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ===== Start =====
app.listen(PORT, () => {
  console.log(`Scan Station server listening on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${[...allowedOrigins].join(", ")}`);
  console.log("PP_BASE_URL:", PP_BASE_URL || "(NOT SET)");
  console.log("Shopify configured:", Boolean(SHOPIFY_STORE && SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET));
});
