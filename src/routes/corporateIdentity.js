import { Router } from "express";

import { listLabelRecords, upsertLabelRecord } from "../services/corporateIdentityStore.js";

const router = Router();

function validateRecordPayload(payload = {}) {
  if (!payload || typeof payload !== "object") {
    return "Payload must be an object.";
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return "Record title is required.";
  }

  if (!Array.isArray(payload.flavors) || payload.flavors.length === 0) {
    return "At least one flavor is required.";
  }

  const hasVariant = payload.flavors.some(
    (flavor) => Array.isArray(flavor?.variants) && flavor.variants.length > 0
  );
  if (!hasVariant) {
    return "Each record must include at least one variant under a flavor.";
  }

  return null;
}

router.get("/corporate-identity/labels", async (_req, res) => {
  try {
    const records = await listLabelRecords();
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: "Failed to load labels", detail: String(err?.message || err) });
  }
});

router.post("/corporate-identity/labels", async (req, res) => {
  const error = validateRecordPayload(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const record = await upsertLabelRecord(req.body);
    return res.json({ ok: true, record });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save label", detail: String(err?.message || err) });
  }
});

export default router;
