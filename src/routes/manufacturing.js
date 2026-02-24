import { Router } from "express";

import { manufacturingService } from "../services/manufacturing.js";
import { badRequest } from "../utils/http.js";

const router = Router();

router.post("/manufacturing/boms/resolve", async (req, res, next) => {
  try {
    const variantIds = Array.isArray(req.body?.variantIds) ? req.body.variantIds : [];
    if (!variantIds.length) return badRequest(res, "variantIds must be a non-empty array");
    const boms = await manufacturingService.resolveBoms(variantIds);
    return res.json({ ok: true, boms });
  } catch (error) {
    return next(error);
  }
});

router.post("/manufacturing/orders/check", async (req, res, next) => {
  try {
    const orderId = req.body?.orderId;
    if (!orderId) return badRequest(res, "orderId is required");
    const result = await manufacturingService.checkOrder({
      orderId,
      locationId: req.body?.locationId
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});


router.get("/manufacturing/setup/phase1", async (req, res, next) => {
  try {
    const apply = String(req.query?.apply || "").toLowerCase() === "true";
    const result = await manufacturingService.ensurePhase1Definitions({ apply });
    return res.json({ ok: true, method: "GET", hint: "Use POST with {apply:true|false} for automation.", ...result });
  } catch (error) {
    return next(error);
  }
});

router.post("/manufacturing/setup/phase1", async (req, res, next) => {
  try {
    const apply = req.body?.apply === true;
    const result = await manufacturingService.ensurePhase1Definitions({ apply });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

export default router;
