import { PRODUCT_LIST } from "./products.js";

let stockInitialized = false;

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;
  "use strict";

  const STORAGE_KEY = "fl_stock_levels_v1";

  const searchInput = document.getElementById("stock-search");
  const tableBody = document.getElementById("stock-tableBody");

  let items = [...PRODUCT_LIST];
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
      PRODUCT_LIST.map((item) => [item.sku, 0])
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
    if (!item) return 0;
    if (Number.isFinite(item.crateUnits) && item.crateUnits > 0) {
      return item.crateUnits;
    }
    const size = String(item.size || "").toLowerCase();
    if (size === "100ml") return 180;
    if (size === "200ml") return 102;
    if (size === "500g") return 40;
    if (size === "1kg") return 20;
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
