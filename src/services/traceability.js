import XLSX from "xlsx";

import { config } from "../config.js";
import { buildIncomingVehicleInspectionSheet } from "./incomingVehicleInspection.js";
import { shopifyFetch } from "./shopify.js";

const SAMPLE_PURCHASE_ORDERS = [
  {
    "Supplier Name": "GR spices",
    "Purchase Order Number": "PO-1001",
    "Invoice Number": "INV-GR-4501",
    Date: "2025-02-24",
    "Product Code": "RM-GR-CHILLI",
    Flavor: "Peri Peri",
    "Material Name": "Chilli Blend",
    "Batch Number": "260225/08",
    Quantity: 120,
    "COA Reference": "COA-GR-4501"
  },
  {
    "Supplier Name": "VIP plastics",
    "Purchase Order Number": "PO-1002",
    "Invoice Number": "INV-VIP-779",
    Date: "2025-02-25",
    "Product Code": "PK-VIP-BTL500",
    Flavor: "Peri Peri",
    "Material Name": "500ml PET Bottle",
    "Batch Number": "260225/08",
    Quantity: 5000,
    "COA Reference": "COC-VIP-779"
  },
  {
    "Supplier Name": "ID spices",
    "Purchase Order Number": "PO-1003",
    "Invoice Number": "INV-ID-3902",
    Date: "2025-02-26",
    "Product Code": "RM-ID-GARLIC",
    Flavor: "Peri Peri",
    "Material Name": "Garlic Powder",
    "Batch Number": "260225/08",
    Quantity: 80,
    "COA Reference": "COA-ID-3902"
  }
];

const SAMPLE_COA_ROWS = [
  {
    "Supplier Name": "GR spices",
    "Batch Number": "260225/08",
    "COA/COC Type": "COA",
    "COA Reference": "COA-GR-4501",
    "COA Document": "docs/coa/gr-spices-coa-4501.pdf"
  },
  {
    "Supplier Name": "VIP plastics",
    "Batch Number": "260225/08",
    "COA/COC Type": "COC",
    "COA Reference": "COC-VIP-779",
    "COA Document": "docs/coc/vip-plastics-coc-779.pdf"
  },
  {
    "Supplier Name": "ID spices",
    "Batch Number": "260225/08",
    "COA/COC Type": "COA",
    "COA Reference": "COA-ID-3902",
    "COA Document": "docs/coa/id-spices-coa-3902.pdf"
  }
];

function buildTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(SAMPLE_PURCHASE_ORDERS), "PurchaseOrders");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(SAMPLE_COA_ROWS), "COA");
  return workbook;
}

