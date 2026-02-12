import { Router } from "express";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const STORE_FILE = path.join(DATA_DIR, "traceability.json");

const router = Router();

const DEFAULT_STORE = {
  openPurchaseOrders: [],
  invoices: [],
  coas: [],
  documentCaptures: [],
  incomingInspections: [],
  finishedBatches: []
};

async function readStore() {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STORE,
      ...parsed,
      openPurchaseOrders: Array.isArray(parsed?.openPurchaseOrders) ? parsed.openPurchaseOrders : [],
      invoices: Array.isArray(parsed?.invoices) ? parsed.invoices : [],
      coas: Array.isArray(parsed?.coas) ? parsed.coas : [],
      documentCaptures: Array.isArray(parsed?.documentCaptures) ? parsed.documentCaptures : [],
      incomingInspections: Array.isArray(parsed?.incomingInspections) ? parsed.incomingInspections : [],
      finishedBatches: Array.isArray(parsed?.finishedBatches) ? parsed.finishedBatches : []
    };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

async function writeStore(store) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

const normalize = (value) => String(value || "").trim();
const keyify = (value) => normalize(value).toLowerCase();
function boolFrom(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off", ""].includes(normalized)) return false;
  }
  return Boolean(value);
}

function toPdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildVehicleInspectionSheetPdf(inspection) {
  const lines = [
    "FLSS DRIVER VEHICLE INSPECTION SHEET",
    "",
    `Inspection ID: ${inspection.inspectionId || "N/A"}`,
    `Purchase Order: ${inspection.poNumber || "N/A"}`,
    `Invoice Number: ${inspection.invoiceNumber || "N/A"}`,
    `Supplier: ${inspection.supplier || "N/A"}`,
    `Printed At: ${new Date().toISOString()}`,
    "",
    "Driver Name: _________________________________",
    "Vehicle Registration: _________________________",
    "",
    "PRE-TRIP CHECKLIST (tick when complete)",
    "[ ] Tyres / wheels visual check",
    "[ ] Lights and indicators functional",
    "[ ] Mirrors and windshield clear",
    "[ ] Brakes and steering feel normal",
    "[ ] No fluid leaks visible",
    "[ ] Delivery docs loaded and secured",
    "",
    "CARGO / DELIVERY CHECKS",
    "[ ] Quantity delivered matches invoice",
    "[ ] Packaging intact",
    "[ ] Seal intact (if applicable)",
    "[ ] COA attached (if required)",
    "",
    "Comments:",
    "________________________________________________",
    "________________________________________________",
    "",
    "Driver signature: ______________________________",
    "Ops signature: _________________________________"
  ];

  const operations = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"];
  lines.forEach((line, index) => {
    if (index === 0) {
      operations.push(`(${toPdfText(line)}) Tj`);
      return;
    }
    operations.push("T*");
    operations.push(`(${toPdfText(line)}) Tj`);
  });
  operations.push("ET");

  const contentStream = operations.join("\n");
  const contentLength = Buffer.byteLength(contentStream, "utf8");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`
  ];

  let offset = "%PDF-1.4\n".length;
  const xrefEntries = ["0000000000 65535 f "];
  for (const object of objects) {
    xrefEntries.push(`${String(offset).padStart(10, "0")} 00000 n `);
    offset += Buffer.byteLength(object, "utf8");
  }

  const xrefStart = offset;
  const xref = `xref\n0 ${objects.length + 1}\n${xrefEntries.join("\n")}\n`;
  const trailer = `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  const pdf = `%PDF-1.4\n${objects.join("")}${xref}${trailer}`;
  return Buffer.from(pdf, "utf8").toString("base64");
}

