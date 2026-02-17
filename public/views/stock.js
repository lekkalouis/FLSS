import { PRODUCT_LIST } from "./products.js";

let stockInitialized = false;

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;
  "use strict";

  const LOG_STORAGE_KEY = "fl_stock_log_v1";
  const MRP_STORAGE_KEY = "fl_stock_mrp_v1";
  const LOCATION_STORAGE_KEY = "fl_stock_location_v1";
  const API_BASE = "/api/v1/shopify";

  const rootView = document.getElementById("viewStock");
  const searchInput = document.getElementById("stock-search");
  const modeButtons = document.querySelectorAll(".stock-modeBtn");
  const tabButtons = document.querySelectorAll(".stock-tabBtn");
  const flavourFilters = document.getElementById("stock-flavourFilters");
  const buyPanel = document.getElementById("stock-buyPanel");
  const modeLabel = document.getElementById("stock-modeLabel");
  const table = document.getElementById("stock-table");
  const tableBody = document.getElementById("stock-tableBody");
  const logContainer = document.getElementById("stock-log");
  const locationSelect = document.getElementById("stock-location");
  const transferSelect = document.getElementById("stock-transferLocation");
  const focusInput = document.getElementById("stock-focusInput");
  const focusApplyBtn = document.getElementById("stock-focusApply");
  const poBatchName = document.getElementById("po-batchName");
  const poSkuSelect = document.getElementById("po-skuSelect");
  const poSkuQty = document.getElementById("po-skuQty");
  const poAddLine = document.getElementById("po-addLine");
  const poLinesTable = document.getElementById("po-linesTable");
  const poCreateBatch = document.getElementById("po-createBatch");
  const poClearLines = document.getElementById("po-clearLines");
  const poBatchList = document.getElementById("po-batchList");

  const RAW_MATERIALS = [
    { sku: "RM-BASE-ORIG", title: "Original base blend (Draft)", variantId: null, isRawMaterial: true, isDraft: true },
    { sku: "RM-BASE-HOT", title: "Hot & spicy base blend (Draft)", variantId: null, isRawMaterial: true, isDraft: true },
    { sku: "RM-PACK-200", title: "200ml shaker packs (Draft)", variantId: null, isRawMaterial: true, isDraft: true },
    { sku: "RM-PACK-500", title: "500g pouches (Draft)", variantId: null, isRawMaterial: true, isDraft: true },
    { sku: "RM-LABEL", title: "Product labels (Draft)", variantId: null, isRawMaterial: true, isDraft: true }
  ];

  const finishedGoods = PRODUCT_LIST.filter((item) => !item.isRawMaterial);
  const rawMaterials = RAW_MATERIALS;
  let items = [...finishedGoods];
  let stockLevels = {};
  let currentMode = "read";
  let activeTab = "count";
  let activeFlavour = "all";
  let logEntries = [];
  let currentLocationId = null;
  let transferLocationId = null;
  let locations = [];
  let locationNameMap = new Map();
  let mrpState = { batches: [], purchaseOrders: [] };
  let mrpDraftLines = [];
  let poDraftLines = [];
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

  function getSavedLocationId() {
    try {
      const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function saveLocationId(locationId) {
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, String(locationId));
    } catch {}
  }

  async function loadStockLevels() {
    stockLevels = Object.fromEntries([...finishedGoods, ...rawMaterials].map((item) => [item.sku, Number(stockLevels[item.sku] || 0)]));
    try {
      const variantIds = finishedGoods.map((item) => item.variantId).filter(Boolean);
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
      finishedGoods.forEach((item) => {
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
          mrpState = {
            batches: parsed.batches,
            purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : []
          };
          return;
        }
      }
    } catch {}
    mrpState = { batches: [], purchaseOrders: [] };
  }

  function saveMrpState() {
    try {
      localStorage.setItem(MRP_STORAGE_KEY, JSON.stringify(mrpState));
    } catch {}
  }

  function getProductBySku(sku) {
    return items.find((entry) => entry.sku === sku);
  }

  function renderFlavourFilters() {
    if (!flavourFilters) return;
    const flavours = [...new Set(finishedGoods.map((item) => item.flavour).filter(Boolean))].sort();
    const chips = [{ label: "All flavours", value: "all" }, ...flavours.map((flavour) => ({ label: flavour, value: flavour }))];
    flavourFilters.innerHTML = chips
      .map((chip) => `<button class="stock-chip ${activeFlavour === chip.value ? "is-active" : ""}" type="button" data-flavour="${chip.value}">${chip.label}</button>`)
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

  function renderPoSkuOptions() {
    if (!poSkuSelect) return;
    poSkuSelect.innerHTML = rawMaterials
      .map((item) => `<option value="${item.sku}">${item.sku} — ${item.title}</option>`)
      .join("");
  }

  function renderPoDraftLines() {
    if (!poLinesTable) return;
    if (!poDraftLines.length) {
      poLinesTable.innerHTML = `
        <tr>
          <td colspan="4" class="stock-muted">Add raw material lines to create a purchase order.</td>
        </tr>
      `;
      return;
    }
    poLinesTable.innerHTML = poDraftLines
      .map((line) => {
        const product = rawMaterials.find((entry) => entry.sku === line.sku);
        return `
          <tr data-sku="${line.sku}">
            <td><strong>${line.sku}</strong></td>
            <td>${product?.title || "Unknown"}</td>
            <td>${formatNumber(line.qty)}</td>
            <td><button class="stock-actionBtn stock-actionBtn--inline" type="button" data-po-remove="${line.sku}">Remove</button></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderPoBatches() {
    if (!poBatchList) return;
    const batches = (mrpState.purchaseOrders || []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!batches.length) {
      poBatchList.innerHTML = `<div class="stock-muted">No purchase orders yet.</div>`;
      return;
    }
    poBatchList.innerHTML = batches
      .map((batch) => {
        const lines = batch.lines
          .map((line) => `<li><strong>${line.sku}</strong> × ${formatNumber(line.qty)}</li>`)
          .join("");
        const status = batch.status === "received" ? "Received" : "Open";
        return `
          <div class="stock-batchCard" data-po-id="${batch.id}">
            <div class="stock-batchHeader">
              <div>
                <strong>${batch.name}</strong>
                <div class="stock-batchMeta">${status} • ${new Date(batch.createdAt).toLocaleString()}</div>
              </div>
              <div class="stock-batchActions">
                ${batch.status !== "received" ? '<button type="button" class="is-primary" data-po-action="receive">Receive PO</button>' : ""}
                <button type="button" class="is-danger" data-po-action="delete">Delete</button>
              </div>
            </div>
            <ul class="stock-muted">${lines}</ul>
          </div>
        `;
      })
      .join("");
  }

  function getOpenBatches() { return []; }

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
    const mrpSummaryTable = document.getElementById("mrp-summaryTable");
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
    const mrpBatchList = document.getElementById("mrp-batchList");
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
      const savedLocationId = getSavedLocationId();
      const chosenLocation = locations.find((loc) => Number(loc.id) === Number(currentLocationId))
        || locations.find((loc) => Number(loc.id) === Number(savedLocationId))
        || locations[0];
      if (chosenLocation) {
        currentLocationId = Number(chosenLocation.id);
        locationSelect.value = String(currentLocationId);
        saveLocationId(currentLocationId);
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
    const sourceItems = activeTab === "buy" ? rawMaterials : finishedGoods;
    items = sourceItems;
    const q = (searchInput?.value || "").trim().toLowerCase();
    const filteredByFlavour = sourceItems.filter((item) => {
      if (activeTab === "buy") return true;
      return activeFlavour === "all" || item.flavour === activeFlavour;
    });
    if (!q) return filteredByFlavour;
    return filteredByFlavour.filter(
      (item) =>
        item.sku.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        String(item.flavour || "").toLowerCase().includes(q)
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
            <td><span class="stock-flavourBadge">${item.flavour || "Raw material"}</span></td>
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
              ${activeTab === "buy" ? `<button class="stock-actionBtn po" type="button" data-action="add-po" data-sku="${item.sku}">Draft PO</button>` : ""}
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
        ? "Mode: Stock received (raw materials)"
        : currentMode === "take"
        ? "Mode: Stock take"
        : "Mode: Read only";
    }
    if (table) {
      table.dataset.mode = currentMode;
    }
    if (rootView) {
      rootView.dataset.mode = currentMode;
      rootView.dataset.tab = activeTab;
    }
    if (buyPanel) buyPanel.hidden = activeTab !== "buy";
    if (flavourFilters) flavourFilters.hidden = activeTab === "buy";
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
          !isReceive &&
          currentLocationId &&
          transferLocationId &&
          Number(currentLocationId) !== Number(transferLocationId);
        btn.disabled = !canTransfer;
      } else {
        btn.disabled = isReadOnly && btn.dataset.action !== "add-po";
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
    const item = [...finishedGoods, ...rawMaterials].find((entry) => entry.sku === sku);
    if (!item) return;

    const oldCount = getStock(sku);

    if (!item.variantId) {
      const nextCount = currentMode === "receive" ? oldCount + Math.max(0, Math.floor(val)) : Math.max(0, Math.floor(val));
      setStock(sku, nextCount);
      const currentCell = row.querySelector(`[data-current="${sku}"]`);
      if (currentCell) currentCell.textContent = String(nextCount);
      appendLogEntry({
        sku,
        oldCount,
        newCount: nextCount,
        mode: currentMode === "receive" ? "receive" : "take"
      });
      return;
    }

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
        renderTable();
        updateModeUI();
      });
    });

    locationSelect?.addEventListener("change", () => {
      const nextId = Number(locationSelect.value);
      if (!Number.isFinite(nextId)) return;
      currentLocationId = nextId;
      saveLocationId(currentLocationId);
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
        return;
      }
      if (action === "add-po") {
        const qty = Math.max(0, Math.floor(Number(totalInput?.value) || 0));
        if (qty <= 0) return;
        const existing = poDraftLines.find((line) => line.sku === sku);
        if (existing) existing.qty += qty;
        else poDraftLines.push({ sku, qty });
        renderPoDraftLines();
        resetRowCounts(row);
      }
    });

    flavourFilters?.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-flavour]");
      if (!chip) return;
      activeFlavour = chip.dataset.flavour || "all";
      renderFlavourFilters();
      renderTable();
      updateModeUI();
    });

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab || "count";
        tabButtons.forEach((tabBtn) => tabBtn.classList.toggle("is-active", tabBtn === btn));
        if (activeTab === "buy" && currentMode === "take") currentMode = "receive";
        if (activeTab === "count" && currentMode === "receive") currentMode = "take";
        renderFlavourFilters();
        renderTable();
        updateModeUI();
      });
    });

    tableBody?.addEventListener("input", (event) => {
      const input = event.target.closest("input[data-count]");
      if (!input) return;
      const row = input.closest("tr");
      if (!row) return;
      updateRowTotal(row);
    });


    poAddLine?.addEventListener("click", () => {
      const sku = poSkuSelect?.value;
      const qty = Number(poSkuQty?.value);
      if (!sku || !Number.isFinite(qty) || qty <= 0) return;
      const existing = poDraftLines.find((line) => line.sku === sku);
      if (existing) {
        existing.qty += qty;
      } else {
        poDraftLines.push({ sku, qty });
      }
      if (poSkuQty) poSkuQty.value = "";
      renderPoDraftLines();
    });

    poLinesTable?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-po-remove]");
      if (!button) return;
      const sku = button.dataset.poRemove;
      poDraftLines = poDraftLines.filter((line) => line.sku !== sku);
      renderPoDraftLines();
    });

    poClearLines?.addEventListener("click", () => {
      poDraftLines = [];
      renderPoDraftLines();
    });

    poCreateBatch?.addEventListener("click", () => {
      const name = poBatchName?.value.trim();
      if (!name || !poDraftLines.length) return;
      const batch = {
        id: `po-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        createdAt: new Date().toISOString(),
        status: "open",
        lines: poDraftLines.map((line) => ({ ...line }))
      };
      mrpState.purchaseOrders = mrpState.purchaseOrders || [];
      mrpState.purchaseOrders.unshift(batch);
      saveMrpState();
      poDraftLines = [];
      if (poBatchName) poBatchName.value = "";
      renderPoDraftLines();
      renderPoBatches();
    });

    poBatchList?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-po-action]");
      if (!actionBtn) return;
      const card = actionBtn.closest("[data-po-id]");
      if (!card) return;
      const poId = card.dataset.poId;
      const list = mrpState.purchaseOrders || [];
      const po = list.find((entry) => entry.id === poId);
      if (!po) return;
      const action = actionBtn.dataset.poAction;
      if (action === "delete") {
        mrpState.purchaseOrders = list.filter((entry) => entry.id !== poId);
        saveMrpState();
        renderPoBatches();
        return;
      }
      if (action === "receive") {
        po.lines.forEach((line) => {
          const oldCount = getStock(line.sku);
          const receiveQty = Math.max(0, Math.floor(Number(line.qty) || 0));
          setStock(line.sku, oldCount + receiveQty);
          appendLogEntry({
            sku: line.sku,
            oldCount,
            newCount: oldCount + receiveQty,
            mode: "receive-po"
          });
        });
        po.status = "received";
        po.receivedAt = new Date().toISOString();
        saveMrpState();
        renderTable();
        renderPoBatches();
      }
    });

    const mrpBatchList = document.getElementById("mrp-batchList");
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
  renderFlavourFilters();
  renderLog();
  loadMrpState();
  renderPoSkuOptions();
  renderPoDraftLines();
  renderMrpBatches();
  renderPoBatches();
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
