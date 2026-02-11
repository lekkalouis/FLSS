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
const boolFrom = (value) => Boolean(value);

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
