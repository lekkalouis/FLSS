let commissionsInitialized = false;

export function initCommissionsView() {
  if (commissionsInitialized) return;
  commissionsInitialized = true;

  const statusEl = document.getElementById("commissionsStatus");
  const refreshBtn = document.getElementById("commissionsRefreshBtn");
  const monthList = document.getElementById("commissionsMonthList");
  const grandTotalEl = document.getElementById("commissionsGrandTotal");

  if (!monthList) return;

  let latestMonths = [];

  const money = (value, currency = "ZAR") => {
    const amount = Number(value || 0);
    try {
      return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } catch (_err) {
      return `R${amount.toFixed(2)}`;
    }
  };

  const monthLabel = (monthKey) => {
    const [y, m] = String(monthKey || "").split("-").map((v) => Number(v));
    if (!y || !m) return monthKey;
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString("en-ZA", { month: "long", year: "numeric" });
  };

  function setStatus(text, tone = "info") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.remove("is-warn", "is-error");
    if (tone === "warn") statusEl.classList.add("is-warn");
    if (tone === "error") statusEl.classList.add("is-error");
  }

  async function setMonthPaid(month, paid) {
    const resp = await fetch(`/api/v1/shopify/commissions/flsl/months/${encodeURIComponent(month)}/paid`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paid })
    });
    if (!resp.ok) {
      throw new Error(`Failed to update paid status (${resp.status})`);
    }
  }

  function renderMonths(months = []) {
    monthList.innerHTML = "";

    if (!Array.isArray(months) || !months.length) {
      monthList.innerHTML = `<div class="commissionsEmpty">No FLSL commission orders found.</div>`;
      if (grandTotalEl) grandTotalEl.textContent = money(0);
      return;
    }

    let grandTotal = 0;

    months.forEach((monthData) => {
      const month = String(monthData.month || "");
      const isPaid = Boolean(monthData.paid);
      grandTotal += Number(monthData.total_commission || 0);

      const card = document.createElement("section");
      card.className = "commissionsMonthCard";

      const header = document.createElement("header");
      header.className = "commissionsMonthHeader";

      const titleWrap = document.createElement("div");
      titleWrap.className = "commissionsTitleWrap";

      const title = document.createElement("h3");
      title.textContent = monthLabel(month);

      const summary = document.createElement("div");
      summary.className = "commissionsMonthSummary";
      summary.textContent = `${monthData.customer_count || 0} customers • ${(monthData.orders || []).length} orders`;

      titleWrap.appendChild(title);
      titleWrap.appendChild(summary);

      const actions = document.createElement("div");
      actions.className = "commissionsMonthActions";

      const totalBadge = document.createElement("div");
      totalBadge.className = "commissionsMonthTotal";
      totalBadge.textContent = `Month total: ${money(monthData.total_commission, monthData.currency || "ZAR")}`;

      const paidBtn = document.createElement("button");
      paidBtn.type = "button";
      paidBtn.className = "commissionsPaidBtn";
      paidBtn.textContent = isPaid ? "Paid ✓" : "Mark paid";
      paidBtn.classList.toggle("is-paid", isPaid);
      paidBtn.addEventListener("click", async () => {
        paidBtn.disabled = true;
        try {
          await setMonthPaid(month, !isPaid);
          const idx = latestMonths.findIndex((entry) => entry.month === month);
          if (idx >= 0) latestMonths[idx].paid = !isPaid;
          renderMonths(latestMonths);
          setStatus(`Updated paid status for ${monthLabel(month)}.`);
        } catch (err) {
          setStatus(String(err?.message || err), "error");
        } finally {
          paidBtn.disabled = false;
        }
      });

      actions.appendChild(totalBadge);
      actions.appendChild(paidBtn);
      header.appendChild(titleWrap);
      header.appendChild(actions);

      const customerSummary = document.createElement("div");
      customerSummary.className = "commissionsCustomerSummary";
      const topCustomers = (monthData.customers || []).slice(0, 4);
      customerSummary.innerHTML = topCustomers.length
        ? `Top customers: ${topCustomers
            .map((entry) => `${entry.customer_name || "Unknown"} (${money(entry.total_commission, monthData.currency || "ZAR")})`)
            .join(" • ")}`
        : "No customer summary";

      const table = document.createElement("table");
      table.className = "commissionsTable";
      table.innerHTML = `
        <thead>
          <tr>
            <th>Order</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Net before shipping/tax</th>
            <th>17% commission</th>
            <th>Trigger</th>
          </tr>
        </thead>
      `;

      const tbody = document.createElement("tbody");
      (monthData.orders || []).forEach((order) => {
        const row = document.createElement("tr");
        const dt = order.created_at ? new Date(order.created_at) : null;
        const dateLabel = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString("en-ZA") : "—";
        row.innerHTML = `
          <td>${order.order_name || "—"}</td>
          <td>${dateLabel}</td>
          <td>${order.customer_name || "—"}</td>
          <td>${money(order.net_amount, monthData.currency || "ZAR")}</td>
          <td>${money(order.commission_amount, monthData.currency || "ZAR")}</td>
          <td>${order.commission_trigger === "customer_tag" ? "Customer tagged FLSL" : "Order tagged FLSL"}</td>
        `;
        tbody.appendChild(row);
      });
      table.appendChild(tbody);

      card.appendChild(header);
      card.appendChild(customerSummary);
      card.appendChild(table);
      monthList.appendChild(card);
    });

    if (grandTotalEl) grandTotalEl.textContent = money(grandTotal);
  }

  async function loadCommissions() {
    setStatus("Loading FLSL commissions...");
    if (refreshBtn) refreshBtn.disabled = true;
    try {
      const resp = await fetch("/api/v1/shopify/commissions/flsl", {
        headers: { Accept: "application/json" }
      });
      if (!resp.ok) {
        throw new Error(`Failed to load commissions (${resp.status})`);
      }
      const data = await resp.json();
      latestMonths = data.months || [];
      renderMonths(latestMonths);
      setStatus("Commission list loaded.");
    } catch (err) {
      latestMonths = [];
      renderMonths(latestMonths);
      setStatus(String(err?.message || err), "error");
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  refreshBtn?.addEventListener("click", loadCommissions);
  loadCommissions();
}
