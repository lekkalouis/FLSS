import { config } from "../config.js";
import { query, hasDatabaseConfig } from "./db.js";
import { shopifyFetch } from "./shopify.js";

const COST_CATEGORIES = new Set([
  "labour",
  "packaging",
  "courier",
  "payment_fees",
  "utilities",
  "software",
  "warehouse_overhead",
  "misc"
]);

const KPI_CACHE_MS = 5 * 60 * 1000;
let cachedKpi = null;

function monthFromDate(date) {
  return String(date).slice(0, 7);
}

function getPeriodBounds(period, month) {
  const now = new Date();
  if (period === "day") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end, month: monthFromDate(start.toISOString()) };
  }
  const [y, m] = String(month || monthFromDate(now.toISOString())).split("-").map(Number);
  const start = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const end = new Date(Date.UTC(y, m || 1, 1));
  return { start, end, month: monthFromDate(start.toISOString()) };
}

function parseShopifyLinkHeader(link) {
  if (!link) return null;
  const parts = link.split(",");
  for (const part of parts) {
    if (!part.includes('rel="next"')) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match?.[1]) continue;
    const url = new URL(match[1]);
    return url.searchParams.get("page_info");
  }
  return null;
}

async function fetchFulfilledOrders({ start, end }) {
  const base = `/admin/api/${config.SHOPIFY_API_VERSION}`;
  const all = [];
  let pageInfo = null;

  for (let i = 0; i < 20; i += 1) {
    const params = new URLSearchParams({
      status: "any",
      fulfillment_status: "fulfilled",
      limit: "250",
      fields:
        "id,total_price,created_at,processed_at,cancelled_at,financial_status,refunds,fulfillments"
    });
    if (!pageInfo) {
      params.set("created_at_min", start.toISOString());
      params.set("created_at_max", end.toISOString());
      params.set("order", "created_at asc");
    } else {
      params.set("page_info", pageInfo);
    }

    const resp = await shopifyFetch(`${base}/orders.json?${params.toString()}`, { method: "GET" });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Shopify orders fetch failed (${resp.status}): ${txt}`);
    }
    const data = await resp.json();
    const orders = Array.isArray(data.orders) ? data.orders : [];
    all.push(...orders);
    pageInfo = parseShopifyLinkHeader(resp.headers.get("link"));
    if (!pageInfo || !orders.length) break;
  }

  return all.filter((order) => {
    if (order.cancelled_at) return false;
    const fin = String(order.financial_status || "").toLowerCase();
    if (["refunded", "voided"].includes(fin)) return false;
    if (Array.isArray(order.refunds) && order.refunds.length) return false;
    return true;
  });
}

function summarizeShopifyOrders(orders) {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total_price || 0), 0);
  const averageSalePrice = totalOrders ? totalRevenue / totalOrders : 0;

  const durations = [];
  orders.forEach((order) => {
    const start = Date.parse(order.processed_at || order.created_at || "");
    if (!Number.isFinite(start)) return;
    const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
    if (!fulfillments.length) return;
    const first = fulfillments
      .map((f) => Date.parse(f.created_at || f.updated_at || ""))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    if (!Number.isFinite(first) || first < start) return;
    durations.push(Math.round((first - start) / 1000));
  });

  const avgFulfillmentSeconds = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return { totalOrders, totalRevenue, averageSalePrice, avgFulfillmentSeconds };
}

function getStaffHourlyRate(entries) {
  const explicit = entries
    .filter((e) => e.cost_name === "__staff_hourly_rate__")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  if (explicit) return Number(explicit.amount_zar || 0);
  return Number(config.FLSS_STAFF_HOURLY_RATE || 0);
}

function calculateCostPerOrder(entries, totalOrders, avgFulfillmentSeconds) {
  if (!totalOrders) {
    return { costPerOrder: 0, labourCostPerOrder: 0, staffHourlyRate: getStaffHourlyRate(entries) };
  }

  const monthlyAllocated = entries
    .filter((e) => e.allocation_type === "monthly" || e.allocation_type === "hybrid")
    .reduce((sum, e) => sum + Number(e.amount_zar || 0), 0);
  const perOrderCosts = entries
    .filter((e) => e.allocation_type === "per_order")
    .reduce((sum, e) => sum + Number(e.amount_zar || 0), 0);

  const staffHourlyRate = getStaffHourlyRate(entries);
  const labourCostPerOrder = (avgFulfillmentSeconds / 3600) * staffHourlyRate;
  const allocatedMonthlyCosts = monthlyAllocated / totalOrders;
  const costPerOrder = allocatedMonthlyCosts + perOrderCosts + labourCostPerOrder;

  return { costPerOrder, labourCostPerOrder, staffHourlyRate };
}

export async function insertCostEntry(entry) {
  if (!hasDatabaseConfig()) throw new Error("Database not configured");
  if (!COST_CATEGORIES.has(entry.cost_category)) throw new Error("Invalid cost_category");
  const sql = `
    INSERT INTO flss_cost_ledger
      (date, month, cost_category, cost_name, amount_zar, allocation_type, notes)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`;
  const params = [
    entry.date,
    monthFromDate(entry.date),
    entry.cost_category,
    entry.cost_name || null,
    Number(entry.amount_zar),
    entry.allocation_type || "monthly",
    entry.notes || null
  ];
  const result = await query(sql, params);
  return result.rows[0];
}

export async function fetchCostBreakdown(month) {
  const [entriesResult, categoriesResult] = await Promise.all([
    query(`SELECT * FROM flss_cost_ledger WHERE month = $1 ORDER BY date DESC, created_at DESC`, [
      month
    ]),
    query(`SELECT code FROM flss_cost_categories WHERE active = TRUE ORDER BY code`)
  ]);

  const rows = entriesResult.rows || [];
  const categories = (categoriesResult.rows || []).map((row) => row.code);
  const byCategory = Object.fromEntries(categories.map((code) => [code, 0]));

  rows.forEach((row) => {
    const key = row.cost_category;
    byCategory[key] = Number(byCategory[key] || 0) + Number(row.amount_zar || 0);
  });

  return { month, entries: rows, byCategory };
}

export async function computeOrderEconomics({ period = "month", month, force = false } = {}) {
  const bounds = getPeriodBounds(period, month);
  const cacheKey = `${period}:${bounds.month}`;
  if (!force && cachedKpi?.key === cacheKey && Date.now() - cachedKpi.ts < KPI_CACHE_MS) {
    return cachedKpi.value;
  }

  const orders = await fetchFulfilledOrders(bounds);
  const summary = summarizeShopifyOrders(orders);
  const costs = hasDatabaseConfig() ? await fetchCostBreakdown(bounds.month) : { entries: [], byCategory: {} };
  const costMeta = calculateCostPerOrder(
    costs.entries,
    summary.totalOrders,
    summary.avgFulfillmentSeconds
  );

  const profitPerOrder = summary.averageSalePrice - costMeta.costPerOrder;
  const marginPercent = summary.averageSalePrice
    ? (profitPerOrder / summary.averageSalePrice) * 100
    : 0;

  const payload = {
    totalOrders: summary.totalOrders,
    totalRevenue: Number(summary.totalRevenue.toFixed(2)),
    averageSalePrice: Number(summary.averageSalePrice.toFixed(2)),
    costPerOrder: Number(costMeta.costPerOrder.toFixed(2)),
    profitPerOrder: Number(profitPerOrder.toFixed(2)),
    marginPercent: Number(marginPercent.toFixed(2)),
    avgFulfillmentSeconds: summary.avgFulfillmentSeconds,
    costBreakdown: costs.byCategory,
    month: bounds.month,
    staffHourlyRate: Number(costMeta.staffHourlyRate.toFixed(2))
  };

  cachedKpi = { key: cacheKey, ts: Date.now(), value: payload };
  return payload;
}

export async function storeKpiSnapshot(payload) {
  if (!hasDatabaseConfig()) return null;
  const result = await query(
    `INSERT INTO flss_kpi_snapshots
    (date, total_orders, total_revenue, avg_sale_price, cost_per_order, profit_per_order, margin_percent, avg_fulfillment_seconds)
    VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      payload.totalOrders,
      payload.totalRevenue,
      payload.averageSalePrice,
      payload.costPerOrder,
      payload.profitPerOrder,
      payload.marginPercent,
      payload.avgFulfillmentSeconds
    ]
  );
  return result.rows[0] || null;
}
