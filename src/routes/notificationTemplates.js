import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";

import { Router } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..", "..");
const dataDir = path.join(repoRoot, "data");
const templatesFile = path.join(dataDir, "notification-templates.json");

const defaultTemplates = [
  {
    id: "shopify-order-created",
    source: "shopify",
    channel: "email",
    eventKey: "order.created",
    name: "Shopify - New Order",
    subject: "Thanks for your order {{ customer.first_name }}",
    body: "Hi {{ customer.first_name }},\n\nWe received order {{ order.name }} totaling {{ order.total_price }}.\n\nThanks,\n{{ shop.name }}",
    enabled: true
  },
  {
    id: "shopify-fulfillment-created",
    source: "shopify",
    channel: "email",
    eventKey: "fulfillment.created",
    name: "Shopify - Fulfillment Update",
    subject: "Your order {{ order.name }} is on the way",
    body: "Your tracking number is {{ fulfillment.tracking_number }}.",
    enabled: true
  },
  {
    id: "flss-dispatch-overdue",
    source: "flss",
    channel: "internal",
    eventKey: "dispatch.overdue",
    name: "FLSS - Dispatch Delay Alert",
    subject: "Dispatch queue needs attention",
    body: "Order {{ order.name }} has been waiting more than {{ metrics.minutes_waiting }} minutes.",
    enabled: true
  },
  {
    id: "flss-truck-threshold",
    source: "flss",
    channel: "internal",
    eventKey: "truck.threshold_reached",
    name: "FLSS - Truck Booking Threshold",
    subject: "Truck threshold reached",
    body: "Parcel count is now {{ metrics.parcel_count }}. Trigger truck booking workflow.",
    enabled: true
  }
];

const router = Router();

function normalizeTemplate(template) {
  return {
    id: String(template.id || "").trim(),
    source: String(template.source || "flss").trim().toLowerCase(),
    channel: String(template.channel || "email").trim().toLowerCase(),
    eventKey: String(template.eventKey || "").trim(),
    name: String(template.name || "").trim(),
    subject: String(template.subject || ""),
    body: String(template.body || ""),
    enabled: Boolean(template.enabled),
    updatedAt: String(template.updatedAt || new Date().toISOString())
  };
}

async function loadTemplates() {
  try {
    const raw = await fs.readFile(templatesFile, "utf8");
    const parsed = JSON.parse(raw);
    const templates = Array.isArray(parsed.templates) ? parsed.templates : [];
    return templates
      .map((template) => normalizeTemplate(template))
      .filter((template) => template.id && template.name && template.eventKey);
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaultTemplates.map((template) => normalizeTemplate(template));
    }
    throw error;
  }
}

async function saveTemplates(templates) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    templatesFile,
    `${JSON.stringify({ templates, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

router.get("/notification-templates", async (_req, res) => {
  try {
    const templates = await loadTemplates();
    res.json({ templates });
  } catch (error) {
    res.status(500).json({ error: "Failed to load notification templates", details: error.message });
  }
});

router.post("/notification-templates", async (req, res) => {
  try {
    const payload = normalizeTemplate(req.body || {});

    if (!payload.name) return res.status(400).json({ error: "Template name is required" });
    if (!payload.eventKey) return res.status(400).json({ error: "eventKey is required" });

    const templates = await loadTemplates();
    const templateId = payload.id || `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const updatedTemplate = {
      ...payload,
      id: templateId,
      updatedAt: new Date().toISOString()
    };

    const existingIndex = templates.findIndex((template) => template.id === templateId);
    if (existingIndex >= 0) templates[existingIndex] = updatedTemplate;
    else templates.unshift(updatedTemplate);

    await saveTemplates(templates);
    return res.json({ ok: true, template: updatedTemplate });
  } catch (error) {
    return res.status(500).json({ error: "Failed to save notification template", details: error.message });
  }
});

router.delete("/notification-templates/:id", async (req, res) => {
  try {
    const templateId = String(req.params.id || "").trim();
    if (!templateId) {
      return res.status(400).json({ error: "Template id is required" });
    }

    const templates = await loadTemplates();
    const nextTemplates = templates.filter((template) => template.id !== templateId);
    if (nextTemplates.length === templates.length) {
      return res.status(404).json({ error: "Template not found" });
    }

    await saveTemplates(nextTemplates);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to delete notification template", details: error.message });
  }
});

export default router;
