import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const HISTORY_PATH = path.join(DATA_DIR, "print-history.json");
const MAX_ENTRIES = 300;

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(HISTORY_PATH);
  } catch {
    await fs.writeFile(HISTORY_PATH, "[]\n", "utf8");
  }
}

async function readAll() {
  await ensureStore();
  const raw = await fs.readFile(HISTORY_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(entries) {
  await fs.writeFile(HISTORY_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

function toSummary(entry) {
  const { content, ...summary } = entry;
  return {
    ...summary,
    hasContent: Boolean(content),
    contentSize: content ? String(content).length : 0
  };
}

export async function appendPrintHistoryEntry(payload = {}) {
  const entries = await readAll();
  const now = new Date().toISOString();
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const entry = {
    id,
    createdAt: now,
    title: String(payload.title || "Print document").slice(0, 200),
    documentType: String(payload.documentType || "generic").slice(0, 80),
    source: String(payload.source || "manual").slice(0, 80),
    orderNo: payload.orderNo ? String(payload.orderNo).slice(0, 80) : "",
    customerName: payload.customerName ? String(payload.customerName).slice(0, 200) : "",
    method: payload.method === "printnode" ? "printnode" : "browser",
    mimeType: payload.mimeType ? String(payload.mimeType).slice(0, 120) : "text/html",
    content: typeof payload.content === "string" ? payload.content : "",
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {}
  };

  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  await writeAll(entries);
  return toSummary(entry);
}

export async function listPrintHistory({ search = "", type = "all", limit = 100 } = {}) {
  const entries = await readAll();
  const query = String(search || "").trim().toLowerCase();
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return entries
    .filter((entry) => {
      if (type && type !== "all" && entry.documentType !== type) return false;
      if (!query) return true;
      return [entry.title, entry.orderNo, entry.customerName, entry.documentType, entry.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .slice(0, cappedLimit)
    .map(toSummary);
}

export async function getPrintHistoryEntry(id) {
  const entries = await readAll();
  return entries.find((entry) => entry.id === id) || null;
}
