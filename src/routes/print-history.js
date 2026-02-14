import { Router } from "express";

import { config } from "../config.js";
import {
  appendPrintHistoryEntry,
  getPrintHistoryEntry,
  listPrintHistory
} from "../services/print-history-store.js";

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
    title: title || "Reprint Document",
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

router.get("/print-history", async (req, res) => {
  try {
    const entries = await listPrintHistory({
      search: req.query.search,
      type: req.query.type,
      limit: req.query.limit
    });
    return res.json({ entries });
  } catch (err) {
    return res.status(500).json({ error: "PRINT_HISTORY_LIST_FAILED", message: err.message });
  }
});

router.get("/print-history/:id", async (req, res) => {
  try {
    const entry = await getPrintHistoryEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: "PRINT_HISTORY_NOT_FOUND" });
    return res.json({ entry });
  } catch (err) {
    return res.status(500).json({ error: "PRINT_HISTORY_GET_FAILED", message: err.message });
  }
});

router.post("/print-history", async (req, res) => {
  try {
    const entry = await appendPrintHistoryEntry(req.body || {});
    return res.status(201).json({ entry });
  } catch (err) {
    return res.status(400).json({ error: "PRINT_HISTORY_CREATE_FAILED", message: err.message });
  }
});

router.post("/print-history/:id/reprint", async (req, res) => {
  try {
    const entry = await getPrintHistoryEntry(req.params.id);
    if (!entry) return res.status(404).json({ error: "PRINT_HISTORY_NOT_FOUND" });

    if (entry.method === "printnode") {
      if (!entry.content) {
        return res.status(400).json({ error: "PRINT_HISTORY_MISSING_CONTENT" });
      }
      if (!requirePrintNodeConfigured(res)) return;
      const result = await sendPrintNodeJob({ pdfBase64: entry.content, title: `${entry.title} (reprint)` });
      if (!result.ok) {
        return res.status(result.status).json({
          error: "PRINTNODE_UPSTREAM",
          status: result.status,
          statusText: result.statusText,
          body: result.body
        });
      }
      return res.json({ ok: true, mode: "printnode", printJob: result.data });
    }

    return res.json({ ok: true, mode: "browser", entry });
  } catch (err) {
    return res.status(500).json({ error: "PRINT_HISTORY_REPRINT_FAILED", message: err.message });
  }
});

export default router;
