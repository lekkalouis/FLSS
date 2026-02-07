let stockInitialized = false;

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;
  "use strict";

  const DEFAULT_ITEMS = [
    { sku: "FL002", title: "Original Multi-Purpose Spice 200ml" },
    { sku: "FL003", title: "Original Multi-Purpose Spice 500g" },
    { sku: "FL004", title: "Original Multi-Purpose Spice 1kg" },
    { sku: "FL005", title: "Original Multi-Purpose Spice Bag 750g" },
    { sku: "FL008", title: "Hot & Spicy Multi-Purpose Spice 200ml" },
    { sku: "FL009", title: "Hot & Spicy Multi-Purpose Spice 500g" },
    { sku: "FL010", title: "Hot & Spicy Multi-Purpose Spice 1kg" },
    { sku: "FL014", title: "Worcester Sauce Spice 200ml" },
    { sku: "FL015", title: "Worcester Sauce Spice 500g" },
    { sku: "FL016", title: "Worcester Sauce Spice 1kg" },
    { sku: "FL017", title: "Worcester Sauce Spice Bag 750g" },
    { sku: "FL026", title: "Red Wine & Garlic Sprinkle 200ml" },
    { sku: "FL027", title: "Red Wine & Garlic Sprinkle 500g" },
    { sku: "FL028", title: "Red Wine & Garlic Sprinkle 1kg" },
    { sku: "FL031", title: "Flippen Lekka Curry Mix 250ml" },
    { sku: "FL032", title: "Flippen Lekka Curry Mix 500g" },
    { sku: "FL033", title: "Flippen Lekka Curry Mix 1kg" },
    { sku: "FL035", title: "Chutney Sprinkle 200ml" },
    { sku: "FL037", title: "Chutney Sprinkle 1kg" },
    { sku: "FL038", title: "Savoury Herb Mix 200ml" },
    { sku: "FL039", title: "Savoury Herb Mix 500g" },
    { sku: "FL041", title: "Salt & Vinegar Seasoning 200ml" },
    { sku: "FL042", title: "Salt & Vinegar Seasoning 500g" },
    { sku: "FL043", title: "Salt & Vinegar Seasoning 1kg" },
    { sku: "FL050", title: "Butter Popcorn Sprinkle 100ml" },
    { sku: "FL053", title: "Sour Cream & Chives Popcorn Sprinkle 100ml" },
    { sku: "FL056", title: "Chutney Popcorn Sprinkle 100ml" },
    { sku: "FL059", title: "Parmesan Cheese Popcorn Sprinkle 100ml" },
    { sku: "FL062", title: "Cheese & Onion Popcorn Sprinkle 100ml" },
    { sku: "FL065", title: "Salt & Vinegar Popcorn Sprinkle 100ml" },
    { sku: "FLBS001", title: "Original Multi-Purpose Basting Sauce 375ml" },
    { sku: "GBOX", title: "Gift Box" }
  ];

  const STORAGE_KEY = "fl_stock_levels_v1";

  const searchInput = document.getElementById("stock-search");
  const tableBody = document.getElementById("stock-tableBody");

  let items = [...DEFAULT_ITEMS];
  let stockLevels = {};

  function loadStockLevels() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        stockLevels = JSON.parse(raw) || {};
        return;
      }
    } catch {}
    stockLevels = Object.fromEntries(
      DEFAULT_ITEMS.map((item) => [item.sku, 0])
    );
  }

  function saveStockLevels() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stockLevels));
    } catch {}
  }

  function getStock(sku) {
    const val = Number(stockLevels[sku] || 0);
    return Number.isFinite(val) ? val : 0;
  }

  function setStock(sku, value) {
    stockLevels[sku] = Math.max(0, Math.floor(value));
    saveStockLevels();
  }

  function filteredItems() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.sku.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q)
    );
  }

  function crateUnitsForItem(item) {
    const title = item.title.toLowerCase();
    if (title.includes("100ml")) return 180;
    if (title.includes("200ml")) return 102;
    if (title.includes("500g")) return 40;
    if (title.includes("1kg")) return 20;
    return 0;
  }

  function sumRowCounts(row) {
    const inputs = row.querySelectorAll("input[data-count]");
    return Array.from(inputs).reduce((sum, input) => {
      const val = Number(input.value);
      return Number.isFinite(val) ? sum + val : sum;
    }, 0);
  }

  function updateRowTotal(row) {
    const crateClicks = Number(row.dataset.crateClicks || 0);
    const crateUnits = Number(row.dataset.crateUnits || 0);
    const total = sumRowCounts(row) + crateClicks * crateUnits;
    const totalInput = row.querySelector("input[data-total]");
    if (totalInput) totalInput.value = String(Math.max(0, Math.floor(total)));
  }

  function resetRowCounts(row) {
    row.querySelectorAll("input[data-count]").forEach((input) => {
      input.value = "";
    });
    row.dataset.crateClicks = "0";
    const crateCount = row.querySelector("[data-crate-count]");
    if (crateCount) crateCount.textContent = "0";
    updateRowTotal(row);
  }

  function renderTable() {
    if (!tableBody) return;
    const list = filteredItems();
    tableBody.innerHTML = list
      .map((item) => {
        const current = getStock(item.sku);
        const crateUnits = crateUnitsForItem(item);
        return `
          <tr data-sku="${item.sku}" data-crate-units="${crateUnits}" data-crate-clicks="0">
            <td><strong>${item.sku}</strong></td>
            <td>${item.title}</td>
            <td>${current}</td>
            <td>
              <input class="stock-qtyInput" type="number" min="0" step="1" data-sku="${item.sku}" data-count="1" />
            </td>
            <td>
              <input class="stock-qtyInput" type="number" min="0" step="1" data-sku="${item.sku}" data-count="2" />
            </td>
            <td>
              <input class="stock-qtyInput" type="number" min="0" step="1" data-sku="${item.sku}" data-count="3" />
            </td>
            <td>
              <input class="stock-qtyInput stock-totalInput" type="number" min="0" step="1" data-total="true" readonly value="0" />
            </td>
            <td>
              <button class="stock-crateBtn" type="button" data-action="crate" data-sku="${item.sku}" ${crateUnits ? "" : "disabled"} title="Add crate">📦</button>
              <span class="stock-crateCount" data-crate-count="${item.sku}">0</span>
            </td>
            <td>
              <button class="stock-actionBtn" type="button" data-action="apply" data-sku="${item.sku}">Set</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function handleApply(sku, totalValue) {
    const val = Number(totalValue);
    if (!Number.isFinite(val)) {
      return;
    }
    setStock(sku, val);
    renderTable();
  }

  function initEvents() {
    searchInput?.addEventListener("input", () => {
      renderTable();
    });

    tableBody?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action='apply']");
      const crateBtn = event.target.closest("button[data-action='crate']");
      if (crateBtn) {
        const row = crateBtn.closest("tr");
        if (!row) return;
        const crateClicks = Number(row.dataset.crateClicks || 0) + 1;
        row.dataset.crateClicks = String(crateClicks);
        const crateCount = row.querySelector("[data-crate-count]");
        if (crateCount) crateCount.textContent = String(crateClicks);
        updateRowTotal(row);
        return;
      }
      if (!btn) return;
      const row = btn.closest("tr");
      const sku = btn.dataset.sku;
      if (!sku || !row) return;
      const totalInput = row.querySelector("input[data-total]");
      handleApply(sku, totalInput?.value || "0");
      resetRowCounts(row);
    });

    tableBody?.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-count]");
      if (!input) return;
      const row = input.closest("tr");
      if (!row) return;
      updateRowTotal(row);
    });
  }

  loadStockLevels();
  renderTable();
  initEvents();
}
