const money = (v) => `R${Number(v || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
const hours = (v) => Number(v || 0).toFixed(2);

const els = {
  range: document.getElementById("rangeSelect"),
  rate: document.getElementById("rateSelect"),
  refresh: document.getElementById("refreshBtn"),
  seed: document.getElementById("seedBtn"),
  kpis: document.getElementById("kpiCards"),
  stage: document.getElementById("stageBreakdown"),
  minutes: document.getElementById("minutesCompare"),
  topTime: document.getElementById("topTimeRows"),
  topError: document.getElementById("topErrorRows")
};

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function card(label, value) {
  return `<div class="card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function renderSummary(summary) {
  const totals = summary?.totals || {};
  els.kpis.innerHTML = [
    card("Hours Saved", hours(totals.hours_saved)),
    card("Rand Value Unlocked", money(totals.total_value_saved)),
    card("Error Cost Avoided", money(totals.expected_error_cost_saved)),
    card("Equivalent FTE Avoided", Number(totals.fte_avoided || 0).toFixed(2))
  ].join("");

  const categoryRows = Object.entries(summary.by_category || {})
    .sort((a, b) => b[1].time_saved_seconds - a[1].time_saved_seconds)
    .map(([key, row]) => `<div class="stage-row"><span>${key.replace(/_/g, " ")}</span><strong>${hours(row.time_saved_seconds / 3600)} hrs | ${money(row.total_value_saved)}</strong></div>`)
    .join("");
  els.stage.innerHTML = categoryRows || '<div class="hint">No events captured yet.</div>';

  const minutes = summary.admin_minutes_per_order || {};
  els.minutes.textContent = `${Number(minutes.baseline_manual || 0).toFixed(1)} min → ${Number(minutes.flss_current || 0).toFixed(1)} min`;

  els.topTime.innerHTML = (summary.top_actions_by_time || [])
    .map((row) => `<tr><td>${row.label}</td><td>${row.count}</td><td>${hours(row.time_saved_seconds / 3600)}</td></tr>`)
    .join("") || '<tr><td colspan="3">No data</td></tr>';

  els.topError.innerHTML = (summary.top_actions_by_error_cost || [])
    .map((row) => `<tr><td>${row.label}</td><td>${row.count}</td><td>${money(row.expected_error_cost_saved)}</td></tr>`)
    .join("") || '<tr><td colspan="3">No data</td></tr>';
}

async function loadCostModel() {
  const model = await getJson("/metrics/cost-model");
  els.rate.innerHTML = model.hourly_rate_options
    .map((value) => `<option value="${value}" ${value === model.default_hourly_rate ? "selected" : ""}>R${value}/hour</option>`)
    .join("");
}

async function loadSummary() {
  const range = els.range.value;
  const hourlyRate = els.rate.value;
  const summary = await getJson(`/metrics/summary?range=${encodeURIComponent(range)}&hourlyRate=${encodeURIComponent(hourlyRate)}`);
  renderSummary(summary);
}

async function seedEvents() {
  const actions = await getJson("/metrics/actions");
  const sampleActions = actions.actions.slice(0, 24);
  const events = [];
  for (let i = 0; i < sampleActions.length; i += 1) {
    const action = sampleActions[i];
    events.push({
      order_id: `DEMO-${1000 + Math.floor(i / 4)}`,
      action_code: action.action_code,
      system: i % 2 === 0 ? "Shopify" : "FLSS",
      automated: true,
      timestamp: new Date(Date.now() - (i * 45 * 60 * 1000)).toISOString()
    });
  }
  await getJson("/metrics/events/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events })
  });
  await loadSummary();
}

els.refresh.addEventListener("click", loadSummary);
els.range.addEventListener("change", loadSummary);
els.rate.addEventListener("change", loadSummary);
els.seed.addEventListener("click", seedEvents);

await loadCostModel();
await loadSummary();
