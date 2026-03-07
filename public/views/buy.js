let buyInitialized = false;

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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_RECEIPT_INSPECTION_CHECKS = Object.freeze([
  { key: "vehicleClean", question: "Vehicle clean and suitable for food-grade materials?" },
  { key: "packagingUndamaged", question: "Packaging undamaged and sealed on arrival?" },
  { key: "temperatureAcceptable", question: "Temperature/condition acceptable on receipt?" },
  { key: "contaminationFree", question: "No visible contamination, pests, or foreign matter?" }
]);

function createDefaultReceiveInspection() {
  return {
    receiptDate: todayIsoDate(),
    vehicleRegistrationNumber: "",
    driverName: "",
    deliveryReference: "",
    coaReference: "",
    checkedBy: "",
    notes: "",
    checks: DEFAULT_RECEIPT_INSPECTION_CHECKS.map((check) => ({ ...check, answer: "" }))
  };
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function initBuyView() {
  if (buyInitialized) return;
  buyInitialized = true;

  const API_BASE = "/api/v1";
  const root = document.getElementById("viewBuy");
  if (!root) return;

  root.innerHTML = `
    <div class="uo-shell">
      <section class="uo-hero">
        <div>
          <p class="uo-eyebrow">Buy</p>
          <h2>Purchase planning and receipts</h2>
          <p class="uo-copy">Plan supplier lines, review grouped purchase orders before write-side effects, and receive raw materials into receipt batches when stock lands.</p>
        </div>
        <div class="uo-toolbar">
          <input id="buySearch" class="uo-input" type="search" placeholder="Search material or supplier" />
          <button id="buyPreview" class="stock-primaryBtn" type="button">Preview grouped POs</button>
        </div>
      </section>

      <section class="uo-card">
        <div class="uo-tabRow" role="tablist" aria-label="Buy tabs">
          <button class="uo-tabBtn is-active" type="button" data-buy-tab="plan" aria-selected="true">Plan</button>
          <button class="uo-tabBtn" type="button" data-buy-tab="review" aria-selected="false">Review</button>
          <button class="uo-tabBtn" type="button" data-buy-tab="history" aria-selected="false">History</button>
        </div>
        <div id="buyStatus" class="uo-inlineStatus">Loading materials...</div>
      </section>

      <section data-buy-panel="plan"></section>
      <section data-buy-panel="review" hidden></section>
      <section data-buy-panel="history" hidden></section>

      <div id="buyReceiveModal" class="dispatchSiteAlertModal" hidden></div>
    </div>
  `;

  root.querySelector('[data-buy-panel="plan"]').innerHTML = `
    <article class="uo-card uo-card--inner">
      <div class="uo-sectionHead"><div><h3>Plan</h3><p>Choose supplier and order quantity per material. Missing mappings are blocked before PO creation.</p></div></div>
      <div class="uo-tableWrap">
        <table class="stock-table">
          <thead><tr><th>SKU</th><th>Material</th><th>Free stock</th><th>Reorder point</th><th>Suggested</th><th>Supplier</th><th>MOQ</th><th>Lead</th><th>Status</th></tr></thead>
          <tbody id="buyPlanBody"></tbody>
        </table>
      </div>
    </article>
  `;
  root.querySelector('[data-buy-panel="review"]').innerHTML = `
    <div class="uo-grid uo-grid--two">
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Review</h3><p>Preview how FLSS will group supplier purchase orders and which channels will dispatch.</p></div></div>
        <div class="uo-actions">
          <label class="uo-label uo-checkbox"><input id="buyDispatchShopify" type="checkbox" checked /><span>Shopify draft</span></label>
          <label class="uo-label uo-checkbox"><input id="buyDispatchEmail" type="checkbox" checked /><span>Email supplier</span></label>
          <label class="uo-label uo-checkbox"><input id="buyDispatchPrint" type="checkbox" checked /><span>Print PO</span></label>
        </div>
        <div id="buyReviewSummary" class="uo-results"></div>
        <div class="uo-actions"><button id="buyCreate" class="stock-primaryBtn" type="button">Create purchase orders</button></div>
      </article>
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Validation</h3><p>Warnings and missing supplier mappings appear here before anything is created.</p></div></div>
        <div id="buyReviewMessages" class="uo-results"></div>
      </article>
    </div>
  `;
  root.querySelector('[data-buy-panel="history"]').innerHTML = `
    <article class="uo-card uo-card--inner">
      <div class="uo-sectionHead"><div><h3>History</h3><p>Lifecycle status is separate from channel dispatch state. Use contextual actions per row.</p></div></div>
      <div class="uo-tableWrap">
        <table class="stock-table">
          <thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Channels</th><th>Received</th><th>Action</th></tr></thead>
          <tbody id="buyHistoryBody"></tbody>
        </table>
      </div>
    </article>
  `;

  const els = {
    tabs: Array.from(root.querySelectorAll("[data-buy-tab]")),
    panels: Array.from(root.querySelectorAll("[data-buy-panel]")),
    search: document.getElementById("buySearch"),
    status: document.getElementById("buyStatus"),
    planBody: document.getElementById("buyPlanBody"),
    previewBtn: document.getElementById("buyPreview"),
    reviewSummary: document.getElementById("buyReviewSummary"),
    reviewMessages: document.getElementById("buyReviewMessages"),
    createBtn: document.getElementById("buyCreate"),
    historyBody: document.getElementById("buyHistoryBody"),
    dispatchShopify: document.getElementById("buyDispatchShopify"),
    dispatchEmail: document.getElementById("buyDispatchEmail"),
    dispatchPrint: document.getElementById("buyDispatchPrint"),
    receiveModal: document.getElementById("buyReceiveModal")
  };

  const state = {
    activeTab: "plan",
    materials: [],
    purchaseOrders: [],
    preview: null,
    selections: new Map(),
    receive: { purchaseOrder: null, rows: [], inspection: createDefaultReceiveInspection() }
  };

  const setStatus = (message) => {
    if (els.status) els.status.textContent = String(message || "");
  };

  const setActiveTab = (tab) => {
    state.activeTab = tab;
    els.tabs.forEach((button) => {
      const active = button.dataset.buyTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.panels.forEach((panel) => {
      panel.hidden = panel.dataset.buyPanel !== tab;
    });
  };

  const selectedLines = () => Array.from(state.selections.entries())
    .map(([materialId, value]) => ({
      material_id: Number(materialId),
      quantity: round2(value.quantity),
      supplier_id: value.supplierId || null
    }))
    .filter((entry) => entry.quantity > 0);

  const filteredMaterials = () => {
    const query = String(els.search.value || "").trim().toLowerCase();
    return state.materials.filter((material) => {
      const haystack = `${material.sku} ${material.title} ${material.category} ${material.preferred_supplier?.name || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  };

  function renderPlan() {
    els.planBody.innerHTML = filteredMaterials().length
      ? filteredMaterials().map((material) => {
        const selection = state.selections.get(String(material.id)) || {
          quantity: material.available <= material.reorder_point ? Math.max(0, round2(material.reorder_point - material.available)) : 0,
          supplierId: material.preferred_supplier?.id || null
        };
        const supplierOptions = Array.isArray(material.supplier_options) ? material.supplier_options : [];
        const selectedOption = supplierOptions.find((option) => Number(option.supplier_id) === Number(selection.supplierId)) || supplierOptions.find((option) => option.is_preferred) || null;
        const statusMarkup = supplierOptions.length
          ? `<span class="uo-chip ${material.available <= material.reorder_point ? "uo-chip--warn" : "uo-chip--success"}">${material.available <= material.reorder_point ? "Reorder" : "Okay"}</span>`
          : `<a class="stock-secondaryBtn" href="/admin" data-route="/admin" data-admin-tab="materials">Map supplier</a>`;
        return `
          <tr>
            <td><strong>${escapeHtml(material.sku)}</strong></td>
            <td>${escapeHtml(material.title)}<div class="uo-meta">${escapeHtml(material.category || "")}</div></td>
            <td>${round2(material.available)}</td>
            <td>${round2(material.reorder_point)}</td>
            <td><input class="uo-input" type="number" step="0.01" min="0" data-buy-field="quantity" data-material-id="${material.id}" value="${round2(selection.quantity)}" /></td>
            <td>
              <select class="uo-select" data-buy-field="supplier" data-material-id="${material.id}">
                <option value="">Select supplier</option>
                ${supplierOptions.map((option) => `<option value="${option.supplier_id}">${escapeHtml(option.supplier?.name || "Supplier")}${option.is_preferred ? " (preferred)" : ""}</option>`).join("")}
              </select>
            </td>
            <td>${round2(selectedOption?.min_order_qty)}</td>
            <td>${Math.max(0, Number(selectedOption?.lead_time_days || material.lead_time_days || 0))}d</td>
            <td>${statusMarkup}</td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="9" class="stock-emptyCell">No materials match this filter.</td></tr>`;
    filteredMaterials().forEach((material) => {
      const selection = state.selections.get(String(material.id));
      const supplierSelect = els.planBody.querySelector(`[data-buy-field="supplier"][data-material-id="${material.id}"]`);
      if (supplierSelect) supplierSelect.value = String(selection?.supplierId || material.preferred_supplier?.id || "");
    });
  }

  function renderReview() {
    const preview = state.preview;
    if (!preview?.groups?.length) {
      els.reviewSummary.innerHTML = `<div class="stock-emptyCard">Preview the grouped purchase orders from the Plan tab first.</div>`;
    } else {
      els.reviewSummary.innerHTML = preview.groups.map((group) => `
        <article class="uo-resultCard">
          <strong>${escapeHtml(group.supplier?.name || "Supplier")}</strong>
          <span>${group.item_count} line${group.item_count === 1 ? "" : "s"}</span>
          <span>Total ${round2(group.total_order_qty)}</span>
          <span>${group.items.map((item) => `${escapeHtml(item.material_sku)} x ${round2(item.order_qty)}`).join(" | ")}</span>
        </article>
      `).join("");
    }
    const errors = Array.isArray(preview?.errors) ? preview.errors : [];
    const warnings = Array.isArray(preview?.warnings) ? preview.warnings : [];
    els.reviewMessages.innerHTML = [
      ...errors.map((entry) => `<article class="uo-resultCard"><strong>Error</strong><span>${escapeHtml(entry.message || "Validation failed")}</span></article>`),
      ...warnings.map((entry) => `<article class="uo-resultCard"><strong>Warning</strong><span>${escapeHtml(entry.message || "Check this line")}</span></article>`)
    ].join("") || `<div class="stock-emptyCard">No warnings. Grouping is ready to create.</div>`;
  }

  function channelChip(dispatch) {
    const status = String(dispatch?.status || "pending").toLowerCase();
    const tone = status === "success" ? "uo-chip--success" : status === "failed" ? "uo-chip--warn" : "uo-chip--muted";
    return `<span class="uo-chip ${tone}">${escapeHtml(dispatch.channel)}: ${escapeHtml(status)}</span>`;
  }

  function renderHistory() {
    els.historyBody.innerHTML = state.purchaseOrders.length
      ? state.purchaseOrders.map((purchaseOrder) => {
        const orderedQty = (purchaseOrder.lines || []).reduce((sum, line) => sum + asNumber(line.quantity, 0), 0);
        const receivedQty = (purchaseOrder.lines || []).reduce((sum, line) => sum + asNumber(line.received_qty, 0), 0);
        const failedChannels = (purchaseOrder.failed_channels || []).join(",");
        const actionMarkup = purchaseOrder.has_dispatch_failures
          ? `<button class="stock-primaryBtn" type="button" data-buy-action="retry" data-buy-po="${purchaseOrder.id}" data-buy-channels="${escapeHtml(failedChannels)}">Retry failed</button>`
          : `
              <button class="stock-secondaryBtn" type="button" data-buy-action="open" data-buy-po="${purchaseOrder.id}">Open</button>
              <button class="stock-secondaryBtn" type="button" data-buy-action="print" data-buy-po="${purchaseOrder.id}">Print</button>
              <button class="stock-secondaryBtn" type="button" data-buy-action="email" data-buy-po="${purchaseOrder.id}">Email</button>
              <button class="stock-primaryBtn" type="button" data-buy-action="receive" data-buy-po="${purchaseOrder.id}" ${purchaseOrder.can_receive ? "" : "disabled"}>Receive</button>
            `;
        return `
          <tr>
            <td><strong>#${purchaseOrder.id}</strong><div class="uo-meta">${escapeHtml(purchaseOrder.shopify_draft_order_name || "-")}</div></td>
            <td>${escapeHtml(purchaseOrder.supplier_name || "-")}</td>
            <td>${escapeHtml(purchaseOrder.lifecycle_status || purchaseOrder.status || "-")}</td>
            <td>${(purchaseOrder.dispatches || []).map(channelChip).join(" ") || '<span class="uo-chip uo-chip--muted">None</span>'}</td>
            <td>${round2(receivedQty)} / ${round2(orderedQty)}</td>
            <td>${actionMarkup}</td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No purchase orders yet.</td></tr>`;
  }

  function buildReceiveRows(purchaseOrder) {
    return (purchaseOrder?.lines || [])
      .filter((line) => round2(asNumber(line.quantity, 0) - asNumber(line.received_qty, 0)) > 0)
      .map((line) => ({
        lineId: Number(line.id),
        quantity: round2(asNumber(line.quantity, 0) - asNumber(line.received_qty, 0)),
        supplierLot: "",
        expiryDate: "",
        coaStatus: ""
      }));
  }

  function renderReceiveModal() {
    if (!state.receive.purchaseOrder) {
      els.receiveModal.hidden = true;
      return;
    }
    const purchaseOrder = state.receive.purchaseOrder;
    const inspection = state.receive.inspection || createDefaultReceiveInspection();
    els.receiveModal.hidden = false;
    els.receiveModal.innerHTML = `
      <div class="dispatchSiteAlertModal__backdrop" data-buy-close-receive="true" aria-hidden="true"></div>
      <div class="dispatchSiteAlertModal__content dispatchSiteAlertModal__content--ok" role="dialog" aria-modal="true" aria-labelledby="buyReceiveTitle" style="width:min(92vw, 58rem);">
        <div class="dispatchSiteAlertModal__header">
          <h3 id="buyReceiveTitle">Receive PO #${purchaseOrder.id}</h3>
          <button type="button" class="dispatchSiteAlertModal__close" data-buy-close-receive="true" aria-label="Close">x</button>
        </div>
        <div class="dispatchSiteAlertModal__body">
          <div class="uo-card uo-card--inner" style="margin-bottom:.75rem;">
            <div class="uo-sectionHead"><div><h3>Incoming vehicle inspection</h3><p>Capture the receipt checks that should follow the supplier delivery and feed traceability.</p></div></div>
            <div class="uo-grid uo-grid--two">
              <label class="uo-label"><span>Receipt date</span><input class="uo-input" type="date" data-buy-inspection-field="receiptDate" value="${escapeHtml(inspection.receiptDate || "")}" /></label>
              <label class="uo-label"><span>Vehicle registration</span><input class="uo-input" type="text" data-buy-inspection-field="vehicleRegistrationNumber" value="${escapeHtml(inspection.vehicleRegistrationNumber || "")}" /></label>
              <label class="uo-label"><span>Driver</span><input class="uo-input" type="text" data-buy-inspection-field="driverName" value="${escapeHtml(inspection.driverName || "")}" /></label>
              <label class="uo-label"><span>Delivery reference</span><input class="uo-input" type="text" data-buy-inspection-field="deliveryReference" value="${escapeHtml(inspection.deliveryReference || "")}" /></label>
              <label class="uo-label"><span>COA / COC reference</span><input class="uo-input" type="text" data-buy-inspection-field="coaReference" value="${escapeHtml(inspection.coaReference || "")}" /></label>
              <label class="uo-label"><span>Checked by</span><input class="uo-input" type="text" data-buy-inspection-field="checkedBy" value="${escapeHtml(inspection.checkedBy || "")}" /></label>
            </div>
            <label class="uo-label" style="display:grid;gap:.35rem;margin-top:.6rem;">
              <span>Inspection notes</span>
              <textarea class="uo-input" rows="3" data-buy-inspection-field="notes">${escapeHtml(inspection.notes || "")}</textarea>
            </label>
            <div class="uo-grid uo-grid--two" style="margin-top:.6rem;">
              ${inspection.checks.map((check) => `
                <label class="uo-label">
                  <span>${escapeHtml(check.question)}</span>
                  <select class="uo-select" data-buy-inspection-check="${check.key}">
                    <option value="">Select</option>
                    <option value="yes"${check.answer === "yes" ? " selected" : ""}>Yes</option>
                    <option value="no"${check.answer === "no" ? " selected" : ""}>No</option>
                  </select>
                </label>
              `).join("")}
            </div>
          </div>
          <div class="uo-sectionHead"><div><h3>Receipt rows</h3><p>Add one or more receipt rows. Use multiple rows against the same line to split a PO line into multiple receipt batches.</p></div><button class="stock-secondaryBtn" type="button" data-buy-add-receive-row="true">Add row</button></div>
          <div class="uo-tableWrap">
            <table class="stock-table">
              <thead><tr><th>PO line</th><th>Qty</th><th>Lot</th><th>Expiry</th><th>COA</th><th>Action</th></tr></thead>
              <tbody>
                ${state.receive.rows.map((row, index) => `
                  <tr>
                    <td>
                      <select class="uo-select" data-buy-receive-index="${index}" data-buy-receive-field="lineId">
                        ${(purchaseOrder.lines || []).map((line) => {
                          const remaining = round2(asNumber(line.quantity, 0) - asNumber(line.received_qty, 0));
                          return `<option value="${line.id}">${escapeHtml(line.sku_snapshot)} (${round2(remaining)} remaining)</option>`;
                        }).join("")}
                      </select>
                    </td>
                    <td><input class="uo-input" type="number" step="0.01" min="0" data-buy-receive-index="${index}" data-buy-receive-field="quantity" value="${round2(row.quantity)}" /></td>
                    <td><input class="uo-input" type="text" data-buy-receive-index="${index}" data-buy-receive-field="supplierLot" value="${escapeHtml(row.supplierLot || "")}" /></td>
                    <td><input class="uo-input" type="date" data-buy-receive-index="${index}" data-buy-receive-field="expiryDate" value="${escapeHtml(row.expiryDate || "")}" /></td>
                    <td>
                      <select class="uo-select" data-buy-receive-index="${index}" data-buy-receive-field="coaStatus">
                        <option value="">-</option>
                        <option value="pending">Pending</option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                      </select>
                    </td>
                    <td><button class="stock-secondaryBtn" type="button" data-buy-remove-receive-row="${index}">Remove</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
        <div class="dispatchSiteAlertModal__actions dispatchSiteAlertModal__actions--split">
          <button type="button" class="dispatchSiteAlertModal__secondary" data-buy-close-receive="true">Cancel</button>
          <button type="button" class="dispatchSiteAlertModal__confirm dispatchSiteAlertModal__confirm--primary" data-buy-submit-receive="true">Receive stock</button>
        </div>
      </div>
    `;
    state.receive.rows.forEach((row, index) => {
      const lineSelect = els.receiveModal.querySelector(`[data-buy-receive-index="${index}"][data-buy-receive-field="lineId"]`);
      if (lineSelect) lineSelect.value = String(row.lineId || "");
      const coaSelect = els.receiveModal.querySelector(`[data-buy-receive-index="${index}"][data-buy-receive-field="coaStatus"]`);
      if (coaSelect) coaSelect.value = String(row.coaStatus || "");
    });
  }

  async function loadMaterials() {
    const response = await fetch(`${API_BASE}/catalog/materials`);
    const body = await response.json().catch(() => ({}));
    state.materials = Array.isArray(body.materials) ? body.materials : [];
    renderPlan();
  }

  async function loadHistory() {
    const response = await fetch(`${API_BASE}/buy/purchase-orders`);
    const body = await response.json().catch(() => ({}));
    state.purchaseOrders = Array.isArray(body.purchaseOrders) ? body.purchaseOrders : [];
    renderHistory();
  }

  async function previewPurchaseOrders() {
    const response = await fetch(`${API_BASE}/buy/purchase-orders/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selections: selectedLines() })
    });
    const body = await response.json().catch(() => ({}));
    state.preview = body;
    renderReview();
    if (!response.ok) throw new Error(body?.errors?.[0]?.message || body?.error || "Could not preview purchase orders");
    setActiveTab("review");
    setStatus(`Previewed ${body.groups?.length || 0} supplier purchase order group${body.groups?.length === 1 ? "" : "s"}.`);
  }

  async function createPurchaseOrders() {
    const response = await fetch(`${API_BASE}/buy/purchase-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selections: selectedLines(),
        dispatch: {
          shopify: els.dispatchShopify.checked,
          email: els.dispatchEmail.checked,
          print: els.dispatchPrint.checked
        },
        actor_type: "ui",
        actor_id: "buy"
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.errors?.[0]?.message || "Could not create purchase orders");
    state.preview = null;
    state.selections.clear();
    setStatus(`Created ${body.results?.length || 0} purchase order group${body.results?.length === 1 ? "" : "s"}.`);
    await Promise.all([loadMaterials(), loadHistory()]);
    setActiveTab("history");
  }

  async function receivePurchaseOrder() {
    const purchaseOrder = state.receive.purchaseOrder;
    if (!purchaseOrder) return;
    const lines = state.receive.rows.map((row) => ({
      line_id: Number(row.lineId),
      received_qty: round2(row.quantity),
      supplier_lot: String(row.supplierLot || "").trim() || null,
      expiry_date: String(row.expiryDate || "").trim() || null,
      coa_status: String(row.coaStatus || "").trim() || null
    })).filter((row) => row.line_id > 0 && row.received_qty > 0);
    if (!lines.length) throw new Error("Add at least one receipt row");
    const response = await fetch(`${API_BASE}/buy/purchase-orders/${purchaseOrder.id}/receive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lines,
        inspection: {
          receipt_date: state.receive.inspection.receiptDate || null,
          vehicle_registration_number: state.receive.inspection.vehicleRegistrationNumber || null,
          driver_name: state.receive.inspection.driverName || null,
          delivery_reference: state.receive.inspection.deliveryReference || null,
          coa_reference: state.receive.inspection.coaReference || null,
          checked_by: state.receive.inspection.checkedBy || null,
          notes: state.receive.inspection.notes || null,
          checks: (state.receive.inspection.checks || []).map((check) => ({
            key: check.key,
            answer: check.answer || ""
          }))
        },
        actor_type: "ui",
        actor_id: "buy"
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not receive purchase order");
    state.receive = { purchaseOrder: null, rows: [], inspection: createDefaultReceiveInspection() };
    renderReceiveModal();
    setStatus(`Received ${lines.length} receipt row${lines.length === 1 ? "" : "s"} into stock batches.`);
    await Promise.all([loadMaterials(), loadHistory()]);
  }

  function openReceiveModal(purchaseOrderId) {
    const purchaseOrder = state.purchaseOrders.find((entry) => Number(entry.id) === Number(purchaseOrderId));
    if (!purchaseOrder) return;
    state.receive = { purchaseOrder, rows: buildReceiveRows(purchaseOrder), inspection: createDefaultReceiveInspection() };
    renderReceiveModal();
  }

  function closeReceiveModal() {
    state.receive = { purchaseOrder: null, rows: [], inspection: createDefaultReceiveInspection() };
    renderReceiveModal();
  }

  els.tabs.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.buyTab || "plan")));
  els.search.addEventListener("input", renderPlan);
  els.planBody.addEventListener("input", (event) => {
    const input = event.target.closest("[data-buy-field]");
    if (!input) return;
    const materialId = String(input.dataset.materialId || "");
    const selection = state.selections.get(materialId) || { quantity: 0, supplierId: null };
    if (input.dataset.buyField === "quantity") selection.quantity = round2(input.value);
    if (input.dataset.buyField === "supplier") selection.supplierId = input.value ? Number(input.value) : null;
    state.selections.set(materialId, selection);
  });
  els.previewBtn.addEventListener("click", async () => { try { await previewPurchaseOrders(); } catch (error) { setStatus(String(error?.message || error)); renderReview(); } });
  els.createBtn.addEventListener("click", async () => { try { await createPurchaseOrders(); } catch (error) { setStatus(String(error?.message || error)); } });
  els.historyBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-buy-action]");
    if (!button) return;
    const purchaseOrder = state.purchaseOrders.find((entry) => Number(entry.id) === Number(button.dataset.buyPo));
    if (!purchaseOrder) return;
    const action = button.dataset.buyAction;
    try {
      if (action === "open") {
        const url = purchaseOrder.shopify_admin_url || purchaseOrder.generated_document_path;
        if (url) window.open(url, "_blank", "noopener");
        return;
      }
      if (action === "receive") {
        openReceiveModal(purchaseOrder.id);
        return;
      }
      const channels = action === "retry"
        ? String(button.dataset.buyChannels || "").split(",").map((entry) => entry.trim()).filter(Boolean)
        : [action];
      const response = await fetch(`${API_BASE}/buy/purchase-orders/${purchaseOrder.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor_type: "ui", actor_id: "buy", channels })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || body?.message || "Dispatch action failed");
      setStatus(`Updated ${channels.join(", ")} for PO #${purchaseOrder.id}.`);
      await loadHistory();
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  });
  els.receiveModal.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.buyCloseReceive === "true") {
      closeReceiveModal();
      return;
    }
    if (target.dataset.buyAddReceiveRow === "true") {
      const firstLine = state.receive.purchaseOrder?.lines?.find((line) => round2(asNumber(line.quantity, 0) - asNumber(line.received_qty, 0)) > 0);
      state.receive.rows.push({ lineId: Number(firstLine?.id || 0), quantity: 0, supplierLot: "", expiryDate: "", coaStatus: "" });
      renderReceiveModal();
      return;
    }
    if (target.dataset.buySubmitReceive === "true") {
      try {
        await receivePurchaseOrder();
      } catch (error) {
        setStatus(String(error?.message || error));
      }
      return;
    }
    const removeButton = target.closest("[data-buy-remove-receive-row]");
    if (removeButton) {
      state.receive.rows.splice(Number(removeButton.dataset.buyRemoveReceiveRow), 1);
      renderReceiveModal();
    }
  });
  const syncReceiveFormState = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const inspectionField = target.closest("[data-buy-inspection-field]");
    if (inspectionField) {
      const key = inspectionField.dataset.buyInspectionField;
      if (!key) return;
      state.receive.inspection[key] = inspectionField.value;
      return;
    }

    const inspectionCheck = target.closest("[data-buy-inspection-check]");
    if (inspectionCheck) {
      const check = (state.receive.inspection.checks || []).find((entry) => entry.key === inspectionCheck.dataset.buyInspectionCheck);
      if (check) check.answer = inspectionCheck.value || "";
      return;
    }

    const input = target.closest("[data-buy-receive-field]");
    if (!input) return;
    const row = state.receive.rows[Number(input.dataset.buyReceiveIndex)];
    if (!row) return;
    const key = input.dataset.buyReceiveField;
    row[key] = key === "lineId" ? Number(input.value || 0) : key === "quantity" ? round2(input.value) : input.value;
  };
  els.receiveModal.addEventListener("input", syncReceiveFormState);
  els.receiveModal.addEventListener("change", syncReceiveFormState);

  setActiveTab("plan");
  Promise.all([loadMaterials(), loadHistory()]).then(() => {
    renderReview();
    setStatus("Set supplier and quantity per material, then preview the grouped purchase orders.");
  }).catch((error) => {
    setStatus(String(error?.message || error));
  });
}
