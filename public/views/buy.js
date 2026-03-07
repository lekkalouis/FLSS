let buyInitialized = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function initBuyView() {
  if (buyInitialized) return;
  buyInitialized = true;

  const API_BASE = "/api/v1";
  const els = {
    root: document.getElementById("viewBuy"),
    search: document.getElementById("buySearch"),
    grid: document.getElementById("buyGrid"),
    submit: document.getElementById("buySubmit"),
    status: document.getElementById("buyStatus"),
    results: document.getElementById("buyResults"),
    history: document.getElementById("buyHistory")
  };

  const state = {
    materials: [],
    purchaseOrders: [],
    qtyByMaterialId: new Map()
  };

  function filteredMaterials() {
    const query = String(els.search?.value || "").trim().toLowerCase();
    return state.materials.filter((material) => {
      const haystack = `${material.sku} ${material.title} ${material.category} ${material.preferred_supplier?.name || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function selections() {
    return Array.from(state.qtyByMaterialId.entries())
      .map(([material_id, quantity]) => ({ material_id: Number(material_id), quantity: Number(quantity || 0) }))
      .filter((line) => line.quantity > 0);
  }

  function renderGrid() {
    if (!els.grid) return;
    const rows = filteredMaterials();
    els.grid.innerHTML = rows.length
      ? rows.map((material) => {
          const qty = Number(state.qtyByMaterialId.get(String(material.id)) || 0);
          return `
            <article class="uo-card">
              <div class="uo-cardHead">
                <span class="uo-icon">${escapeHtml(material.icon || "*")}</span>
                <div>
                  <strong>${escapeHtml(material.title)}</strong>
                  <div class="uo-meta">${escapeHtml(material.sku)} - ${escapeHtml(material.category)}</div>
                </div>
              </div>
              <div class="uo-stats">
                <span>Available <strong>${Number(material.available || 0)}</strong></span>
                <span>Supplier <strong>${escapeHtml(material.preferred_supplier?.name || "Missing")}</strong></span>
              </div>
              <label class="uo-label">
                Qty
                <input class="uo-input" type="number" min="0" step="1" value="${qty}" data-material-id="${material.id}" />
              </label>
            </article>
          `;
        }).join("")
      : `<div class="stock-emptyCard">No materials match this filter.</div>`;
  }

  function renderResults(result) {
    if (!els.results) return;
    if (!result?.results?.length) {
      els.results.innerHTML = `<div class="stock-emptyCard">No purchase order results yet.</div>`;
      return;
    }
    els.results.innerHTML = result.results.map((entry) => `
      <article class="uo-resultCard">
        <strong>${escapeHtml(entry.supplier?.name || "Supplier")}</strong>
        <span>Status: ${escapeHtml(entry.status || "-")}</span>
        <span>PO: ${escapeHtml(entry.purchase_order_id || "-")}</span>
        <span>Shopify: ${escapeHtml(entry.draft_order?.name || entry.draft_order?.reason || "-")}</span>
        <span>Email: ${escapeHtml(entry.email?.ok ? "sent" : entry.email?.reason || entry.email?.error || "-")}</span>
        <span>Print: ${escapeHtml(entry.print?.ok ? "sent" : entry.print?.reason || entry.print?.error || "-")}</span>
      </article>
    `).join("");
  }

  function renderHistory() {
    if (!els.history) return;
    els.history.innerHTML = state.purchaseOrders.length
      ? state.purchaseOrders.map((purchaseOrder) => {
          const failedChannels = (purchaseOrder.dispatches || [])
            .filter((dispatch) => dispatch.status !== "success" && dispatch.status !== "skipped")
            .map((dispatch) => dispatch.channel);
          return `
            <tr>
              <td><strong>#${purchaseOrder.id}</strong></td>
              <td>${escapeHtml(purchaseOrder.supplier_name || "-")}</td>
              <td>${escapeHtml(purchaseOrder.shopify_draft_order_name || "-")}</td>
              <td>${escapeHtml(purchaseOrder.status || "-")}</td>
              <td>${escapeHtml(failedChannels.join(", ") || "none")}</td>
              <td><button class="stock-primaryBtn" type="button" data-buy-retry="${purchaseOrder.id}">Retry failed</button></td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No purchase orders created yet.</td></tr>`;
  }

  async function loadMaterials() {
    const resp = await fetch(`${API_BASE}/catalog/materials`);
    const body = await resp.json().catch(() => ({}));
    state.materials = Array.isArray(body.materials) ? body.materials : [];
    renderGrid();
  }

  async function loadPurchaseOrders() {
    const resp = await fetch(`${API_BASE}/buy/purchase-orders`);
    const body = await resp.json().catch(() => ({}));
    state.purchaseOrders = Array.isArray(body.purchaseOrders) ? body.purchaseOrders : [];
    renderHistory();
  }

  async function submitBuy() {
    const lines = selections();
    if (!lines.length) {
      if (els.status) els.status.textContent = "Select at least one raw material.";
      return;
    }
    els.submit.disabled = true;
    if (els.status) els.status.textContent = "Creating grouped purchase orders...";
    try {
      const resp = await fetch(`${API_BASE}/buy/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: lines,
          actor_type: "ui",
          actor_id: "buy"
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not create purchase orders");
      if (els.status) els.status.textContent = `Created ${body.results?.length || 0} supplier PO group${body.results?.length === 1 ? "" : "s"}.`;
      renderResults(body);
      state.qtyByMaterialId.clear();
      await Promise.all([loadMaterials(), loadPurchaseOrders()]);
    } catch (error) {
      if (els.status) els.status.textContent = String(error?.message || error);
    } finally {
      els.submit.disabled = false;
      renderGrid();
    }
  }

  els.search?.addEventListener("input", renderGrid);
  els.grid?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-material-id]");
    if (!input) return;
    state.qtyByMaterialId.set(String(input.dataset.materialId), Number(input.value || 0));
  });
  els.submit?.addEventListener("click", submitBuy);
  els.history?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-buy-retry]");
    if (!button) return;
    button.disabled = true;
    try {
      const resp = await fetch(`${API_BASE}/buy/purchase-orders/${button.dataset.buyRetry}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_type: "ui", actor_id: "buy" })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Retry failed");
      if (els.status) els.status.textContent = `Retried ${body.retried?.length || 0} channel${body.retried?.length === 1 ? "" : "s"}.`;
      await loadPurchaseOrders();
    } catch (error) {
      if (els.status) els.status.textContent = String(error?.message || error);
    } finally {
      button.disabled = false;
    }
  });

  Promise.resolve()
    .then(() => Promise.all([loadMaterials(), loadPurchaseOrders()]))
    .then(() => {
      renderResults(null);
      if (els.status) els.status.textContent = "Select materials and confirm once to auto-split by supplier.";
    });
}
