import crypto from "crypto";

import { findAction, getCostModel } from "./metrics-catalog.js";
import { buildEventSavings } from "./savings-engine.js";

const events = [];

export function listEvents(limit = 200) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 5000));
  return events.slice(-safeLimit).reverse();
}

export function getAllEvents() {
  return [...events];
}

export function emitEvent(payload = {}) {
  const action = findAction(payload.action_code);
  if (!action) {
    const err = new Error(`Unknown action_code: ${payload.action_code}`);
    err.statusCode = 400;
    throw err;
  }

  const costModel = getCostModel();
  const hourlyRate = Number(payload.hourly_rate || costModel.default_hourly_rate);
  const timestamp = payload.timestamp || new Date().toISOString();

  const event = {
    id: crypto.randomUUID(),
    order_id: String(payload.order_id || "unknown"),
    action_code: action.action_code,
    label: action.label,
    category: action.category,
    system: String(payload.system || "FLSS"),
    automated: payload.automated !== false,
    timestamp,
    admin_action: Boolean(action.admin_action),
    manual_seconds: action.manual_seconds,
    automated_seconds: action.automated_seconds,
    manual_error_rate: action.manual_error_rate,
    automated_error_rate: action.automated_error_rate,
    avg_fix_seconds: action.avg_fix_seconds,
    avg_direct_cost: action.avg_direct_cost,
    savings: buildEventSavings(action, hourlyRate)
  };

  events.push(event);
  return event;
}

export function emitEventsBulk(rows = []) {
  return rows.map((row) => emitEvent(row));
}
