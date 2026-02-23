import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const ORDERS_FILE = path.join(DATA_DIR, "customer-orders.json");

const PRODUCT_CATALOG = [
  {
    id: "orig-spice-200",
    title: "Original Multi-Purpose Spice (200g)",
    sku: "FL-ORG-200",
    prices: { public: 69.9, retail: 65.9, retailer: 59.9, agent: 57.9, export: 54.9, private: 52.9, fkb: 49.9 }
  },
  {
    id: "hot-spice-200",
    title: "Hot & Spicy Multi-Purpose Spice (200g)",
    sku: "FL-HOT-200",
    prices: { public: 72.9, retail: 68.9, retailer: 61.9, agent: 59.9, export: 56.9, private: 54.9, fkb: 51.9 }
  },
  {
    id: "chutney-sprinkle-150",
    title: "Chutney Sprinkle (150g)",
    sku: "FL-CHU-150",
    prices: { public: 62.9, retail: 58.9, retailer: 52.9, agent: 50.9, export: 47.9, private: 45.9, fkb: 42.9 }
  },
  {
    id: "butter-popcorn-120",
    title: "Butter Popcorn Sprinkle (120g)",
    sku: "FL-BUT-120",
    prices: { public: 56.9, retail: 53.9, retailer: 48.9, agent: 46.9, export: 43.9, private: 41.9, fkb: 39.9 }
  }
];

function ensureOrdersFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders: [] }, null, 2));
  }
}

function readOrdersDb() {
  ensureOrdersFile();
  const raw = fs.readFileSync(ORDERS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.orders)) return { orders: [] };
    return parsed;
  } catch {
    return { orders: [] };
  }
}

function writeOrdersDb(db) {
  ensureOrdersFile();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(db, null, 2));
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function listCatalog(tier = "public") {
  const normalizedTier = String(tier || "public").toLowerCase().trim() || "public";
  return PRODUCT_CATALOG.map((item) => {
    const fallback = Number(item.prices.public || 0);
    const unitPrice = Number(item.prices[normalizedTier] ?? fallback);
    return {
      id: item.id,
      title: item.title,
      sku: item.sku,
      unitPrice: money(unitPrice),
      tierUsed: Object.hasOwn(item.prices, normalizedTier) ? normalizedTier : "public"
    };
  });
}

export function createCustomerOrder({ customer, items, notes }) {
  const catalogMap = new Map(listCatalog(customer?.tier || "public").map((item) => [item.id, item]));
  const lines = [];

  for (const rawItem of Array.isArray(items) ? items : []) {
    const productId = String(rawItem?.productId || "").trim();
    const quantity = Math.max(0, Math.floor(Number(rawItem?.quantity || 0)));
    if (!productId || quantity <= 0) continue;
    const product = catalogMap.get(productId);
    if (!product) continue;

    const lineTotal = money(product.unitPrice * quantity);
    lines.push({
      productId: product.id,
      title: product.title,
      sku: product.sku,
      quantity,
      unitPrice: product.unitPrice,
      lineTotal
    });
  }

  if (!lines.length) {
    return { error: "Please add at least one item to place an order" };
  }

  const subtotal = money(lines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0));

  const order = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    customerEmail: customer.email,
    tier: String(customer.tier || "public"),
    status: "received",
    lines,
    subtotal,
    notes: String(notes || "").trim(),
    createdAt: new Date().toISOString()
  };

  const db = readOrdersDb();
  db.orders.push(order);
  writeOrdersDb(db);
  return { order };
}

export function listCustomerOrders(customerId) {
  const db = readOrdersDb();
  return db.orders
    .filter((order) => order.customerId === customerId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
