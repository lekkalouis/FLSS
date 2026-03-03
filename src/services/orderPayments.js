import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "order-payments.json");

const DEFAULT_DB = {
  bankPayments: []
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DB, null, 2));
}

function readDb() {
  ensureDataFile();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      bankPayments: Array.isArray(data.bankPayments) ? data.bankPayments : []
    };
  } catch {
    return { ...DEFAULT_DB };
  }
}

function writeDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function orderTotal(order) {
  return roundCurrency(Number(order?.current_total_price ?? order?.total_price ?? 0));
}

function orderOutstanding(order) {
  const apiOutstanding = Number(order?.current_total_outstanding_price ?? order?.total_outstanding ?? NaN);
  if (Number.isFinite(apiOutstanding)) return Math.max(0, roundCurrency(apiOutstanding));
  const total = orderTotal(order);
  const paid = Number(order?.total_paid ?? NaN);
  if (Number.isFinite(paid)) return Math.max(0, roundCurrency(total - paid));
  return total;
}

function allocatedByOrder(bankPayments) {
  const map = new Map();
  for (const payment of bankPayments) {
    for (const allocation of payment.allocations || []) {
      const key = String(allocation.orderId || "");
      if (!key) continue;
      map.set(key, roundCurrency((map.get(key) || 0) + Number(allocation.amount || 0)));
    }
  }
  return map;
}

function computeDueDate(order) {
  const paymentTerms = order?.payment_terms || null;
  const createdAt = order?.created_at ? new Date(order.created_at) : null;
  if (!(createdAt instanceof Date) || Number.isNaN(createdAt?.getTime())) return null;

  const dueInDays = Number(paymentTerms?.due_in_days ?? paymentTerms?.payment_terms_template?.due_in_days);

  if (Number.isFinite(dueInDays) && dueInDays > 0 && dueInDays < 3660) {
    const dueDate = new Date(createdAt.getTime() + dueInDays * 24 * 60 * 60 * 1000);
    return dueDate.toISOString();
  }

  if (typeof paymentTerms?.payment_schedules?.[0]?.due_at === "string") {
    return paymentTerms.payment_schedules[0].due_at;
  }

  return null;
}

export function createBankPaymentRecord(payload) {
  const amount = Number(payload?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be greater than zero" };
  }

  const allocations = Array.isArray(payload?.allocations)
    ? payload.allocations
        .map((item) => ({
          orderId: String(item?.orderId || "").trim(),
          orderName: String(item?.orderName || "").trim(),
          amount: roundCurrency(item?.amount)
        }))
        .filter((item) => item.orderId && Number.isFinite(item.amount) && item.amount > 0)
    : [];

  const allocated = roundCurrency(allocations.reduce((sum, item) => sum + item.amount, 0));
  if (allocated > amount) return { error: "Allocated total cannot exceed payment amount" };

  const db = readDb();
  const payment = {
    id: crypto.randomUUID(),
    amount: roundCurrency(amount),
    reference: String(payload?.reference || "").trim(),
    notes: String(payload?.notes || "").trim(),
    receivedAt: payload?.receivedAt || new Date().toISOString(),
    allocations,
    unallocatedAmount: roundCurrency(amount - allocated),
    createdAt: new Date().toISOString()
  };

  db.bankPayments.push(payment);
  writeDb(db);
  return { payment };
}

export function listBankPayments() {
  return readDb().bankPayments;
}

export function buildOrderPaymentsDashboard(orders) {
  const db = readDb();
  const allocatedMap = allocatedByOrder(db.bankPayments);

  const outstandingOrders = (orders || [])
    .map((order) => {
      const id = String(order.id);
      const total = orderTotal(order);
      const shopifyOutstanding = orderOutstanding(order);
      const localAllocated = roundCurrency(allocatedMap.get(id) || 0);
      const dueDate = computeDueDate(order);
      const paymentTerms = order?.payment_terms?.name || order?.payment_gateway_names?.join(", ") || "";
      return {
        orderId: id,
        orderName: order.name || `#${id}`,
        createdAt: order.created_at || null,
        customerName:
          order?.customer?.first_name || order?.customer?.last_name
            ? `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim()
            : order?.customer?.email || order?.email || "Unknown customer",
        customerEmail: order?.customer?.email || order?.email || "",
        financialStatus: order?.financial_status || "",
        paymentTerms,
        dueDate,
        total,
        shopifyOutstanding,
        locallyAllocated: localAllocated,
        localStatus: shopifyOutstanding <= 0 ? "paid" : localAllocated > 0 ? "partial" : "unpaid"
      };
    })
    .filter((order) => order.shopifyOutstanding > 0 || order.locallyAllocated > 0)
    .sort((a, b) => new Date(a.dueDate || "9999-12-31").getTime() - new Date(b.dueDate || "9999-12-31").getTime());

  const summary = outstandingOrders.reduce(
    (acc, order) => {
      acc.totalOutstanding = roundCurrency(acc.totalOutstanding + order.shopifyOutstanding);
      if (order.localStatus === "partial") acc.partialOrders += 1;
      if (order.localStatus === "unpaid") acc.unpaidOrders += 1;
      if (order.localStatus === "paid") acc.paidOrders += 1;
      return acc;
    },
    {
      orderCount: outstandingOrders.length,
      totalOutstanding: 0,
      unpaidOrders: 0,
      partialOrders: 0,
      paidOrders: 0
    }
  );

  return {
    summary,
    outstandingOrders,
    bankPayments: db.bankPayments
  };
}
