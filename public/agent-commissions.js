const summaryGrid = document.getElementById("summaryGrid");
const rulesBody = document.getElementById("rulesBody");
const ordersBody = document.getElementById("ordersBody");
const paymentOrder = document.getElementById("paymentOrder");
const refreshBtn = document.getElementById("refreshBtn");
const ruleForm = document.getElementById("ruleForm");
const paymentForm = document.getElementById("paymentForm");

let dashboard = null;

const fmt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
    .map(
      (rule) => `<tr>
      <td>${escapeHtml(rule.customerName || rule.customerEmail || rule.customerId)}</td>
      <td>${escapeHtml(rule.agentName || "-")}</td>
      <td>${Number(rule.commissionRate || 0).toFixed(2)}%</td>
      <td><button class="btn btn-sm btn-alt-danger" data-rule-delete="${rule.id}">Delete</button></td>
    </tr>`
    )
    .join("");
}

function renderOrders(orders) {
  ordersBody.innerHTML = orders
    .map(
      (order) => `<tr>
      <td>${escapeHtml(order.orderName)}</td>
      <td>${escapeHtml(order.customerName)}</td>
      <td>${escapeHtml(order.agentName || "-")}</td>
      <td>${fmt.format(order.netAmount)}</td>
      <td>${order.commissionRate.toFixed(2)}%</td>
      <td>${fmt.format(order.commissionAmount)}</td>
      <td>${fmt.format(order.allocatedAmount)}</td>
      <td>${fmt.format(order.outstandingAmount)}</td>
      <td><span class="ac-badge ac-badge--${order.paymentStatus}">${order.paymentStatus}</span></td>
    </tr>`
    )
    .join("");

  const options = orders
    .filter((order) => order.outstandingAmount > 0)
    .map((order) => `<option value="${order.orderId}">${escapeHtml(order.orderName)} — ${fmt.format(order.outstandingAmount)} outstanding</option>`)
    .join("");
  paymentOrder.innerHTML = `<option value="">No allocation</option>${options}`;
}

async function loadDashboard() {
  const resp = await fetch("/api/v1/agent-commissions/dashboard");
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Failed to load dashboard");
  dashboard = data;
  renderSummary(data.summary);
  renderRules(data.rules);
  renderOrders(data.orders);
  const existing = document.getElementById("acWarning");
  if (existing) existing.remove();
  if (data.warning) {
    const warning = document.createElement("p");
    warning.id = "acWarning";
    warning.className = "ac-warning";
    warning.textContent = data.warning;
    summaryGrid.parentElement?.insertBefore(warning, summaryGrid.nextSibling);
  }
}

ruleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(ruleForm);
  const payload = Object.fromEntries(formData.entries());
  const resp = await fetch("/api/v1/agent-commissions/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    alert(err.error || "Could not save rule");
    return;
  }
  ruleForm.reset();
  await loadDashboard();
});

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(paymentForm);
  const orderId = paymentOrder.value;
  const allocationAmount = Number(formData.get("allocationAmount") || 0);
  const allocations = orderId && allocationAmount > 0 ? [{ orderId, amount: allocationAmount }] : [];
  const payload = {
    amount: Number(formData.get("amount")),
    reference: formData.get("reference"),
    receivedAt: formData.get("receivedAt") || undefined,
    notes: formData.get("notes"),
    allocations
  };
  const resp = await fetch("/api/v1/agent-commissions/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    alert(err.error || "Could not save payment");
    return;
  }
  paymentForm.reset();
  await loadDashboard();
});

rulesBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-rule-delete]");
  if (!button) return;
  if (!confirm("Delete this rule?")) return;
  await fetch(`/api/v1/agent-commissions/rules/${button.dataset.ruleDelete}`, { method: "DELETE" });
  await loadDashboard();
});

refreshBtn.addEventListener("click", () => loadDashboard().catch((error) => alert(error.message)));

loadDashboard().catch((error) => {
  summaryGrid.innerHTML = `<article class="ac-kpi"><h3>Error</h3><p>${escapeHtml(error.message)}</p></article>`;
});
