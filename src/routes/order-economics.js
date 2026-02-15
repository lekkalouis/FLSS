import { Router } from "express";

import {
  computeOrderEconomics,
  fetchCostBreakdown,
  insertCostEntry
} from "../services/order-economics.js";
import { hasDatabaseConfig } from "../services/db.js";

const router = Router();

router.get("/analytics/order-economics", async (req, res) => {
  try {
    const period = String(req.query.period || "month");
    const month = req.query.month ? String(req.query.month) : undefined;
    const kpi = await computeOrderEconomics({ period, month });
    return res.json(kpi);
  } catch (err) {
    console.error("Order economics KPI error:", err);
    return res.status(500).json({ error: "Failed to compute order economics" });
  }
});

router.post("/costs", async (req, res) => {
  try {
    if (!hasDatabaseConfig()) {
      return res.status(503).json({ error: "Database not configured. Set DATABASE_URL first." });
    }
    const {
      date,
      cost_category,
      cost_name,
      amount_zar,
      allocation_type = "monthly",
      notes
    } = req.body || {};

    if (!date || !cost_category || amount_zar == null) {
      return res.status(400).json({ error: "date, cost_category and amount_zar are required" });
    }

    const row = await insertCostEntry({
      date,
      cost_category,
      cost_name,
      amount_zar,
      allocation_type,
      notes
    });

    return res.status(201).json({ ok: true, entry: row });
  } catch (err) {
    console.error("Cost ledger insert error:", err);
    return res.status(500).json({ error: err.message || "Failed to save cost ledger entry" });
  }
});

router.get("/costs", async (req, res) => {
  try {
    if (!hasDatabaseConfig()) {
      return res.status(503).json({ error: "Database not configured. Set DATABASE_URL first." });
    }
    const month = String(req.query.month || "");
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "month query param required in YYYY-MM format" });
    }
    const result = await fetchCostBreakdown(month);
    return res.json(result);
  } catch (err) {
    console.error("Cost breakdown error:", err);
    return res.status(500).json({ error: "Failed to load cost breakdown" });
  }
});

export default router;
