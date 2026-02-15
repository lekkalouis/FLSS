let yearPlannerInitialized = false;

export function initYearPlannerView() {
  if (yearPlannerInitialized) return;
  yearPlannerInitialized = true;

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const STORAGE_KEY = "fl_year_planner_v1";

  const yearInput = document.getElementById("ypYear");
  const exportBtn = document.getElementById("ypExportCsv");
  const resetBtn = document.getElementById("ypResetYear");
  const body = document.getElementById("ypBody");
  const status = document.getElementById("ypStatus");
  const totalIncome = document.getElementById("ypTotalIncome");
  const totalBudget = document.getElementById("ypTotalBudget");
  const totalActual = document.getElementById("ypTotalActual");
  const netPosition = document.getElementById("ypNetPosition");

  if (!yearInput || !body) return;

  function defaultYearData(year) {
    return {
      [year]: MONTHS.map((month) => ({
        month,
        income: 0,
        budget: 0,
        actual: 0,
        notes: ""
      }))
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function currency(value) {
    const num = Number(value) || 0;
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(num);
  }

  function getYearRows(state, year) {
    if (!Array.isArray(state[year]) || state[year].length !== 12) {
      state[year] = defaultYearData(year)[year];
    }
    return state[year];
  }

  const state = loadState();
  const currentYear = String(new Date().getFullYear());
  yearInput.value = currentYear;
  getYearRows(state, currentYear);
  saveState(state);

  function updateKpis(rows) {
    const income = rows.reduce((sum, r) => sum + (Number(r.income) || 0), 0);
    const budget = rows.reduce((sum, r) => sum + (Number(r.budget) || 0), 0);
    const actual = rows.reduce((sum, r) => sum + (Number(r.actual) || 0), 0);
    totalIncome.textContent = currency(income);
    totalBudget.textContent = currency(budget);
    totalActual.textContent = currency(actual);
    netPosition.textContent = currency(income - actual);
    netPosition.classList.toggle("yp-negative", income - actual < 0);
  }

  function render() {
    const year = String(yearInput.value || currentYear);
    const rows = getYearRows(state, year);
    body.innerHTML = rows
      .map((row, idx) => {
        const variance = (Number(row.budget) || 0) - (Number(row.actual) || 0);
        return `
          <tr data-row="${idx}">
            <td><strong>${row.month}</strong></td>
            <td><input class="yp-input" type="number" min="0" step="0.01" data-field="income" value="${row.income}" /></td>
            <td><input class="yp-input" type="number" min="0" step="0.01" data-field="budget" value="${row.budget}" /></td>
            <td><input class="yp-input" type="number" min="0" step="0.01" data-field="actual" value="${row.actual}" /></td>
            <td class="${variance < 0 ? "yp-negative" : "yp-positive"}">${currency(variance)}</td>
            <td><input class="yp-input" type="text" data-field="notes" maxlength="140" value="${row.notes || ""}" placeholder="Optional notes" /></td>
          </tr>
        `;
      })
      .join("");

    updateKpis(rows);
    if (status) status.textContent = `Editing planner for ${year}.`;
  }

  function persistCell(target) {
    const tr = target.closest("tr[data-row]");
    if (!tr) return;
    const rowIndex = Number(tr.dataset.row);
    const field = target.dataset.field;
    const year = String(yearInput.value || currentYear);
    const rows = getYearRows(state, year);
    if (!rows[rowIndex] || !field) return;
    rows[rowIndex][field] = field === "notes" ? target.value : Number(target.value || 0);
    saveState(state);
    render();
  }

  function toCsv(rows) {
    const header = ["Month", "Income", "Budgeted Expenses", "Actual Expenses", "Variance", "Notes"];
    const lines = rows.map((row) => {
      const variance = (Number(row.budget) || 0) - (Number(row.actual) || 0);
      return [
        row.month,
        Number(row.income) || 0,
        Number(row.budget) || 0,
        Number(row.actual) || 0,
        variance,
        `"${String(row.notes || "").replaceAll('"', '""')}"`
      ].join(",");
    });
    return [header.join(","), ...lines].join("\n");
  }

  body.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    persistCell(target);
  });

  yearInput.addEventListener("change", () => {
    const year = String(Number(yearInput.value) || new Date().getFullYear());
    yearInput.value = year;
    getYearRows(state, year);
    saveState(state);
    render();
  });

  resetBtn?.addEventListener("click", () => {
    const year = String(yearInput.value || currentYear);
    state[year] = defaultYearData(year)[year];
    saveState(state);
    render();
    if (status) status.textContent = `Reset planner for ${year}.`;
  });

  exportBtn?.addEventListener("click", () => {
    const year = String(yearInput.value || currentYear);
    const rows = getYearRows(state, year);
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `year-planner-${year}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    if (status) status.textContent = `Exported ${year} planner to CSV.`;
  });

  render();
}
