import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "agent-commissions.json");

const DEFAULT_DB = {
  rules: [],
  payments: []
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments : []
    };
  } catch {
    return { ...DEFAULT_DB };
  }
}

function writeDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function normalizeRate(rate) {
  const numeric = Number(rate);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.min(numeric, 100);
}

export function listCommissionRules() {
  return readDb().rules;
}

export function upsertCommissionRule(payload) {
  const db = readDb();
  const customerEmail = String(payload?.customerEmail || "").trim().toLowerCase();
  const customerId = payload?.customerId == null || payload?.customerId === "" ? null : String(payload.customerId).trim();
  const rate = normalizeRate(payload?.commissionRate);
  if (!rate && rate !== 0) return { error: "Commission rate is required" };
  if (!customerEmail && !customerId) return { error: "Provide customer email or Shopify customer ID" };

  const now = new Date().toISOString();
  const incomingId = String(payload?.id || "").trim();
  let rule = incomingId ? db.rules.find((item) => item.id === incomingId) : null;

  if (!rule) {
    rule = { id: crypto.randomUUID(), createdAt: now };
    db.rules.push(rule);
  }

  rule.customerId = customerId;
  rule.customerEmail = customerEmail;
  rule.customerName = String(payload?.customerName || "").trim();
  rule.agentName = String(payload?.agentName || "").trim();
  rule.commissionRate = rate;
  rule.active = payload?.active === undefined ? true : Boolean(payload.active);
  rule.updatedAt = now;

  writeDb(db);
  return { rule };
}

export function deleteCommissionRule(id) {
  const db = readDb();
  const before = db.rules.length;
  db.rules = db.rules.filter((item) => item.id !== id);
  if (db.rules.length === before) return false;
  writeDb(db);
  return true;
}

export function recordPayment(payload) {
  const amount = Number(payload?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Payment amount must be greater than zero" };

  const allocations = Array.isArray(payload?.allocations)
    ? payload.allocations
        .map((item) => ({
          orderId: String(item?.orderId || "").trim(),
          amount: Number(item?.amount)
        }))
        .filter((item) => item.orderId && Number.isFinite(item.amount) && item.amount > 0)
    : [];

  const allocatedTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (allocatedTotal - amount > 0.0001) {
    return { error: "Allocated amount cannot exceed payment amount" };
  }

  const db = readDb();
  const payment = {
    id: crypto.randomUUID(),
    amount,
    unallocatedAmount: Math.max(0, amount - allocatedTotal),
    reference: String(payload?.reference || "").trim(),
    notes: String(payload?.notes || "").trim(),
    receivedAt: payload?.receivedAt || new Date().toISOString(),
    allocations,
    createdAt: new Date().toISOString()
  };
  db.payments.push(payment);
  writeDb(db);
  return { payment };
}

export function listPayments() {
  return readDb().payments;
}

function roundCurrency(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

function customerMatchesRule(order, rule) {
  const customerId = order?.customer?.id != null ? String(order.customer.id) : "";
  const customerEmail = String(order?.customer?.email || order?.email || "").trim().toLowerCase();
  if (rule.customerId && customerId && rule.customerId === customerId) return true;
  if (rule.customerEmail && customerEmail && rule.customerEmail === customerEmail) return true;
  return false;
}

function orderNetAmount(order) {
  const totalPrice = Number(order?.current_total_price ?? order?.total_price ?? 0);
  const totalTax = Number(order?.current_total_tax ?? order?.total_tax ?? 0);
  const shipping = Number(
    order?.total_shipping_price_set?.shop_money?.amount ??
      order?.current_total_shipping_price_set?.shop_money?.amount ??
      0
  );
  return roundCurrency(Math.max(0, totalPrice - totalTax - shipping));
}

function allocationByOrder(payments) {
  const map = new Map();
  for (const payment of payments) {
    for (const allocation of payment.allocations || []) {
      const current = map.get(allocation.orderId) || 0;
      map.set(allocation.orderId, roundCurrency(current + Number(allocation.amount || 0)));
    }
  }
  return map;
}

export function buildCommissionDashboard(orders) {
  const db = readDb();
  const activeRules = db.rules.filter((rule) => rule.active !== false);
  const allocatedMap = allocationByOrder(db.payments);

  const commissionOrders = [];
  for (const order of orders || []) {
    const rule = activeRules.find((item) => customerMatchesRule(order, item));
    if (!rule) continue;

    const netAmount = orderNetAmount(order);
    const commissionAmount = roundCurrency((netAmount * Number(rule.commissionRate || 0)) / 100);
    const orderId = String(order.id);
    const allocatedAmount = roundCurrency(allocatedMap.get(orderId) || 0);
    const outstandingAmount = roundCurrency(Math.max(0, commissionAmount - allocatedAmount));
    let paymentStatus = "unpaid";
    if (commissionAmount <= 0 || allocatedAmount >= commissionAmount) {
      paymentStatus = "paid";
    } else if (allocatedAmount > 0) {
      paymentStatus = "partial";
    }

    commissionOrders.push({
      orderId,
      orderName: order.name || `#${order.id}`,
      createdAt: order.created_at || null,
      customerName:
        order?.customer?.first_name || order?.customer?.last_name
          ? `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim()
          : order?.customer?.email || order?.email || "Unknown customer",
      customerEmail: order?.customer?.email || order?.email || "",
      financialStatus: order?.financial_status || "",
      netAmount,
      commissionRate: Number(rule.commissionRate || 0),
      commissionAmount,
      allocatedAmount,
      outstandingAmount,
      paymentStatus,
      agentName: rule.agentName || ""
    });
  }

  commissionOrders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const summary = commissionOrders.reduce(
    (acc, item) => {
      acc.netSales = roundCurrency(acc.netSales + item.netAmount);
      acc.commissionDue = roundCurrency(acc.commissionDue + item.commissionAmount);
      acc.commissionAllocated = roundCurrency(acc.commissionAllocated + item.allocatedAmount);
      acc.commissionOutstanding = roundCurrency(acc.commissionOutstanding + item.outstandingAmount);
      if (item.paymentStatus === "paid") acc.paidOrders += 1;
      if (item.paymentStatus === "partial") acc.partialOrders += 1;
      if (item.paymentStatus === "unpaid") acc.unpaidOrders += 1;
      return acc;
    },
    {
      totalOrders: commissionOrders.length,
      netSales: 0,
      commissionDue: 0,
      commissionAllocated: 0,
      commissionOutstanding: 0,
      paidOrders: 0,
      partialOrders: 0,
      unpaidOrders: 0
    }
  );

  return {
    rules: db.rules,
    payments: db.payments,
    orders: commissionOrders,
    summary
  };
}
