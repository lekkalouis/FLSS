import express from "express";
import crypto from "node:crypto";

import { config } from "../config.js";
import { buildMarketingMaterial, listPromoMaterials } from "../services/agentPortal.js";

import {
  getCustomerFromToken,
  getPublicProfile,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  updateCustomerProfile
} from "../services/customerAccounts.js";
import { createCustomerOrder, listCatalog, listCustomerOrders } from "../services/customerOrders.js";

const router = express.Router();

function normalizeQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function verifyShopifyProxySignature(req) {
  const signature = normalizeQueryValue(req.query.signature).toLowerCase();
  if (!signature || !config.SHOPIFY_CLIENT_SECRET) return true;

  const source = Object.entries(req.query || {})
    .filter(([key]) => key !== "signature")
    .map(([key, value]) => {
      const cleaned = Array.isArray(value)
        ? value.map((item) => String(item || "")).join(",")
        : String(value || "");
      return `${key}=${cleaned}`;
    })
    .sort()
    .join("");

  const expected = crypto
    .createHmac("sha256", String(config.SHOPIFY_CLIENT_SECRET))
    .update(source)
    .digest("hex")
    .toLowerCase();

  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function getShopifyCustomerContext(req) {
  const query = req.query || {};
  const id = normalizeQueryValue(
    query.logged_in_customer_id || req.get("x-shopify-customer-id")
  );
  const email = normalizeQueryValue(
    query.logged_in_customer_email || req.get("x-shopify-customer-email")
  );
  const firstName = normalizeQueryValue(
    query.logged_in_customer_first_name || req.get("x-shopify-customer-first-name")
  );
  const lastName = normalizeQueryValue(
    query.logged_in_customer_last_name || req.get("x-shopify-customer-last-name")
  );

  if (!id && !email) return null;
  return {
    id,
    email,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim() || email || `Customer ${id}`
  };
}

function requireShopifyCustomerContext(req, res) {
  if (!verifyShopifyProxySignature(req)) {
    res.status(401).json({
      error: "Invalid Shopify signature"
    });
    return null;
  }

  const customer = getShopifyCustomerContext(req);
  if (!customer) {
    res.status(401).json({
      error: "Customer identity missing. Open this page through Shopify Customer Accounts or App Proxy."
    });
    return null;
  }
  return customer;
}

function tokenFromAuthHeader(req) {
  const auth = String(req.get("authorization") || "");
  const [scheme, token] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function requireCustomer(req, res) {
  const token = tokenFromAuthHeader(req);
  const user = getCustomerFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return user;
}

router.post("/customer-accounts/register", (req, res) => {
  const result = registerCustomer(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json(result);
});

router.post("/customer-accounts/login", (req, res) => {
  const result = loginCustomer(req.body);
  if (result.error) return res.status(401).json({ error: result.error });
  return res.json(result);
});

router.post("/customer-accounts/logout", (req, res) => {
  const token = tokenFromAuthHeader(req);
  if (token) logoutCustomer(token);
  return res.status(204).end();
});

router.get("/customer-accounts/me", (req, res) => {
  const user = requireCustomer(req, res);
  if (!user) return;
  return res.json({ user: getPublicProfile(user) });
});

router.put("/customer-accounts/me", (req, res) => {
  const user = requireCustomer(req, res);
  if (!user) return;

  const result = updateCustomerProfile(user.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json(result);
});

router.get("/customer-accounts/catalog", (req, res) => {
  const user = requireCustomer(req, res);
  if (!user) return;
  return res.json({ products: listCatalog(user.tier) });
});

router.get("/customer-accounts/orders", (req, res) => {
  const user = requireCustomer(req, res);
  if (!user) return;
  return res.json({ orders: listCustomerOrders(user.id) });
});

router.post("/customer-accounts/orders", (req, res) => {
  const user = requireCustomer(req, res);
  if (!user) return;

  const result = createCustomerOrder({
    customer: user,
    items: req.body?.items,
    notes: req.body?.notes
  });
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json(result);
});

router.get("/customer-accounts/agent-portal/session", (req, res) => {
  const customer = requireShopifyCustomerContext(req, res);
  if (!customer) return;
  return res.json({ customer, authenticated: true });
});

router.get("/customer-accounts/agent-portal/promo-materials", (req, res) => {
  const customer = requireShopifyCustomerContext(req, res);
  if (!customer) return;
  return res.json({ customer, materials: listPromoMaterials() });
});

router.post("/customer-accounts/agent-portal/generate-marketing-material", (req, res) => {
  const customer = requireShopifyCustomerContext(req, res);
  if (!customer) return;
  const material = buildMarketingMaterial(req.body || {});
  return res.status(201).json({ customer, material });
});

export default router;
