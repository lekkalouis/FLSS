import { Router } from "express";

import { config } from "../config.js";
import { badRequest } from "../utils/http.js";
import { renderTemplate, resolveTieredDiscount } from "../services/wholesale/engine.js";
import {
  deleteDiscountProfile,
  deleteTemplate,
  listDiscountProfiles,
  listTemplates,
  upsertDiscountProfile,
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

  const result = await sendPrintNodeJob({
    content,
    contentType: template.contentType,
    title: req.body?.title || template.name,
    printerId: template.printerId,
    copies: req.body?.copies || template.copies || 1
  });

  if (!result.ok) {
    return res.status(result.status || 502).json({
      error: "PRINTNODE_UPSTREAM",
      status: result.status,
      statusText: result.statusText,
      body: result.body
    });
  }

  return res.json({ ok: true, rendered, printJob: result.data, template });
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
