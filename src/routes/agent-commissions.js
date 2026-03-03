import express from "express";

import {
  buildCommissionDashboard,
  deleteCommissionRule,
  listCommissionRules,
  listPayments,
  recordPayment,
  upsertCommissionRule
} from "../services/agentCommissions.js";
import { shopifyFetch } from "../services/shopify.js";

const router = express.Router();

function isoDateDaysAgo(days) {
  const safeDays = Number.isFinite(Number(days)) ? Number(days) : 90;
  const date = new Date(Date.now() - Math.max(1, safeDays) * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

async function fetchOrders(days = 120) {
  const createdAtMin = isoDateDaysAgo(days);
  const fields = [
    "id",
    "name",
    "created_at",
    "email",
    "financial_status",
    "total_price",
    "current_total_price",
    "total_tax",
    "current_total_tax",
    "total_shipping_price_set",
    "customer"
  ];

  const resp = await shopifyFetch(
    `/admin/api/2025-10/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(createdAtMin)}&fields=${fields.join(",")}`,
    { method: "GET" }
  );
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Could not fetch Shopify orders (${resp.status}): ${text.slice(0, 300)}`);
  }
  const data = JSON.parse(text);
  return Array.isArray(data.orders) ? data.orders : [];
}

router.get("/agent-commissions/rules", (_req, res) => {
  return res.json({ rules: listCommissionRules() });
});

router.post("/agent-commissions/rules", (req, res) => {
  const result = upsertCommissionRule(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json(result);
});

router.delete("/agent-commissions/rules/:id", (req, res) => {
  const ok = deleteCommissionRule(String(req.params.id || ""));
  if (!ok) return res.status(404).json({ error: "Rule not found" });
  return res.status(204).end();
});

router.get("/agent-commissions/payments", (_req, res) => {
  return res.json({ payments: listPayments() });
});

router.post("/agent-commissions/payments", (req, res) => {
  const result = recordPayment(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json(result);
});

router.get("/agent-commissions/dashboard", async (req, res) => {
  try {
    const days = Number(req.query.days || 120);
    const orders = await fetchOrders(days);
    const dashboard = buildCommissionDashboard(orders);
    return res.json(dashboard);
  } catch (error) {
    console.error("Agent commissions dashboard error", error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;
