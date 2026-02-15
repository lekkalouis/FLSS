import fs from "fs/promises";
import path from "path";

import { config } from "../config.js";

const MAX_SCAN_FILES = 4000;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".zpl", ".prn"]);

function docsRoot() {
  const configured = String(config.CUSTOMER_DOCS_DIR || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), "data", "customer-docs");
}

function tokenize(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function buildMatcher({ email, name, orderNo }) {
  const tokens = [
    ...tokenize(email),
    ...tokenize(name),
    ...tokenize(String(email || "").split("@")[0]),
    ...tokenize(orderNo)
  ];
  const unique = [...new Set(tokens)];
  return (haystack) => {
    if (!unique.length) return true;
    return unique.some((token) => haystack.includes(token));
  };
}

function parseOrderNo(input) {
  const value = String(input || "");
  const hashMatch = value.match(/#(\d{3,})/);
  if (hashMatch) return hashMatch[1];
  const orderMatch = value.match(/(?:order|ord|invoice|inv|waybill|dn)[-_\s]*(\d{3,})/i);
  if (orderMatch) return orderMatch[1];
  const plainMatch = value.match(/\b(\d{4,})\b/);
  return plainMatch ? plainMatch[1] : null;
}

async function walk(rootDir) {
  const out = [];
  const queue = [rootDir];
  while (queue.length && out.length < MAX_SCAN_FILES) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
        if (out.length >= MAX_SCAN_FILES) break;
      }
    }
  }
  return out;
}

export async function listCustomerDocuments(query = {}) {
  const rootDir = docsRoot();
  await fs.mkdir(rootDir, { recursive: true });
  const files = await walk(rootDir);
  const matcher = buildMatcher(query || {});

  const docs = [];
  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    const rel = path.relative(rootDir, fullPath);
    const relNormalized = rel.split(path.sep).join("/");
    const name = path.basename(fullPath);
    const haystack = `${relNormalized} ${name}`.toLowerCase();
    if (!matcher(haystack)) continue;

    let stats;
    try {
      stats = await fs.stat(fullPath);
    } catch {
      continue;
    }

    const orderNo = parseOrderNo(`${relNormalized} ${name}`);
    docs.push({
      id: relNormalized,
      name,
      relativePath: relNormalized,
      ext,
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      orderNo
    });
  }

  docs.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {
    rootDir,
    documents: docs.slice(0, 250)
  };
}

export async function resolveDocumentPath(documentId) {
  const rootDir = docsRoot();
  const rel = String(documentId || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  const fullPath = path.join(rootDir, rel);
  const normalizedRoot = path.resolve(rootDir);
  const normalizedTarget = path.resolve(fullPath);
  if (!normalizedTarget.startsWith(normalizedRoot)) return null;
  try {
    const stats = await fs.stat(normalizedTarget);
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }
  return normalizedTarget;
}

export async function readDocumentBase64(documentId) {
  const fullPath = await resolveDocumentPath(documentId);
  if (!fullPath) return null;
  const buffer = await fs.readFile(fullPath);
  return buffer.toString("base64");
}
