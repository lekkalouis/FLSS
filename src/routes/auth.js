import { Router } from "express";

import {
  beginShopifyCustomerLogin,
  completeShopifyCustomerLogin,
  getShopifyCustomerAuthState,
  logoutShopifyCustomerSession
} from "../services/shopifyCustomerAuth.js";

const router = Router();

router.get("/auth/session", (req, res) => {
  res.json({ ok: true, auth: getShopifyCustomerAuthState(req) });
});

router.get("/auth/login", async (req, res) => {
  try {
    await beginShopifyCustomerLogin(req, res);
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message || "Unable to start customer sign-in." });
  }
});

router.get("/auth/callback", async (req, res) => {
  await completeShopifyCustomerLogin(req, res);
});

router.get("/auth/logout", async (req, res) => {
  await logoutShopifyCustomerSession(req, res);
});

router.post("/auth/logout", async (req, res) => {
  await logoutShopifyCustomerSession(req, res);
});

export default router;
