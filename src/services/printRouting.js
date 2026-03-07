import { config } from "../config.js";
import { getSystemSettings } from "./systemSettings.js";

function parsePrinterIdList(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((value) => Number(String(value || "").trim()))
    .filter((value) => Number.isInteger(value) && value > 0);
}

export function resolveDefaultPrinterId() {
  const value = Number(config.PRINTNODE_PRINTER_ID);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function resolveDeliveryNotePrinterIds() {
  const list = parsePrinterIdList(config.PRINTNODE_DELIVERY_NOTE_PRINTER_IDS);
  const single = Number(config.PRINTNODE_DELIVERY_NOTE_PRINTER_ID);
  if (Number.isInteger(single) && single > 0) {
    list.push(single);
  }
  return Array.from(new Set(list));
}

function selectDeliveryNotePrinterId(orderNo = "") {
  const deliveryPrinters = resolveDeliveryNotePrinterIds();
  if (deliveryPrinters.length) {
    const chars = String(orderNo || "").split("");
    const hash = chars.reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return deliveryPrinters[hash % deliveryPrinters.length];
  }
  return resolveDefaultPrinterId();
}

function getConfiguredDocumentPrinterId(documentType) {
  const key = String(documentType || "").trim();
  if (!key) return null;
  try {
    const configured = Number(getSystemSettings()?.printers?.documents?.[key]);
    if (Number.isInteger(configured) && configured > 0) return configured;
  } catch {
    // Ignore settings read failures and fall back to defaults.
  }
  return null;
}

export function resolveDocumentPrinterId(documentType, explicitPrinterId, options = {}) {
  const explicit = Number(explicitPrinterId);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;

  const configured = getConfiguredDocumentPrinterId(documentType);
  if (Number.isInteger(configured) && configured > 0) return configured;

  if (String(documentType || "").trim() === "deliveryNote") {
    return selectDeliveryNotePrinterId(options.orderNo || "");
  }

  return resolveDefaultPrinterId();
}

export function resolveStickerPrinterId(explicitPrinterId) {
  const explicit = Number(explicitPrinterId);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  try {
    const configured = Number(getSystemSettings()?.sticker?.stickerPrinterId);
    if (Number.isInteger(configured) && configured > 0) return configured;
  } catch {
    // Ignore settings read failures and fall back to defaults.
  }
  return resolveDefaultPrinterId();
}

export function resolveGboxPrinterId(explicitPrinterId) {
  const explicit = Number(explicitPrinterId);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  try {
    const configured = Number(getSystemSettings()?.oneClickActions?.gbox?.printerId);
    if (Number.isInteger(configured) && configured > 0) return configured;
  } catch {
    // Ignore settings read failures and fall back to defaults.
  }
  return resolveDefaultPrinterId();
}
