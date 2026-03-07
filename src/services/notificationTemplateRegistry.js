import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";

export const NOTIFICATION_EVENT_KEYS = Object.freeze({
  PICKUP_READY: "pickup-ready",
  TRUCK_COLLECTION: "truck-collection"
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..", "..");
const dataDir = path.join(repoRoot, "data");
const templatesFile = path.join(dataDir, "notification-templates.json");

export const DEFAULT_NOTIFICATION_TEMPLATES = Object.freeze([
  {
    id: "flss-pickup-ready-email",
    source: "flss",
    channel: "email",
    eventKey: NOTIFICATION_EVENT_KEYS.PICKUP_READY,
    name: "FLSS - Pickup Ready",
    subject: "Order {{ order.name }} ready for collection",
    body: [
      "Hi {{ customer.name }},",
      "",
      "Your order {{ order.name }} is ready for collection.",
      "",
      "Parcels packed: {{ metrics.parcel_count }}",
      "Order weight: {{ metrics.weight_kg }} kg",
      "Collection barcode: {{ pickup.barcode_value }}",
      "Collection PIN: {{ pickup.pin }}",
      "Collection barcode image: {{ pickup.barcode_image_url }}",
      "",
      "Thank you,",
      "{{ shop.name }}"
    ].join("\n"),
    enabled: true
  },
  {
    id: "flss-truck-collection-email",
    source: "flss",
    channel: "email",
    eventKey: NOTIFICATION_EVENT_KEYS.TRUCK_COLLECTION,
    name: "FLSS - Truck Collection Request",
    subject: "Truck collection request - {{ metrics.parcel_count }} parcels",
    body: [
      "Hi {{ logistics.provider_name }},",
      "",
      "Please arrange a truck collection for today's parcels.",
      "",
      "Date: {{ logistics.collection_date }}",
      "Estimated parcels/boxes: {{ metrics.parcel_count }}",
      "Booked parcels: {{ metrics.booked_parcel_count }}",
      "Reason: {{ logistics.reason }}",
      "",
      "Thank you,",
      "{{ shop.name }}"
    ].join("\n"),
    enabled: true
  },
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
  }
]);

function buildGeneratedTemplateId() {
  return `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTemplate(template) {
  return {
    id: String(template?.id || "").trim(),
    source: String(template?.source || "flss").trim().toLowerCase(),
    channel: String(template?.channel || "email").trim().toLowerCase(),
    eventKey: String(template?.eventKey || "").trim(),
    name: String(template?.name || "").trim(),
    subject: String(template?.subject || ""),
    body: String(template?.body || ""),
    enabled: Boolean(template?.enabled),
    updatedAt: String(template?.updatedAt || new Date().toISOString())
  };
}

function getValueAtTokenPath(context, tokenPath) {
  return String(tokenPath || "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce((acc, segment) => {
      if (acc == null || typeof acc !== "object" || !(segment in acc)) return null;
      return acc[segment];
    }, context);
}

export function renderTemplateString(templateText, context = {}) {
  return String(templateText || "").replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawToken) => {
    const tokenPath = String(rawToken || "").split("|")[0].trim();
    if (!tokenPath) return "";
    const value = getValueAtTokenPath(context, tokenPath);
    if (value == null) return "";
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
    if (typeof value === "object") return "";
    return String(value);
  });
}

export function renderNotificationContent(template, context = {}) {
  const normalizedTemplate = normalizeTemplate(template);
  const subject = renderTemplateString(normalizedTemplate.subject, context).trim();
  const text = renderTemplateString(normalizedTemplate.body, context).trim();
  const html = text
    .split(/\r?\n\r?\n/)
    .map((paragraph) => paragraph.split(/\r?\n/).join("<br />"))
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("");

  return {
    subject,
    text,
    html
  };
}

export async function loadNotificationTemplates() {
  try {
    const raw = await fs.readFile(templatesFile, "utf8");
    const parsed = JSON.parse(raw);
    const templates = Array.isArray(parsed.templates) ? parsed.templates : [];
    return templates
      .map((template) => normalizeTemplate(template))
      .filter((template) => template.id && template.name && template.eventKey);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return DEFAULT_NOTIFICATION_TEMPLATES.map((template) => normalizeTemplate(template));
    }
    throw error;
  }
}

export async function saveNotificationTemplates(templates) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    templatesFile,
    `${JSON.stringify({ templates, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

export async function upsertNotificationTemplate(template) {
  const payload = normalizeTemplate(template);
  if (!payload.name) {
    const err = new Error("Template name is required");
    err.code = "INVALID_TEMPLATE";
    throw err;
  }
  if (!payload.eventKey) {
    const err = new Error("eventKey is required");
    err.code = "INVALID_TEMPLATE";
    throw err;
  }

  const templates = await loadNotificationTemplates();
  const templateId = payload.id || buildGeneratedTemplateId();
  const updatedTemplate = {
    ...payload,
    id: templateId,
    updatedAt: new Date().toISOString()
  };
  const existingIndex = templates.findIndex((entry) => entry.id === templateId);
  if (existingIndex >= 0) {
    templates[existingIndex] = updatedTemplate;
  } else {
    templates.unshift(updatedTemplate);
  }
  await saveNotificationTemplates(templates);
  return updatedTemplate;
}

export async function deleteNotificationTemplate(templateId) {
  const cleanTemplateId = String(templateId || "").trim();
  if (!cleanTemplateId) {
    const err = new Error("Template id is required");
    err.code = "INVALID_TEMPLATE";
    throw err;
  }

  const templates = await loadNotificationTemplates();
  const nextTemplates = templates.filter((template) => template.id !== cleanTemplateId);
  if (nextTemplates.length === templates.length) {
    const err = new Error("Template not found");
    err.code = "TEMPLATE_NOT_FOUND";
    throw err;
  }
  await saveNotificationTemplates(nextTemplates);
}

export async function resolveNotificationTemplate({ templateId, eventKey, channel = "email" } = {}) {
  const cleanTemplateId = String(templateId || "").trim();
  const cleanEventKey = String(eventKey || "").trim();
  const cleanChannel = String(channel || "email").trim().toLowerCase() || "email";
  const templates = await loadNotificationTemplates();

  const byId = cleanTemplateId
    ? templates.find((template) => template.id === cleanTemplateId && template.channel === cleanChannel && template.enabled)
    : null;
  if (byId) return byId;

  const byEvent = cleanEventKey
    ? templates.find((template) => template.eventKey === cleanEventKey && template.channel === cleanChannel && template.enabled)
    : null;
  if (byEvent) return byEvent;

  const fallback = DEFAULT_NOTIFICATION_TEMPLATES
    .map((template) => normalizeTemplate(template))
    .find((template) => template.eventKey === cleanEventKey && template.channel === cleanChannel);

  return fallback || null;
}
