const RANGE_TO_MS = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000
};

export function buildEventSavings(action, hourlyRate) {
  const timeSavedSeconds = Math.max(action.manual_seconds - action.automated_seconds, 0);
  const timeSavedHours = timeSavedSeconds / 3600;
  const timeValueSaved = timeSavedHours * hourlyRate;

  const errorProbabilityDelta = Math.max(action.manual_error_rate - action.automated_error_rate, 0);
  const expectedFixValueSaved =
    errorProbabilityDelta * ((action.avg_fix_seconds / 3600) * hourlyRate + action.avg_direct_cost);

  return {
    time_saved_seconds: timeSavedSeconds,
    time_value_saved: timeValueSaved,
    expected_error_cost_saved: expectedFixValueSaved,
    total_value_saved: timeValueSaved + expectedFixValueSaved,
    error_probability_delta: errorProbabilityDelta
  };
}

function rangeStart(range, nowTs) {
  if (!RANGE_TO_MS[range]) return 0;
  return nowTs - RANGE_TO_MS[range];
}

function emptyCategorySummary() {
  return {
    count: 0,
    time_saved_seconds: 0,
    expected_error_cost_saved: 0,
    total_value_saved: 0
  };
}

export function summarizeEvents(events, options = {}) {
  const nowTs = Date.now();
  const range = options.range || "month";
  const hourlyRate = Number(options.hourlyRate || 250);
  const fteHoursPerMonth = Number(options.fteHoursPerMonth || 173.33);
  const startTs = rangeStart(range, nowTs);

  const filtered = events.filter((event) => {
    const ts = new Date(event.timestamp).getTime();
    return Number.isFinite(ts) && ts >= startTs;
  });

  const totals = {
    events: filtered.length,
    time_saved_seconds: 0,
    expected_error_cost_saved: 0,
    total_value_saved: 0
  };

  const byCategory = {};
  const byAction = {};
  const perOrder = {};

  for (const event of filtered) {
    totals.time_saved_seconds += event.savings.time_saved_seconds;
    totals.expected_error_cost_saved += event.savings.expected_error_cost_saved;
    totals.total_value_saved += event.savings.total_value_saved;

    if (!byCategory[event.category]) byCategory[event.category] = emptyCategorySummary();
    const categoryRow = byCategory[event.category];
    categoryRow.count += 1;
    categoryRow.time_saved_seconds += event.savings.time_saved_seconds;
    categoryRow.expected_error_cost_saved += event.savings.expected_error_cost_saved;
    categoryRow.total_value_saved += event.savings.total_value_saved;

    if (!byAction[event.action_code]) {
      byAction[event.action_code] = {
        action_code: event.action_code,
        label: event.label,
        count: 0,
        time_saved_seconds: 0,
        expected_error_cost_saved: 0,
        total_value_saved: 0
      };
    }
    const actionRow = byAction[event.action_code];
    actionRow.count += 1;
    actionRow.time_saved_seconds += event.savings.time_saved_seconds;
    actionRow.expected_error_cost_saved += event.savings.expected_error_cost_saved;
    actionRow.total_value_saved += event.savings.total_value_saved;

    const orderId = event.order_id || "unknown";
    if (!perOrder[orderId]) {
      perOrder[orderId] = {
        manual_seconds: 0,
        automated_seconds: 0,
        is_admin_seconds: 0,
        is_admin_manual_seconds: 0
      };
    }
    perOrder[orderId].manual_seconds += event.manual_seconds;
    perOrder[orderId].automated_seconds += event.automated_seconds;
    if (event.admin_action) {
      perOrder[orderId].is_admin_seconds += event.automated_seconds;
      perOrder[orderId].is_admin_manual_seconds += event.manual_seconds;
    }
  }

  const actionRows = Object.values(byAction);
  const topActionsByTime = [...actionRows]
    .sort((a, b) => b.time_saved_seconds - a.time_saved_seconds)
    .slice(0, 10);
  const topActionsByError = [...actionRows]
    .sort((a, b) => b.expected_error_cost_saved - a.expected_error_cost_saved)
    .slice(0, 5);

  const orderRows = Object.values(perOrder).filter((row) => row.is_admin_manual_seconds > 0);
  const avgManualAdminSeconds =
    orderRows.length > 0
      ? orderRows.reduce((acc, row) => acc + row.is_admin_manual_seconds, 0) / orderRows.length
      : 0;
  const avgCurrentAdminSeconds =
    orderRows.length > 0
      ? orderRows.reduce((acc, row) => acc + row.is_admin_seconds, 0) / orderRows.length
      : 0;

  return {
    range,
    hourly_rate: hourlyRate,
    totals: {
      ...totals,
      hours_saved: totals.time_saved_seconds / 3600,
      fte_avoided: totals.time_saved_seconds / 3600 / fteHoursPerMonth
    },
    by_category: byCategory,
    top_actions_by_time: topActionsByTime,
    top_actions_by_error_cost: topActionsByError,
    admin_minutes_per_order: {
      baseline_manual: avgManualAdminSeconds / 60,
      flss_current: avgCurrentAdminSeconds / 60
    }
  };
}
