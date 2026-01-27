export function normalizeParcelPerfectClass(value) {
  if (!value) return value;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (lower === "quote") return "Quote";
  if (lower === "collection") return "Collection";
  if (lower === "waybill") return "Waybill";
  if (lower === "auth") return "Auth";
  return raw;
}
