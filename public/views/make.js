let makeInitialized = false;

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function initMakeView() {
  if (makeInitialized) return;
  makeInitialized = true;

  const API_BASE = "/api/v1";
  const root = document.getElementById("viewMake");
  if (!root) return;

  root.innerHTML = `
    <div class="uo-shell">
      <section class="uo-hero">
        <div>
          <p class="uo-eyebrow">Make</p>
          <h2>Draft, release, and complete</h2>
          <p class="uo-copy">Planner creates drafts only. Orders handles release, shortage buying, printing, and completion. Recipes owns the BOM library.</p>
        </div>
        <div class="uo-toolbar">
          <input id="makeSearch" class="uo-input" type="search" placeholder="Search finished goods" />
          <input id="makeTargetDate" class="uo-input" type="date" />
        </div>
      </section>

      <section class="uo-card">
        <div class="uo-tabRow" role="tablist" aria-label="Make tabs">
          <button class="uo-tabBtn is-active" type="button" data-make-tab="planner" aria-selected="true">Planner</button>
          <button class="uo-tabBtn" type="button" data-make-tab="orders" aria-selected="false">Orders</button>
          <button class="uo-tabBtn" type="button" data-make-tab="recipes" aria-selected="false">Recipes</button>
        </div>
        <div id="makeStatus" class="uo-inlineStatus">Loading products...</div>
      </section>

      <section data-make-panel="planner"></section>
      <section data-make-panel="orders" hidden></section>
      <section data-make-panel="recipes" hidden></section>
    </div>
  `;

  root.querySelector('[data-make-panel="planner"]').innerHTML = `
    <div class="uo-grid uo-grid--two">
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Planner</h3><p>Queue products and review live requirements. Draft orders do not reserve raw material.</p></div></div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>SKU</th><th>Product</th><th>On hand</th><th>Open sales demand</th><th>Free stock</th><th>Planned incoming</th><th>Draft qty</th></tr></thead>
            <tbody id="makeProductsBody"></tbody>
          </table>
        </div>
      </article>
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Draft order</h3><p>Create a draft MO or buy current shortages from the queued lines.</p></div></div>
        <textarea id="makeNotes" class="uo-textarea" rows="4" placeholder="Manufacturing notes"></textarea>
        <div class="uo-actions">
          <button id="makeCreateOrder" class="stock-primaryBtn" type="button">Create draft</button>
          <button id="makeCreateShortagePos" class="stock-secondaryBtn" type="button">Create linked POs</button>
        </div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>SKU</th><th>Product</th><th>Qty</th></tr></thead>
            <tbody id="makeDraftBody"></tbody>
          </table>
        </div>
      </article>
    </div>
    <article class="uo-card uo-card--inner">
      <div class="uo-sectionHead"><div><h3>Requirements</h3><p>Live raw-material requirements against currently available stock.</p></div></div>
      <div class="uo-tableWrap">
        <table class="stock-table">
          <thead><tr><th>Material SKU</th><th>Material</th><th>Required</th><th>Available</th><th>Shortage</th><th>Preferred supplier</th></tr></thead>
          <tbody id="makeRequirementsBody"></tbody>
        </table>
      </div>
    </article>
  `;
  root.querySelector('[data-make-panel="orders"]').innerHTML = `
    <article class="uo-card uo-card--inner">
      <div class="uo-sectionHead"><div><h3>Orders</h3><p>Release reserves by FEFO batch allocation. Complete consumes the allocated source batches and creates a finished batch.</p></div></div>
      <div class="uo-tableWrap">
        <table class="stock-table">
          <thead><tr><th>MO</th><th>Status</th><th>Target date</th><th>Products</th><th>Requirements</th><th>Action</th></tr></thead>
          <tbody id="makeOrdersBody"></tbody>
        </table>
      </div>
    </article>
  `;
  root.querySelector('[data-make-panel="recipes"]').innerHTML = `
    <div class="uo-grid uo-grid--two">
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>BOM library</h3><p>Create and maintain recipe versions. Product and material master data now lives in Admin.</p></div></div>
        <div class="uo-actions">
          <button class="stock-secondaryBtn" type="button" data-route="/admin" data-admin-tab="products">Manage products</button>
          <button class="stock-secondaryBtn" type="button" data-route="/admin" data-admin-tab="materials">Manage materials</button>
        </div>
        <div id="makeBomStatus" class="uo-inlineStatus">Loading BOM library...</div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>Product</th><th>Version</th><th>Effective</th><th>Yield</th><th>Waste</th><th>Lines</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="makeBomLibraryBody"></tbody>
          </table>
        </div>
      </article>
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>BOM editor</h3><p>Add or edit a recipe version without leaving Make.</p></div></div>
        <div class="uo-formGrid uo-formGrid--compact">
          <label class="uo-label">Product<select id="makeBomProduct" class="uo-select"></select></label>
          <label class="uo-label">Version<input id="makeBomVersion" class="uo-input" type="text" placeholder="v1" /></label>
          <label class="uo-label">Effective from<input id="makeBomEffectiveFrom" class="uo-input" type="date" /></label>
          <label class="uo-label">Yield %<input id="makeBomYield" class="uo-input" type="number" step="0.01" value="100" /></label>
          <label class="uo-label">Waste %<input id="makeBomWaste" class="uo-input" type="number" step="0.01" value="0" /></label>
          <label class="uo-label uo-checkbox"><input id="makeBomActive" type="checkbox" checked /><span>Active recipe</span></label>
        </div>
        <div class="uo-sectionHead"><div><h3>Recipe lines</h3><p>Lines are aggregated by material, type, and UoM.</p></div></div>
        <div class="uo-formGrid uo-formGrid--compact">
          <label class="uo-label">Material<select id="makeBomLineMaterial" class="uo-select"></select></label>
          <label class="uo-label">Qty<input id="makeBomLineQty" class="uo-input" type="number" step="0.01" value="0" /></label>
          <label class="uo-label">UoM<input id="makeBomLineUom" class="uo-input" type="text" /></label>
          <label class="uo-label">Type<select id="makeBomLineType" class="uo-select"><option value="ingredient">Ingredient</option><option value="packaging">Packaging</option><option value="label">Label</option><option value="consumable">Consumable</option></select></label>
        </div>
        <div class="uo-actions"><button id="makeBomAddLine" class="stock-secondaryBtn" type="button">Add line</button></div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>SKU</th><th>Material</th><th>Type</th><th>Qty</th><th>UoM</th><th>Action</th></tr></thead>
            <tbody id="makeBomLinesBody"></tbody>
          </table>
        </div>
        <div class="uo-actions">
          <button id="makeBomSave" class="stock-primaryBtn" type="button">Save BOM</button>
          <button id="makeBomReset" class="stock-secondaryBtn" type="button">New BOM</button>
        </div>
      </article>
    </div>
  `;

  const els = {
    tabs: Array.from(root.querySelectorAll("[data-make-tab]")),
    panels: Array.from(root.querySelectorAll("[data-make-panel]")),
    search: document.getElementById("makeSearch"),
    targetDate: document.getElementById("makeTargetDate"),
    notes: document.getElementById("makeNotes"),
    status: document.getElementById("makeStatus"),
    productsBody: document.getElementById("makeProductsBody"),
    draftBody: document.getElementById("makeDraftBody"),
    requirementsBody: document.getElementById("makeRequirementsBody"),
    createOrder: document.getElementById("makeCreateOrder"),
    createShortagePos: document.getElementById("makeCreateShortagePos"),
    ordersBody: document.getElementById("makeOrdersBody"),
    bomStatus: document.getElementById("makeBomStatus"),
    bomLibraryBody: document.getElementById("makeBomLibraryBody"),
    bomProduct: document.getElementById("makeBomProduct"),
    bomVersion: document.getElementById("makeBomVersion"),
    bomEffectiveFrom: document.getElementById("makeBomEffectiveFrom"),
    bomYield: document.getElementById("makeBomYield"),
    bomWaste: document.getElementById("makeBomWaste"),
    bomActive: document.getElementById("makeBomActive"),
    bomLineMaterial: document.getElementById("makeBomLineMaterial"),
    bomLineQty: document.getElementById("makeBomLineQty"),
    bomLineUom: document.getElementById("makeBomLineUom"),
    bomLineType: document.getElementById("makeBomLineType"),
    bomAddLine: document.getElementById("makeBomAddLine"),
    bomLinesBody: document.getElementById("makeBomLinesBody"),
    bomSave: document.getElementById("makeBomSave"),
    bomReset: document.getElementById("makeBomReset")
  };

  const state = {
    activeTab: "planner",
    products: [],
    materials: [],
    boms: [],
    manufacturingOrders: [],
    qtyBySku: new Map(),
    requirements: [],
    missingBom: [],
    editingBomId: null,
    bomLines: []
  };

  let requirementsTimer = null;

  const setStatus = (message) => {
    if (els.status) els.status.textContent = String(message || "");
  };

  const setActiveTab = (tab) => {
    state.activeTab = tab;
    els.tabs.forEach((button) => {
      const active = button.dataset.makeTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.panels.forEach((panel) => {
      panel.hidden = panel.dataset.makePanel !== tab;
    });
  };

  const draftLines = () => Array.from(state.qtyBySku.entries())
    .map(([product_sku, quantity]) => ({ product_sku, quantity: round2(quantity) }))
    .filter((entry) => entry.quantity > 0);

  const filteredProducts = () => {
    const query = String(els.search.value || "").trim().toLowerCase();
    return state.products.filter((product) => {
      const haystack = `${product.sku} ${product.title} ${product.flavour || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  };

  const activeBomMap = () => {
    const map = new Map();
    state.boms.forEach((bom) => {
      if (!Number(bom.is_active)) return;
      map.set(String(bom.product_sku), bom);
    });
    return map;
  };

  function renderProducts() {
    els.productsBody.innerHTML = filteredProducts().length
      ? filteredProducts().map((product) => `
          <tr>
            <td><strong>${escapeHtml(product.sku)}</strong></td>
            <td>${escapeHtml(product.title)}</td>
            <td>${round2(product.on_hand)}</td>
            <td>${round2(product.open_demand)}</td>
            <td>${round2(product.free_stock)}</td>
            <td>${round2(product.planned_incoming)}</td>
            <td><input class="uo-input" type="number" min="0" step="1" data-make-sku="${escapeHtml(product.sku)}" value="${round2(state.qtyBySku.get(product.sku) || 0)}" /></td>
          </tr>
        `).join("")
      : `<tr><td colspan="7" class="stock-emptyCell">No products match this filter.</td></tr>`;
  }

  function renderDraft() {
    els.draftBody.innerHTML = draftLines().length
      ? draftLines().map((line) => {
        const product = state.products.find((entry) => entry.sku === line.product_sku);
        return `<tr><td><strong>${escapeHtml(line.product_sku)}</strong></td><td>${escapeHtml(product?.title || line.product_sku)}</td><td>${round2(line.quantity)}</td></tr>`;
      }).join("")
      : `<tr><td colspan="3" class="stock-emptyCell">Queue products in the planner to build a draft.</td></tr>`;
  }

  function renderRequirements() {
    if (!state.requirements.length && state.missingBom.length) {
      els.requirementsBody.innerHTML = `<tr><td colspan="6" class="stock-emptyCell">Missing active BOM for: ${escapeHtml(state.missingBom.join(", "))}</td></tr>`;
      return;
    }
    els.requirementsBody.innerHTML = state.requirements.length
      ? state.requirements.map((requirement) => `
          <tr>
            <td>${escapeHtml(requirement.material_sku || "-")}</td>
            <td>${escapeHtml(requirement.material_title || "-")}</td>
            <td>${round2(requirement.required_qty)}</td>
            <td>${round2(requirement.available_qty)}</td>
            <td class="${Number(requirement.shortage_qty || 0) > 0 ? "stock-neg" : ""}">${round2(requirement.shortage_qty)}</td>
            <td>${escapeHtml(requirement.preferred_supplier?.name || "-")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No draft lines yet.</td></tr>`;
  }

  function renderOrders() {
    els.ordersBody.innerHTML = state.manufacturingOrders.length
      ? state.manufacturingOrders.map((order) => {
        const shortageCount = (order.requirements || []).filter((requirement) => Number(requirement.shortage_qty || 0) > 0).length;
        return `
          <tr>
            <td><strong>#${order.id}</strong><div class="uo-meta">${escapeHtml(order.shopify_draft_order_name || "-")}</div></td>
            <td>${escapeHtml(order.status || "-")}${shortageCount ? ` <span class="uo-chip uo-chip--warn">${shortageCount} shortage${shortageCount === 1 ? "" : "s"}</span>` : ""}</td>
            <td>${escapeHtml(order.target_date || "-")}</td>
            <td>${(order.lines || []).map((line) => `${escapeHtml(line.product_sku)} x ${round2(line.quantity)}`).join(" | ")}</td>
            <td>${(order.requirements || []).length}${shortageCount ? `<div class="uo-meta">${shortageCount} still to buy</div>` : ""}</td>
            <td>
              <button class="stock-secondaryBtn" type="button" data-make-action="release" data-make-order="${order.id}" ${order.status === "draft" ? "" : "disabled"}>Release</button>
              <button class="stock-secondaryBtn" type="button" data-make-action="buy" data-make-order="${order.id}">Create linked POs</button>
              <button class="stock-secondaryBtn" type="button" data-make-action="print" data-make-order="${order.id}">Print</button>
              <button class="stock-primaryBtn" type="button" data-make-action="complete" data-make-order="${order.id}" ${["draft", "released"].includes(order.status) ? "" : "disabled"}>Complete</button>
            </td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No manufacturing orders yet.</td></tr>`;
  }

  function renderBomOptions() {
    els.bomProduct.innerHTML = `<option value="">Select product</option>${state.products.map((product) => `<option value="${escapeHtml(product.sku)}">${escapeHtml(product.sku)} - ${escapeHtml(product.title)}</option>`).join("")}`;
    els.bomLineMaterial.innerHTML = `<option value="">Select material</option>${state.materials.map((material) => `<option value="${material.id}">${escapeHtml(material.sku)} - ${escapeHtml(material.title)}</option>`).join("")}`;
  }

  function renderBomLibrary() {
    els.bomLibraryBody.innerHTML = state.boms.length
      ? state.boms.map((bom) => `
          <tr>
            <td><strong>${escapeHtml(bom.product_sku)}</strong><div class="uo-meta">${escapeHtml(bom.product_title || bom.product_sku)}</div></td>
            <td>${escapeHtml(bom.version || "-")}</td>
            <td>${escapeHtml(bom.effective_from || "-")}</td>
            <td>${round2(bom.yield_pct)}%</td>
            <td>${round2(bom.waste_pct)}%</td>
            <td>${Number(bom.line_count || bom.lines?.length || 0)}</td>
            <td>${Number(bom.is_active) ? `<span class="uo-chip uo-chip--success">Active</span>` : `<span class="uo-chip uo-chip--muted">History</span>`}</td>
            <td><button class="stock-secondaryBtn" type="button" data-bom-edit="${bom.id}">Edit</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="8" class="stock-emptyCell">No BOMs yet.</td></tr>`;
    els.bomStatus.textContent = state.editingBomId ? `Editing BOM #${state.editingBomId}.` : "Loading BOM library...";
  }

  function renderBomLines() {
    els.bomLinesBody.innerHTML = state.bomLines.length
      ? state.bomLines.map((line, index) => {
        const material = state.materials.find((entry) => Number(entry.id) === Number(line.material_id));
        return `<tr><td><strong>${escapeHtml(material?.sku || "-")}</strong></td><td>${escapeHtml(material?.title || `Material ${line.material_id}`)}</td><td>${escapeHtml(line.line_type)}</td><td>${round2(line.quantity)}</td><td>${escapeHtml(line.uom)}</td><td><button class="stock-secondaryBtn" type="button" data-bom-remove="${index}">Remove</button></td></tr>`;
      }).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">Add one or more recipe lines.</td></tr>`;
  }

  function resetBomEditor() {
    state.editingBomId = null;
    state.bomLines = [];
    els.bomProduct.value = "";
    els.bomVersion.value = "";
    els.bomEffectiveFrom.value = todayIso();
    els.bomYield.value = "100";
    els.bomWaste.value = "0";
    els.bomActive.checked = true;
    els.bomLineMaterial.value = "";
    els.bomLineQty.value = "0";
    els.bomLineUom.value = "";
    els.bomLineType.value = "ingredient";
    renderBomLines();
    els.bomStatus.textContent = "Build a new BOM version.";
  }

  function loadBomIntoEditor(bomId) {
    const bom = state.boms.find((entry) => Number(entry.id) === Number(bomId));
    if (!bom) return;
    state.editingBomId = Number(bom.id);
    state.bomLines = Array.isArray(bom.lines) ? bom.lines.map((line) => ({
      material_id: Number(line.material_id),
      quantity: round2(line.quantity),
      uom: String(line.uom || line.material_uom || "unit"),
      line_type: String(line.line_type || "ingredient")
    })) : [];
    els.bomProduct.value = bom.product_sku || "";
    els.bomVersion.value = bom.version || "";
    els.bomEffectiveFrom.value = bom.effective_from || todayIso();
    els.bomYield.value = String(bom.yield_pct ?? 100);
    els.bomWaste.value = String(bom.waste_pct ?? 0);
    els.bomActive.checked = Number(bom.is_active) === 1;
    renderBomLines();
    setActiveTab("recipes");
    els.bomStatus.textContent = `Editing ${bom.product_sku} ${bom.version || ""}.`;
  }

  async function refreshRequirements() {
    clearTimeout(requirementsTimer);
    requirementsTimer = setTimeout(async () => {
      const lines = draftLines();
      if (!lines.length) {
        state.requirements = [];
        state.missingBom = [];
        renderDraft();
        renderRequirements();
        return;
      }
      const response = await fetch(`${API_BASE}/make/manufacturing-orders/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines })
      });
      const body = await response.json().catch(() => ({}));
      state.requirements = Array.isArray(body.requirements) ? body.requirements : [];
      state.missingBom = Array.isArray(body.missing_bom) ? body.missing_bom : [];
      renderDraft();
      renderRequirements();
    }, 120);
  }

  async function loadMasterData() {
    const [productsResp, materialsResp, bomsResp] = await Promise.all([
      fetch(`${API_BASE}/catalog/products`),
      fetch(`${API_BASE}/catalog/materials`),
      fetch(`${API_BASE}/catalog/boms`)
    ]);
    const [productsBody, materialsBody, bomsBody] = await Promise.all([
      productsResp.json().catch(() => ({})),
      materialsResp.json().catch(() => ({})),
      bomsResp.json().catch(() => ({}))
    ]);
    state.products = Array.isArray(productsBody.products) ? productsBody.products : [];
    state.materials = Array.isArray(materialsBody.materials) ? materialsBody.materials : [];
    state.boms = Array.isArray(bomsBody.boms) ? bomsBody.boms : [];
    renderProducts();
    renderDraft();
    renderRequirements();
    renderBomOptions();
    renderBomLibrary();
    renderBomLines();
  }

  async function loadOrders() {
    const response = await fetch(`${API_BASE}/make/manufacturing-orders`);
    const body = await response.json().catch(() => ({}));
    state.manufacturingOrders = Array.isArray(body.manufacturingOrders) ? body.manufacturingOrders : [];
    renderOrders();
  }

  async function createOrder() {
    const lines = draftLines();
    if (!lines.length) throw new Error("Add at least one draft product line");
    const response = await fetch(`${API_BASE}/make/manufacturing-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, target_date: els.targetDate.value || null, notes: els.notes.value || "", actor_type: "ui", actor_id: "make" })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not create manufacturing order");
    state.qtyBySku.clear();
    els.notes.value = "";
    setStatus(`Created manufacturing draft #${body.manufacturing_order?.id || ""}.`);
    await Promise.all([loadMasterData(), loadOrders()]);
    setActiveTab("orders");
  }

  async function createShortagePos(payload) {
    const response = await fetch(`${API_BASE}/make/manufacturing-orders/shortages/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, actor_type: "ui", actor_id: "make" })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not create linked purchase orders");
    setStatus(`Created ${body.results?.length || 0} linked purchase order group${body.results?.length === 1 ? "" : "s"}.`);
  }

  async function saveBom() {
    if (!state.bomLines.length) throw new Error("Add at least one BOM line");
    const payload = {
      product_sku: els.bomProduct.value,
      version: els.bomVersion.value || "v1",
      effective_from: els.bomEffectiveFrom.value || todayIso(),
      yield_pct: round2(els.bomYield.value),
      waste_pct: round2(els.bomWaste.value),
      is_active: els.bomActive.checked,
      lines: state.bomLines,
      actor_type: "ui",
      actor_id: "make"
    };
    if (!payload.product_sku) throw new Error("Select a product");
    const url = state.editingBomId ? `${API_BASE}/catalog/boms/${state.editingBomId}` : `${API_BASE}/catalog/boms`;
    const method = state.editingBomId ? "PUT" : "POST";
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not save BOM");
    await loadMasterData();
    if (body?.bom?.id) loadBomIntoEditor(body.bom.id);
    els.bomStatus.textContent = "BOM saved.";
  }

  els.tabs.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.makeTab || "planner")));
  els.search.addEventListener("input", renderProducts);
  els.productsBody.addEventListener("input", (event) => {
    const input = event.target.closest("[data-make-sku]");
    if (!input) return;
    state.qtyBySku.set(String(input.dataset.makeSku || ""), round2(input.value));
    renderDraft();
    void refreshRequirements();
  });
  els.createOrder.addEventListener("click", async () => { try { await createOrder(); } catch (error) { setStatus(String(error?.message || error)); } });
  els.createShortagePos.addEventListener("click", async () => {
    try {
      await createShortagePos({ lines: draftLines(), note: "Linked from planner shortages" });
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  });
  els.ordersBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-make-action]");
    if (!button) return;
    const order = state.manufacturingOrders.find((entry) => Number(entry.id) === Number(button.dataset.makeOrder));
    if (!order) return;
    try {
      if (button.dataset.makeAction === "buy") {
        await createShortagePos({
          manufacturing_order_id: Number(order.id),
          lines: order.lines || [],
          note: `Linked from manufacturing order #${order.id}`
        });
      } else {
        const actionLabel = {
          release: "released",
          print: "printed",
          complete: "completed"
        }[button.dataset.makeAction] || "updated";
        const response = await fetch(`${API_BASE}/make/manufacturing-orders/${order.id}/${button.dataset.makeAction}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actor_type: "ui", actor_id: "make" })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || body?.message || `Could not ${button.dataset.makeAction} manufacturing order`);
        setStatus(`Manufacturing order #${order.id} ${actionLabel}.`);
        await Promise.all([loadMasterData(), loadOrders()]);
      }
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  });
  els.bomAddLine.addEventListener("click", () => {
    const materialId = Number(els.bomLineMaterial.value || 0);
    if (!(materialId > 0)) {
      els.bomStatus.textContent = "Select a material first.";
      return;
    }
    state.bomLines.push({
      material_id: materialId,
      quantity: round2(els.bomLineQty.value),
      uom: String(els.bomLineUom.value || state.materials.find((entry) => Number(entry.id) === materialId)?.uom || "unit"),
      line_type: String(els.bomLineType.value || "ingredient")
    });
    renderBomLines();
  });
  els.bomLinesBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bom-remove]");
    if (!button) return;
    state.bomLines.splice(Number(button.dataset.bomRemove), 1);
    renderBomLines();
  });
  els.bomLibraryBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bom-edit]");
    if (!button) return;
    loadBomIntoEditor(button.dataset.bomEdit);
  });
  els.bomSave.addEventListener("click", async () => { try { await saveBom(); } catch (error) { els.bomStatus.textContent = String(error?.message || error); } });
  els.bomReset.addEventListener("click", resetBomEditor);

  els.targetDate.value = todayIso();
  setActiveTab("planner");
  resetBomEditor();
  Promise.all([loadMasterData(), loadOrders()]).then(() => {
    setStatus("Queue products to create a draft manufacturing order.");
  }).catch((error) => {
    setStatus(String(error?.message || error));
  });
}
