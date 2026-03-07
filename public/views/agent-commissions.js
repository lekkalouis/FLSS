let agentCommissionsInitialized = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function initAgentCommissionsView() {
  if (agentCommissionsInitialized) return;
  agentCommissionsInitialized = true;

  const root = document.getElementById("viewAgentCommissions");
  if (!root) return;

  const summaryGrid = root.querySelector("#summaryGrid");
  const rulesBody = root.querySelector("#rulesBody");
  const ordersBody = root.querySelector("#ordersBody");
  const paymentOrder = root.querySelector("#paymentOrder");
  const refreshBtn = root.querySelector("#refreshBtn");
  const ruleForm = root.querySelector("#ruleForm");
  const paymentForm = root.querySelector("#paymentForm");
  const toggleRulesBtn = root.querySelector("#toggleRulesBtn");
  const rulesPanel = root.querySelector("#rulesPanel");
  const dateFiltersForm = root.querySelector("#acDateFilters");
  const dateFromInput = root.querySelector("#acDateFrom");
  const dateToInput = root.querySelector("#acDateTo");
  const dateResetBtn = root.querySelector("#acDateReset");

  let dashboard = null;
  let filters = { from: "", to: "" };
  const fmt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

  function asDateOnly(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  function inRange(value, from, to) {
    const date = asDateOnly(value);
    if (!date) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }

  function round2(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function renderSummary(summary) {
    const rows = [
      ["Orders", summary.totalOrders],
      ["Net sales", fmt.format(summary.netSales)],
      ["Commission due", fmt.format(summary.commissionDue)],
      ["Allocated", fmt.format(summary.commissionAllocated)],
      ["Outstanding", fmt.format(summary.commissionOutstanding)],
      ["Paid", summary.paidOrders],
      ["Partial", summary.partialOrders],
      ["Unpaid", summary.unpaidOrders]
    ];
    summaryGrid.innerHTML = rows.map(([label, value]) => `<article class="ac-kpi"><h3>${label}</h3><p>${value}</p></article>`).join("");
  }

  function renderRules(rules) {
    rulesBody.innerHTML = rules
      .map((rule) => `<tr>
        <td>${escapeHtml(rule.customerName || rule.customerEmail || rule.customerId)}</td>
        <td>${escapeHtml(rule.agentName || "-")}</td>
        <td>${Number(rule.commissionRate || 0).toFixed(2)}%</td>
        <td><button class="btn btn-sm btn-alt-danger" data-rule-delete="${rule.id}">Delete</button></td>
      </tr>`)
      .join("");
  }

  function renderOrders(orders) {
    ordersBody.innerHTML = orders
      .map((order) => `<tr>
        <td>${escapeHtml(order.orderName)}</td>
        <td>${escapeHtml(order.customerName)}</td>
        <td>${escapeHtml(order.agentName || "-")}</td>
        <td>${fmt.format(order.netAmount)}</td>
        <td>${Number(order.commissionRate || 0).toFixed(2)}%</td>
        <td>${fmt.format(order.commissionAmount)}</td>
        <td>${fmt.format(order.allocatedAmount)}</td>
        <td>${fmt.format(order.outstandingAmount)}</td>
        <td><span class="ac-badge ac-badge--${order.paymentStatus}">${order.paymentStatus}</span></td>
      </tr>`)
      .join("");

    const options = orders
      .filter((order) => order.outstandingAmount > 0)
      .map((order) => `<option value="${order.orderId}">${escapeHtml(order.orderName)} - ${fmt.format(order.outstandingAmount)} outstanding</option>`)
      .join("");
    paymentOrder.innerHTML = `<option value="">No allocation</option>${options}`;
  }

  function buildFilteredOrders(data, from, to) {
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    const payments = Array.isArray(data?.payments) ? data.payments : [];
    const filteredOrders = orders.filter((order) => inRange(order.createdAt, from, to));
    const allocatedByOrder = new Map();

    for (const payment of payments) {
      if (!inRange(payment.receivedAt || payment.createdAt, from, to)) continue;
      for (const allocation of payment.allocations || []) {
        const orderId = String(allocation?.orderId || "");
        const amount = Number(allocation?.amount || 0);
        if (!orderId || !Number.isFinite(amount) || amount <= 0) continue;
        allocatedByOrder.set(orderId, round2((allocatedByOrder.get(orderId) || 0) + amount));
      }
    }

    return filteredOrders.map((order) => {
      const commissionAmount = round2(order.commissionAmount);
      const allocatedAmount = round2(allocatedByOrder.get(String(order.orderId)) || 0);
      const outstandingAmount = round2(Math.max(0, commissionAmount - allocatedAmount));
      let paymentStatus = "unpaid";
      if (commissionAmount <= 0 || allocatedAmount >= commissionAmount) paymentStatus = "paid";
      else if (allocatedAmount > 0) paymentStatus = "partial";
      return { ...order, allocatedAmount, outstandingAmount, paymentStatus };
    });
  }

  function summaryFromOrders(orders) {
    const summary = {
      totalOrders: 0,
      netSales: 0,
      commissionDue: 0,
      commissionAllocated: 0,
      commissionOutstanding: 0,
      paidOrders: 0,
      partialOrders: 0,
      unpaidOrders: 0
    };
    for (const order of orders) {
      summary.totalOrders += 1;
      summary.netSales += Number(order.netAmount || 0);
      summary.commissionDue += Number(order.commissionAmount || 0);
      summary.commissionAllocated += Number(order.allocatedAmount || 0);
      summary.commissionOutstanding += Number(order.outstandingAmount || 0);
      if (order.paymentStatus === "paid") summary.paidOrders += 1;
      if (order.paymentStatus === "partial") summary.partialOrders += 1;
      if (order.paymentStatus === "unpaid") summary.unpaidOrders += 1;
    }
    summary.netSales = round2(summary.netSales);
    summary.commissionDue = round2(summary.commissionDue);
    summary.commissionAllocated = round2(summary.commissionAllocated);
    summary.commissionOutstanding = round2(summary.commissionOutstanding);
    return summary;
  }

  function applyFiltersAndRender() {
    if (!dashboard) return;
    const from = filters.from ? asDateOnly(filters.from) : null;
    const to = filters.to ? asDateOnly(filters.to) : null;
    const orders = buildFilteredOrders(dashboard, from, to);
    renderSummary(summaryFromOrders(orders));
    renderOrders(orders);
    renderRules(dashboard.rules || []);
  }

  async function loadDashboard() {
    const resp = await fetch("/api/v1/agent-commissions/dashboard");
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Failed to load dashboard");
    dashboard = data;
    applyFiltersAndRender();
  }

  ruleForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(ruleForm);
    const payload = Object.fromEntries(formData.entries());
    const resp = await fetch("/api/v1/agent-commissions/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) return;
    ruleForm.reset();
    await loadDashboard();
  });

  paymentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(paymentForm);
    const orderId = paymentOrder.value;
    const allocationAmount = Number(formData.get("allocationAmount") || 0);
    const allocations = orderId && allocationAmount > 0 ? [{ orderId, amount: allocationAmount }] : [];
    const resp = await fetch("/api/v1/agent-commissions/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(formData.get("amount")),
        reference: formData.get("reference"),
        receivedAt: formData.get("receivedAt") || undefined,
        notes: formData.get("notes"),
        allocations
      })
    });
    if (!resp.ok) return;
    paymentForm.reset();
    await loadDashboard();
  });

  rulesBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rule-delete]");
    if (!button) return;
    await fetch(`/api/v1/agent-commissions/rules/${button.dataset.ruleDelete}`, { method: "DELETE" });
    await loadDashboard();
  });

  toggleRulesBtn?.addEventListener("click", () => {
    if (!rulesPanel) return;
    const isHidden = rulesPanel.hasAttribute("hidden");
    if (isHidden) {
      rulesPanel.removeAttribute("hidden");
      toggleRulesBtn.textContent = "Hide rules";
      toggleRulesBtn.setAttribute("aria-expanded", "true");
    } else {
      rulesPanel.setAttribute("hidden", "hidden");
      toggleRulesBtn.textContent = "Show rules";
      toggleRulesBtn.setAttribute("aria-expanded", "false");
    }
  });

  dateFiltersForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    filters = { from: String(dateFromInput?.value || ""), to: String(dateToInput?.value || "") };
    applyFiltersAndRender();
  });

  dateResetBtn?.addEventListener("click", () => {
    filters = { from: "", to: "" };
    if (dateFromInput) dateFromInput.value = "";
    if (dateToInput) dateToInput.value = "";
    applyFiltersAndRender();
  });

  refreshBtn?.addEventListener("click", () => void loadDashboard());
  void loadDashboard();
}
