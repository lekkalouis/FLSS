(() => {
  "use strict";

  const PRODUCT_UTILS = window.FLSS_PRODUCT_UTILS || { products: [] };
  const DEFAULT_ITEMS = PRODUCT_UTILS.products || [];

  const CONFIG = { SHOPIFY: { PROXY_BASE: "/shopify" } };
  const LOG_STORAGE_KEY = "fl_stock_update_log_v1";

  const searchInput = document.getElementById("stock-search");
  const tableBody = document.getElementById("stock-tableBody");
  const modeButtons = document.querySelectorAll(".stock-modeBtn");
  const modeLabel = document.getElementById("stock-modeLabel");
  const adjustLabel = document.getElementById("stock-adjustLabel");
  const focusTitle = document.getElementById("stock-focusTitle");
  const focusMeta = document.getElementById("stock-focusMeta");
  const focusInput = document.getElementById("stock-focusInput");
  const focusApply = document.getElementById("stock-focusApply");
  const focusPrev = document.getElementById("stock-focusPrev");
  const focusNext = document.getElementById("stock-focusNext");
  const logBox = document.getElementById("stock-log");
  const statusEl = document.getElementById("stock-status");

  let mode = "take";
  let items = [...DEFAULT_ITEMS];
  let stockLevels = {};
  let focusIndex = 0;

  function setStatus(message, tone = "muted") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = tone === "err" ? "#dc2626" : "#475569";
  }

  function loadStockLog() {
    if (!logBox) return;
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      if (!raw) return;
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        const line = document.createElement("div");
        line.className = "stock-logEntry";
        line.innerHTML = `<span>${entry.time}</span>${entry.message}`;
        logBox.appendChild(line);
      });
    } catch {}
  }

  function persistLogEntry(message) {
    try {
      const raw = localStorage.getItem(LOG_STORAGE_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(entries)) return;
      entries.unshift({ time: new Date().toLocaleTimeString(), message });
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries.slice(0, 200)));
    } catch {}
  }

  function getStock(sku) {
    const val = Number(stockLevels[sku] || 0);
    return Number.isFinite(val) ? val : 0;
  }

  function setStock(sku, value) {
    stockLevels[sku] = Math.max(0, Math.floor(value));
  }


  function logEvent(message) {
    if (!logBox) return;
    const entry = document.createElement("div");
    entry.className = "stock-logEntry";
    entry.innerHTML = `<span>${new Date().toLocaleTimeString()}</span>${message}`;
    logBox.prepend(entry);
    persistLogEntry(message);
  }

  async function fetchInventoryLevels() {
    const variantIds = items.map((item) => item.variantId).filter(Boolean);
    if (!variantIds.length) return;
    const resp = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/inventory/levels/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantIds })
    });
    if (!resp.ok) {
      throw new Error("Unable to fetch inventory levels.");
    }
    const data = await resp.json();
    const levels = data?.levelsByVariantId || {};
    items.forEach((item) => {
      if (!item.variantId) return;
      const key = String(item.variantId);
      if (levels[key] != null) {
        stockLevels[item.sku] = Number(levels[key]) || 0;
      }
    });
  }

  async function updateInventoryLevel(variantId, available) {
    const resp = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/inventory/levels/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId, available })
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => ({}));
      throw new Error(payload?.message || "Inventory update failed.");
    }
    return resp.json();
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

  function renderTable() {
    if (!tableBody) return;
    const list = filteredItems();
    tableBody.innerHTML = list
      .map((item) => {
        const current = getStock(item.sku);
        const actionLabel = mode === "take" ? "Set" : "Add";
        const btnClass = mode === "take" ? "stock-actionBtn" : "stock-actionBtn receive";
        const colour = item.flavourColor || "#cbd5f5";
        return `
          <tr class="stock-row" style="border-left:4px solid ${colour};">
            <td><strong>${item.sku}</strong></td>
            <td>${item.title}</td>
            <td>${current}</td>
            <td>
              <input class="stock-qtyInput" type="number" min="0" step="1" data-sku="${item.sku}" />
            </td>
            <td>
              <button class="${btnClass}" type="button" data-action="apply" data-sku="${item.sku}">${actionLabel}</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderFocus() {
    const list = filteredItems();
    if (!list.length) {
      focusTitle.textContent = "No items found";
      focusMeta.textContent = "Adjust search to continue.";
      focusInput.value = "";
      focusApply.disabled = true;
      return;
    }
    focusApply.disabled = false;
    focusIndex = Math.min(focusIndex, list.length - 1);
    const item = list[focusIndex];
    focusTitle.textContent = item.title;
    focusMeta.textContent = `${item.sku} • Current stock: ${getStock(item.sku)}`;
    focusInput.value = "";
  }

  function updateMode(nextMode) {
    mode = nextMode;
    modeButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.mode === mode);
    });
    modeLabel.textContent = mode === "take" ? "Mode: Stock take" : "Mode: Stock received";
    adjustLabel.textContent = mode === "take" ? "New count" : "Add qty";
    focusApply.textContent = mode === "take" ? "Apply" : "Receive";
    renderTable();
    renderFocus();
  }

  async function handleApply(sku, rawValue, source = "table") {
    const val = Number(rawValue);
    if (!Number.isFinite(val)) {
      logEvent(`Skipped ${sku}: invalid number.`);
      return;
    }
    const item = items.find((entry) => entry.sku === sku);
    if (!item?.variantId) {
      logEvent(`Skipped ${sku}: missing variantId.`);
      return;
    }
    const current = getStock(sku);
    const nextValue = mode === "take" ? Math.floor(val) : current + Math.floor(val);
    if (mode === "take") {
      setStock(sku, nextValue);
      logEvent(`${sku} set to ${nextValue} (${source}).`);
    } else {
      setStock(sku, nextValue);
      logEvent(`${sku} received +${Math.floor(val)} (${source}).`);
    }
    try {
      const update = await updateInventoryLevel(item.variantId, nextValue);
      if (update?.available != null) {
        setStock(sku, update.available);
      }
      setStatus(`Updated ${sku} to ${getStock(sku)}.`, "ok");
    } catch (err) {
      setStatus(err?.message || "Inventory update failed.", "err");
    } finally {
      renderTable();
      renderFocus();
    }
  }

  function stepFocus(delta) {
    const list = filteredItems();
    if (!list.length) return;
    focusIndex = (focusIndex + delta + list.length) % list.length;
    renderFocus();
  }

  function initEvents() {
    searchInput?.addEventListener("input", () => {
      focusIndex = 0;
      renderTable();
      renderFocus();
    });

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        updateMode(btn.dataset.mode || "take");
      });
    });

    tableBody?.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-action='apply']");
      if (!btn) return;
      const sku = btn.dataset.sku;
      const input = tableBody.querySelector(`input[data-sku='${CSS.escape(sku)}']`);
      if (!sku || !input) return;
      await handleApply(sku, input.value, "table");
      input.value = "";
    });

    focusApply?.addEventListener("click", async () => {
      const list = filteredItems();
      const item = list[focusIndex];
      if (!item) return;
      await handleApply(item.sku, focusInput.value, "quick take");
      focusInput.value = "";
      focusInput.focus();
    });

    focusPrev?.addEventListener("click", () => stepFocus(-1));
    focusNext?.addEventListener("click", () => stepFocus(1));
  }

  loadStockLog();
  setStatus("Loading live inventory…");
  fetchInventoryLevels()
    .then(() => {
      setStatus("Inventory synced.");
    })
    .catch((err) => {
      console.error(err);
      setStatus("Unable to load inventory.", "err");
    })
    .finally(() => {
      renderTable();
      renderFocus();
    });
  initEvents();
})();
