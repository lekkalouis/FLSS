import express from "express";

import {
  buildOrderPaymentsDashboard,
  createBankPaymentRecord,
  listBankPayments
} from "../services/orderPayments.js";
import { config } from "../config.js";
import { shopifyFetch } from "../services/shopify.js";

const router = express.Router();

function hasShopifyConfig() {
  return Boolean(config.SHOPIFY_STORE && config.SHOPIFY_CLIENT_ID && config.SHOPIFY_CLIENT_SECRET);
}

function isoDateDaysAgo(days) {
  const d = Number(days);
  const safeDays = Number.isFinite(d) ? Math.max(1, d) : 180;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
}

async function fetchOrders(days = 180) {
  if (!hasShopifyConfig()) {
    return [];
  }

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
  const shopifyConfigured = hasShopifyConfig();
  try {
    const days = Number(req.query.days || 180);
    const orders = await fetchOrders(days);
    const dashboard = buildOrderPaymentsDashboard(orders);
    dashboard.meta = {
      degraded: !shopifyConfigured,
      source: shopifyConfigured ? "shopify_and_local" : "local_only",
      shopify: {
        configured: shopifyConfigured,
        reachable: shopifyConfigured
      }
    };
    if (!shopifyConfigured) {
      dashboard.warning = "Shopify credentials are not configured. Showing local bank payment records only.";
    }
    return res.json(dashboard);
  } catch (error) {
    console.error("Order payments dashboard error", error);
    const dashboard = buildOrderPaymentsDashboard([]);
    dashboard.meta = {
      degraded: true,
      source: "local_only",
      shopify: {
        configured: shopifyConfigured,
        reachable: false
      }
    };
    dashboard.warning = `Could not fetch Shopify orders: ${String(error?.message || error)}`;
    return res.json(dashboard);
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
    const shopifyConfigured = hasShopifyConfig();
    const sync = {
      configured: shopifyConfigured,
      attempted: allocations.length,
      succeeded: 0,
      failed: []
    };

    if (shopifyConfigured) {
      for (const allocation of allocations) {
        try {
          await applyManualPayment(allocation.orderId, allocation.amount, result.payment.reference);
          sync.succeeded += 1;
        } catch (error) {
          sync.failed.push({
            orderId: allocation.orderId,
            amount: allocation.amount,
            error: String(error?.message || error)
          });
        }
      }
    }

    const statusCode = sync.failed.length > 0 ? 202 : 201;
    const warning = !shopifyConfigured
      ? "Saved locally only because Shopify credentials are not configured."
      : sync.failed.length > 0
        ? "Saved locally, but one or more Shopify transaction sync operations failed."
        : undefined;

    return res.status(statusCode).json({
      ...result,
      sync,
      warning
    });
  } catch (error) {
    console.error("Order payments allocation error", error);
    return res.status(500).json({ error: String(error?.message || error) });
  }
});

export default router;
