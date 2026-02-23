import { PRODUCT_LIST } from "./products.js";

let stockInitialized = false;

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;

  const API_BASE = "/api/v1/shopify";
  const LOG_STORAGE_KEY = "fl_stock_log_v2";
  const CRATE_UNITS = 102;

  const poCatalog = [
    { sku: "FL-BLEND-MP", title: "Blended Spice / Original Multi Purpose", icon: "🌿" },
    { sku: "FL-BLEND-HOT", title: "Blended Spice / Hot & Spicy", icon: "🔥" },
    { sku: "FL-BLEND-CM", title: "Blended Spice / Curry Mix", icon: "🍛" },
    { sku: "LB-MP-100", title: "Labelled Bottle / Original / 100ml", icon: "🧴" },
    { sku: "LB-MP-200", title: "Labelled Bottle / Original / 200ml", icon: "🧴" },
    { sku: "LT-CM", title: "Labelled Tub / Curry Mix / 250ml", icon: "🪣" },
    { sku: "LT-MP-750", title: "Labelled Tub / Original / 750g", icon: "🪣" },
    { sku: "FL-PCAP-O", title: "Printed Flip Lid Caps / Orange", icon: "🟠" },
    { sku: "FL-PCAP-R", title: "Printed Flip Lid Caps / Red", icon: "🔴" },
    { sku: "BX-12-200", title: "12 x 200ml BOX", icon: "📦" },
    { sku: "THE-LAB-ST", title: "Thermal Labels / Standard", icon: "🏷️" }
  ];

  const els = {
    root: document.getElementById("viewStock"),
    search: document.getElementById("stock-search"),
    location: document.getElementById("stock-location"),
    modeLabel: document.getElementById("stock-modeLabel"),
    modeBtns: document.querySelectorAll(".stock-modeBtn[data-mode]"),
    areaTabs: document.querySelectorAll(".stock-tabBtn[data-tab]"),
    stockArea: document.getElementById("stock-stockArea"),
    purchaseArea: document.getElementById("stock-purchaseArea"),
    table: document.getElementById("stock-table"),
    tbody: document.getElementById("stock-tableBody"),
    log: document.getElementById("stock-log"),
    missingSummary: document.getElementById("stock-missingSummary"),
    poGrid: document.getElementById("po-grid"),
    poSupplier: document.getElementById("po-supplier"),
    poNote: document.getElementById("po-note"),
    poSubmit: document.getElementById("po-submit"),
    poToast: document.getElementById("po-toast"),
    poOpenTable: document.getElementById("po-openTable"),
    poTabBtns: document.querySelectorAll(".stock-tabBtn[data-po-tab]"),
    poCreatePanel: document.getElementById("po-createPanel"),
    poReceivePanel: document.getElementById("po-receivePanel")
  };

  const finishedGoods = PRODUCT_LIST.filter((p) => !p.isRawMaterial);
  const state = {
    tab: "stock",
    mode: "read",
    poTab: "create",
    stock: new Map(finishedGoods.map((i) => [i.sku, 0])),
    log: [],
    poQty: new Map(),
    locationId: null,
    missingBySku: new Map()
  };

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function setToast(msg) {
    if (!els.poToast) return;
    els.poToast.hidden = false;
    els.poToast.textContent = msg;
    setTimeout(() => {
      if (els.poToast) els.poToast.hidden = true;
    }, 2800);
  }

  function addLog(entry) {
    state.log.unshift({ ts: new Date().toLocaleString(), ...entry });
    state.log = state.log.slice(0, 200);
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(state.log));
    renderLog();
  }

  function renderLog() {
    if (!els.log) return;
    if (!state.log.length) {
      els.log.innerHTML = `<div class="stock-logEntry">No updates yet.</div>`;
      return;
    }
    els.log.innerHTML = state.log
      .map((l) => `<div class="stock-logEntry"><span>${l.ts}</span> <strong>${l.sku}</strong> ${l.msg}</div>`)
      .join("");
  }

  async function loadLocations() {
    if (!els.location) return;
    const resp = await fetch(`${API_BASE}/locations`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return;
    const locations = Array.isArray(payload.locations) ? payload.locations : [];
    els.location.innerHTML = locations.map((l) => `<option value="${l.id}">${l.name || l.id}</option>`).join("");
    if (locations[0]) {
      state.locationId = Number(locations[0].id);
      els.location.value = String(state.locationId);
    }
  }

  async function loadStock() {
    const variantIds = finishedGoods.map((i) => i.variantId).filter(Boolean);
    if (!variantIds.length) return;
    const resp = await fetch(`${API_BASE}/inventory-levels?variantIds=${variantIds.join(",")}${state.locationId ? `&locationId=${state.locationId}` : ""}`);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) return;
    const levels = Array.isArray(payload.levels) ? payload.levels : [];
    const byVar = new Map(levels.map((l) => [Number(l.variantId), Number(l.available || 0)]));
    finishedGoods.forEach((item) => state.stock.set(item.sku, Math.floor(num(byVar.get(Number(item.variantId))))));
  }

  async function loadMissingForOpenOrders() {
    const resp = await fetch(`${API_BASE}/orders/open`);
    const payload = await resp.json().catch(() => ({}));
    state.missingBySku = new Map();
    if (!resp.ok) return;
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    orders.forEach((o) => {
      (o.line_items || []).forEach((li) => {
        const key = String(li.sku || "").trim();
        if (!key) return;
        state.missingBySku.set(key, (state.missingBySku.get(key) || 0) + Math.max(0, num(li.quantity_remaining ?? li.quantity)));
      });
    });
  }

  function filteredItems() {
    const q = String(els.search?.value || "").trim().toLowerCase();
    return finishedGoods.filter((i) => !q || `${i.sku} ${i.title} ${i.flavour || ""}`.toLowerCase().includes(q));
  }

  function renderMissingSummary() {
    if (!els.missingSummary) return;
    if (state.mode !== "make") {
      els.missingSummary.hidden = true;
      return;
    }
    const rows = filteredItems()
      .map((i) => {
        const demand = num(state.missingBySku.get(i.sku));
        const onHand = num(state.stock.get(i.sku));
        const missing = Math.max(0, demand - onHand);
        return { i, missing };
      })
      .filter((r) => r.missing > 0)
      .sort((a, b) => b.missing - a.missing)
      .slice(0, 12)
      .map((r) => `<span class="stock-pill">${r.i.sku}: ${r.missing}</span>`)
      .join(" ");
    els.missingSummary.hidden = false;
    els.missingSummary.innerHTML = rows || `<span class="stock-muted">No shortages against currently open orders.</span>`;
  }

  function rowMarkup(item) {
    const current = num(state.stock.get(item.sku));
    const demand = num(state.missingBySku.get(item.sku));
    const missing = Math.max(0, demand - current);
    return `
      <tr data-sku="${item.sku}" data-crates="0">
        <td><strong>${item.sku}</strong></td>
        <td>${item.title}</td>
        <td><span class="stock-flavourBadge">${item.flavour || "-"}</span></td>
        <td class="${current < 0 ? "stock-neg" : ""}" data-current>${current}</td>
        <td class="stock-countCol"><input class="stock-qtyInput" type="number" min="0" step="1" data-manual /></td>
        <td class="stock-countCol"><button class="stock-iconBtn" type="button" data-action="crate">🧺 +${CRATE_UNITS}</button> <span data-crate-count>0</span></td>
        <td class="stock-countCol" data-new-total>${current}</td>
        <td class="stock-countCol" data-diff>0</td>
        <td class="stock-countCol"><button class="stock-actionBtn" type="button" data-action="set">Set</button></td>
        <td class="stock-makeCol">${missing}</td>
      </tr>
    `;
  }

  function renderTable() {
    if (!els.tbody) return;
    els.tbody.innerHTML = filteredItems().map(rowMarkup).join("");
    updateModeUI();
  }

  function updateRowTotals(row) {
    const current = num(row.querySelector("[data-current]")?.textContent);
    const manual = Math.max(0, Math.floor(num(row.querySelector("[data-manual]")?.value)));
    const crates = Math.max(0, Math.floor(num(row.dataset.crates)));
    const next = manual + crates * CRATE_UNITS;
    const diff = next - current;
    row.querySelector("[data-new-total]").textContent = String(next);
    row.querySelector("[data-diff]").textContent = String(diff);
  }

  async function setInventory(item, nextValue, modeForLog) {
    const resp = await fetch(`${API_BASE}/inventory-levels/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantId: item.variantId, mode: "count", value: nextValue, locationId: state.locationId })
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.message || "Stock update failed");
    const available = Math.floor(num(payload?.level?.available));
    state.stock.set(item.sku, available);
    addLog({ sku: item.sku, msg: `${modeForLog}: ${nextValue} (Δ ${nextValue - num(payload?.previous?.available || 0)})` });
  }

  function updateModeUI() {
    els.table.dataset.mode = state.mode;
    if (els.modeLabel) els.modeLabel.textContent = `Mode: ${state.mode[0].toUpperCase()}${state.mode.slice(1)}`;
    const isRead = state.mode === "read";
    const isMake = state.mode === "make";
    els.root.dataset.mode = state.mode;
    els.root.dataset.tab = state.tab;
    els.tbody?.querySelectorAll("[data-manual], .stock-iconBtn, .stock-actionBtn").forEach((el) => {
      el.disabled = isRead || isMake;
    });
    renderMissingSummary();
  }

  function renderPOGrid() {
    if (!els.poGrid) return;
    els.poGrid.innerHTML = poCatalog
      .map((p) => {
        const qty = Math.max(0, Math.floor(num(state.poQty.get(p.sku))));
        return `<article class="stock-poItem"><div class="stock-poIcon">${p.icon}</div><div><div class="name">${p.title}</div><div class="meta">${p.sku}</div></div><input type="number" min="0" step="1" data-po-sku="${p.sku}" class="stock-qtyInput" value="${qty}" /></article>`;
      })
      .join("");
  }

  async function createPO() {
    const lines = poCatalog
      .map((p) => ({ sku: p.sku, title: p.title, quantity: Math.max(0, Math.floor(num(state.poQty.get(p.sku)))) }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) return;
    const resp = await fetch(`${API_BASE}/purchase-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierName: String(els.poSupplier?.value || ""), note: String(els.poNote?.value || ""), lines })
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.message || "Could not create PO");
    setToast("Purchase order draft created successfully.");
    state.poQty.clear();
    renderPOGrid();
    await loadOpenPOs();
  }

  async function loadOpenPOs() {
    if (!els.poOpenTable) return;
    const resp = await fetch(`${API_BASE}/purchase-orders/open`);
    const payload = await resp.json().catch(() => ({}));
    const list = resp.ok ? (payload.purchaseOrders || []) : [];
    els.poOpenTable.innerHTML = list
      .map((po) => {
        const lineCount = (po.line_items || []).reduce((s, l) => s + num(l.quantity), 0);
        return `<tr data-po-id="${po.id}"><td>${po.name || po.id}</td><td>${new Date(po.created_at || Date.now()).toLocaleString()}</td><td>${lineCount}</td><td><button class="stock-actionBtn" data-po-action="receive">Receive</button> <button class="stock-actionBtn" data-po-action="print" ${po.adminUrl ? "" : "disabled"}>Print docs</button></td></tr>`;
      })
      .join("") || `<tr><td colspan="4" class="stock-muted">No open PO drafts found.</td></tr>`;
  }

  function switchTab(tab) {
    state.tab = tab;
    els.stockArea.hidden = tab !== "stock";
    els.purchaseArea.hidden = tab !== "purchase";
    els.areaTabs.forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  }

  function switchPoTab(tab) {
    state.poTab = tab;
    els.poCreatePanel.hidden = tab !== "create";
    els.poReceivePanel.hidden = tab !== "receive";
    els.poTabBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.poTab === tab));
  }

  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    state.log = raw ? JSON.parse(raw) : [];
  } catch {
    state.log = [];
  }

  els.search?.addEventListener("input", renderTable);
  els.location?.addEventListener("change", async () => {
    state.locationId = Number(els.location.value);
    await loadStock();
    renderTable();
  });

  els.modeBtns.forEach((b) => b.addEventListener("click", () => {
    state.mode = b.dataset.mode;
    els.modeBtns.forEach((x) => x.classList.toggle("is-active", x === b));
    updateModeUI();
  }));

  els.areaTabs.forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  els.poTabBtns.forEach((b) => b.addEventListener("click", async () => {
    switchPoTab(b.dataset.poTab);
    if (b.dataset.poTab === "receive") await loadOpenPOs();
  }));

  els.tbody?.addEventListener("input", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    if (e.target.matches("[data-manual]")) updateRowTotals(row);
  });

  els.tbody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    if (!row) return;
    if (btn.dataset.action === "crate") {
      row.dataset.crates = String(num(row.dataset.crates) + 1);
      const countEl = row.querySelector("[data-crate-count]");
      if (countEl) countEl.textContent = String(row.dataset.crates);
      updateRowTotals(row);
      return;
    }
    if (btn.dataset.action === "set") {
      const sku = row.dataset.sku;
      const item = finishedGoods.find((i) => i.sku === sku);
      if (!item?.variantId) return;
      const nextVal = Math.floor(num(row.querySelector("[data-new-total]")?.textContent));
      const current = num(state.stock.get(sku));
      const diff = nextVal - current;
      try {
        await setInventory(item, nextVal, "count");
        state.stock.set(sku, nextVal);
        addLog({ sku, msg: `count set to ${nextVal} (diff ${diff >= 0 ? "+" : ""}${diff})` });
        renderTable();
      } catch (err) {
        addLog({ sku, msg: `update failed: ${String(err.message || err)}` });
      }
    }
  });

  els.poGrid?.addEventListener("input", (e) => {
    const input = e.target.closest("input[data-po-sku]");
    if (!input) return;
    state.poQty.set(input.dataset.poSku, Math.max(0, Math.floor(num(input.value))));
  });

  els.poSubmit?.addEventListener("click", async () => {
    try {
      await createPO();
    } catch (err) {
      setToast(String(err?.message || err));
    }
  });

  els.poOpenTable?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-po-action]");
    if (!btn) return;
    const row = btn.closest("tr[data-po-id]");
    if (!row) return;
    if (btn.dataset.poAction === "print") {
      window.open(`https://${location.host}/purchase-orders`, "_blank", "noopener,noreferrer");
      return;
    }
    if (btn.dataset.poAction === "receive") {
      setToast("PO receive logged. Print templates can be triggered from Shopify OrderPrinterPro.");
      addLog({ sku: row.dataset.poId, msg: "PO marked as received (manual template print required)." });
      row.remove();
    }
  });

  Promise.resolve()
    .then(loadLocations)
    .then(loadStock)
    .then(loadMissingForOpenOrders)
    .then(() => {
      renderPOGrid();
      renderTable();
      renderLog();
      switchTab("stock");
      switchPoTab("create");
      updateModeUI();
    });
}
