import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..", "..");

function readJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

const actions = readJson("metrics/actions.v1.json");
const costModel = readJson("metrics/cost-model.json");
const actionIndex = new Map(actions.map((action) => [action.action_code, action]));

function inWindow(timestamp, window) {
  const date = new Date(timestamp);
  const now = new Date();
  if (window === "today") {
    return date.toDateString() === now.toDateString();
  }
  if (window === "week") {
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - now.getDay());
    return date >= weekStart;
  }
  if (window === "month") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  return true;
}

function summarizeAction(events, ratePerHour) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event.action_code, (counts.get(event.action_code) || 0) + 1);
  }

  const byAction = [];
  let totalSecondsSaved = 0;
  let totalErrorCostSaved = 0;
  let totalManualEntryTouches = 0;
  let totalDecisionTouches = 0;
  let totalLoadWaitSecondsSaved = 0;
  let totalDistractionTouches = 0;
  const systemsTouched = new Set();

  for (const [actionCode, count] of counts.entries()) {
    const action = actionIndex.get(actionCode);
    if (!action) continue;

    (action.systems || []).forEach((system) => systemsTouched.add(system));

    const secondsSavedPerAction = Math.max((action.manual_seconds || 0) - (action.automated_seconds || 0), 0);
    const secondsSaved = secondsSavedPerAction * count;
    const errorDelta = Math.max((action.manual_error_rate || 0) - (action.automated_error_rate || 0), 0);
    const expectedErrorSaved =
      errorDelta * count * (((action.avg_fix_seconds || 0) / 3600) * ratePerHour + (action.avg_direct_cost || 0));

    totalSecondsSaved += secondsSaved;
    totalErrorCostSaved += expectedErrorSaved;
    if (action.manual_data_entry) totalManualEntryTouches += count;
    if (action.decision_action) totalDecisionTouches += count;
    if (action.distraction_risk) totalDistractionTouches += count;
    if (action.load_wait_action) {
      totalLoadWaitSecondsSaved += Math.max((action.manual_seconds || 0) - (action.automated_seconds || 0), 0) * count;
    }

    byAction.push({
      action_code: actionCode,
      label: action.label,
      category: action.category,
      count,
      seconds_saved: secondsSaved,
      error_cost_saved: expectedErrorSaved,
      manual_seconds: action.manual_seconds,
      automated_seconds: action.automated_seconds
    });
  }

  byAction.sort((a, b) => b.seconds_saved - a.seconds_saved);

  const byStage = {};
  for (const row of byAction) {
    byStage[row.category] = byStage[row.category] || { seconds_saved: 0, error_cost_saved: 0, events: 0 };
    byStage[row.category].seconds_saved += row.seconds_saved;
    byStage[row.category].error_cost_saved += row.error_cost_saved;
    byStage[row.category].events += row.count;
  }

  return {
    totals: {
      events: events.length,
      hours_saved: totalSecondsSaved / 3600,
      rand_time_value: (totalSecondsSaved / 3600) * ratePerHour,
      error_cost_avoided: totalErrorCostSaved,
      rand_value_unlocked: (totalSecondsSaved / 3600) * ratePerHour + totalErrorCostSaved,
      equivalent_fte_avoided: (totalSecondsSaved / 3600) / costModel.fte_hours_per_month,
      minutes_per_order_manual: events.length ? byAction.reduce((sum, row) => sum + row.count * (row.manual_seconds || 0), 0) / events.length / 60 : 0,
      minutes_per_order_flss: events.length ? byAction.reduce((sum, row) => sum + row.count * (row.automated_seconds || 0), 0) / events.length / 60 : 0
    },
    diagnostics: {
      systems_touched: [...systemsTouched].sort(),
      decisions_taken: totalDecisionTouches,
      manual_entries_avoided: totalManualEntryTouches,
      load_wait_minutes_saved: totalLoadWaitSecondsSaved / 60,
      distraction_risk_touches: totalDistractionTouches
    },
    by_stage: byStage,
    top_actions_time_saved: [...byAction].sort((a, b) => b.seconds_saved - a.seconds_saved).slice(0, 10),
    top_actions_error_saved: [...byAction].sort((a, b) => b.error_cost_saved - a.error_cost_saved).slice(0, 5)
  };
}

export function getActionLibrary() {
  return actions;
}

export function getCostModel() {
  return costModel;
}

export function buildSavingsSummary(events, { window = "all", hourlyRate } = {}) {
  const selectedRate = Number(hourlyRate) || costModel.default_hourly_rate;
  const filtered = events.filter((event) => inWindow(event.timestamp, window));
  return {
    window,
    hourly_rate: selectedRate,
    generated_at: new Date().toISOString(),
    ...summarizeAction(filtered, selectedRate)
  };
}
