import { Router } from "express";

import { config } from "../config.js";
import {
  hasOAuthSession,
  isOAuthEnabled,
  sendOAuthApiUnauthorized
} from "../services/oauth.js";
import { getLatestEnvironmentTelemetry, ingestEnvironmentTelemetry } from "../services/environmentTelemetry.js";

const router = Router();

function hasRotaryBearerToken(req) {
  const expectedToken = String(config.ROTARY_TOKEN || "").trim();
  if (!expectedToken) return false;
  const authHeader = String(req.get("authorization") || "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  return bearerToken === expectedToken;
}

router.post("/environment/ingest", async (req, res) => {
  if (isOAuthEnabled() && !hasOAuthSession(req) && !hasRotaryBearerToken(req)) {
    return sendOAuthApiUnauthorized(req, res);
  }
  try {
    const environment = await ingestEnvironmentTelemetry(req.body || {});
    return res.json({ ok: true, environment });
  } catch (error) {
    if (error?.code === "INVALID_ENVIRONMENT_TELEMETRY") {
      return res.status(400).json({ ok: false, error: error.message });
    }
    return res.status(500).json({ ok: false, error: "Failed to ingest environment telemetry" });
  }
});

router.get("/environment", (_req, res) => {
  res.json({ ok: true, environment: getLatestEnvironmentTelemetry() });
});

export default router;
