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
import nodemailer from "nodemailer";

dotenv.config();
const app = express();

// ===== Config (env) =====
const {
  PORT = 3000,
  HOST = "0.0.0.0",
  NODE_ENV = "development",

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
  PRINTNODE_PRINTER_ID,

  SMTP_HOST,
  SMTP_PORT = 587,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE = "false",
  SMTP_FROM,
  TRUCK_EMAIL_TO
} = process.env;

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || (NODE_ENV === "production" ? "http://localhost:3000" : "*");

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
const allowAllOrigins = allowedOrigins.has("*");

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowAllOrigins || allowedOrigins.has(origin)) return cb(null, true);
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

function normalizeCustomer(customer, deliveryMethod) {
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
    delivery_method: deliveryMethod || null
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

function requireTruckEmailConfigured(res) {
  if (!SMTP_HOST || !SMTP_FROM || !TRUCK_EMAIL_TO) {
    res.status(501).json({
      error: "TRUCK_EMAIL_NOT_CONFIGURED",
      message: "Set SMTP_HOST, SMTP_FROM, and TRUCK_EMAIL_TO in .env to send truck alerts."
    });
    return false;
  }
  return true;
}

function requireCustomerEmailConfigured(res) {
  if (!SMTP_HOST || !SMTP_FROM) {
    res.status(501).json({
      error: "EMAIL_NOT_CONFIGURED",
      message: "Set SMTP_HOST and SMTP_FROM in .env to send customer emails."
    });
    return false;
  }
  return true;
}

function buildServiceStatus(ok, detail) {
  return { ok: Boolean(ok), detail };
}

let smtpTransport = null;
function getSmtpTransport() {
  if (smtpTransport) return smtpTransport;
  smtpTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 0) || 587,
    secure: String(SMTP_SECURE).toLowerCase() === "true",
    auth: SMTP_USER
      ? {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      : undefined
  });
  return smtpTransport;
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
function normalizeParcelPerfectClass(value) {
  if (!value) return value;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (lower === "quote") return "Quote";
  if (lower === "collection") return "Collection";
  if (lower === "waybill") return "Waybill";
  if (lower === "auth") return "Auth";
  return raw;
}

