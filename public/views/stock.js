import { resolveFlavourColor } from "./flavour-map.js";

let stockInitialized = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round2(value) {
  return Math.round((asNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

function formatInspectionAnswer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "yes") return "Yes";
  if (normalized === "no") return "No";
  return "-";
}

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;

  const API_BASE = "/api/v1";
  const root = document.getElementById("viewStock");
  if (!root) return;

  root.innerHTML = `
    <div class="uo-shell">
      <section class="uo-hero">
        <div>
          <p class="uo-eyebrow">Stock</p>
          <h2>Inventory and traceability</h2>
          <p class="uo-copy">Inventory is operational here. Product, material, and supplier editing now lives under Admin, while batches focus on traceability and stocktakes close actual inventory movements.</p>
        </div>
        <div class="uo-toolbar">
          <input id="stockSearch" class="uo-input" type="search" placeholder="Search SKU, product, flavour, material, or supplier" />
          <button class="stock-secondaryBtn" type="button" data-route="/admin" data-admin-tab="materials">Manage catalog</button>
        </div>
      </section>

      <section class="uo-card">
        <div class="uo-tabRow" role="tablist" aria-label="Stock sections">
          <button class="uo-tabBtn is-active" type="button" data-stock-primary="inventory" data-stock-tab-target="inventory" aria-selected="true">Inventory</button>
          <button class="uo-tabBtn" type="button" data-stock-primary="batches" data-stock-tab-target="batches" aria-selected="false">Batches</button>
          <button class="uo-tabBtn" type="button" data-stock-primary="stocktakes" data-stock-tab-target="stocktakes" aria-selected="false">Stocktakes</button>
        </div>
        <div id="stockStatus" class="uo-inlineStatus">Loading inventory...</div>
      </section>

      <section id="stockPanelInventory">
        <div class="uo-subtabRow" role="tablist" aria-label="Inventory tabs">
          <button class="uo-subtabBtn is-active" type="button" data-stock-inventory-tab="products" aria-selected="true">Products</button>
          <button class="uo-subtabBtn" type="button" data-stock-inventory-tab="materials" aria-selected="false">Materials</button>
        </div>
        <div id="stockInventoryProducts">
          <article class="uo-card uo-card--inner">
            <div class="uo-sectionHead"><div><h3>Finished goods</h3><p>On hand, open sales demand, free stock, and planned manufacturing incoming.</p></div></div>
            <div class="uo-tableWrap">
              <table class="stock-table">
                <thead><tr><th>SKU</th><th>Product</th><th>Flavour</th><th>On hand</th><th>Open sales demand</th><th>Free stock</th><th>Planned incoming</th><th>Status</th></tr></thead>
                <tbody id="stockProductsBody"></tbody>
              </table>
            </div>
          </article>
        </div>
        <div id="stockInventoryMaterials" hidden>
          <div class="uo-grid uo-grid--two">
            <article class="uo-card uo-card--inner">
              <div class="uo-sectionHead"><div><h3>Materials</h3><p>Read-only inventory view. Edit master data and supplier mappings in Admin.</p></div></div>
              <div class="uo-actions">
                <button class="stock-secondaryBtn" type="button" data-route="/admin" data-admin-tab="materials">Open Admin materials</button>
                <button class="stock-secondaryBtn" type="button" data-route="/admin" data-admin-tab="suppliers">Open suppliers</button>
              </div>
              <div class="uo-tableWrap">
                <table class="stock-table">
                  <thead><tr><th>SKU</th><th>Material</th><th>Category</th><th>On hand</th><th>Allocated</th><th>Available</th><th>Suppliers</th><th>Preferred</th><th>Source</th></tr></thead>
                  <tbody id="stockMaterialsBody"></tbody>
                </table>
              </div>
            </article>
            <article class="uo-card uo-card--inner">
              <div class="uo-sectionHead"><div><h3>Catalog guidance</h3><p>How Buy and Make use these numbers.</p></div></div>
              <div class="summaryCard">Available = on hand minus released manufacturing reservations.
Draft manufacturing orders do not reserve stock.
Buy supplier selectors come from the material supplier mappings in Admin.
If a material has no supplier options, Buy blocks PO creation for that line.</div>
            </article>
          </div>
        </div>
      </section>

      <section id="stockPanelBatches" hidden>
        <div class="uo-grid uo-grid--two">
          <article class="uo-card uo-card--inner">
            <div class="uo-sectionHead"><div><h3>How batches work</h3><p>Traceability rules for receipts, opening balances, and finished goods.</p></div></div>
            <div class="summaryCard">Receipt batches are created when a purchase order is received.
Opening batches are auto-created for legacy stock that had quantity but no traceability row yet.
Finished batches are created when a manufacturing order completes.
Remaining qty shows what is still physically available inside that batch after consumption.</div>
            <div class="uo-subtabRow" role="tablist" aria-label="Batch filters">
              <button class="uo-subtabBtn is-active" type="button" data-batch-filter="all">All</button>
              <button class="uo-subtabBtn" type="button" data-batch-filter="receipt">Receipts</button>
              <button class="uo-subtabBtn" type="button" data-batch-filter="finished">Finished goods</button>
              <button class="uo-subtabBtn" type="button" data-batch-filter="opening">Opening balances</button>
            </div>
            <div class="uo-tableWrap">
              <table class="stock-table">
                <thead><tr><th>Batch</th><th>Type</th><th>Item</th><th>Supplier</th><th>Total</th><th>Remaining</th><th>Source</th><th>Action</th></tr></thead>
                <tbody id="stockBatchesBody"></tbody>
              </table>
            </div>
          </article>
          <article class="uo-card uo-card--inner">
            <div class="uo-sectionHead"><div><h3>Batch detail</h3><p>Open a batch row to inspect movements, upstream allocations, and downstream finished-batch links.</p></div></div>
            <div id="stockBatchDetail" class="stock-emptyCard">Select a batch to inspect its traceability chain.</div>
          </article>
        </div>
      </section>

      <section id="stockPanelStocktakes" hidden>
        <div class="uo-grid uo-grid--two">
          <article class="uo-card uo-card--inner">
            <div class="uo-sectionHead"><div><h3>Close a stocktake</h3><p>Count finished goods, materials, or both. FLSS writes stock movements and Shopify sync deltas where mappings exist.</p></div></div>
            <div class="uo-toolbar">
              <select id="stocktakeScope" class="uo-select"><option value="full">Full location</option><option value="finished-goods">Finished goods</option><option value="raw-materials">Raw materials</option></select>
              <input id="stocktakeSearch" class="uo-input" type="search" placeholder="Search items in this count" />
              <button id="stocktakeSubmit" class="stock-primaryBtn" type="button">Close stocktake</button>
            </div>
            <div id="stocktakeStatus" class="uo-inlineStatus">Load current quantities, adjust counted values, then close the stocktake.</div>
            <div class="uo-tableWrap">
              <table class="stock-table">
                <thead><tr><th>Type</th><th>SKU</th><th>Item</th><th>Category</th><th>Current</th><th>Counted</th></tr></thead>
                <tbody id="stocktakeBody"></tbody>
              </table>
            </div>
          </article>
          <article class="uo-card uo-card--inner">
            <div class="uo-sectionHead"><div><h3>Recent stocktakes</h3><p>Closed stocktake sessions.</p></div></div>
            <div id="stocktakeHistory" class="stock-historyGrid"></div>
            <div class="uo-sectionHead" style="margin-top:1rem;"><div><h3>Audit log</h3><p>Mutating actions across stock, buy, and make.</p></div></div>
            <form id="stockAuditFilters" class="uo-toolbar">
              <input class="uo-input" type="search" name="entity_type" placeholder="Entity type" />
              <input class="uo-input" type="search" name="action" placeholder="Action" />
              <input class="uo-input" type="search" name="status" placeholder="Status" />
              <button class="stock-secondaryBtn" type="submit">Filter log</button>
            </form>
            <div id="stockAuditStatus" class="uo-inlineStatus">Loading audit log...</div>
            <div class="uo-tableWrap">
              <table class="stock-table">
                <thead><tr><th>Occurred</th><th>Surface</th><th>Action</th><th>Entity</th><th>ID</th><th>Status</th></tr></thead>
                <tbody id="stockAuditBody"></tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </div>
  `;

  const els = {
    status: document.getElementById("stockStatus"),
    search: document.getElementById("stockSearch"),
    primaryTabs: Array.from(root.querySelectorAll("[data-stock-primary]")),
    inventoryTabs: Array.from(root.querySelectorAll("[data-stock-inventory-tab]")),
    productsBody: document.getElementById("stockProductsBody"),
    materialsBody: document.getElementById("stockMaterialsBody"),
    batchFilterButtons: Array.from(root.querySelectorAll("[data-batch-filter]")),
    batchesBody: document.getElementById("stockBatchesBody"),
    batchDetail: document.getElementById("stockBatchDetail"),
    stocktakeScope: document.getElementById("stocktakeScope"),
    stocktakeSearch: document.getElementById("stocktakeSearch"),
    stocktakeBody: document.getElementById("stocktakeBody"),
    stocktakeSubmit: document.getElementById("stocktakeSubmit"),
    stocktakeStatus: document.getElementById("stocktakeStatus"),
    stocktakeHistory: document.getElementById("stocktakeHistory"),
    auditFilters: document.getElementById("stockAuditFilters"),
    auditStatus: document.getElementById("stockAuditStatus"),
    auditBody: document.getElementById("stockAuditBody")
  };

  const state = {
    primaryTab: "inventory",
    inventoryTab: "products",
    batchFilter: "all",
    products: [],
    materials: [],
    batches: [],
    stocktakes: [],
    auditRows: [],
    stocktakeCounts: new Map()
  };

  const setStatus = (message) => { if (els.status) els.status.textContent = String(message || ""); };

  const setPrimaryTab = (tab) => {
    state.primaryTab = tab;
    els.primaryTabs.forEach((button) => {
      const active = button.dataset.stockPrimary === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    root.querySelector("#stockPanelInventory").hidden = tab !== "inventory";
    root.querySelector("#stockPanelBatches").hidden = tab !== "batches";
    root.querySelector("#stockPanelStocktakes").hidden = tab !== "stocktakes";
  };

  const setInventoryTab = (tab) => {
    state.inventoryTab = tab;
    els.inventoryTabs.forEach((button) => {
      const active = button.dataset.stockInventoryTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    root.querySelector("#stockInventoryProducts").hidden = tab !== "products";
    root.querySelector("#stockInventoryMaterials").hidden = tab !== "materials";
  };

  function filteredProducts() {
    const query = String(els.search.value || "").trim().toLowerCase();
    return state.products.filter((product) => {
      const haystack = `${product.sku} ${product.title} ${product.flavour || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function filteredMaterials() {
    const query = String(els.search.value || "").trim().toLowerCase();
    return state.materials.filter((material) => {
      const haystack = `${material.sku} ${material.title} ${material.category} ${material.preferred_supplier?.name || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function filteredStocktakeItems() {
    const query = String(els.stocktakeSearch.value || "").trim().toLowerCase();
    const scope = String(els.stocktakeScope.value || "full");
    const products = state.products.filter(() => scope === "full" || scope === "finished-goods").map((product) => ({
      entity_type: "product",
      key: `product:${product.sku}`,
      sku: product.sku,
      title: product.title,
      category: "Finished good",
      current: asNumber(product.on_hand, 0)
    }));
    const materials = state.materials.filter(() => scope === "full" || scope === "raw-materials").map((material) => ({
      entity_type: "material",
      key: `material:${material.id}`,
      material_id: material.id,
      sku: material.sku,
      title: material.title,
      category: material.category,
      current: asNumber(material.on_hand, 0)
    }));
    return [...products, ...materials].filter((item) => {
      const haystack = `${item.sku} ${item.title} ${item.category}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function renderProducts() {
    els.productsBody.innerHTML = filteredProducts().length
      ? filteredProducts().map((product) => `
          <tr>
            <td><strong>${escapeHtml(product.sku)}</strong></td>
            <td>${escapeHtml(product.title)}</td>
            <td><span class="stock-flavourBadge" style="--flavour-color:${resolveFlavourColor(product.flavour)}">${escapeHtml(product.flavour || "-")}</span></td>
            <td>${round2(product.on_hand)}</td>
            <td>${round2(product.open_demand)}</td>
            <td class="${Number(product.free_stock || 0) < 0 ? "stock-neg" : ""}">${round2(product.free_stock)}</td>
            <td>${round2(product.planned_incoming)}</td>
            <td><span class="stock-statusBadge stock-statusBadge--${escapeHtml(product.status || "ok")}">${escapeHtml(product.status || "ok")}</span></td>
          </tr>
        `).join("")
      : `<tr><td colspan="8" class="stock-emptyCell">No products match this filter.</td></tr>`;
  }

  function renderMaterials() {
    els.materialsBody.innerHTML = filteredMaterials().length
      ? filteredMaterials().map((material) => `
          <tr>
            <td><strong>${escapeHtml(material.sku)}</strong></td>
            <td>${escapeHtml(material.title)}</td>
            <td>${escapeHtml(material.category)}</td>
            <td>${round2(material.on_hand)}</td>
            <td>${round2(material.allocated)}</td>
            <td class="${Number(material.available || 0) <= Number(material.reorder_point || 0) ? "stock-neg" : ""}">${round2(material.available)}</td>
            <td>${Array.isArray(material.supplier_options) ? material.supplier_options.length : 0}</td>
            <td>${escapeHtml(material.preferred_supplier?.name || "Missing")}</td>
            <td>${escapeHtml(material.inventory_source || "local")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="9" class="stock-emptyCell">No materials match this filter.</td></tr>`;
  }

  function renderBatches() {
    els.batchesBody.innerHTML = state.batches.length
      ? state.batches.map((batch) => `
          <tr>
            <td><strong>${escapeHtml(batch.batch_code)}</strong></td>
            <td>${escapeHtml(batch.batch_type)}</td>
            <td>${escapeHtml(batch.product_sku || batch.material_title || "-")}</td>
            <td>${escapeHtml(batch.supplier_name || "-")}</td>
            <td>${round2(batch.qty_total)}</td>
            <td>${round2(batch.qty_remaining)}</td>
            <td>${escapeHtml(batch.purchase_order_name || (batch.manufacturing_order_id ? `MO #${batch.manufacturing_order_id}` : "-"))}</td>
            <td><button class="stock-secondaryBtn" type="button" data-batch-open="${batch.id}">Open</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="8" class="stock-emptyCell">No batches found for this filter.</td></tr>`;
  }

  function renderBatchDetail(batch) {
    if (!batch) {
      els.batchDetail.innerHTML = `Select a batch to inspect its traceability chain.`;
      return;
    }
    const inspection = batch.details?.inspection && typeof batch.details.inspection === "object"
      ? batch.details.inspection
      : null;
    const hasInspectionData = Boolean(
      inspection && (
        inspection.vehicleRegistrationNumber ||
        inspection.driverName ||
        inspection.deliveryReference ||
        inspection.receiptDate ||
        inspection.coaReference ||
        inspection.checkedBy ||
        inspection.notes ||
        (Array.isArray(inspection.checks) && inspection.checks.some((check) => String(check.answer || "").trim()))
      )
    );
    const inspectionChecks = Array.isArray(inspection?.checks)
      ? inspection.checks
        .map((check) => `- ${escapeHtml(check.question || "Check")}: ${formatInspectionAnswer(check.answer)}`)
        .join("\n")
      : "- Not captured";
    const inspectionBlock = hasInspectionData
      ? `Incoming inspection:
Vehicle reg: ${escapeHtml(inspection.vehicleRegistrationNumber || "-")}
Driver: ${escapeHtml(inspection.driverName || "-")}
Delivery ref: ${escapeHtml(inspection.deliveryReference || "-")}
Receipt date: ${escapeHtml(inspection.receiptDate || "-")}
COA / COC ref: ${escapeHtml(inspection.coaReference || "-")}
Checked by: ${escapeHtml(inspection.checkedBy || "-")}
Checks:
${inspectionChecks}
Notes: ${escapeHtml(inspection.notes || "-")}`
      : "Incoming inspection:\n- Not captured";
    els.batchDetail.innerHTML = `
      <div class="dispatchDetailGrid dispatchDetailGrid--compact">
        <div class="dispatchDetailCard"><div class="dispatchDetailCard__label">Batch</div><div class="dispatchDetailCard__value">${escapeHtml(batch.batch_code)}</div></div>
        <div class="dispatchDetailCard"><div class="dispatchDetailCard__label">Type</div><div class="dispatchDetailCard__value">${escapeHtml(batch.batch_type)}</div></div>
        <div class="dispatchDetailCard"><div class="dispatchDetailCard__label">Remaining</div><div class="dispatchDetailCard__value">${round2(batch.qty_remaining)}</div></div>
        <div class="dispatchDetailCard"><div class="dispatchDetailCard__label">Source</div><div class="dispatchDetailCard__value">${escapeHtml(batch.source_document?.label || "-")}</div></div>
      </div>
      <div class="summaryCard">Supplier: ${escapeHtml(batch.supplier?.name || "-")}
Lot: ${escapeHtml(batch.supplier_lot || "-")}
Expiry: ${escapeHtml(batch.expiry_date || "-")}
COA status: ${escapeHtml(batch.coa_status || "-")}

${inspectionBlock}

Movements:
${(batch.movements || []).map((movement) => `- ${movement.occurred_at}: ${movement.movement_type} ${round2(movement.quantity)}`).join("\n") || "- None"}

Upstream / downstream:
${(batch.finished_batch_sources || []).map((entry) => `- Source ${entry.source_batch_code || "-"} -> ${entry.material_sku || "-" } x ${round2(entry.allocated_qty)}`).join("\n") || ""}
${(batch.downstream_batches || []).map((entry) => `- Downstream ${entry.finished_batch_code || `MO #${entry.manufacturing_order_id}`}`).join("\n") || "- No linked downstream batches"}</div>
    `;
  }

  function renderStocktakeRows() {
    els.stocktakeBody.innerHTML = filteredStocktakeItems().slice(0, 60).map((item) => `
      <tr data-stocktake-key="${escapeHtml(item.key)}">
        <td>${escapeHtml(item.entity_type)}</td>
        <td><strong>${escapeHtml(item.sku)}</strong></td>
        <td>${escapeHtml(item.title)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${round2(item.current)}</td>
        <td><input class="stock-qtyInput" type="number" step="1" data-stocktake-count value="${round2(state.stocktakeCounts.get(item.key) ?? item.current)}" /></td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="stock-emptyCell">No stocktake items match this filter.</td></tr>`;
  }

  function renderStocktakeHistory() {
    els.stocktakeHistory.innerHTML = state.stocktakes.length
      ? state.stocktakes.map((row) => `<article class="stock-historyCard"><strong>#${row.id}</strong><span>${escapeHtml(row.scope)}</span><span>${escapeHtml(row.status)}</span><span>${escapeHtml(row.closed_at || row.created_at || "-")}</span></article>`).join("")
      : `<div class="stock-emptyCard">No stocktakes recorded yet.</div>`;
  }

  function renderAuditRows() {
    els.auditBody.innerHTML = state.auditRows.length
      ? state.auditRows.map((row) => `<tr><td>${escapeHtml(row.occurred_at || "-")}</td><td>${escapeHtml(row.surface || "-")}</td><td>${escapeHtml(row.action || "-")}</td><td>${escapeHtml(row.entity_type || "-")}</td><td>${escapeHtml(row.entity_id || "-")}</td><td>${escapeHtml(row.status || "-")}</td></tr>`).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No audit rows found.</td></tr>`;
  }

  async function loadInventory() {
    const response = await fetch(`${API_BASE}/inventory/overview`);
    const body = await response.json().catch(() => ({}));
    state.products = Array.isArray(body.products) ? body.products : [];
    state.materials = Array.isArray(body.materials) ? body.materials : [];
    renderProducts();
    renderMaterials();
    renderStocktakeRows();
  }

  async function loadBatches() {
    const params = new URLSearchParams();
    if (state.batchFilter !== "all") params.set("batch_type", state.batchFilter);
    const response = await fetch(`${API_BASE}/inventory/batches?${params.toString()}`);
    const body = await response.json().catch(() => ({}));
    state.batches = Array.isArray(body.batches) ? body.batches : [];
    renderBatches();
  }

  async function loadStocktakes() {
    const response = await fetch(`${API_BASE}/inventory/stocktakes`);
    const body = await response.json().catch(() => ({}));
    state.stocktakes = Array.isArray(body.stocktakes) ? body.stocktakes : [];
    renderStocktakeHistory();
  }

  async function loadAudit() {
    const params = new URLSearchParams(new FormData(els.auditFilters));
    const response = await fetch(`${API_BASE}/audit/log?${params.toString()}`);
    const body = await response.json().catch(() => ({}));
    state.auditRows = Array.isArray(body.rows) ? body.rows : [];
    els.auditStatus.textContent = `Loaded ${state.auditRows.length} audit row${state.auditRows.length === 1 ? "" : "s"}.`;
    renderAuditRows();
  }

  async function openBatchDetail(batchId) {
    const response = await fetch(`${API_BASE}/inventory/batches/${batchId}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      renderBatchDetail(null);
      return;
    }
    renderBatchDetail(body.batch);
  }

  async function submitStocktake() {
    const items = filteredStocktakeItems().map((item) => ({
      entity_type: item.entity_type,
      product_sku: item.entity_type === "product" ? item.sku : null,
      material_id: item.entity_type === "material" ? item.material_id : null,
      counted_qty: round2(state.stocktakeCounts.get(item.key) ?? item.current)
    }));
    const response = await fetch(`${API_BASE}/inventory/stocktakes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: els.stocktakeScope.value, lines: items, actor_type: "ui", actor_id: "stock" })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not close stocktake");
    els.stocktakeStatus.textContent = "Stocktake closed.";
    state.stocktakeCounts.clear();
    await Promise.all([loadInventory(), loadStocktakes(), loadAudit(), loadBatches()]);
  }

  els.primaryTabs.forEach((button) => button.addEventListener("click", () => setPrimaryTab(button.dataset.stockPrimary || "inventory")));
  els.inventoryTabs.forEach((button) => button.addEventListener("click", () => setInventoryTab(button.dataset.stockInventoryTab || "products")));
  els.search.addEventListener("input", () => { renderProducts(); renderMaterials(); });
  els.batchFilterButtons.forEach((button) => button.addEventListener("click", async () => {
    state.batchFilter = button.dataset.batchFilter || "all";
    els.batchFilterButtons.forEach((entry) => entry.classList.toggle("is-active", entry === button));
    await loadBatches();
  }));
  els.batchesBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-batch-open]");
    if (button) void openBatchDetail(button.dataset.batchOpen);
  });
  els.stocktakeSearch.addEventListener("input", renderStocktakeRows);
  els.stocktakeScope.addEventListener("change", renderStocktakeRows);
  els.stocktakeBody.addEventListener("input", (event) => {
    const row = event.target.closest("[data-stocktake-count]");
    const parent = event.target.closest("[data-stocktake-key]");
    if (!row || !parent) return;
    state.stocktakeCounts.set(parent.dataset.stocktakeKey, round2(row.value));
  });
  els.stocktakeSubmit.addEventListener("click", async () => {
    try {
      await submitStocktake();
    } catch (error) {
      els.stocktakeStatus.textContent = String(error?.message || error);
    }
  });
  els.auditFilters.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadAudit();
  });

  setPrimaryTab("inventory");
  setInventoryTab("products");
  Promise.all([loadInventory(), loadBatches(), loadStocktakes(), loadAudit()]).then(() => {
    setStatus("Inventory, batches, and stocktake tools are ready.");
  }).catch((error) => {
    setStatus(String(error?.message || error));
  });
}
