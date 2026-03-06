import { Router } from "express";

import { listPrintHistory } from "../services/printHistory.js";

const router = Router();

router.get("/print-history", (req, res) => {
  try {
    const result = listPrintHistory({
      page: req.query.page,
      pageSize: req.query.pageSize,
      status: req.query.status,
      jobType: req.query.jobType || req.query.type,
      from: req.query.from,
      to: req.query.to,
      printerId: req.query.printerId
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({
      error: "PRINT_HISTORY_LIST_FAILED",
      message: String(error?.message || error)
    });
  }
});

export default router;
