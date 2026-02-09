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
  const table = document.getElementById("stock-table");
  const tableBody = document.getElementById("stock-tableBody");
  const logContainer = document.getElementById("stock-log");
  const locationSelect = document.getElementById("stock-location");
  const transferSelect = document.getElementById("stock-transferLocation");
  const focusInput = document.getElementById("stock-focusInput");
  const focusApplyBtn = document.getElementById("stock-focusApply");

  let items = [...PRODUCT_LIST];
  let stockLevels = {};
  let currentMode = "read";
  let logEntries = [];
  let currentLocationId = null;
  let transferLocationId = null;
  let locations = [];
  let locationNameMap = new Map();
  const CRATE_UNITS = 102;
  const BOX_UNITS = 250;

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
      const locationParam = currentLocationId ? `&locationId=${currentLocationId}` : "";
      const resp = await fetch(
        `${API_BASE}/inventory-levels?variantIds=${variantIds.join(",")}${locationParam}`
      );
      const payload = await resp.json();
      if (!resp.ok) {
        console.warn("Failed to load Shopify inventory levels", payload);
        return;
      }
      if (payload?.locationId && !currentLocationId) {
        currentLocationId = Number(payload.locationId);
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

  async function loadLocations() {
    if (!locationSelect || !transferSelect) return;
    try {
      const resp = await fetch(`${API_BASE}/locations`);
      const payload = await resp.json();
      if (!resp.ok) {
        console.warn("Failed to load Shopify locations", payload);
        return;
      }
      locations = Array.isArray(payload.locations) ? payload.locations : [];
      locationNameMap = new Map(locations.map((loc) => [Number(loc.id), loc.name]));
      const options = locations
        .map(
          (loc) =>
            `<option value="${loc.id}">${loc.name || `Location ${loc.id}`}</option>`
        )
        .join("");
      locationSelect.innerHTML = options;
      transferSelect.innerHTML = `<option value="">Transfer target...</option>${options}`;
      if (currentLocationId) {
        locationSelect.value = String(currentLocationId);
      } else if (locations[0]) {
        currentLocationId = Number(locations[0].id);
        locationSelect.value = String(currentLocationId);
      }
      const nextLocation = locations.find((loc) => Number(loc.id) !== currentLocationId);
      if (nextLocation) {
        transferLocationId = Number(nextLocation.id);
        transferSelect.value = String(transferLocationId);
      }
    } catch (err) {
      console.error("Failed to load locations", err);
    }
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

  function sumRowCounts(row) {
    const inputs = row.querySelectorAll("input[data-count]");
    return Array.from(inputs).reduce((sum, input) => {
      const val = Number(input.value);
      return Number.isFinite(val) ? sum + val : sum;
    }, 0);
  }

  function updateRowTotal(row) {
    const crateClicks = Number(row.dataset.crateClicks || 0);
    const boxClicks = Number(row.dataset.boxClicks || 0);
    const total =
      sumRowCounts(row) + crateClicks * CRATE_UNITS + boxClicks * BOX_UNITS;
    const totalInput = row.querySelector("input[data-total]");
    if (totalInput) totalInput.value = String(Math.max(0, Math.floor(total)));
  }

  function resetRowCounts(row) {
    row.querySelectorAll("input[data-count]").forEach((input) => {
      input.value = "";
    });
    row.dataset.crateClicks = "0";
    row.dataset.boxClicks = "0";
    const crateCount = row.querySelector("[data-unit-count='crate']");
    if (crateCount) crateCount.textContent = "0";
    const boxCount = row.querySelector("[data-unit-count='box']");
    if (boxCount) boxCount.textContent = "0";
    updateRowTotal(row);
  }

  function renderTable() {
    if (!tableBody) return;
    const list = filteredItems();
    tableBody.innerHTML = list
      .map((item) => {
        const current = getStock(item.sku);
        return `
          <tr data-sku="${item.sku}" data-crate-clicks="0" data-box-clicks="0">
            <td><strong>${item.sku}</strong></td>
            <td>${item.title}</td>
            <td class="stock-currentCol" data-current="${item.sku}">${current}</td>
            <td class="stock-adjustCol">
              <input class="stock-qtyInput" type="number" min="0" step="1" data-sku="${item.sku}" data-count="1" />
            </td>
            <td class="stock-adjustCol">
              <input class="stock-qtyInput" type="number" min="0" step="1" data-sku="${item.sku}" data-count="2" />
            </td>
            <td class="stock-adjustCol">
              <input class="stock-qtyInput" type="number" min="0" step="1" data-sku="${item.sku}" data-count="3" />
            </td>
            <td class="stock-adjustCol">
              <input class="stock-qtyInput stock-totalInput" type="number" min="0" step="1" data-total="true" readonly value="0" />
            </td>
            <td class="stock-quickCol">
              <span class="stock-iconGroup stock-crateGroup">
                <button class="stock-iconBtn" type="button" data-action="crate" data-sku="${item.sku}" title="Add crate (${CRATE_UNITS})">🧺</button>
                <span class="stock-iconCount" data-unit-count="crate">0</span>
              </span>
              <span class="stock-iconGroup stock-boxGroup">
                <button class="stock-iconBtn" type="button" data-action="box" data-sku="${item.sku}" title="Add box (${BOX_UNITS})">📦</button>
                <span class="stock-iconCount" data-unit-count="box">0</span>
              </span>
            </td>
            <td class="stock-actionCol">
              <button class="stock-actionBtn" type="button" data-action="apply" data-sku="${item.sku}">Set</button>
              <button class="stock-actionBtn transfer" type="button" data-action="transfer" data-sku="${item.sku}">Transfer</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function updateModeUI() {
    const isReadOnly = currentMode === "read";
    const isReceive = currentMode === "receive";
    modeButtons.forEach((btn) => {
      if (btn.dataset.mode === currentMode) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    });
    if (modeLabel) {
      modeLabel.textContent = currentMode === "receive"
        ? "Mode: Stock received"
        : currentMode === "take"
        ? "Mode: Stock take"
        : "Mode: Read only";
    }
    if (table) {
      table.dataset.mode = currentMode;
    }
    tableBody?.querySelectorAll(".stock-actionBtn").forEach((btn) => {
      if (isReceive) {
        btn.classList.add("receive");
      } else {
        btn.classList.remove("receive");
      }
    });
    tableBody?.querySelectorAll("input.stock-qtyInput").forEach((input) => {
      if (input.dataset.total) return;
      input.disabled = isReadOnly;
    });
    tableBody?.querySelectorAll(".stock-iconBtn").forEach((btn) => {
      btn.disabled = isReadOnly;
    });
    tableBody?.querySelectorAll(".stock-actionBtn").forEach((btn) => {
      if (btn.dataset.action === "transfer") {
        const canTransfer =
          !isReadOnly &&
          currentLocationId &&
          transferLocationId &&
          Number(currentLocationId) !== Number(transferLocationId);
        btn.disabled = !canTransfer;
      } else {
        btn.disabled = isReadOnly;
      }
    });
    if (focusInput) focusInput.disabled = isReadOnly;
    if (focusApplyBtn) focusApplyBtn.disabled = isReadOnly;
    const adjustLabel = document.getElementById("stock-adjustLabel");
    if (adjustLabel) {
      adjustLabel.textContent = isReceive ? "Receive qty" : "New count";
    }
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
          value: val,
          locationId: currentLocationId
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

  async function handleTransfer(row, sku, totalValue) {
    const val = Number(totalValue);
    if (!Number.isFinite(val) || val <= 0) {
      return;
    }
    if (!currentLocationId || !transferLocationId) return;
    if (Number(currentLocationId) === Number(transferLocationId)) return;
    const item = items.find((entry) => entry.sku === sku);
    if (!item?.variantId) return;
    const oldCount = getStock(sku);
    try {
      const resp = await fetch(`${API_BASE}/inventory-levels/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: item.variantId,
          fromLocationId: currentLocationId,
          toLocationId: transferLocationId,
          quantity: val
        })
      });
      const payload = await resp.json();
      if (!resp.ok) {
        console.warn("Stock transfer failed", payload);
        return;
      }
      const available = Number(payload?.from?.available);
      if (Number.isFinite(available)) {
        setStock(sku, available);
        const currentCell = row.querySelector(`[data-current="${sku}"]`);
        if (currentCell) currentCell.textContent = String(available);
      }
      const modeLabelText = `transfer → ${
        locationNameMap.get(Number(transferLocationId)) || "destination"
      }`;
      appendLogEntry({
        sku,
        oldCount,
        newCount: Number.isFinite(available) ? available : oldCount,
        mode: modeLabelText
      });
    } catch (err) {
      console.error("Stock transfer failed", err);
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

    locationSelect?.addEventListener("change", () => {
      const nextId = Number(locationSelect.value);
      if (!Number.isFinite(nextId)) return;
      currentLocationId = nextId;
      loadStockLevels().then(() => {
        renderTable();
        updateModeUI();
      });
    });

    transferSelect?.addEventListener("change", () => {
      const nextId = Number(transferSelect.value);
      transferLocationId = Number.isFinite(nextId) ? nextId : null;
      updateModeUI();
    });

    tableBody?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-action]");
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      const row = actionBtn.closest("tr");
      if (!row) return;
      if (action === "crate" || action === "box") {
        const datasetKey = action === "crate" ? "crateClicks" : "boxClicks";
        const countKey = action === "crate" ? "crate" : "box";
        const nextClicks = Number(row.dataset[datasetKey] || 0) + 1;
        row.dataset[datasetKey] = String(nextClicks);
        const countEl = row.querySelector(`[data-unit-count='${countKey}']`);
        if (countEl) countEl.textContent = String(nextClicks);
        updateRowTotal(row);
        return;
      }
      const sku = actionBtn.dataset.sku;
      if (!sku) return;
      const totalInput = row.querySelector("input[data-total]");
      if (action === "apply") {
        handleApply(row, sku, totalInput?.value || "0").finally(() => {
          resetRowCounts(row);
        });
        return;
      }
      if (action === "transfer") {
        handleTransfer(row, sku, totalInput?.value || "0").finally(() => {
          resetRowCounts(row);
        });
      }
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
  loadLocations().then(() => {
    loadStockLevels().then(() => {
      renderTable();
      updateModeUI();
    });
  });
  initEvents();
}
