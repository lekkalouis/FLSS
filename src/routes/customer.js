import crypto from "crypto";
import { Router } from "express";

import { config } from "../config.js";
import { shopifyFetch } from "../services/shopify.js";
import { badRequest } from "../utils/http.js";

const router = Router();
const TOKEN_VERSION = "v1";

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

function requireCustomerPortalConfigured(res) {
  if (!config.CUSTOMER_AUTH_SECRET) {
    res.status(501).json({
      error: "CUSTOMER_PORTAL_NOT_CONFIGURED",
      message: "Set CUSTOMER_AUTH_SECRET in .env to enable customer portal logins."
    });
    return false;
  }
  if (!Array.isArray(config.SPECIAL_CUSTOMERS) || !config.SPECIAL_CUSTOMERS.length) {
    res.status(501).json({
      error: "CUSTOMER_PORTAL_NOT_CONFIGURED",
      message: "Set SPECIAL_CUSTOMERS in .env to enable customer portal logins."
    });
    return false;
  }
  return true;
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signToken(payload, secret) {
  const encoded = base64UrlEncode(JSON.stringify({ v: TOKEN_VERSION, ...payload }));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyToken(token, secret) {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload || payload.v !== TOKEN_VERSION) return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function findSpecialCustomer(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return (config.SPECIAL_CUSTOMERS || []).find(
    (entry) => String(entry.email || "").trim().toLowerCase() === normalized
  );
}

function requireCustomerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Missing bearer token." });
  }
  const token = header.slice("Bearer ".length).trim();
  const payload = verifyToken(token, config.CUSTOMER_AUTH_SECRET);
  if (!payload) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
  }
  req.customer = payload;
  return next();
}

router.post("/customer/login", (req, res) => {
  if (!requireCustomerPortalConfigured(res)) return;

  const { email, passcode } = req.body || {};
  if (!email || !passcode) {
    return badRequest(res, "Missing email or passcode.");
  }

  const match = findSpecialCustomer(email);
  if (!match || String(match.passcode) !== String(passcode)) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid credentials." });
  }

  const expiresInMinutes = Math.max(5, Number(config.CUSTOMER_AUTH_TTL_MINUTES || 60));
  const payload = {
    email: match.email,
    name: match.name || "",
    customerId: match.customerId || match.customer_id || null,
    exp: Date.now() + expiresInMinutes * 60 * 1000
  };

  if (!payload.customerId) {
    return res.status(422).json({
      error: "MISSING_CUSTOMER_ID",
      message: "Special customer is missing a customerId."
    });
  }

  return res.json({
    ok: true,
    token: signToken(payload, config.CUSTOMER_AUTH_SECRET),
    customer: {
      email: payload.email,
      name: payload.name,
      customerId: payload.customerId,
      expiresInMinutes
    }
  });
});

router.post("/customer/orders", requireCustomerAuth, async (req, res) => {
  try {
    if (!requireShopifyConfigured(res)) return;

    const {
      poNumber,
      shippingMethod,
      shippingPrice,
      shippingService,
      shippingQuoteNo,
      billingAddress,
      shippingAddress,
      lineItems
    } = req.body || {};

    if (!Array.isArray(lineItems) || !lineItems.length) {
      return badRequest(res, "Missing lineItems");
    }

    const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
    const noteParts = ["Customer portal order"];
    if (poNumber) noteParts.push(`PO: ${poNumber}`);
    if (shippingMethod) noteParts.push(`Delivery: ${shippingMethod}`);
    if (shippingQuoteNo) noteParts.push(`Quote: ${shippingQuoteNo}`);

    const orderPayload = {
      order: {
        customer: { id: req.customer.customerId },
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
            : []),
          { name: "portal_customer", value: String(req.customer.email || "") }
        ],
        financial_status: "pending",
        tags: "customer_portal"
      }
    };

    if (shippingMethod && shippingMethod !== "ship") {
      orderPayload.order.tags = `${orderPayload.order.tags},delivery_${shippingMethod}`;
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
    console.error("Customer portal order error:", err);
    return res
      .status(502)
      .json({ error: "UPSTREAM_ERROR", message: String(err?.message || err) });
  }
});

export default router;
