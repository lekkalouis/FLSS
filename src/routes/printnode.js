import { Router } from "express";
import PDFDocument from "pdfkit";

import { config } from "../config.js";
import {
  fetchWithTimeout,
  isUpstreamTimeoutError,
  sendTimeoutResponse
} from "../utils/http.js";

const router = Router();

function requirePrintNodeConfigured(res) {
  if (!config.PRINTNODE_API_KEY || !config.PRINTNODE_PRINTER_ID) {
    res.status(500).json({
      error: "PRINTNODE_NOT_CONFIGURED",
      message: "Set PRINTNODE_API_KEY and PRINTNODE_PRINTER_ID in your .env file"
    });
    return false;
  }
  return true;
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

async function sendPrintNodeJob({ pdfBase64, title, route = "POST /printnode/print" }) {
  const auth = Buffer.from(config.PRINTNODE_API_KEY + ":").toString("base64");
  const payload = {
    printerId: Number(config.PRINTNODE_PRINTER_ID),
    title: title || "Parcel Label",
    contentType: "pdf_base64",
    content: pdfBase64.replace(/\s/g, ""),
    source: "Flippen Lekka Scan Station"
  };

  const upstream = await fetchWithTimeout(
    "https://api.printnode.com/printjobs",
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
      target: "https://api.printnode.com/printjobs"
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
    return {
      ok: false,
      status: upstream.status,
      statusText: upstream.statusText,
      body: data
    };
  }

  return { ok: true, data };
}

router.post("/printnode/print", async (req, res) => {
  try {
    const { pdfBase64, title } = req.body || {};

    if (!pdfBase64) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing pdfBase64" });
    }

    if (!requirePrintNodeConfigured(res)) return;

    const result = await sendPrintNodeJob({ pdfBase64, title, route: "POST /printnode/print" });
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
    const { deliveryNote, title } = req.body || {};

    if (!deliveryNote || typeof deliveryNote !== "object") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing deliveryNote" });
    }

    if (!requirePrintNodeConfigured(res)) return;

    const pdfBase64 = await buildDeliveryNotePdfBase64(deliveryNote);
    const result = await sendPrintNodeJob({
      pdfBase64,
      title: title || `Delivery Note ${deliveryNote.orderNo || ""}`,
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
    const { invoiceUrl, title } = req.body || {};

    if (!invoiceUrl) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing invoiceUrl" });
    }

    if (!requirePrintNodeConfigured(res)) return;

    let url;
    try {
      url = new URL(invoiceUrl);
    } catch {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid invoiceUrl" });
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Invalid invoiceUrl" });
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
