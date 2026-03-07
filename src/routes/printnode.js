import { Router } from "express";
import PDFDocument from "pdfkit";

import { config } from "../config.js";
import { purgePrintHistoryOlderThan, recordPrintHistory } from "../services/printHistory.js";
import { getSystemSettings } from "../services/systemSettings.js";
import {
  resolveDefaultPrinterId,
  resolveDocumentPrinterId,
  resolveGboxPrinterId,
  resolveStickerPrinterId
} from "../services/printRouting.js";
import {
  fetchWithTimeout,
  isUpstreamTimeoutError,
  sendTimeoutResponse
} from "../utils/http.js";

const router = Router();
const PRINTNODE_PRINTJOBS_URL = "https://api.printnode.com/printjobs";
const PRINTNODE_PRINTERS_URL = "https://api.printnode.com/printers";

function requirePrintNodeConfigured(res, options = {}) {
  const { allowDeliveryPrinterFallback = false } = options;
  const hasDefaultPrinter = Boolean(resolveDefaultPrinterId());
  const hasDeliveryPrinters = Boolean(resolveDocumentPrinterId("deliveryNote", null, { orderNo: "fallback" }));

  if (!config.PRINTNODE_API_KEY || (!hasDefaultPrinter && !(allowDeliveryPrinterFallback && hasDeliveryPrinters))) {
    res.status(500).json({
      error: "PRINTNODE_NOT_CONFIGURED",
      message:
        "Set PRINTNODE_API_KEY and PRINTNODE_PRINTER_ID (or PRINTNODE_DELIVERY_NOTE_PRINTER_IDS for delivery notes) in your .env file"
    });
    return false;
  }
  return true;
}

function requirePrintNodeApiConfigured(res) {
  if (!config.PRINTNODE_API_KEY) {
    res.status(500).json({
      error: "PRINTNODE_NOT_CONFIGURED",
      message: "Set PRINTNODE_API_KEY in your .env file"
    });
    return false;
  }
  return true;
}

function getPrintHistoryRetentionDays() {
  try {
    return Number(getSystemSettings()?.printHistory?.retentionDays) || 365;
  } catch {
    return 365;
  }
}

function auditPrintHistory(entry) {
  try {
    recordPrintHistory(entry);
    purgePrintHistoryOlderThan(getPrintHistoryRetentionDays());
  } catch (error) {
    console.warn("Print history write failed:", error?.message || error);
  }
}

function getIsoWeekNumber(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
}

