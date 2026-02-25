import express from "express";

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

export default router;
