let makeInitialized = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function initMakeView() {
  if (makeInitialized) return;
  makeInitialized = true;

  const API_BASE = "/api/v1";
  const els = {
    search: document.getElementById("makeSearch"),
    productBody: document.getElementById("makeProductsBody"),
    draftBody: document.getElementById("makeDraftBody"),
    requirementsBody: document.getElementById("makeRequirementsBody"),
    status: document.getElementById("makeStatus"),
    targetDate: document.getElementById("makeTargetDate"),
    notes: document.getElementById("makeNotes"),
    createOrder: document.getElementById("makeCreateOrder"),
    createShortagePos: document.getElementById("makeCreateShortagePos"),
    historyBody: document.getElementById("makeHistoryBody")
  };

  const state = {
    products: [],
    manufacturingOrders: [],
    qtyBySku: new Map(),
    latestRequirements: []
  };

  function filteredProducts() {
    const query = String(els.search?.value || "").trim().toLowerCase();
    return state.products.filter((product) => {
      const haystack = `${product.sku} ${product.title} ${product.flavour || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function makeLines() {
    return Array.from(state.qtyBySku.entries())
      .map(([product_sku, quantity]) => ({ product_sku, quantity: Number(quantity || 0) }))
      .filter((line) => line.quantity > 0);
  }

  function renderProducts() {
    if (!els.productBody) return;
    const rows = filteredProducts();
    els.productBody.innerHTML = rows.length
      ? rows.map((product) => `
          <tr>
            <td><strong>${escapeHtml(product.sku)}</strong></td>
            <td>${escapeHtml(product.title)}</td>
            <td>${escapeHtml(product.flavour || "-")}</td>
            <td>${Number(product.available || 0)}</td>
            <td><input class="uo-input" type="number" min="0" step="1" value="${Number(state.qtyBySku.get(product.sku) || 0)}" data-make-sku="${escapeHtml(product.sku)}" /></td>
          </tr>
        `).join("")
      : `<tr><td colspan="5" class="stock-emptyCell">No products match this filter.</td></tr>`;
  }

  function renderDraft() {
    if (!els.draftBody) return;
    const lines = makeLines();
    els.draftBody.innerHTML = lines.length
      ? lines.map((line) => {
          const product = state.products.find((entry) => entry.sku === line.product_sku);
          return `
            <tr>
              <td><strong>${escapeHtml(line.product_sku)}</strong></td>
              <td>${escapeHtml(product?.title || line.product_sku)}</td>
              <td>${Number(line.quantity || 0)}</td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="3" class="stock-emptyCell">No products queued yet.</td></tr>`;
  }

  function renderRequirements() {
    if (!els.requirementsBody) return;
    els.requirementsBody.innerHTML = state.latestRequirements.length
      ? state.latestRequirements.map((requirement) => `
          <tr>
            <td>${escapeHtml(requirement.material_sku || "-")}</td>
            <td>${escapeHtml(requirement.material_title || "-")}</td>
            <td>${Number(requirement.required_qty || 0)}</td>
            <td>${Number(requirement.available_qty || 0)}</td>
            <td class="${Number(requirement.shortage_qty || 0) > 0 ? "stock-neg" : ""}">${Number(requirement.shortage_qty || 0)}</td>
            <td>${escapeHtml(requirement.preferred_supplier?.name || "-")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">Add draft quantities to see BOM requirements.</td></tr>`;
  }

  function renderHistory() {
    if (!els.historyBody) return;
    els.historyBody.innerHTML = state.manufacturingOrders.length
      ? state.manufacturingOrders.map((order) => `
          <tr>
            <td><strong>#${order.id}</strong></td>
            <td>${escapeHtml(order.status || "-")}</td>
            <td>${escapeHtml(order.shopify_draft_order_name || "-")}</td>
            <td>${escapeHtml(order.target_date || "-")}</td>
            <td><button class="stock-primaryBtn" type="button" data-make-complete="${order.id}" ${order.status === "completed" ? "disabled" : ""}>Complete</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="5" class="stock-emptyCell">No manufacturing orders created yet.</td></tr>`;
  }

  async function loadProducts() {
    const resp = await fetch(`${API_BASE}/catalog/products`);
    const body = await resp.json().catch(() => ({}));
    state.products = Array.isArray(body.products) ? body.products : [];
    renderProducts();
  }

  async function loadHistory() {
    const resp = await fetch(`${API_BASE}/make/manufacturing-orders`);
    const body = await resp.json().catch(() => ({}));
    state.manufacturingOrders = Array.isArray(body.manufacturingOrders) ? body.manufacturingOrders : [];
    renderHistory();
  }

  async function refreshRequirements() {
    const lines = makeLines();
    renderDraft();
    if (!lines.length) {
      state.latestRequirements = [];
      renderRequirements();
      return;
    }
    const resp = await fetch(`${API_BASE}/make/manufacturing-orders/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines })
    });
    const body = await resp.json().catch(() => ({}));
    state.latestRequirements = Array.isArray(body.requirements) ? body.requirements : [];
    renderRequirements();
  }

  async function createOrder() {
    const lines = makeLines();
    if (!lines.length) {
      if (els.status) els.status.textContent = "Queue at least one product before creating an order.";
      return;
    }
    els.createOrder.disabled = true;
    if (els.status) els.status.textContent = "Creating manufacturing order draft...";
    try {
      const resp = await fetch(`${API_BASE}/make/manufacturing-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          target_date: String(els.targetDate?.value || ""),
          notes: String(els.notes?.value || ""),
          actor_type: "ui",
          actor_id: "make"
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not create manufacturing order");
      if (els.status) els.status.textContent = `Manufacturing order #${body.manufacturing_order?.id || "?"} created.`;
      state.qtyBySku.clear();
      state.latestRequirements = Array.isArray(body.requirements) ? body.requirements : [];
      renderProducts();
      renderDraft();
      renderRequirements();
      await loadHistory();
    } catch (error) {
      if (els.status) els.status.textContent = String(error?.message || error);
    } finally {
      els.createOrder.disabled = false;
    }
  }

  async function createShortagePurchaseOrders() {
    const lines = makeLines();
    if (!lines.length) return;
    els.createShortagePos.disabled = true;
    try {
      const resp = await fetch(`${API_BASE}/make/manufacturing-orders/shortages/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          actor_type: "ui",
          actor_id: "make"
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not create linked purchase orders");
      if (els.status) els.status.textContent = `Created ${body.results?.length || 0} linked purchase order group${body.results?.length === 1 ? "" : "s"}.`;
    } catch (error) {
      if (els.status) els.status.textContent = String(error?.message || error);
    } finally {
      els.createShortagePos.disabled = false;
    }
  }

  els.search?.addEventListener("input", renderProducts);
  els.productBody?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-make-sku]");
    if (!input) return;
    state.qtyBySku.set(String(input.dataset.makeSku), Number(input.value || 0));
    void refreshRequirements();
  });
  els.createOrder?.addEventListener("click", createOrder);
  els.createShortagePos?.addEventListener("click", createShortagePurchaseOrders);
  els.historyBody?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-make-complete]");
    if (!button) return;
    button.disabled = true;
    try {
      const resp = await fetch(`${API_BASE}/make/manufacturing-orders/${button.dataset.makeComplete}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_type: "ui", actor_id: "make" })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not complete manufacturing order");
      if (els.status) els.status.textContent = `Manufacturing order #${body.manufacturing_order?.id || "?"} completed.`;
      await loadHistory();
    } catch (error) {
      if (els.status) els.status.textContent = String(error?.message || error);
    } finally {
      button.disabled = false;
    }
  });

  Promise.resolve()
    .then(() => Promise.all([loadProducts(), loadHistory()]))
    .then(() => {
      renderDraft();
      renderRequirements();
      if (els.status) els.status.textContent = "Build a manufacturing draft and FLSS will explode the BOM live.";
    });
}
