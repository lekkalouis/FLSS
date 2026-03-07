import { Router } from "express";

import {
  beginOAuthLogin,
  completeOAuthLogin,
  getClientOAuthState,
  logoutOAuthSession
} from "../services/oauth.js";

const router = Router();

router.get("/auth/session", (req, res) => {
  res.json({ ok: true, auth: getClientOAuthState(req) });
});

router.get("/auth/login", (req, res) => {
  beginOAuthLogin(req, res);
});

router.get("/auth/callback", async (req, res) => {
  await completeOAuthLogin(req, res);
});

router.get("/auth/logout", (req, res) => {
  logoutOAuthSession(req, res);
});

router.post("/auth/logout", (req, res) => {
  logoutOAuthSession(req, res);
});

export default router;
