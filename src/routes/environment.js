import { Router } from "express";

import { getLatestEnvironmentTelemetry, ingestEnvironmentTelemetry } from "../services/environmentTelemetry.js";

const router = Router();

router.post("/environment/ingest", async (req, res) => {
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
