import { Router } from "express";

import { config } from "../config.js";
import { appendPrintHistoryEntry } from "../services/print-history-store.js";

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

async function sendPrintNodeJob({ pdfBase64, title }) {
  const auth = Buffer.from(config.PRINTNODE_API_KEY + ":").toString("base64");
  const payload = {
    printerId: Number(config.PRINTNODE_PRINTER_ID),
    title: title || "Parcel Label",
    contentType: "pdf_base64",
    content: pdfBase64.replace(/\s/g, ""),
    source: "Flippen Lekka Scan Station"
  };

  const upstream = await fetch("https://api.printnode.com/printjobs", {
    method: "POST",
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

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
    const { pdfBase64, title, documentType, source, orderNo, customerName, meta } = req.body || {};

    if (!pdfBase64) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing pdfBase64" });
    }

    if (!requirePrintNodeConfigured(res)) return;

    const result = await sendPrintNodeJob({ pdfBase64, title });
    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }

    const historyEntry = await appendPrintHistoryEntry({
      title: title || "Parcel Label",
      documentType: documentType || "shipping-label",
      source: source || "scan-station",
      orderNo,
      customerName,
      method: "printnode",
      mimeType: "application/pdf",
      content: pdfBase64,
      meta
    });

    return res.json({ ok: true, printJob: result.data, historyEntry });
  } catch (err) {
    console.error("PrintNode proxy error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/printnode/print-url", async (req, res) => {
  try {
    const { invoiceUrl, title, documentType, source, orderNo, customerName, meta } = req.body || {};

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

    const invoiceResp = await fetch(url, { method: "GET" });
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
      title
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: result.status,
        statusText: result.statusText,
        body: result.body
      });
    }

    const historyEntry = await appendPrintHistoryEntry({
      title: title || "Invoice",
      documentType: documentType || "invoice",
      source: source || "scan-station",
      orderNo,
      customerName,
      method: "printnode",
      mimeType: "application/pdf",
      content: buffer.toString("base64"),
      meta: { ...(meta && typeof meta === "object" ? meta : {}), invoiceUrl: String(url) }
    });

    return res.json({ ok: true, printJob: result.data, historyEntry });
  } catch (err) {
    console.error("PrintNode invoice print error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

export default router;
