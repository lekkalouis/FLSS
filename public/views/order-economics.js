export function initOrderEconomicsView({ mount, apiBase = "/api/v1" }) {
  if (!mount || mount.dataset.initialized === "true") return;
  mount.dataset.initialized = "true";

  const monthInput = mount.querySelector('[data-role="month"]');
  const reloadBtn = mount.querySelector('[data-role="reload"]');
  const cards = {
    avg: mount.querySelector('[data-role="avg-sale"]'),
    cost: mount.querySelector('[data-role="cost-order"]'),
    profit: mount.querySelector('[data-role="profit-order"]'),
    margin: mount.querySelector('[data-role="margin"]'),
    totals: mount.querySelector('[data-role="totals"]'),
    fulfil: mount.querySelector('[data-role="fulfil"]')
  };
  const breakdown = mount.querySelector('[data-role="breakdown"]');

  const formatMoney = (v) => `R${Number(v || 0).toFixed(2)}`;

  async function refresh() {
    const month = monthInput?.value || "";
    const res = await fetch(`${apiBase}/analytics/order-economics?period=month&month=${encodeURIComponent(month)}`);
    const data = await res.json();
    cards.avg.textContent = formatMoney(data.averageSalePrice);
    cards.cost.textContent = formatMoney(data.costPerOrder);
    cards.profit.textContent = formatMoney(data.profitPerOrder);
    cards.margin.textContent = `${Number(data.marginPercent || 0).toFixed(2)}%`;
    cards.totals.textContent = `${data.totalOrders || 0} orders · ${formatMoney(data.totalRevenue)}`;
    cards.fulfil.textContent = `${data.avgFulfillmentSeconds || 0}s avg fulfillment`;

    const items = Object.entries(data.costBreakdown || {});
    breakdown.innerHTML = items.length
      ? items
          .map(([k, v]) => `<li><strong>${k}</strong><span>${formatMoney(v)}</span></li>`)
          .join("")
      : '<li><span>No monthly costs recorded yet.</span></li>';
  }

  reloadBtn?.addEventListener("click", () => refresh().catch(() => {}));
  monthInput?.addEventListener("change", () => refresh().catch(() => {}));

  if (monthInput && !monthInput.value) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  refresh().catch(() => {});
}
