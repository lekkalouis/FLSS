(() => {
  "use strict";

  const DEFAULT_ITEMS = [
    { sku: "FL002", title: "Original Multi-Purpose Spice 200ml" },
    { sku: "FL003", title: "Original Multi-Purpose Spice 500g" },
    { sku: "FL004", title: "Original Multi-Purpose Spice 1kg" },
    { sku: "FL005", title: "Original Multi-Purpose Spice Bag 750g" },
    { sku: "FL005-1", title: "Original Multi-Purpose Spice Tub 750g" },
    { sku: "FL008", title: "Hot & Spicy Multi-Purpose Spice 200ml" },
    { sku: "FL009", title: "Hot & Spicy Multi-Purpose Spice 500g" },
    { sku: "FL010", title: "Hot & Spicy Multi-Purpose Spice 1kg" },
    { sku: "FL014", title: "Worcester Sauce Spice 200ml" },
    { sku: "FL015", title: "Worcester Sauce Spice 500g" },
    { sku: "FL016", title: "Worcester Sauce Spice 1kg" },
    { sku: "FL017", title: "Worcester Sauce Spice Bag 750g" },
    { sku: "FL017-1", title: "Worcester Sauce Spice Tub 750g" },
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
    { sku: "FLBS002", title: "Original Multi-Purpose Basting Sauce 12x375ml" }
  ];

  const STORAGE_KEY = "fl_stock_levels_v1";

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

  let mode = "take";
  let items = [...DEFAULT_ITEMS];
  let stockLevels = {};
  let focusIndex = 0;

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

  function addStock(sku, delta) {
    const next = getStock(sku) + Math.floor(delta);
    setStock(sku, next);
  }

  function logEvent(message) {
    if (!logBox) return;
    const entry = document.createElement("div");
    entry.className = "stock-logEntry";
    entry.innerHTML = `<span>${new Date().toLocaleTimeString()}</span>${message}`;
    logBox.prepend(entry);
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
        return `
          <tr>
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

  function handleApply(sku, rawValue, source = "table") {
    const val = Number(rawValue);
    if (!Number.isFinite(val)) {
      logEvent(`Skipped ${sku}: invalid number.`);
      return;
    }
    if (mode === "take") {
      setStock(sku, val);
      logEvent(`${sku} set to ${Math.floor(val)} (${source}).`);
    } else {
      addStock(sku, val);
      logEvent(`${sku} received +${Math.floor(val)} (${source}).`);
    }
    renderTable();
    renderFocus();
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

    tableBody?.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action='apply']");
      if (!btn) return;
      const sku = btn.dataset.sku;
      const input = tableBody.querySelector(`input[data-sku='${CSS.escape(sku)}']`);
      if (!sku || !input) return;
      handleApply(sku, input.value, "table");
      input.value = "";
    });

    focusApply?.addEventListener("click", () => {
      const list = filteredItems();
      const item = list[focusIndex];
      if (!item) return;
      handleApply(item.sku, focusInput.value, "quick take");
      focusInput.focus();
    });

    focusPrev?.addEventListener("click", () => stepFocus(-1));
    focusNext?.addEventListener("click", () => stepFocus(1));
  }

  loadStockLevels();
  renderTable();
  renderFocus();
  initEvents();
})();
