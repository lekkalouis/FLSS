import { getDb } from "../db/sqlite.js";

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return status || "unknown";
}

export function sanitizePrintPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return null;
  const next = { ...payload };
  if (typeof next.content === "string") {
    next.contentLength = next.content.length;
    delete next.content;
  }
  if (typeof next.pdfBase64 === "string") {
    next.pdfBase64Length = next.pdfBase64.length;
    delete next.pdfBase64;
  }
  return next;
}

export function recordPrintHistory(entry = {}) {
  const db = getDb();
  const normalized = {
    jobType: String(entry.jobType || "unknown").trim() || "unknown",
    status: normalizeStatus(entry.status),
    printerId: entry.printerId == null ? null : Number(entry.printerId) || null,
    title: entry.title == null ? null : String(entry.title || "").slice(0, 200),
    source: entry.source == null ? null : String(entry.source || "").slice(0, 120),
    upstreamStatus: entry.upstreamStatus == null ? null : Number(entry.upstreamStatus) || null,
    upstreamStatusText:
      entry.upstreamStatusText == null ? null : String(entry.upstreamStatusText || "").slice(0, 120),
    upstreamJobId: entry.upstreamJobId == null ? null : String(entry.upstreamJobId || "").slice(0, 120),
    requestPayloadJson:
      entry.requestPayload == null ? null : JSON.stringify(sanitizePrintPayload(entry.requestPayload)),
    responsePayloadJson:
      entry.responsePayload == null ? null : JSON.stringify(entry.responsePayload),
    metadataJson: entry.metadata == null ? null : JSON.stringify(entry.metadata),
    errorMessage: entry.errorMessage == null ? null : String(entry.errorMessage || "").slice(0, 600),
    createdAt: toIso(entry.createdAt) || new Date().toISOString()
  };

  const result = db
    .prepare(
      `INSERT INTO print_history (
         job_type,
         status,
         printer_id,
         title,
         source,
         upstream_status,
         upstream_status_text,
         upstream_job_id,
         request_payload_json,
         response_payload_json,
         metadata_json,
         error_message,
         created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      normalized.jobType,
      normalized.status,
      normalized.printerId,
      normalized.title,
      normalized.source,
      normalized.upstreamStatus,
      normalized.upstreamStatusText,
      normalized.upstreamJobId,
      normalized.requestPayloadJson,
      normalized.responsePayloadJson,
      normalized.metadataJson,
      normalized.errorMessage,
      normalized.createdAt
    );

  return Number(result.lastInsertRowid || 0);
}

function parseJsonValue(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function listPrintHistory(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(filters.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const where = [];
  const values = [];

  const status = String(filters.status || "").trim().toLowerCase();
  if (status) {
    where.push("status = ?");
    values.push(status);
  }

  const jobType = String(filters.jobType || "").trim().toLowerCase();
  if (jobType) {
    where.push("lower(job_type) = ?");
    values.push(jobType);
  }

  const fromIso = toIso(filters.from);
  if (fromIso) {
    where.push("created_at >= ?");
    values.push(fromIso);
  }

  const toIsoValue = toIso(filters.to);
  if (toIsoValue) {
    where.push("created_at <= ?");
    values.push(toIsoValue);
  }

  const printerId = Number(filters.printerId);
  if (Number.isInteger(printerId) && printerId > 0) {
    where.push("printer_id = ?");
    values.push(printerId);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         id,
         job_type AS jobType,
         status,
         printer_id AS printerId,
         title,
         source,
         upstream_status AS upstreamStatus,
         upstream_status_text AS upstreamStatusText,
         upstream_job_id AS upstreamJobId,
         request_payload_json AS requestPayloadJson,
         response_payload_json AS responsePayloadJson,
         metadata_json AS metadataJson,
         error_message AS errorMessage,
         created_at AS createdAt
       FROM print_history
       ${whereSql}
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, pageSize, offset)
    .map((row) => ({
      ...row,
      requestPayload: parseJsonValue(row.requestPayloadJson),
      responsePayload: parseJsonValue(row.responsePayloadJson),
      metadata: parseJsonValue(row.metadataJson)
    }));

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM print_history ${whereSql}`)
    .get(...values)?.count || 0;

  return {
    page,
    pageSize,
    total: Number(total || 0),
    rows
  };
}

export function purgePrintHistoryOlderThan(retentionDays) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const cutoff = new Date(Date.now() - Math.trunc(days) * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  const result = db.prepare("DELETE FROM print_history WHERE created_at < ?").run(cutoff);
  return Number(result.changes || 0);
}