export function buildTraceabilityTemplateBuffer() {
  const workbook = buildTemplateWorkbook();
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function normalizeText(value) {
  return String(value || "").trim();
}

export function parseBatchCode(batchCode) {
  const cleaned = normalizeText(batchCode).replace(/\s+/g, "");
  const match = cleaned.match(/^(\d{2})(\d{2})(\d{2})\/(\d{2})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const shortYear = Number(match[3]);
  const week = Number(match[4]);
  const year = 2000 + shortYear;

  if (day < 1 || day > 31 || month < 1 || month > 12 || week < 1 || week > 53) {
    return null;
  }

  return { day, month, shortYear, year, week, normalized: `${match[1]}${match[2]}${match[3]}/${match[4]}` };
}

function getIsoWeekDateRange(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const start = new Date(week1Monday);
  start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeRows(rows, type) {
  return rows.map((row, idx) => ({
    id: `${type}-${idx + 1}`,
    supplierName: normalizeText(row["Supplier Name"] || row.supplierName),
    purchaseOrderNumber: normalizeText(row["Purchase Order Number"] || row.purchaseOrderNumber),
    invoiceNumber: normalizeText(row["Invoice Number"] || row.invoiceNumber),
    date: toIsoDate(row.Date || row.date),
    productCode: normalizeText(row["Product Code"] || row.productCode),
    flavor: normalizeText(row.Flavor || row.flavor),
    materialName: normalizeText(row["Material Name"] || row.materialName),
    batchNumber: normalizeText(row["Batch Number"] || row.batchNumber),
    quantity: Number(row.Quantity || row.quantity || 0),
    coaReference: normalizeText(row["COA Reference"] || row.coaReference),
    coaType: normalizeText(row["COA/COC Type"] || row.coaType),
    coaDocument: normalizeText(row["COA Document"] || row.coaDocument)
  }));
}

function decodeWorkbookBase64(base64) {
  return XLSX.read(Buffer.from(base64, "base64"), { type: "buffer", cellDates: true });
}

function readSheetRows(workbook, sheetName) {
  if (!workbook.Sheets[sheetName]) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
}

export function loadTraceabilityWorkbook({ purchasesFileBase64, coaFileBase64 } = {}) {
  const workbook = purchasesFileBase64 ? decodeWorkbookBase64(purchasesFileBase64) : buildTemplateWorkbook();
  const coaWorkbook = coaFileBase64 ? decodeWorkbookBase64(coaFileBase64) : workbook;

  return {
    purchases: normalizeRows(readSheetRows(workbook, "PurchaseOrders"), "purchase"),
    coa: normalizeRows(readSheetRows(coaWorkbook, "COA"), "coa")
  };
}

async function fetchShopifySales({ startDate, endDate, flavor }) {
  if (!config.SHOPIFY_STORE || !config.SHOPIFY_CLIENT_ID || !config.SHOPIFY_CLIENT_SECRET) {
    return [];
  }

  const startIso = `${startDate.toISOString().slice(0, 10)}T00:00:00Z`;
  const endIso = `${endDate.toISOString().slice(0, 10)}T23:59:59Z`;

  let response;
  try {
    response = await shopifyFetch(
      `/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min=${encodeURIComponent(startIso)}&created_at_max=${encodeURIComponent(endIso)}`,
      { method: "GET" }
    );
  } catch {
    return [];
  }

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => ({}));
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const flavorNeedle = normalizeText(flavor).toLowerCase();

  return orders
    .flatMap((order) => {
      const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
      return lineItems
        .filter((line) => {
          if (!flavorNeedle) return true;
          return `${line.title || ""} ${line.sku || ""}`.toLowerCase().includes(flavorNeedle);
        })
        .map((line) => ({
          orderNumber: order.name || order.order_number || "",
          invoiceNumber: order.name || "",
          customer: order.customer?.first_name
            ? `${order.customer.first_name} ${order.customer.last_name || ""}`.trim()
            : order.email || "Unknown customer",
          createdAt: order.created_at,
          flavor: line.title || line.sku || "",
          quantity: Number(line.quantity || 0)
        }));
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export async function buildTraceabilityReport({ batchNumber, flavor, purchasesFileBase64, coaFileBase64 }) {
  const parsedBatch = parseBatchCode(batchNumber);
  if (!parsedBatch) {
    return { error: "Invalid batch format. Expected DDMMYY/WW, e.g. 260225/08." };
  }

  const { start, end } = getIsoWeekDateRange(parsedBatch.year, parsedBatch.week);
  const { purchases, coa } = loadTraceabilityWorkbook({ purchasesFileBase64, coaFileBase64 });
  const flavorNeedle = normalizeText(flavor).toLowerCase();

  const purchasesForBatch = purchases.filter((row) => {
    const batchMatch = normalizeText(row.batchNumber) === parsedBatch.normalized;
    const flavorMatch = !flavorNeedle || normalizeText(row.flavor).toLowerCase().includes(flavorNeedle);
    return batchMatch && flavorMatch;
  });

  const coaMap = new Map(coa.map((entry) => [normalizeText(entry.batchNumber), entry]));
  const purchasesWithDocs = purchasesForBatch.map((po) => ({
    ...po,
    coa: coaMap.get(normalizeText(po.batchNumber)) || null,
    incomingVehicleInspection: buildIncomingVehicleInspectionSheet({
      supplierName: po.supplierName,
      purchaseOrderNumber: po.purchaseOrderNumber,
      date: po.date
    })
  }));

  const sales = await fetchShopifySales({ startDate: start, endDate: end, flavor });

  return {
    batch: {
      ...parsedBatch,
      weekStart: start.toISOString().slice(0, 10),
      weekEnd: end.toISOString().slice(0, 10)
    },
    flavor: normalizeText(flavor),
    sales,
    purchases: purchasesWithDocs
  };
}
