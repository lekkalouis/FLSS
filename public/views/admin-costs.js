const CATEGORIES = [
  ["labour", "Labour Cost (R)", "monthly"],
  ["packaging", "Packaging Total (R)", "monthly"],
  ["courier", "Courier Total (R)", "monthly"],
  ["utilities", "Utilities (R)", "monthly"],
  ["software", "Software (R)", "monthly"],
  ["misc", "Other Operational Costs (R)", "monthly"],
  ["labour", "Staff Hourly Rate (R/hour)", "per_order", "__staff_hourly_rate__"],
  ["packaging", "Avg Packaging Cost per Order (R)", "per_order"],
  ["courier", "Avg Courier Cost per Order (R)", "per_order"]
];

export function initAdminCostsView({ mount, apiBase = "/api/v1" }) {
  if (!mount || mount.dataset.initialized === "true") return;
  mount.dataset.initialized = "true";
  const monthInput = mount.querySelector('[data-role="month"]');
  const dateInput = mount.querySelector('[data-role="date"]');
  const saveBtn = mount.querySelector('[data-role="save"]');
  const status = mount.querySelector('[data-role="status"]');
  const breakdown = mount.querySelector('[data-role="monthly-breakdown"]');

  async function loadBreakdown(month) {
    const res = await fetch(`${apiBase}/costs?month=${encodeURIComponent(month)}`);
    if (!res.ok) return;
    const data = await res.json();
    const entries = Object.entries(data.byCategory || {});
    breakdown.innerHTML = entries.length
      ? entries.map(([k, v]) => `<li><strong>${k}</strong><span>R${Number(v).toFixed(2)}</span></li>`).join("")
      : "<li>No entries for selected month.</li>";
  }

  async function save() {
    const month = monthInput.value;
    const date = dateInput.value;
    const payloads = CATEGORIES
      .map(([cost_category, label, allocation_type, cost_name]) => {
        const input = mount.querySelector(`[name="${label}"]`);
        const amount = Number(input?.value || 0);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        return {
          date,
          cost_category,
          cost_name: cost_name || label,
          amount_zar: amount,
          allocation_type,
          notes: `Saved from /admin/costs for ${month}`
        };
      })
      .filter(Boolean);

    if (!payloads.length) {
      status.textContent = "Enter at least one amount greater than 0.";
      return;
    }

    for (const payload of payloads) {
      const res = await fetch(`${apiBase}/costs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to save one or more cost entries");
    }

    status.textContent = `Saved ${payloads.length} ledger entries.`;
    await loadBreakdown(month);
  }

  saveBtn?.addEventListener("click", () => save().catch((err) => {
    status.textContent = err.message;
  }));
  monthInput?.addEventListener("change", () => loadBreakdown(monthInput.value).catch(() => {}));

  const now = new Date();
  const isoDate = now.toISOString().slice(0, 10);
  monthInput.value = now.toISOString().slice(0, 7);
  dateInput.value = isoDate;
  loadBreakdown(monthInput.value).catch(() => {});
}