app.post("/pp", async (req, res) => {
  try {
    const { method, classVal, class: classNameRaw, params } = req.body || {};
    const className = normalizeParcelPerfectClass(classVal || classNameRaw);

    if (!method || !className || typeof params !== "object") {
      return badRequest(res, "Expected { method, classVal|class, params } in body");
    }

    if (!PP_BASE_URL || !PP_BASE_URL.startsWith("http")) {
      return res.status(500).json({
        error: "CONFIG_ERROR",
        message: "PP_BASE_URL is not a valid URL"
      });
    }

    const form = new URLSearchParams();
    form.set("method", String(method));
    form.set("class", String(className));
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

// ===== 2) Shopify: customers search =====
app.get("/shopify/customers/search", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const q = String(req.query.q || "").trim();
    if (!q) return badRequest(res, "Missing search query (?q=...)");

    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    const base = `/admin/api/${SHOPIFY_API_VERSION}`;
    const url =
      `${base}/customers/search.json?limit=${limit}` +
      `&query=${encodeURIComponent(q)}` +
      `&fields=id,first_name,last_name,email,phone,addresses,default_address,tags`;

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

    const deliveries = await Promise.all(
      customers.map(async (cust) => {
        try {
          const metaUrl = `${base}/customers/${cust.id}/metafields.json`;
          const metaResp = await shopifyFetch(metaUrl, { method: "GET" });
          if (!metaResp.ok) return null;
          const metaData = await metaResp.json();
          const m = (metaData.metafields || []).find(
            (mf) => mf.namespace === "custom" && mf.key === "delivery_method"
          );
          return m?.value || null;
        } catch {
          return null;
        }
      })
    );

    const normalized = customers
      .map((cust, idx) => normalizeCustomer(cust, deliveries[idx]))
      .filter(Boolean);

    return res.json({ customers: normalized });
  } catch (err) {
    console.error("Shopify customer search error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

// ===== 2b) Shopify: create customer =====
app.post("/shopify/customers", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      deliveryMethod,
      address
    } = req.body || {};

    if (!firstName && !lastName && !email && !phone) {
      return badRequest(res, "Provide at least a name, email, or phone number");
    }

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;
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
        note: company ? `Company: ${company}` : undefined,
        metafields: deliveryMethod
          ? [
              {
                namespace: "custom",
                key: "delivery_method",
                type: "single_line_text_field",
                value: deliveryMethod
              }
            ]
          : []
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
      deliveryMethod || null
    );
    return res.json({ ok: true, customer });
  } catch (err) {
    console.error("Shopify customer create error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

// ===== 2c) Shopify: products search =====
app.get("/shopify/products/search", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const q = String(req.query.q || "").trim();
    if (!q) return badRequest(res, "Missing search query (?q=...)");

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 50);
    const base = `/admin/api/${SHOPIFY_API_VERSION}`;

    const productUrl =
      `${base}/products.json?limit=${limit}` +
      `&title=${encodeURIComponent(q)}` +
      `&fields=id,title,variants`;

    const variantUrl =
      `${base}/variants.json?limit=${limit}` +
      `&sku=${encodeURIComponent(q)}` +
      `&fields=id,product_id,title,sku,price,weight,weight_unit`;

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

    const productTitleById = new Map(
      products.map((p) => [p.id, p.title])
    );

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
        const idProducts = Array.isArray(idData.products)
          ? idData.products
          : [];
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
          v.title && v.title !== "Default Title"
            ? `${p.title} – ${v.title}`
            : p.title;
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
        v.title && v.title !== "Default Title"
          ? `${baseTitle} – ${v.title}`
          : baseTitle;
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

    return res.json({ products: normalized });
  } catch (err) {
    console.error("Shopify product search error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

// ===== 2c.1) Shopify: products from collection =====
app.get("/shopify/products/collection", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const handle = String(req.query.handle || "").trim();
    if (!handle) {
      return badRequest(res, "Missing collection handle (?handle=...)");
    }

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;
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
      const list = Array.isArray(data.custom_collections)
        ? data.custom_collections
        : [];
      if (list.length) collectionId = list[0].id;
    }
    if (!collectionId && smartResp.ok) {
      const data = await smartResp.json();
      const list = Array.isArray(data.smart_collections)
        ? data.smart_collections
        : [];
      if (list.length) collectionId = list[0].id;
    }

    if (!collectionId) {
      return res
        .status(404)
        .json({ error: "NOT_FOUND", message: "Collection not found" });
    }

    const productUrl = `${base}/collections/${collectionId}/products.json?limit=250&fields=id,title,variants`;
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
          v.title && v.title !== "Default Title"
            ? `${p.title} – ${v.title}`
            : p.title;
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

    return res.json({ products: normalized });
  } catch (err) {
    console.error("Shopify collection products error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

// ===== 2d) Shopify: create draft order =====
app.post("/shopify/draft-orders", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      customerId,
      poNumber,
      shippingMethod,
      shippingPrice,
      shippingService,
      shippingQuoteNo,
      billingAddress,
      shippingAddress,
      lineItems
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;
    const noteParts = [];
    if (poNumber) noteParts.push(`PO: ${poNumber}`);
    if (shippingMethod) noteParts.push(`Delivery: ${shippingMethod}`);
    if (shippingQuoteNo) noteParts.push(`Quote: ${shippingQuoteNo}`);

    const payload = {
      draft_order: {
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
          ...(poNumber
            ? [{ name: "po_number", value: String(poNumber) }]
            : []),
          ...(shippingQuoteNo
            ? [{ name: "shipping_quote_no", value: String(shippingQuoteNo) }]
            : [])
        ]
      }
    };

    if (shippingMethod && shippingMethod !== "ship") {
      payload.draft_order.tags = `delivery_${shippingMethod}`;
    }

    if (shippingPrice != null && shippingMethod === "ship") {
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
      ? `https://${SHOPIFY_STORE}.myshopify.com/admin/draft_orders/${d.id}`
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

// ===== 2e) Shopify: complete draft order =====
app.post("/shopify/draft-orders/complete", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const { draftOrderId } = req.body || {};
    if (!draftOrderId) {
      return badRequest(res, "Missing draftOrderId");
    }

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;
    const resp = await shopifyFetch(
      `${base}/draft_orders/${draftOrderId}/complete.json`,
      {
        method: "POST",
        body: JSON.stringify({ draft_order: { id: draftOrderId } })
      }
    );

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
      order: order
        ? { id: order.id, name: order.name, orderNumber: order.order_number }
        : null
    });
  } catch (err) {
    console.error("Shopify draft order complete error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

// ===== 2f) Shopify: create order =====
app.post("/shopify/orders", async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      customerId,
      poNumber,
      shippingMethod,
      shippingPrice,
      shippingService,
      shippingQuoteNo,
      billingAddress,
      shippingAddress,
      lineItems
    } = req.body || {};

    if (!customerId) {
      return badRequest(res, "Missing customerId");
    }
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const base = `/admin/api/${SHOPIFY_API_VERSION}`;
    const noteParts = [];
    if (poNumber) noteParts.push(`PO: ${poNumber}`);
    if (shippingMethod) noteParts.push(`Delivery: ${shippingMethod}`);
    if (shippingQuoteNo) noteParts.push(`Quote: ${shippingQuoteNo}`);

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
          ...(poNumber
            ? [{ name: "po_number", value: String(poNumber) }]
            : []),
          ...(shippingQuoteNo
            ? [{ name: "shipping_quote_no", value: String(shippingQuoteNo) }]
            : [])
        ],
        financial_status: "pending"
      }
    };

    if (shippingMethod && shippingMethod !== "ship") {
      orderPayload.order.tags = `delivery_${shippingMethod}`;
    }

    if (shippingPrice != null && shippingMethod === "ship") {
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

// ===== 3) Shopify: find order by name =====
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
      `${base}/orders.json?status=open` +
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

    const orders = ordersRaw
      .filter((o) => !o.cancelled_at)
      .map((o) => {
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
          parcel_count: parcelCountFromTag,
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
    const trackingNote = trackingNumber ? ` Tracking: ${trackingNumber}` : "";
    const fulfillmentPayload = {
      fulfillment: {
        message: `Shipped via Scan Station.${trackingNote}`,
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

// ===== 2c.1) Notify customer for collection ready =====
app.post("/shopify/notify-collection", async (req, res) => {
  try {
    if (!requireCustomerEmailConfigured(res)) return;
    const {
      orderNo,
      email,
      customerName,
      parcelCount = 0,
      weightKg = 0
    } = req.body || {};

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
      from: SMTP_FROM,
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

// ===== ParcelPerfect place lookup (Quote.getPlacesByName/Postcode) =====
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
        message: "PP_TOKEN is required for place lookups"
      });
    }

    const isPostcode = /^[0-9]{3,10}$/.test(query);
    const method = isPostcode ? "getPlacesByPostcode" : "getPlacesByName";
    const paramsObj = isPostcode ? { postcode: query } : { name: query };

    const form = new URLSearchParams();
    form.set("method", method);
    form.set("class", "Quote");
    form.set("token_id", PP_TOKEN);
    form.set("params", JSON.stringify(paramsObj));

    const upstream = await fetch(PP_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return res.status(upstream.status).send(text);
    }

    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error("PP place lookup error:", err);
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

// ===== Truck booking email alert =====
app.post("/alerts/book-truck", async (req, res) => {
  if (!requireTruckEmailConfigured(res)) return;
  const { parcelCount, reason = "auto" } = req.body || {};
  const count = Number(parcelCount || 0);
  if (!count || Number.isNaN(count)) {
    return badRequest(res, "parcelCount is required");
  }

  const toList = String(TRUCK_EMAIL_TO || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!toList.length) {
    return badRequest(res, "TRUCK_EMAIL_TO is empty");
  }

  const subject = `Truck collection request - ${count} parcels`;
  const today = new Date().toLocaleDateString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const text = `Hi SWE Couriers,

Please arrange a truck collection for today's parcels.

Date: ${today}
Parcel count: ${count}
Reason: ${reason}

Thank you,
Flippen Lekka Scan Station`;

  try {
    const transport = getSmtpTransport();
    const info = await transport.sendMail({
      from: SMTP_FROM,
      to: toList.join(", "),
      subject,
      text
    });
    res.json({ ok: true, messageId: info.messageId, to: toList, subject });
  } catch (err) {
    res.status(500).json({ error: "TRUCK_EMAIL_ERROR", message: err?.message || String(err) });
  }
});

// ===== Health check =====
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.get("/statusz", async (_req, res) => {
  const services = {
    server: buildServiceStatus(true, "Online")
  };

  const ppTokenRequired = String(PP_REQUIRE_TOKEN).toLowerCase() !== "false";
  const ppConfigured = Boolean(PP_BASE_URL) && (!ppTokenRequired || Boolean(PP_TOKEN));
  services.parcelPerfect = buildServiceStatus(
    ppConfigured,
    ppConfigured ? "Configured" : "Missing PP_BASE_URL or PP_TOKEN"
  );

  const printNodeConfigured = Boolean(PRINTNODE_API_KEY && PRINTNODE_PRINTER_ID);
  services.printNode = buildServiceStatus(
    printNodeConfigured,
    printNodeConfigured ? "Configured" : "Missing PRINTNODE settings"
  );

  const emailConfigured = Boolean(SMTP_HOST && SMTP_FROM);
  services.email = buildServiceStatus(
    emailConfigured,
    emailConfigured ? "Configured" : "Missing SMTP settings"
  );

  const shopifyConfigured = Boolean(SHOPIFY_STORE && SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET);
  if (!shopifyConfigured) {
    services.shopify = buildServiceStatus(false, "Missing Shopify settings");
  } else {
    try {
      await getShopifyAdminToken();
      services.shopify = buildServiceStatus(true, "Authenticated");
    } catch (err) {
      services.shopify = buildServiceStatus(false, "Auth failed");
    }
  }

  const ok = Object.values(services).every((service) => service.ok);
  res.json({ ok, checkedAt: new Date().toISOString(), services });
});

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, "public")));
app.get("/flocs", (req, res) => res.sendFile(path.join(__dirname, "public", "flocs.html")));
app.get("/simulate", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "simulate.html"))
);

// SPA fallback
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ===== Start =====
app.listen(PORT, HOST, () => {
  const hostLabel = HOST === "0.0.0.0" ? "all interfaces" : HOST;
  console.log(`Scan Station server listening on http://${hostLabel}:${PORT}`);
  if (HOST === "localhost" || HOST === "127.0.0.1") {
    console.warn("Warning: HOST is loopback-only; other devices on your LAN cannot connect.");
  }
  console.log(`Allowed origins: ${allowAllOrigins ? "*" : [...allowedOrigins].join(", ")}`);
  console.log("PP_BASE_URL:", PP_BASE_URL || "(NOT SET)");
  console.log("Shopify configured:", Boolean(SHOPIFY_STORE && SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET));
});
