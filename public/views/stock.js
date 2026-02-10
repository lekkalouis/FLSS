import { PRODUCT_LIST } from "./products.js";

let stockInitialized = false;

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;
  "use strict";

  const LOG_STORAGE_KEY = "fl_stock_log_v1";
  const MRP_STORAGE_KEY = "fl_stock_mrp_v1";
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
  const mrpBatchName = document.getElementById("mrp-batchName");
  const mrpSampleWeight = document.getElementById("mrp-sampleWeight");
  const mrpSkuSelect = document.getElementById("mrp-skuSelect");
  const mrpSkuQty = document.getElementById("mrp-skuQty");
  const mrpAddLine = document.getElementById("mrp-addLine");
  const mrpLinesTable = document.getElementById("mrp-linesTable");
  const mrpCreateBatch = document.getElementById("mrp-createBatch");
  const mrpClearLines = document.getElementById("mrp-clearLines");
  const mrpSummaryTable = document.getElementById("mrp-summaryTable");
  const mrpBatchList = document.getElementById("mrp-batchList");

  let items = [...PRODUCT_LIST];
  let stockLevels = {};
  let currentMode = "read";
  let logEntries = [];
  let currentLocationId = null;
  let transferLocationId = null;
  let locations = [];
  let locationNameMap = new Map();
  let mrpState = { batches: [] };
  let mrpDraftLines = [];
  const CRATE_UNITS = 102;
  const BOX_UNITS = 250;

  function getStock(sku) {
    const val = Number(stockLevels[sku] || 0);
    return Number.isFinite(val) ? val : 0;
  }

  function setStock(sku, value) {
    stockLevels[sku] = Math.max(0, Math.floor(value));
  }

  function formatNumber(value, digits = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "--";
    return numeric.toFixed(digits);
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

  function loadMrpState() {
    try {
      const raw = localStorage.getItem(MRP_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.batches)) {
          mrpState = parsed;
          return;
        }
      }
    } catch {}
    mrpState = { batches: [] };
  }

  function saveMrpState() {
    try {
      localStorage.setItem(MRP_STORAGE_KEY, JSON.stringify(mrpState));
    } catch {}
  }

  function getProductBySku(sku) {
    return items.find((entry) => entry.sku === sku);
  }

  function renderMrpSkuOptions() {
    if (!mrpSkuSelect) return;
    mrpSkuSelect.innerHTML = items
      .map((item) => `<option value="${item.sku}">${item.sku} — ${item.title}</option>`)
      .join("");
  }

  function renderDraftLines() {
    if (!mrpLinesTable) return;
    if (!mrpDraftLines.length) {
      mrpLinesTable.innerHTML = `
        <tr>
          <td colspan="4" class="stock-muted">Add line items to build the batch.</td>
        </tr>
      `;
      return;
    }
    mrpLinesTable.innerHTML = mrpDraftLines
      .map((line) => {
        const product = getProductBySku(line.sku);
        return `
          <tr data-sku="${line.sku}">
            <td><strong>${line.sku}</strong></td>
            <td>${product?.title || "Unknown"}</td>
            <td>${formatNumber(line.qty)}</td>
            <td><button class="stock-actionBtn stock-actionBtn--inline" type="button" data-mrp-remove="${line.sku}">Remove</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function getOpenBatches() {
    return mrpState.batches.filter((batch) => batch.status !== "completed");
  }

  function computeCommittedTotals() {
    const totals = new Map();
    getOpenBatches().forEach((batch) => {
      batch.lines.forEach((line) => {
        const current = totals.get(line.sku) || 0;
        totals.set(line.sku, current + Number(line.qty || 0));
      });
    });
    return totals;
  }

  function renderMrpSummary() {
    if (!mrpSummaryTable) return;
    const totals = computeCommittedTotals();
    const rows = Array.from(totals.entries())
      .map(([sku, committed]) => {
        const onHand = getStock(sku);
        const missing = Math.max(0, committed - onHand);
        return `
          <tr>
            <td><strong>${sku}</strong></td>
            <td>${formatNumber(committed)}</td>
            <td>${formatNumber(onHand)}</td>
            <td>${formatNumber(missing)}</td>
          </tr>
        `;
      })
      .join("");
    mrpSummaryTable.innerHTML =
      rows ||
      `
        <tr>
          <td colspan="4" class="stock-muted">No committed items yet.</td>
        </tr>
      `;
  }

  function renderMrpBatches() {
    if (!mrpBatchList) return;
    const batches = mrpState.batches.slice().sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    if (!batches.length) {
      mrpBatchList.innerHTML = `<div class="stock-muted">No production orders yet.</div>`;
      return;
    }
    mrpBatchList.innerHTML = batches
      .map((batch) => {
        const sampleWeightLabel = batch.sampleWeight
          ? `Sample weight: ${formatNumber(batch.sampleWeight, 2)} kg`
          : "Sample weight: —";
        const statusLabel = batch.status === "completed" ? "Completed" : "Open";
        const linesMarkup = batch.lines
          .map((line) => {
            const product = getProductBySku(line.sku);
            const onHand = getStock(line.sku);
            const missing = Math.max(0, line.qty - onHand);
            return `
              <li>
                <strong>${line.sku}</strong> ${product?.title || ""} — ${formatNumber(line.qty)}
                <span class="stock-muted">(On hand ${formatNumber(onHand)}, missing ${formatNumber(missing)})</span>
              </li>
            `;
          })
          .join("");
        return `
          <div class="stock-batchCard" data-batch-id="${batch.id}">
            <div class="stock-batchHeader">
              <div>
                <strong>${batch.name}</strong>
                <div class="stock-batchMeta">${statusLabel} • ${new Date(batch.createdAt).toLocaleString()}</div>
              </div>
              <div class="stock-batchActions">
                <button type="button" class="is-primary" data-batch-action="receive">Receive batch</button>
                <button type="button" data-batch-action="print">Print order</button>
                <button type="button" class="is-danger" data-batch-action="delete">Delete</button>
              </div>
            </div>
            <div class="stock-batchMeta">${sampleWeightLabel}</div>
            <ul class="stock-muted">
              ${linesMarkup}
            </ul>
          </div>
        `;
      })
      .join("");
  }

  async function receiveInventoryLine(line) {
    const item = getProductBySku(line.sku);
    if (!item?.variantId) return null;
    const qty = Number(line.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    const resp = await fetch(`${API_BASE}/inventory-levels/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: item.variantId,
        mode: "receive",
        value: qty,
        locationId: currentLocationId
      })
    });
    const payload = await resp.json();
    if (!resp.ok) {
      console.warn("MRP receive failed", payload);
      return null;
    }
    return Number(payload?.level?.available);
  }

  function updateRowCurrentValue(sku) {
    const row = tableBody?.querySelector(`tr[data-sku="${sku}"]`);
    const currentCell = row?.querySelector(`[data-current="${sku}"]`);
    if (currentCell) currentCell.textContent = String(getStock(sku));
  }

  async function handleBatchReceive(batch) {
    if (!batch || batch.status === "completed") return;
    for (const line of batch.lines) {
      const oldCount = getStock(line.sku);
      const newCount = await receiveInventoryLine(line);
      if (Number.isFinite(newCount)) {
        setStock(line.sku, newCount);
        updateRowCurrentValue(line.sku);
        appendLogEntry({
          sku: line.sku,
          oldCount,
          newCount,
          mode: `batch ${batch.name}`
        });
      }
    }
    batch.status = "completed";
    batch.completedAt = new Date().toISOString();
    saveMrpState();
    renderMrpBatches();
    renderMrpSummary();
  }

  function printProductionOrder(batch) {
    if (!batch) return;
    const linesMarkup = batch.lines
      .map((line) => {
        const product = getProductBySku(line.sku);
        const onHand = getStock(line.sku);
        const missing = Math.max(0, line.qty - onHand);
        return `
          <tr>
            <td>${line.sku}</td>
            <td>${product?.title || ""}</td>
            <td>${formatNumber(line.qty)}</td>
            <td>${formatNumber(onHand)}</td>
            <td>${formatNumber(missing)}</td>
          </tr>
        `;
      })
      .join("");
    const sampleWeightLabel = batch.sampleWeight
      ? `${formatNumber(batch.sampleWeight, 2)} kg`
      : "—";
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Production Order - ${batch.name}</title>
        <style>
          body{ font-family:Arial, sans-serif; color:#0f172a; padding:24px; }
          h1{ margin:0 0 8px 0; font-size:20px; }
          .meta{ margin-bottom:16px; font-size:12px; color:#475569; }
          table{ width:100%; border-collapse:collapse; font-size:12px; }
          th, td{ border:1px solid #e2e8f0; padding:6px 8px; text-align:left; }
          th{ background:#f1f5f9; text-transform:uppercase; font-size:11px; letter-spacing:.05em; }
          .footer{ margin-top:16px; font-size:11px; color:#64748b; }
        </style>
      </head>
      <body>
        <h1>Production order: ${batch.name}</h1>
        <div class="meta">Created: ${new Date(batch.createdAt).toLocaleString()} • Sample weight: ${sampleWeightLabel}</div>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Required</th>
              <th>On hand</th>
              <th>Missing</th>
            </tr>
          </thead>
          <tbody>
            ${linesMarkup}
          </tbody>
        </table>
        <div class="footer">Printed from Stock Take MRP.</div>
      </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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

    mrpAddLine?.addEventListener("click", () => {
      const sku = mrpSkuSelect?.value;
      const qty = Number(mrpSkuQty?.value);
      if (!sku || !Number.isFinite(qty) || qty <= 0) return;
      const existing = mrpDraftLines.find((line) => line.sku === sku);
      if (existing) {
        existing.qty += qty;
      } else {
        mrpDraftLines.push({ sku, qty });
      }
      if (mrpSkuQty) mrpSkuQty.value = "";
      renderDraftLines();
    });

    mrpLinesTable?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-mrp-remove]");
      if (!button) return;
      const sku = button.dataset.mrpRemove;
      mrpDraftLines = mrpDraftLines.filter((line) => line.sku !== sku);
      renderDraftLines();
    });

    mrpClearLines?.addEventListener("click", () => {
      mrpDraftLines = [];
      renderDraftLines();
    });

    mrpCreateBatch?.addEventListener("click", () => {
      const name = mrpBatchName?.value.trim();
      if (!name || !mrpDraftLines.length) return;
      const sampleWeightValue = Number(mrpSampleWeight?.value);
      const sampleWeight = Number.isFinite(sampleWeightValue) && sampleWeightValue > 0
        ? sampleWeightValue
        : null;
      const batch = {
        id: `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        createdAt: new Date().toISOString(),
        sampleWeight,
        status: "open",
        lines: mrpDraftLines.map((line) => ({ ...line }))
      };
      mrpState.batches.unshift(batch);
      saveMrpState();
      mrpDraftLines = [];
      if (mrpBatchName) mrpBatchName.value = "";
      if (mrpSampleWeight) mrpSampleWeight.value = "";
      renderDraftLines();
      renderMrpBatches();
      renderMrpSummary();
    });

    mrpBatchList?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-batch-action]");
      if (!actionBtn) return;
      const batchCard = actionBtn.closest("[data-batch-id]");
      if (!batchCard) return;
      const batchId = batchCard.dataset.batchId;
      const batch = mrpState.batches.find((entry) => entry.id === batchId);
      if (!batch) return;
      const action = actionBtn.dataset.batchAction;
      if (action === "print") {
        printProductionOrder(batch);
        return;
      }
      if (action === "delete") {
        mrpState.batches = mrpState.batches.filter((entry) => entry.id !== batchId);
        saveMrpState();
        renderMrpBatches();
        renderMrpSummary();
        return;
      }
      if (action === "receive") {
        actionBtn.disabled = true;
        handleBatchReceive(batch).finally(() => {
          actionBtn.disabled = false;
        });
      }
    });
  }

  loadLogEntries();
  renderLog();
  loadMrpState();
  renderMrpSkuOptions();
  renderDraftLines();
  renderMrpBatches();
  renderMrpSummary();
  renderTable();
  updateModeUI();
  loadLocations().then(() => {
    loadStockLevels().then(() => {
      renderTable();
      updateModeUI();
      renderMrpSummary();
      renderMrpBatches();
    });
  });
  initEvents();
}
