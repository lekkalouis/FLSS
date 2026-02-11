let commissionsInitialized = false;

export function initCommissionsView() {
  if (commissionsInitialized) return;
  commissionsInitialized = true;

  const statusEl = document.getElementById("commissionsStatus");
  const refreshBtn = document.getElementById("commissionsRefreshBtn");
  const monthList = document.getElementById("commissionsMonthList");
  const grandTotalEl = document.getElementById("commissionsGrandTotal");

  if (!monthList) return;

  const PAID_KEY = "flsl_commission_paid_months_v1";

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

  const readPaidState = () => {
    try {
      const raw = localStorage.getItem(PAID_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_err) {
      return {};
    }
  };

  const writePaidState = (state) => {
    localStorage.setItem(PAID_KEY, JSON.stringify(state));
  };

  function setStatus(text, tone = "info") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.remove("is-warn", "is-error");
    if (tone === "warn") statusEl.classList.add("is-warn");
    if (tone === "error") statusEl.classList.add("is-error");
  }

  function renderMonths(months = []) {
    const paidState = readPaidState();
    monthList.innerHTML = "";

    if (!Array.isArray(months) || !months.length) {
      monthList.innerHTML = `<div class="commissionsEmpty">No FLSL commission orders found.</div>`;
      if (grandTotalEl) grandTotalEl.textContent = money(0);
      return;
    }

    let grandTotal = 0;

    months.forEach((monthData) => {
      const month = String(monthData.month || "");
      const isPaid = Boolean(paidState[month]);
      grandTotal += Number(monthData.total_commission || 0);

      const card = document.createElement("section");
      card.className = "commissionsMonthCard";

      const header = document.createElement("header");
      header.className = "commissionsMonthHeader";

      const title = document.createElement("h3");
      title.textContent = monthLabel(month);

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
      paidBtn.addEventListener("click", () => {
        const current = readPaidState();
        current[month] = !Boolean(current[month]);
        writePaidState(current);
        renderMonths(months);
      });

      actions.appendChild(totalBadge);
      actions.appendChild(paidBtn);
      header.appendChild(title);
      header.appendChild(actions);

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
      card.appendChild(table);
      monthList.appendChild(card);
    });

    if (grandTotalEl) grandTotalEl.textContent = money(grandTotal);
  }

  async function loadCommissions() {
    setStatus("Loading FLSL commissions...");
    refreshBtn && (refreshBtn.disabled = true);
    try {
      const resp = await fetch("/api/v1/shopify/commissions/flsl", {
        headers: { Accept: "application/json" }
      });
      if (!resp.ok) {
        throw new Error(`Failed to load commissions (${resp.status})`);
      }
      const data = await resp.json();
      renderMonths(data.months || []);
      setStatus("Commission list loaded.");
    } catch (err) {
      renderMonths([]);
      setStatus(String(err?.message || err), "error");
    } finally {
      refreshBtn && (refreshBtn.disabled = false);
    }
  }

  refreshBtn?.addEventListener("click", loadCommissions);
  loadCommissions();
}
