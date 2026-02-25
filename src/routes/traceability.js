import { Router } from "express";

import { badRequest } from "../utils/http.js";
import { buildTraceabilityReport, buildTraceabilityTemplateBuffer } from "../services/traceability.js";

const router = Router();

router.get("/traceability/template.xlsx", (_req, res) => {
  const workbookBuffer = buildTraceabilityTemplateBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=traceability_sample_data.xlsx");
  return res.send(workbookBuffer);
});

router.post("/traceability/report", async (req, res) => {
  const batchNumber = String(req.body?.batchNumber || "").trim();
  const flavor = String(req.body?.flavor || "").trim();

  if (!batchNumber) {
    return badRequest(res, "batchNumber is required.");
  }

  try {
    const report = await buildTraceabilityReport({
      batchNumber,
      flavor,
      purchasesFileBase64: req.body?.purchasesFileBase64,
      coaFileBase64: req.body?.coaFileBase64
    });

    if (report?.error) {
      return badRequest(res, report.error);
    }

    return res.json({ ok: true, report });
  } catch (error) {
    return res.status(500).json({
      error: "TRACEABILITY_REPORT_FAILED",
      message: error?.message || "Could not build traceability report"
    });
  }
});

export default router;
