import express from "express";

import {
  buildOrderPaymentsDashboard,
  createBankPaymentRecord,
  listBankPayments
} from "../services/orderPayments.js";
import { shopifyFetch } from "../services/shopify.js";

const router = express.Router();

function isoDateDaysAgo(days) {
  const d = Number(days);
  const safeDays = Number.isFinite(d) ? Math.max(1, d) : 180;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
}

async function fetchOrders(days = 180) {
  const fields = [
    "id",
    "name",
    "email",
    "created_at",
    "financial_status",
    "current_total_price",
    "total_price",
    "current_total_outstanding_price",
    "total_outstanding",
    "payment_gateway_names",
    "payment_terms",
    "customer"
  ];

  const resp = await shopifyFetch(
    `/admin/api/2025-10/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(isoDateDaysAgo(days))}&fields=${fields.join(",")}`,
    { method: "GET" }
  );
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Could not fetch orders (${resp.status}): ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  return Array.isArray(data.orders) ? data.orders : [];
}

async function applyManualPayment(orderId, amount, reference) {
  const payload = {
    transaction: {
      kind: "sale",
      status: "success",
      amount: String(Number(amount).toFixed(2)),
      gateway: "manual",
      source_name: "external",
      receipt: reference ? { reference } : undefined
    }
  };

  const resp = await shopifyFetch(`/admin/api/2025-10/orders/${orderId}/transactions.json`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Shopify transaction failed for order ${orderId} (${resp.status}): ${text.slice(0, 250)}`);
  }
}

router.get("/order-payments/dashboard", async (req, res) => {
  try {
    const days = Number(req.query.days || 180);
    const orders = await fetchOrders(days);
    return res.json(buildOrderPaymentsDashboard(orders));
  } catch (error) {
    console.error("Order payments dashboard error", error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

router.get("/order-payments/bank-payments", (_req, res) => {
  return res.json({ payments: listBankPayments() });
});

router.post("/order-payments/allocate", async (req, res) => {
  try {
    const result = createBankPaymentRecord(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    const allocations = result.payment.allocations || [];
    for (const allocation of allocations) {
      await applyManualPayment(allocation.orderId, allocation.amount, result.payment.reference);
    }

    return res.status(201).json(result);
  } catch (error) {
    console.error("Order payments allocation error", error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;
