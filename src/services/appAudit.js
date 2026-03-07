import { getDb } from "../db/sqlite.js";

function now() {
  return new Date().toISOString();
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ error: "JSON_SERIALIZE_FAILED" });
  }
}

export function recordAppAudit(entry = {}) {
  const db = getDb();
  const row = {
    occurred_at: String(entry.occurred_at || now()),
    actor_type: entry.actor_type ? String(entry.actor_type) : null,
    actor_id: entry.actor_id ? String(entry.actor_id) : null,
    surface: entry.surface ? String(entry.surface) : null,
    action: String(entry.action || "unknown_action"),
    entity_type: entry.entity_type ? String(entry.entity_type) : null,
    entity_id: entry.entity_id ? String(entry.entity_id) : null,
    related_entity_type: entry.related_entity_type ? String(entry.related_entity_type) : null,
    related_entity_id: entry.related_entity_id ? String(entry.related_entity_id) : null,
    status: String(entry.status || "ok"),
    request_id: entry.request_id ? String(entry.request_id) : null,
    details_json: safeJson(entry.details_json || entry.details || {})
  };

  const result = db.prepare(
    `INSERT INTO app_audit_log (
      occurred_at,
      actor_type,
      actor_id,
      surface,
      action,
      entity_type,
      entity_id,
      related_entity_type,
      related_entity_id,
      status,
      request_id,
      details_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.occurred_at,
    row.actor_type,
    row.actor_id,
    row.surface,
    row.action,
    row.entity_type,
    row.entity_id,
    row.related_entity_type,
    row.related_entity_id,
    row.status,
    row.request_id,
    row.details_json
  );

  return {
    id: result.lastInsertRowid,
    ...row
  };
}

export function listAppAuditLog(filters = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (filters.entity_type) {
    clauses.push("entity_type = ?");
    params.push(String(filters.entity_type));
  }
  if (filters.action) {
    clauses.push("action = ?");
    params.push(String(filters.action));
  }
  if (filters.actor_id) {
    clauses.push("actor_id = ?");
    params.push(String(filters.actor_id));
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(String(filters.status));
  }
  if (filters.from) {
    clauses.push("occurred_at >= ?");
    params.push(String(filters.from));
  }
  if (filters.to) {
    clauses.push("occurred_at <= ?");
    params.push(String(filters.to));
  }

  const limit = Math.max(1, Math.min(500, Number(filters.limit || 100)));
  const offset = Math.max(0, Number(filters.offset || 0));
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows = db.prepare(
    `SELECT *
     FROM app_audit_log
     ${where}
     ORDER BY occurred_at DESC, id DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return rows.map((row) => ({
    ...row,
    details: (() => {
      try {
        return row.details_json ? JSON.parse(row.details_json) : {};
      } catch {
        return {};
      }
    })()
  }));
}
