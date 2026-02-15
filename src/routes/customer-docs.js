import { Router } from "express";

import { config } from "../config.js";
import { getSmtpTransport } from "../services/email.js";
import {
  listCustomerDocuments,
  readDocumentBase64
} from "../services/customer-docs.js";

const router = Router();

function hasEmailConfig() {
  return Boolean(config.SMTP_HOST && config.SMTP_FROM);
}

router.get("/customer-docs", async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim();
    const name = String(req.query?.name || "").trim();
    const orderNo = String(req.query?.orderNo || "").trim();

    const result = await listCustomerDocuments({ email, name, orderNo });
    return res.json({
      documents: result.documents,
      configuredRoot: result.rootDir,
      emailConfigured: hasEmailConfig()
    });
  } catch (err) {
    console.error("Customer docs list error:", err);
    return res.status(500).json({
      error: "CUSTOMER_DOCS_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/customer-docs/email", async (req, res) => {
  try {
    const { customerEmail, customerName, documentIds = [], subject, message } = req.body || {};

    if (!hasEmailConfig()) {
      return res.status(501).json({
        error: "EMAIL_NOT_CONFIGURED",
        message: "Set SMTP_HOST and SMTP_FROM in .env to send customer emails."
      });
    }

    if (!customerEmail) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing customerEmail" });
    }

    if (!Array.isArray(documentIds) || !documentIds.length) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Select at least one document" });
    }

    const attachments = [];
    for (const id of documentIds.slice(0, 8)) {
      const base64 = await readDocumentBase64(id);
      if (!base64) continue;
      attachments.push({
        filename: String(id).split("/").pop() || "document.pdf",
        content: base64,
        encoding: "base64"
      });
    }

    if (!attachments.length) {
      return res.status(404).json({ error: "NOT_FOUND", message: "No valid documents selected" });
    }

    const transport = getSmtpTransport();
    await transport.sendMail({
      from: config.SMTP_FROM,
      to: customerEmail,
      subject: subject || `Documents for ${customerName || customerEmail}`,
      text:
        message ||
        `Hi ${customerName || "there"},\n\nPlease find your requested documents attached.\n\nRegards,\nFLSS Team`,
      attachments
    });

    return res.json({ ok: true, sent: attachments.length });
  } catch (err) {
    console.error("Customer docs email error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

router.post("/customer-docs/print", async (req, res) => {
  try {
    const { documentId, copies = 1, title } = req.body || {};
    if (!documentId) {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing documentId" });
    }
    if (!config.PRINTNODE_API_KEY || !config.PRINTNODE_PRINTER_ID) {
      return res.status(500).json({
        error: "PRINTNODE_NOT_CONFIGURED",
        message: "Set PRINTNODE_API_KEY and PRINTNODE_PRINTER_ID in your .env file"
      });
    }

    const base64 = await readDocumentBase64(documentId);
    if (!base64) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Document was not found" });
    }

    const auth = Buffer.from(`${config.PRINTNODE_API_KEY}:`).toString("base64");
    const payload = {
      printerId: Number(config.PRINTNODE_PRINTER_ID),
      title: title || `Customer doc: ${String(documentId).split("/").pop()}`,
      contentType: "pdf_base64",
      content: base64,
      source: "Flippen Lekka Customer Directory",
      qty: Math.max(1, Number(copies || 1))
    };

    const upstream = await fetch("https://api.printnode.com/printjobs", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
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
      return res.status(upstream.status).json({
        error: "PRINTNODE_UPSTREAM",
        status: upstream.status,
        statusText: upstream.statusText,
        body: data
      });
    }

    return res.json({ ok: true, printJob: data });
  } catch (err) {
    console.error("Customer docs print error:", err);
    return res.status(502).json({
      error: "UPSTREAM_ERROR",
      message: String(err?.message || err)
    });
  }
});

export default router;
