import { Router } from "express";

import { config } from "../config.js";
import { badRequest } from "../utils/http.js";
import { renderTemplate, resolveTieredDiscount } from "../services/wholesale/engine.js";
import {
  deleteDiscountProfile,
  createPrintHistoryEntry,
  deleteTemplate,
  getPrintHistoryEntry,
  getPrintSettings,
  listDiscountProfiles,
  listPrintHistory,
  listTemplates,
  upsertDiscountProfile,
  upsertPrintSettings,
  upsertTemplate
} from "../services/wholesale/store.js";

const router = Router();

async function sendPrintNodeJob({ content, title, contentType = "raw_base64", printerId, copies = 1 }) {
  if (!config.PRINTNODE_API_KEY || !config.PRINTNODE_PRINTER_ID) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "PRINTNODE_NOT_CONFIGURED",
        message: "Set PRINTNODE_API_KEY and PRINTNODE_PRINTER_ID in your .env file"
      }
    };
  }

  const auth = Buffer.from(`${config.PRINTNODE_API_KEY}:`).toString("base64");
  const payload = {
    printerId: Number(printerId || config.PRINTNODE_PRINTER_ID),
    title: title || "Wholesale Print",
    contentType,
    content,
    source: "Flippen Lekka Wholesale Automation",
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
    return {
      ok: false,
      status: upstream.status,
      statusText: upstream.statusText,
      body: data
    };
  }

  return { ok: true, data };
}

router.get("/wholesale/templates", async (_req, res) => {
  const templates = await listTemplates();
  return res.json({ templates });
});

router.post("/wholesale/templates", async (req, res) => {
  if (!req.body?.name) return badRequest(res, "Missing template name");
  const template = await upsertTemplate(req.body || {});
  return res.status(201).json({ template });
});

router.put("/wholesale/templates/:templateId", async (req, res) => {
  const templateId = String(req.params.templateId || "");
  if (!templateId) return badRequest(res, "Missing templateId");
  const template = await upsertTemplate({ ...req.body, id: templateId });
  return res.json({ template });
});

router.delete("/wholesale/templates/:templateId", async (req, res) => {
  const ok = await deleteTemplate(String(req.params.templateId || ""));
  if (!ok) return res.status(404).json({ error: "NOT_FOUND" });
  return res.status(204).end();
});

router.post("/wholesale/templates/:templateId/preview", async (req, res) => {
  const templateId = String(req.params.templateId || "");
  const templates = await listTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template) return res.status(404).json({ error: "NOT_FOUND" });

  const rendered = renderTemplate(template.content, req.body || {});
  return res.json({ rendered, template });
});

router.post("/wholesale/templates/:templateId/print", async (req, res) => {
  const templateId = String(req.params.templateId || "");
  const templates = await listTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template) return res.status(404).json({ error: "NOT_FOUND" });

  const rendered = renderTemplate(template.content, req.body || {});
  const content = template.contentType === "pdf_uri"
    ? rendered
    : Buffer.from(rendered, "utf8").toString("base64");

  const settings = await getPrintSettings();
  const title = req.body?.title || template.name;
  const copies = req.body?.copies || template.copies || settings.copies || 1;
  const result = await sendPrintNodeJob({
    content,
    contentType: template.contentType,
    title,
    printerId: template.printerId,
    copies
  });

  if (!result.ok) {
    return res.status(result.status || 502).json({
      error: "PRINTNODE_UPSTREAM",
      status: result.status,
      statusText: result.statusText,
      body: result.body
    });
  }

  await createPrintHistoryEntry({
    mode: "template",
    templateId: template.id,
    templateName: template.name,
    title,
    contentType: template.contentType,
    content,
    copies
  });

  return res.json({ ok: true, rendered, printJob: result.data, template });
});

router.get("/wholesale/print-settings", async (_req, res) => {
  const settings = await getPrintSettings();
  return res.json({ settings });
});

router.put("/wholesale/print-settings", async (req, res) => {
  const settings = await upsertPrintSettings(req.body || {});
  return res.json({ settings });
});

router.get("/wholesale/print-history", async (_req, res) => {
  const history = await listPrintHistory();
  return res.json({ history });
});

router.post("/wholesale/print-history/reprint", async (req, res) => {
  const printId = String(req.body?.printId || "");
  if (!printId) return badRequest(res, "Missing printId");
  const existing = await getPrintHistoryEntry(printId);
  if (!existing) return res.status(404).json({ error: "NOT_FOUND" });

  const result = await sendPrintNodeJob({
    content: existing.content,
    contentType: existing.contentType,
    title: existing.title,
    copies: existing.copies
  });

  if (!result.ok) {
    return res.status(result.status || 502).json({
      error: "PRINTNODE_UPSTREAM",
      status: result.status,
      statusText: result.statusText,
      body: result.body
    });
  }

  const historyEntry = await createPrintHistoryEntry({
    mode: "reprint",
    templateId: existing.templateId,
    templateName: existing.templateName,
    title: existing.title,
    contentType: existing.contentType,
    content: existing.content,
    copies: existing.copies
  });

  return res.json({ ok: true, historyEntry, printJob: result.data });
});

router.post("/wholesale/print-drop", async (req, res) => {
  const pdfBase64 = String(req.body?.pdfBase64 || "").trim();
  if (!pdfBase64) return badRequest(res, "Missing pdfBase64");

  const settings = await getPrintSettings();
  const titlePrefix = settings.titlePrefix ? `${settings.titlePrefix} ` : "";
  const title = String(req.body?.title || `${titlePrefix}Drop Print`).trim();
  const copies = Math.max(1, Number(req.body?.copies || settings.copies || 1));
  const content = `data:application/pdf;base64,${pdfBase64}`;

  const result = await sendPrintNodeJob({
    content,
    contentType: "pdf_uri",
    title,
    copies
  });

  if (!result.ok) {
    return res.status(result.status || 502).json({
      error: "PRINTNODE_UPSTREAM",
      status: result.status,
      statusText: result.statusText,
      body: result.body
    });
  }

  const historyEntry = await createPrintHistoryEntry({
    mode: "drop",
    title,
    contentType: "pdf_uri",
    content,
    copies
  });

  return res.json({ ok: true, historyEntry, printJob: result.data });
});

router.get("/wholesale/discount-profiles", async (_req, res) => {
  const profiles = await listDiscountProfiles();
  return res.json({ profiles });
});

router.post("/wholesale/discount-profiles", async (req, res) => {
  if (!req.body?.name) return badRequest(res, "Missing profile name");
  const profile = await upsertDiscountProfile(req.body || {});
  return res.status(201).json({ profile });
});

router.put("/wholesale/discount-profiles/:profileId", async (req, res) => {
  const profileId = String(req.params.profileId || "");
  if (!profileId) return badRequest(res, "Missing profileId");
  const profile = await upsertDiscountProfile({ ...req.body, id: profileId });
  return res.json({ profile });
});

router.delete("/wholesale/discount-profiles/:profileId", async (req, res) => {
  const ok = await deleteDiscountProfile(String(req.params.profileId || ""));
  if (!ok) return res.status(404).json({ error: "NOT_FOUND" });
  return res.status(204).end();
});

router.post("/wholesale/discounts/resolve", async (req, res) => {
  const body = req.body || {};
  const profiles = await listDiscountProfiles();
  const resolution = resolveTieredDiscount(
    {
      customerTags: Array.isArray(body.customerTags) ? body.customerTags : [],
      quantity: Number(body.quantity || 1),
      basePrice: Number(body.basePrice || 0),
      sku: body.sku || ""
    },
    profiles
  );

  return res.json({ resolution });
});

export default router;