async function sendPrintNodeJob({ pdfBase64, title }) {
  const printNodeApiKey = process.env.PRINTNODE_API_KEY;
  const printNodePrinterId = process.env.PRINTNODE_PRINTER_ID;
  if (!printNodeApiKey || !printNodePrinterId) {
    return {
      ok: false,
      status: 500,
      body: { error: "PRINTNODE_NOT_CONFIGURED", message: "Missing PRINTNODE env settings" }
    };
  }

  const auth = Buffer.from(printNodeApiKey + ":").toString("base64");
  const payload = {
    printerId: Number(printNodePrinterId),
    title: title || "Driver vehicle inspection sheet",
    contentType: "pdf_base64",
    content: String(pdfBase64 || "").replace(/\s/g, ""),
    source: "Flippen Lekka Traceability"
  };

  const upstream = await fetch("https://api.printnode.com/printjobs", {
    method: "POST",
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const rawBody = await upstream.text();
  let parsedBody;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = { raw: rawBody };
  }

  return {
    ok: upstream.ok,
    status: upstream.status,
    statusText: upstream.statusText,
    body: parsedBody
  };
}

router.get("/traceability/state", async (_req, res) => {
  const store = await readStore();
  res.json(store);
});

router.post("/traceability/open-pos", async (req, res) => {
  const poNumber = normalize(req.body?.poNumber);
  const supplier = normalize(req.body?.supplier);
  const flavor = normalize(req.body?.flavor);
  const expectedDate = normalize(req.body?.expectedDate);
  if (!poNumber) {
    return res.status(400).json({ error: "poNumber is required" });
  }

  const store = await readStore();
  const existing = store.openPurchaseOrders.find((po) => keyify(po.poNumber) === keyify(poNumber));
  if (existing) {
    return res.status(409).json({ error: "PO already exists" });
  }

  const record = {
    poNumber,
    supplier,
    flavor,
    expectedDate,
    status: "open",
    createdAt: new Date().toISOString()
  };
  store.openPurchaseOrders.unshift(record);
  await writeStore(store);
  return res.status(201).json({ po: record });
});

router.get("/traceability/open-pos", async (_req, res) => {
  const store = await readStore();
  const openPurchaseOrders = store.openPurchaseOrders.filter((po) => po.status !== "closed");
  res.json({ openPurchaseOrders });
});

router.post("/traceability/invoices", async (req, res) => {
  const invoiceNumber = normalize(req.body?.invoiceNumber);
  const poNumber = normalize(req.body?.poNumber);
  const supplier = normalize(req.body?.supplier);
  const flavor = normalize(req.body?.flavor);
  const receivedBatchNumber = normalize(req.body?.receivedBatchNumber);
  const pdfUrl = normalize(req.body?.pdfUrl);
  const items = Array.isArray(req.body?.items)
    ? req.body.items
        .map((item) => ({
          itemName: normalize(item?.itemName),
          lotBatchNumber: normalize(item?.lotBatchNumber),
          qty: Number(item?.qty) || 0,
          unit: normalize(item?.unit) || "units"
        }))
        .filter((item) => item.itemName)
    : [];

  if (!invoiceNumber || !poNumber) {
    return res.status(400).json({ error: "invoiceNumber and poNumber are required" });
  }

  const store = await readStore();
  const exists = store.invoices.find((invoice) => keyify(invoice.invoiceNumber) === keyify(invoiceNumber));
  if (exists) {
    return res.status(409).json({ error: "Invoice already exists" });
  }

  const invoice = {
    invoiceNumber,
    poNumber,
    supplier,
    flavor,
    receivedBatchNumber,
    pdfUrl,
    items,
    uploadedAt: new Date().toISOString()
  };
  store.invoices.unshift(invoice);

  const po = store.openPurchaseOrders.find((entry) => keyify(entry.poNumber) === keyify(poNumber));
  if (po) {
    po.status = "received";
    po.receivedAt = new Date().toISOString();
  }

  const inspection = {
    inspectionId: `INSP-${Date.now()}`,
    invoiceNumber,
    poNumber,
    supplier,
    receivedQty: Number(req.body?.receivedQty) || 0,
    vehicleReg: "",
    driverName: "",
    checks: {
      quantityConfirmed: false,
      packagingIntact: false,
      sealIntact: false,
      coaAttached: false
    },
    comments: "",
    signature: "",
    completedAt: "",
    status: "pending",
    createdAt: new Date().toISOString()
  };
  store.incomingInspections.unshift(inspection);

  await writeStore(store);
  return res.status(201).json({ invoice, generatedInspection: inspection });
});

router.get("/traceability/invoices", async (_req, res) => {
  const store = await readStore();
  res.json({ invoices: store.invoices });
});

router.post("/traceability/document-captures", async (req, res) => {
  const poNumber = normalize(req.body?.poNumber);
  const invoiceNumber = normalize(req.body?.invoiceNumber);
  const imagePath = normalize(req.body?.imagePath);
  const source = normalize(req.body?.source) || "pi-doc-station";
  const capturedAt = normalize(req.body?.capturedAt) || new Date().toISOString();

  if (!poNumber || !invoiceNumber || !imagePath) {
    return res.status(400).json({
      error: "poNumber, invoiceNumber and imagePath are required"
    });
  }

  const store = await readStore();
  const capture = {
    captureId: `CAP-${Date.now()}`,
    poNumber,
    invoiceNumber,
    imagePath,
    source,
    capturedAt,
    createdAt: new Date().toISOString()
  };
  store.documentCaptures.unshift(capture);

  const matchedInvoice = store.invoices.find(
    (invoice) => keyify(invoice.invoiceNumber) === keyify(invoiceNumber)
  );
  if (matchedInvoice) {
    matchedInvoice.captureImagePath = imagePath;
    matchedInvoice.captureLoggedAt = capture.capturedAt;
  }

  const matchedPo = store.openPurchaseOrders.find((po) => keyify(po.poNumber) === keyify(poNumber));
  if (matchedPo) {
    matchedPo.captureImagePath = imagePath;
    matchedPo.captureLoggedAt = capture.capturedAt;
  }

  const matchedInspection = store.incomingInspections.find(
    (inspection) => keyify(inspection.poNumber) === keyify(poNumber)
  );
  if (matchedInspection) {
    matchedInspection.captureImagePath = imagePath;
    matchedInspection.captureLoggedAt = capture.capturedAt;
  }

  await writeStore(store);
  return res.status(201).json({ capture, inspection: matchedInspection || null });
});

router.get("/traceability/document-captures", async (_req, res) => {
  const store = await readStore();
  return res.json({ captures: store.documentCaptures || [] });
});

router.post("/traceability/coas", async (req, res) => {
  const coaNumber = normalize(req.body?.coaNumber);
  const productName = normalize(req.body?.productName);
  const batchNumber = normalize(req.body?.batchNumber);
  const supplier = normalize(req.body?.supplier);
  const pdfUrl = normalize(req.body?.pdfUrl);
  if (!coaNumber || !batchNumber) {
    return res.status(400).json({ error: "coaNumber and batchNumber are required" });
  }

  const store = await readStore();
  const existing = store.coas.find((coa) => keyify(coa.coaNumber) === keyify(coaNumber));
  if (existing) {
    return res.status(409).json({ error: "COA already exists" });
  }

  const coa = {
    coaNumber,
    productName,
    batchNumber,
    supplier,
    pdfUrl,
    uploadedAt: new Date().toISOString()
  };
  store.coas.unshift(coa);
  await writeStore(store);
  res.status(201).json({ coa });
});

router.get("/traceability/coas", async (_req, res) => {
  const store = await readStore();
  res.json({ coas: store.coas });
});

router.get("/traceability/inspections", async (_req, res) => {
  const store = await readStore();
  res.json({ inspections: store.incomingInspections });
});

router.post("/traceability/inspections/:inspectionId/submit", async (req, res) => {
  const inspectionId = normalize(req.params?.inspectionId);
  if (!inspectionId) {
    return res.status(400).json({ error: "inspectionId is required" });
  }

  const store = await readStore();
  const inspection = store.incomingInspections.find(
    (item) => keyify(item.inspectionId) === keyify(inspectionId)
  );
  if (!inspection) {
    return res.status(404).json({ error: "Inspection not found" });
  }

  inspection.vehicleReg = normalize(req.body?.vehicleReg);
  inspection.driverName = normalize(req.body?.driverName);
  inspection.receivedQty = Number(req.body?.receivedQty) || inspection.receivedQty || 0;
  inspection.checks = {
    quantityConfirmed: boolFrom(req.body?.checks?.quantityConfirmed),
    packagingIntact: boolFrom(req.body?.checks?.packagingIntact),
    sealIntact: boolFrom(req.body?.checks?.sealIntact),
    coaAttached: boolFrom(req.body?.checks?.coaAttached)
  };
  inspection.comments = normalize(req.body?.comments);
  inspection.signature = normalize(req.body?.signature);
  inspection.status = "submitted";
  inspection.completedAt = new Date().toISOString();

  await writeStore(store);
  res.json({ inspection });
});

router.post("/traceability/inspections/:inspectionId/print-sheet", async (req, res) => {
  const inspectionId = normalize(req.params?.inspectionId);
  if (!inspectionId) {
    return res.status(400).json({ error: "inspectionId is required" });
  }

  const store = await readStore();
  const inspection = store.incomingInspections.find(
    (item) => keyify(item.inspectionId) === keyify(inspectionId)
  );
  if (!inspection) {
    return res.status(404).json({ error: "Inspection not found" });
  }

  const pdfBase64 = buildVehicleInspectionSheetPdf(inspection);
  const printResult = await sendPrintNodeJob({
    pdfBase64,
    title: `Vehicle inspection ${inspection.inspectionId}`
  });

  if (!printResult.ok) {
    return res.status(printResult.status || 502).json({
      error: "PRINT_FAILED",
      statusText: printResult.statusText,
      body: printResult.body
    });
  }

  inspection.printedAt = new Date().toISOString();
  inspection.printJob = printResult.body;
  await writeStore(store);

  return res.json({ ok: true, inspection, printJob: printResult.body, pdfBase64 });
});

router.post("/traceability/finished-batches", async (req, res) => {
  const finishedBatchNumber = normalize(req.body?.finishedBatchNumber);
  const flavor = normalize(req.body?.flavor);
  const productionDate = normalize(req.body?.productionDate);
  const notes = normalize(req.body?.notes);
  const components = Array.isArray(req.body?.components)
    ? req.body.components
        .map((component) => ({
          itemName: normalize(component?.itemName),
          sourceBatchNumber: normalize(component?.sourceBatchNumber),
          invoiceNumber: normalize(component?.invoiceNumber)
        }))
        .filter((component) => component.itemName || component.sourceBatchNumber || component.invoiceNumber)
    : [];

  if (!finishedBatchNumber || !flavor) {
    return res.status(400).json({ error: "finishedBatchNumber and flavor are required" });
  }

  const store = await readStore();
  const existingIndex = store.finishedBatches.findIndex(
    (batch) =>
      keyify(batch.finishedBatchNumber) === keyify(finishedBatchNumber) &&
      keyify(batch.flavor) === keyify(flavor)
  );
  const record = {
    finishedBatchNumber,
    flavor,
    productionDate,
    notes,
    components,
    createdAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    store.finishedBatches[existingIndex] = record;
  } else {
    store.finishedBatches.unshift(record);
  }
  await writeStore(store);
  res.status(201).json({ finishedBatch: record });
});

router.get("/traceability/lookup", async (req, res) => {
  const batchNumber = normalize(req.query?.batchNumber);
  const flavor = normalize(req.query?.flavor);
  if (!batchNumber || !flavor) {
    return res.status(400).json({ error: "batchNumber and flavor are required" });
  }

  const store = await readStore();
  const finishedBatch = store.finishedBatches.find(
    (batch) =>
      keyify(batch.finishedBatchNumber) === keyify(batchNumber) && keyify(batch.flavor) === keyify(flavor)
  );

  if (!finishedBatch) {
    return res.status(404).json({ error: "No traceability record for that finished batch + flavor" });
  }

  const sourceBatchNumbers = new Set(
    (finishedBatch.components || [])
      .map((component) => keyify(component.sourceBatchNumber))
      .filter(Boolean)
  );
  const invoiceNumbers = new Set(
    (finishedBatch.components || [])
      .map((component) => keyify(component.invoiceNumber))
      .filter(Boolean)
  );

  const invoices = store.invoices.filter((invoice) => {
    if (invoiceNumbers.has(keyify(invoice.invoiceNumber))) return true;
    if (sourceBatchNumbers.has(keyify(invoice.receivedBatchNumber))) return true;
    return (invoice.items || []).some((item) => sourceBatchNumbers.has(keyify(item.lotBatchNumber)));
  });

  const coas = store.coas.filter((coa) => sourceBatchNumbers.has(keyify(coa.batchNumber)));
  const inspections = store.incomingInspections.filter((inspection) =>
    invoices.some((invoice) => keyify(invoice.invoiceNumber) === keyify(inspection.invoiceNumber))
  );

  res.json({
    query: { batchNumber, flavor },
    finishedBatch,
    invoices,
    coas,
    inspections
  });
});

export default router;
