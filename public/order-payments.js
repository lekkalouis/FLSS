const kpisEl = document.getElementById("opKpis");
const ordersEl = document.getElementById("opOrders");
const refreshBtn = document.getElementById("opRefresh");
const form = document.getElementById("opForm");
const orderSelect = document.getElementById("opOrder");

const fmt = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-ZA");
}

async function loadDashboard() {
  const resp = await fetch("/api/v1/order-payments/dashboard");
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || "Could not load dashboard");

  const summary = data.summary || {};
  kpisEl.innerHTML = [
    ["Orders tracked", summary.orderCount || 0],
    ["Total outstanding", fmt.format(summary.totalOutstanding || 0)],
    ["Unpaid", summary.unpaidOrders || 0],
    ["Partial", summary.partialOrders || 0],
    ["Paid", summary.paidOrders || 0]
  ]
    .map(([label, val]) => `<article class="op-kpi"><h3>${label}</h3><p>${val}</p></article>`)
    .join("");

  const orders = Array.isArray(data.outstandingOrders) ? data.outstandingOrders : [];
  ordersEl.innerHTML = orders
    .map(
      (o) => `<tr>
      <td>${esc(o.orderName)}</td>
      <td>${esc(o.customerName)}</td>
      <td>${esc(o.paymentTerms || "-")}</td>
      <td>${asDate(o.dueDate)}</td>
      <td>${fmt.format(o.shopifyOutstanding)}</td>
      <td><span class="op-badge op-badge--${esc(o.localStatus)}">${esc(o.localStatus)}</span></td>
      <td>${esc(o.financialStatus || "-")}</td>
    </tr>`
    )
    .join("");

  orderSelect.innerHTML = `<option value="">No order allocation</option>${orders
    .filter((o) => o.shopifyOutstanding > 0)
    .map((o) => `<option value="${esc(o.orderId)}" data-name="${esc(o.orderName)}">${esc(o.orderName)} — ${fmt.format(o.shopifyOutstanding)} outstanding</option>`)
    .join("")}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(form);
  const orderId = orderSelect.value;
  const selectedOrder = orderSelect.selectedOptions?.[0];
  const allocationAmount = Number(fd.get("allocationAmount") || 0);
  const allocations = orderId && allocationAmount > 0 ? [{ orderId, amount: allocationAmount, orderName: selectedOrder?.dataset?.name || "" }] : [];
  const payload = {
    amount: Number(fd.get("amount")),
    reference: fd.get("reference"),
    receivedAt: fd.get("receivedAt") || undefined,
    notes: fd.get("notes"),
    allocations
  };

  const resp = await fetch("/api/v1/order-payments/allocate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    alert(data.error || "Could not apply payment");
    return;
  }

  form.reset();
  await loadDashboard();
});

refreshBtn.addEventListener("click", () => loadDashboard().catch((error) => alert(error.message)));

loadDashboard().catch((error) => {
  kpisEl.innerHTML = `<article class="op-kpi"><h3>Error</h3><p>${esc(error.message)}</p></article>`;
});