function formatBestBeforeMonthYear(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "--/----";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${month}/${year}`;
}

function formatBatchCode(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "------/--";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  const week = String(getIsoWeekNumber(date) || 0).padStart(2, "0");
  return `${day}${month}${year}/${week}`;
}

function addMonths(dateValue, monthCount = 0) {
  const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return null;
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + Math.trunc(Number(monthCount) || 0));
  return next;
}

function mmToDots(mm, dpi = 203) {
  const numeric = Number(mm);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric / 25.4) * dpi);
}

function normalizeCalibrationNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildPplbStickerRaw({
  quantity = 52,
  bestBeforeTitleLine,
  bestBeforeDateLine,
  batchLine,
  calibration = {}
}) {
  const qty = Math.max(4, Math.trunc(Number(quantity) || 52));
  const roundedQty = Math.ceil(qty / 4) * 4;
  const rows = Math.max(1, roundedQty / 4);

  const normalizedCalibration = {
    xOffsetMm: normalizeCalibrationNumber(calibration?.xOffsetMm, 0),
    yOffsetMm: normalizeCalibrationNumber(calibration?.yOffsetMm, 0),
    labelWidthMm: normalizeCalibrationNumber(calibration?.labelWidthMm, 22),
    labelHeightMm: normalizeCalibrationNumber(calibration?.labelHeightMm, 16),
    columnGapMm: normalizeCalibrationNumber(calibration?.columnGapMm, 3),
    line1YMm: normalizeCalibrationNumber(calibration?.line1YMm, 2),
    line2YMm: normalizeCalibrationNumber(calibration?.line2YMm, 6.5),
    line3YMm: normalizeCalibrationNumber(calibration?.line3YMm, 11),
    textRotation:
      Number.isInteger(Number(calibration?.textRotation)) &&
      Number(calibration?.textRotation) >= 0 &&
      Number(calibration?.textRotation) <= 3
        ? Number(calibration?.textRotation)
        : 0
  };

  const rollWidthDots = mmToDots(100);
  const labelHeightDots = mmToDots(normalizedCalibration.labelHeightMm);
  const gapDots = mmToDots(3);
  const labelWidthDots = mmToDots(normalizedCalibration.labelWidthMm);
  const columnGapDots = mmToDots(normalizedCalibration.columnGapMm);
  const xOffsetDots = mmToDots(normalizedCalibration.xOffsetMm);
  const yOffsetDots = mmToDots(normalizedCalibration.yOffsetMm);
  const rowContentWidthDots = (labelWidthDots * 4) + (columnGapDots * 3);
  const leftMarginDots = Math.max(0, Math.floor((rollWidthDots - rowContentWidthDots) / 2));

  const lineOneY = Math.max(0, mmToDots(normalizedCalibration.line1YMm) + yOffsetDots);
  const lineTwoY = Math.max(0, mmToDots(normalizedCalibration.line2YMm) + yOffsetDots);
  const lineThreeY = Math.max(0, mmToDots(normalizedCalibration.line3YMm) + yOffsetDots);
  const textRotation = normalizedCalibration.textRotation;

  const lines = [
    "I8,A,001",
    `q${rollWidthDots}`,
    `Q${labelHeightDots},${gapDots}`,
    "S2",
    "D10"
  ];

  for (let row = 0; row < rows; row += 1) {
    lines.push("N");
    for (let col = 0; col < 4; col += 1) {
      const x = leftMarginDots + (col * (labelWidthDots + columnGapDots)) + 6 + xOffsetDots;
      lines.push(`A${x},${lineOneY},${textRotation},1,1,1,N,"${bestBeforeTitleLine}"`);
      lines.push(`A${x},${lineTwoY},${textRotation},1,1,1,N,"${bestBeforeDateLine}"`);
      lines.push(`A${x},${lineThreeY},${textRotation},1,1,1,N,"${batchLine}"`);
    }
    lines.push("P1");
  }

  return {
    roundedQty,
    rows,
    calibration: normalizedCalibration,
    raw: `${lines.join("\n")}\n`
  };
}

function formatAddressLines(section = {}) {
  const lines = [];
  if (section.name) lines.push(String(section.name));
  if (section.address1) lines.push(String(section.address1));
  if (section.address2) lines.push(String(section.address2));

  const cityLine = [section.city, section.province].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (section.zip) lines.push(String(section.zip));
  if (section.country) lines.push(String(section.country));
  if (section.phone) lines.push(`Phone: ${section.phone}`);
  if (section.email) lines.push(`Email: ${section.email}`);
  if (section.vatNumber) lines.push(`VAT Nr: ${section.vatNumber}`);

  return lines;
}

async function buildDeliveryNotePdfBase64(deliveryNote = {}) {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  const orderNo = String(deliveryNote.orderNo || "").trim();
  const title = "DELIVERY NOTE";
  doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "right" });
  doc.moveDown(0.2);

  doc.font("Helvetica-Bold").fontSize(14).text("Flippen Lekka Holdings (Pty) Ltd");
  doc.font("Helvetica").fontSize(9).text("7 Papawer Street, Blomtuin, Bellville");
  doc.text("Cape Town, Western Cape, 7530");
  doc.text("Co. Reg No: 2015/091655/07");
  doc.text("VAT Reg No: 4150279885");
  doc.text("Phone: 071 371 0499 | 078 355 6277");
  doc.text("Email: admin@flippenlekkaspices.co.za");

  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10).text(`Date: ${deliveryNote.invoiceDate || ""}`, { align: "right" });
  doc.text(`Delivery No: ${orderNo || ""}`, { align: "right" });
  if (deliveryNote.poNumber) {
    doc.text(`PO Number: ${deliveryNote.poNumber}`, { align: "right" });
  }

  const topY = doc.y + 12;
  const colGap = 20;
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - colGap) / 2;
  const leftX = doc.page.margins.left;
  const rightX = leftX + colWidth + colGap;

  doc.font("Helvetica-Bold").fontSize(11).text("Invoice to", leftX, topY, { width: colWidth });
  doc.font("Helvetica-Bold").text("Deliver to", rightX, topY, { width: colWidth });

  const leftLines = formatAddressLines(deliveryNote.billing || {});
  const rightLines = formatAddressLines(deliveryNote.shipping || {});

  let leftY = topY + 18;
  let rightY = topY + 18;
  doc.font("Helvetica").fontSize(9);
  for (const line of leftLines) {
    doc.text(line, leftX, leftY, { width: colWidth });
    leftY = doc.y + 2;
  }
  for (const line of rightLines) {
    doc.text(line, rightX, rightY, { width: colWidth });
    rightY = doc.y + 2;
  }

  doc.y = Math.max(leftY, rightY) + 16;

  const rows = Array.isArray(deliveryNote.lineItems) ? deliveryNote.lineItems : [];
  const tableX = doc.page.margins.left;
  const tableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const col1 = Math.floor(tableW * 0.22);
  const col3 = 50;
  const col2 = tableW - col1 - col3;
  const rowH = 20;

  const drawRow = (y, a, b, c, bold = false) => {
    doc.rect(tableX, y, tableW, rowH).stroke();
    doc.moveTo(tableX + col1, y).lineTo(tableX + col1, y + rowH).stroke();
    doc.moveTo(tableX + col1 + col2, y).lineTo(tableX + col1 + col2, y + rowH).stroke();
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    doc.text(a || "", tableX + 6, y + 6, { width: col1 - 12, ellipsis: true });
    doc.text(b || "", tableX + col1 + 6, y + 6, { width: col2 - 12, ellipsis: true });
    doc.text(String(c || ""), tableX + col1 + col2 + 6, y + 6, { width: col3 - 12, align: "center" });
  };

  drawRow(doc.y, "Code", "Description", "Qty", true);
  doc.y += rowH;

  if (!rows.length) {
    drawRow(doc.y, "", "No line items.", "", false);
    doc.y += rowH;
  } else {
    for (const item of rows) {
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }
      drawRow(doc.y, item.sku || "", item.title || "", Number(item.quantity || 0), false);
      doc.y += rowH;
    }
  }

  doc.moveDown(1.4);
  doc.font("Helvetica").fontSize(9);
  doc.text("Received by: ___________________", { continued: true });
  doc.text("     Receiver signature: ___________________", { continued: true });
  doc.text("     Date: ___________________");
  doc.moveDown(0.8);
  doc.fontSize(8).text(
    "Please check your goods before signing. Goods remain vested in Flippen Lekka Holdings (Pty) Ltd until paid in full.",
    { align: "center" }
  );



  return await new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    doc.on("error", reject);
    doc.end();
  });
}

async function sendPrintNodeJob({
  pdfBase64,
  pdfUri,
  rawBase64,
  contentType,
  title,
  printerId,
  jobType = "generic_print",
  metadata = null,
  route = "POST /printnode/print",
  source = "Flippen Lekka Scan Station"
}) {
  const auth = Buffer.from(config.PRINTNODE_API_KEY + ":").toString("base64");
  const hasPdfBase64 = typeof pdfBase64 === "string" && pdfBase64.trim().length > 0;
  const hasPdfUri = typeof pdfUri === "string" && pdfUri.trim().length > 0;
  const hasRawBase64 = typeof rawBase64 === "string" && rawBase64.trim().length > 0;
  const resolvedContentType =
    contentType ||
    (hasRawBase64 ? "raw_base64" : hasPdfUri ? "pdf_uri" : hasPdfBase64 ? "pdf_base64" : null);
  const content =
    resolvedContentType === "pdf_uri"
      ? String(pdfUri || "").trim()
      : resolvedContentType === "raw_base64"
      ? String(rawBase64 || "").replace(/\s/g, "")
      : String(pdfBase64 || "").replace(/\s/g, "");
  const payload = {
    printerId: Number(printerId || resolveDefaultPrinterId()),
    title: title || "Parcel Label",
    contentType: resolvedContentType,
    content,
    source
  };

  if (!resolvedContentType || !content) {
    const result = {
      ok: false,
      status: 400,
      statusText: "BAD_REQUEST",
      body: { error: "Missing print content (pdfBase64, rawBase64 or pdfUri)" }
    };
    auditPrintHistory({
      jobType,
      status: "failed",
      printerId: payload.printerId,
      title: payload.title,
      source: payload.source,
      upstreamStatus: result.status,
      upstreamStatusText: result.statusText,
      requestPayload: payload,
      responsePayload: result.body,
      metadata,
      errorMessage: "Missing print content"
    });
    return result;
  }

  if (!Number.isInteger(payload.printerId) || payload.printerId <= 0) {
    const result = {
      ok: false,
      status: 500,
      statusText: "PRINTNODE_NOT_CONFIGURED",
      body: { error: "Missing valid printerId" }
    };
    auditPrintHistory({
      jobType,
      status: "failed",
      printerId: null,
      title: payload.title,
      source: payload.source,
      upstreamStatus: result.status,
      upstreamStatusText: result.statusText,
      requestPayload: payload,
      responsePayload: result.body,
      metadata,
      errorMessage: "Missing valid printerId"
    });
    return result;
  }

  const upstream = await fetchWithTimeout(
    PRINTNODE_PRINTJOBS_URL,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    config.PRINTNODE_TIMEOUT_MS,
    {
      upstream: "printnode",
      route,
      target: PRINTNODE_PRINTJOBS_URL
    }
  );

  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) {
    const result = {
      ok: false,
      status: upstream.status,
      statusText: upstream.statusText,
      body: data
    };
    auditPrintHistory({
      jobType,
      status: "failed",
      printerId: payload.printerId,
      title: payload.title,
      source: payload.source,
      upstreamStatus: upstream.status,
      upstreamStatusText: upstream.statusText,
      requestPayload: payload,
      responsePayload: data,
      metadata,
      errorMessage: data?.message || data?.error || `PrintNode HTTP ${upstream.status}`
    });
    return result;
  }

  auditPrintHistory({
    jobType,
    status: "success",
    printerId: payload.printerId,
    title: payload.title,
    source: payload.source,
    upstreamStatus: upstream.status,
    upstreamStatusText: upstream.statusText,
    upstreamJobId: data?.id || data?.printjobId || data?.printJobId || null,
    requestPayload: payload,
    responsePayload: data,
    metadata
  });

  return { ok: true, data };
}

async function fetchBarcodePngBuffer(value) {
  const barcodeValue = String(value || "").trim() || "GBOX";
  const params = new URLSearchParams({
    data: barcodeValue,
    code: "Code128",
    multiplebarcodes: "false",
    "translate-esc": "off",
    unit: "Fit",
    dpi: "200",
    imagetype: "Png",
    rotation: "0",
    quiet: "0"
  });
  const response = await fetchWithTimeout(`https://barcode.tec-it.com/barcode.ashx?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "image/png"
    },
  }, 15000, {
    upstream: "barcode-tec-it",
    route: "buildGboxBarcodePdfBase64",
    target: `https://barcode.tec-it.com/barcode.ashx?${params.toString()}`
  });
  if (!response.ok) {
    throw new Error(`Barcode generation failed (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function buildGboxBarcodePdfBase64({ title = "GBOX", subtitle = "Gift Box", barcodeValue = "GBOX", quantity = 24 } = {}) {
  const doc = new PDFDocument({ margin: 24, size: "A4" });
  const chunks = [];
  const labelCount = Math.max(1, Math.trunc(Number(quantity) || 24));
  const barcodeBuffer = await fetchBarcodePngBuffer(barcodeValue);
  const gap = 14;
  const columns = 2;
  const labelWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - gap) / columns;
  const labelHeight = 136;
  const rowsPerPage = Math.max(
    1,
    Math.floor((doc.page.height - doc.page.margins.top - doc.page.margins.bottom + gap) / (labelHeight + gap))
  );
  const labelsPerPage = columns * rowsPerPage;

  doc.on("data", (chunk) => chunks.push(chunk));

  for (let index = 0; index < labelCount; index += 1) {
    if (index > 0 && index % labelsPerPage === 0) {
      doc.addPage();
    }
    const pageIndex = index % labelsPerPage;
    const row = Math.floor(pageIndex / columns);
    const column = pageIndex % columns;
    const x = doc.page.margins.left + (column * (labelWidth + gap));
    const y = doc.page.margins.top + (row * (labelHeight + gap));

    doc.save();
    doc.roundedRect(x, y, labelWidth, labelHeight, 12).lineWidth(1).strokeColor("#cbd5e1").fillAndStroke("#ffffff", "#cbd5e1");
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(18).text(title, x + 12, y + 10, {
      width: labelWidth - 24,
      align: "center"
    });
    if (subtitle) {
      doc.fillColor("#475569").font("Helvetica").fontSize(10).text(subtitle, x + 12, y + 34, {
        width: labelWidth - 24,
        align: "center"
      });
    }
    doc.image(barcodeBuffer, x + 14, y + 50, {
      fit: [labelWidth - 28, 50],
      align: "center",
      valign: "center"
    });
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(11).text(barcodeValue, x + 12, y + labelHeight - 24, {
      width: labelWidth - 24,
      align: "center"
    });
    doc.restore();
  }

  return await new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    doc.on("error", reject);
    doc.end();
  });
}

router.get("/printnode/printers", async (_req, res) => {
  try {
    if (!requirePrintNodeApiConfigured(res)) return;
    const auth = Buffer.from(config.PRINTNODE_API_KEY + ":").toString("base64");
    const upstream = await fetchWithTimeout(
      PRINTNODE_PRINTERS_URL,
      {
        method: "GET",
        headers: {
          Authorization: "Basic " + auth,
          Accept: "application/json"
        }
      },
      config.PRINTNODE_TIMEOUT_MS,
      {
        upstream: "printnode",
        route: "GET /printnode/printers",
        target: PRINTNODE_PRINTERS_URL
      }
    );
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: upstream.status,
        statusText: upstream.statusText,
        body: data
      });
    }
    const printers = Array.isArray(data) ? data : Array.isArray(data?.printers) ? data.printers : [];
    return res.json({ ok: true, printers, raw: data });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) return sendTimeoutResponse(res, err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/printnode/print-raw", async (req, res) => {
  try {
    const { rawBase64, title, printerId, source, metadata } = req.body || {};
    if (!rawBase64 || typeof rawBase64 !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing rawBase64" });
    }
    if (!requirePrintNodeApiConfigured(res)) return;
    const result = await sendPrintNodeJob({
      rawBase64,
      contentType: "raw_base64",
      title: title || "Raw print job",
      printerId,
      source: source || "FLSS Raw Printer",
      metadata,
      jobType: "raw_print",
      route: "POST /printnode/print-raw"
    });
    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }
    return res.json({ ok: true, printJob: result.data });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/printnode/print-best-before-stickers", async (req, res) => {
  try {
    const settings = getSystemSettings();
    const input = req.body || {};
    const commandLanguage = String(settings?.sticker?.commandLanguage || "PPLB").trim().toUpperCase() || "PPLB";
    const shelfLifeMonths = Number(settings?.sticker?.shelfLifeMonths) || 12;
    const defaultQty = Number(settings?.sticker?.defaultButtonQty) || 50;
    const calibration = settings?.sticker?.calibration || {};
    const requestedQty = Number(input.quantity);
    const baseQty = Number.isFinite(requestedQty) && requestedQty > 0 ? Math.trunc(requestedQty) : defaultQty;
    const roundedQty = Math.ceil(baseQty / 4) * 4;

    if (commandLanguage !== "PPLB") {
      return res.status(400).json({
        error: "UNSUPPORTED_STICKER_LANGUAGE",
        message: `Sticker command language '${commandLanguage}' is not supported yet. Set commandLanguage to 'PPLB'.`
      });
    }

    const productionDate = (() => {
      const raw = input.productionDate || input.batchDate || null;
      const parsed = raw ? new Date(raw) : new Date();
      return Number.isFinite(parsed.getTime()) ? parsed : new Date();
    })();

    const bestBeforeDate = addMonths(productionDate, shelfLifeMonths) || productionDate;
    const bestBeforeTitleLine = "Best Before";
    const bestBeforeDateLine = formatBestBeforeMonthYear(bestBeforeDate);
    const bestBeforeLine = `${bestBeforeTitleLine}: ${bestBeforeDateLine}`;
    const batchLine = `BN:${formatBatchCode(productionDate)}`;
    const stickerPrinterId = resolveStickerPrinterId(input.printerId);

    if (!requirePrintNodeApiConfigured(res)) return;
    if (!Number.isInteger(stickerPrinterId) || stickerPrinterId <= 0) {
      return res.status(500).json({
        error: "PRINTNODE_NOT_CONFIGURED",
        message: "Configure a sticker printer in system settings or set PRINTNODE_PRINTER_ID."
      });
    }

    const payload = buildPplbStickerRaw({
      quantity: roundedQty,
      bestBeforeTitleLine,
      bestBeforeDateLine,
      batchLine,
      calibration
    });
    const rawBase64 = Buffer.from(payload.raw, "utf8").toString("base64");
    const result = await sendPrintNodeJob({
      rawBase64,
      contentType: "raw_base64",
      title: input.title || `Best-before stickers ${bestBeforeDateLine}`,
      printerId: stickerPrinterId,
      source: "FLSS Sticker Printer",
      jobType: "best_before_sticker",
      route: "POST /printnode/print-best-before-stickers",
      metadata: {
        quantityRequested: baseQty,
        quantityPrinted: payload.roundedQty,
        rows: payload.rows,
        commandLanguage,
        productionDate: productionDate.toISOString(),
        shelfLifeMonths,
        bestBeforeTitleLine,
        bestBeforeDateLine,
        bestBeforeLine,
        batchLine,
        calibration: payload.calibration
      }
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }

    return res.json({
      ok: true,
      printJob: result.data,
      sticker: {
        quantityRequested: baseQty,
        quantityPrinted: payload.roundedQty,
        rows: payload.rows,
        productionDate: productionDate.toISOString(),
        bestBefore: formatBestBeforeMonthYear(bestBeforeDate),
        batchCode: formatBatchCode(productionDate)
      }
    });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PrintNode best-before sticker print error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/printnode/print-gbox-barcodes", async (req, res) => {
  try {
    const settings = getSystemSettings();
    const gboxSettings = settings?.oneClickActions?.gbox || {};
    const input = req.body || {};
    const title = String(input.title || gboxSettings.title || "GBOX").trim() || "GBOX";
    const subtitle = String(input.subtitle || gboxSettings.subtitle || "Gift Box").trim();
    const barcodeValue = String(input.barcodeValue || gboxSettings.barcodeValue || "GBOX").trim() || "GBOX";
    const requestedQty = Number(input.quantity);
    const baseQty = Number.isFinite(requestedQty) && requestedQty > 0
      ? Math.trunc(requestedQty)
      : Number(gboxSettings.defaultQty) || 24;
    const printerId = resolveGboxPrinterId(input.printerId);

    if (!requirePrintNodeApiConfigured(res)) return;
    if (!Number.isInteger(printerId) || printerId <= 0) {
      return res.status(500).json({
        error: "PRINTNODE_NOT_CONFIGURED",
        message: "Configure a printer for GBOX labels in One Click Actions or set PRINTNODE_PRINTER_ID."
      });
    }

    const pdfBase64 = await buildGboxBarcodePdfBase64({
      title,
      subtitle,
      barcodeValue,
      quantity: baseQty
    });
    const result = await sendPrintNodeJob({
      pdfBase64,
      title: `${title} barcode labels`,
      printerId,
      source: "FLSS GBOX Labels",
      jobType: "gbox_barcode",
      route: "POST /printnode/print-gbox-barcodes",
      metadata: {
        title,
        subtitle,
        barcodeValue,
        quantityPrinted: baseQty
      }
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }

    return res.json({
      ok: true,
      printJob: result.data,
      labels: {
        title,
        subtitle,
        barcodeValue,
        quantityPrinted: baseQty
      }
    });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PrintNode GBOX barcode print error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/printnode/print", async (req, res) => {
  try {
    const { pdfBase64, title, printerId, documentType } = req.body || {};

    if (!pdfBase64) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing pdfBase64" });
    }

    if (!requirePrintNodeConfigured(res)) return;

    const result = await sendPrintNodeJob({
      pdfBase64,
      title,
      printerId: resolveDocumentPrinterId(documentType, printerId),
      jobType: "generic_pdf",
      route: "POST /printnode/print"
    });
    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }

    return res.json({ ok: true, printJob: result.data });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PrintNode proxy error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});


router.post("/printnode/print-delivery-note", async (req, res) => {
  try {
    const { deliveryNote, title, printerId } = req.body || {};

    if (!deliveryNote || typeof deliveryNote !== "object") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing deliveryNote" });
    }

    if (!requirePrintNodeConfigured(res, { allowDeliveryPrinterFallback: true })) return;

    const selectedPrinterId = resolveDocumentPrinterId("deliveryNote", printerId, {
      orderNo: deliveryNote.orderNo
    });

    const pdfBase64 = await buildDeliveryNotePdfBase64(deliveryNote);
    const result = await sendPrintNodeJob({
      pdfBase64,
      title: title || `Delivery Note ${deliveryNote.orderNo || ""}`,
      printerId: selectedPrinterId,
      jobType: "delivery_note",
      metadata: {
        orderNo: String(deliveryNote.orderNo || "").trim() || null
      },
      route: "POST /printnode/print-delivery-note"
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }

    return res.json({ ok: true, printJob: result.data });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PrintNode delivery-note print error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/printnode/print-url", async (req, res) => {
  try {
    const { invoiceUrl, title, printerId, usePdfUri, source, documentType } = req.body || {};

    if (!invoiceUrl) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing invoiceUrl" });
    }

    if (!requirePrintNodeApiConfigured(res)) return;

    let url;
    try {
      url = new URL(invoiceUrl);
    } catch {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid invoiceUrl" });
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid invoiceUrl" });
    }

    const selectedPrinterId = resolveDocumentPrinterId(documentType, printerId);

    if (usePdfUri) {
      const result = await sendPrintNodeJob({
        pdfUri: String(url),
        title,
        printerId: selectedPrinterId,
        source: source || "Flippen Lekka Scan Station",
        jobType: "print_url",
        metadata: { invoiceUrl: String(url), mode: "pdf_uri", documentType: documentType || null },
        route: "POST /printnode/print-url"
      });

      if (!result.ok) {
        return res.status(result.status).json({
          error: "PRINTNODE_UPSTREAM",
          status: result.status,
          statusText: result.statusText,
          body: result.body
        });
      }

      return res.json({ ok: true, printJob: result.data });
    }

    const invoiceResp = await fetchWithTimeout(
      url,
      { method: "GET" },
      config.PRINTNODE_TIMEOUT_MS,
      {
        upstream: "invoice",
        route: "POST /printnode/print-url",
        target: String(url)
      }
    );
    if (!invoiceResp.ok) {
      const body = await invoiceResp.text();
      return res.status(invoiceResp.status).json({
        error: "INVOICE_FETCH_FAILED",
        status: invoiceResp.status,
        statusText: invoiceResp.statusText,
        body
      });
    }

    const buffer = Buffer.from(await invoiceResp.arrayBuffer());
    if (!buffer.length) {
      return res
        .status(502)
        .json({ error: "INVOICE_EMPTY", message: "Invoice download returned empty content" });
    }

    const result = await sendPrintNodeJob({
      pdfBase64: buffer.toString("base64"),
      title,
      printerId: selectedPrinterId,
      source: source || "Flippen Lekka Scan Station",
      jobType: "print_url",
      metadata: { invoiceUrl: String(url), mode: "pdf_download", documentType: documentType || null },
      route: "POST /printnode/print-url"
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }

    return res.json({ ok: true, printJob: result.data });
  } catch (err) {
    if (isUpstreamTimeoutError(err)) {
      return sendTimeoutResponse(res, err);
    }
    console.error("PrintNode invoice print error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

export default router;
