import { PRODUCT_LIST } from "./products.js";

let stockInitialized = false;

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;
  "use strict";

  const LOG_STORAGE_KEY = "fl_stock_log_v1";
  const API_BASE = "/api/v1/shopify";

  const searchInput = document.getElementById("stock-search");
  const modeButtons = document.querySelectorAll(".stock-modeBtn");
  const modeLabel = document.getElementById("stock-modeLabel");
  const tableBody = document.getElementById("stock-tableBody");
  const logContainer = document.getElementById("stock-log");

  let items = [...PRODUCT_LIST];
  let stockLevels = {};
  let currentMode = "take";
  let logEntries = [];

  function getStock(sku) {
    const val = Number(stockLevels[sku] || 0);
    return Number.isFinite(val) ? val : 0;
  }

  function setStock(sku, value) {
    stockLevels[sku] = Math.max(0, Math.floor(value));
  }

  async function loadStockLevels() {
    stockLevels = Object.fromEntries(PRODUCT_LIST.map((item) => [item.sku, 0]));
    try {
      const variantIds = PRODUCT_LIST.map((item) => item.variantId).filter(Boolean);
      if (!variantIds.length) return;
      const resp = await fetch(
        `${API_BASE}/inventory-levels?variantIds=${variantIds.join(",")}`
      );
      const payload = await resp.json();
      if (!resp.ok) {
        console.warn("Failed to load Shopify inventory levels", payload);
        return;
      }
      const levels = Array.isArray(payload.levels) ? payload.levels : [];
      const levelsByVariant = new Map(
        levels.map((level) => [Number(level.variantId), Number(level.available || 0)])
      );
      PRODUCT_LIST.forEach((item) => {
        if (!item.variantId) return;
        const available = levelsByVariant.get(Number(item.variantId));
        if (available != null && Number.isFinite(available)) {
          stockLevels[item.sku] = Math.max(0, Math.floor(available));
        }
      });
    } catch (err) {
      console.error("Failed to load stock levels", err);
    }
  }

  function loadLogEntries() {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        logEntries = Array.isArray(parsed) ? parsed : [];
        return;
      }
    } catch {}
    logEntries = [];
  }

  function saveLogEntries() {
    try {
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logEntries));
    } catch {}
  }

  function renderLog() {
    if (!logContainer) return;
    if (!logEntries.length) {
      logContainer.innerHTML = `<div class="stock-logEntry">No updates yet.</div>`;
      return;
    }
    logContainer.innerHTML = "";
    logEntries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "stock-logEntry";
      row.innerHTML = `
        <span>${entry.timestamp}</span>
        <span>${entry.sku}</span>
        <span>${entry.mode}</span>
        <span>${entry.oldCount} → ${entry.newCount}</span>
      `;
      logContainer.appendChild(row);
    });
  }

  function appendLogEntry({ sku, oldCount, newCount, mode }) {
    const timestamp = new Date().toLocaleString();
    logEntries.push({
      timestamp,
      sku,
      mode,
      oldCount,
      newCount
    });
    saveLogEntries();
    renderLog();
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
            <td data-current="${item.sku}">${current}</td>
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

  function updateModeUI() {
    modeButtons.forEach((btn) => {
      if (btn.dataset.mode === currentMode) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });
    if (modeLabel) {
      modeLabel.textContent =
        currentMode === "receive" ? "Mode: Stock received" : "Mode: Stock take";
    }
    tableBody?.querySelectorAll(".stock-actionBtn").forEach((btn) => {
      if (currentMode === "receive") {
        btn.classList.add("receive");
      } else {
        btn.classList.remove("receive");
      }
    });
  }

  async function handleApply(row, sku, totalValue) {
    const val = Number(totalValue);
    if (!Number.isFinite(val)) {
      return;
    }
    const item = items.find((entry) => entry.sku === sku);
    if (!item?.variantId) return;

    const oldCount = getStock(sku);

    try {
      const resp = await fetch(`${API_BASE}/inventory-levels/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: item.variantId,
          mode: currentMode,
          value: val
        })
      });
      const payload = await resp.json();
      if (!resp.ok) {
        console.warn("Stock update failed", payload);
        return;
      }
      const newCount = Number(payload?.level?.available);
      if (!Number.isFinite(newCount)) return;
      setStock(sku, newCount);
      const currentCell = row.querySelector(`[data-current="${sku}"]`);
      if (currentCell) currentCell.textContent = String(newCount);
      appendLogEntry({
        sku,
        oldCount,
        newCount,
        mode: currentMode === "receive" ? "receive" : "take"
      });
    } catch (err) {
      console.error("Stock update failed", err);
    }
  }

  function initEvents() {
    searchInput?.addEventListener("input", () => {
      renderTable();
      updateModeUI();
    });

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        if (!mode) return;
        currentMode = mode;
        updateModeUI();
      });
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
      handleApply(row, sku, totalInput?.value || "0").finally(() => {
        resetRowCounts(row);
      });
    });

    tableBody?.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-count]");
      if (!input) return;
      const row = input.closest("tr");
      if (!row) return;
      updateRowTotal(row);
    });
  }

  loadLogEntries();
  renderLog();
  renderTable();
  updateModeUI();
  loadStockLevels().then(() => {
    renderTable();
    updateModeUI();
  });
  initEvents();
}
