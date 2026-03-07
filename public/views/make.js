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
    historyBody: document.getElementById("makeHistoryBody"),
    bomEditor: document.getElementById("makeBomEditor"),
    bomLibraryBody: document.getElementById("makeBomLibraryBody"),
    bomStatus: document.getElementById("makeBomStatus"),
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
    bomReset: document.getElementById("makeBomReset"),
    materialSku: document.getElementById("makeMaterialSku"),
    materialTitle: document.getElementById("makeMaterialTitle"),
    materialCategory: document.getElementById("makeMaterialCategory"),
    materialUom: document.getElementById("makeMaterialUom"),
    materialIcon: document.getElementById("makeMaterialIcon"),
    materialSupplier: document.getElementById("makeMaterialSupplier"),
    materialCreate: document.getElementById("makeMaterialCreate"),
    materialStatus: document.getElementById("makeMaterialStatus")
  };

  const state = {
    products: [],
    materials: [],
    suppliers: [],
    boms: [],
    manufacturingOrders: [],
    qtyBySku: new Map(),
    latestRequirements: [],
    missingBom: [],
    editingBomId: null,
    bomEditorLines: []
  };

  function materialById(materialId) {
    return state.materials.find((material) => Number(material.id) === Number(materialId)) || null;
  }

  function activeBomBySkuMap() {
    const map = new Map();
    state.boms.forEach((bom) => {
      if (!Number(bom?.is_active)) return;
      const existing = map.get(String(bom.product_sku));
      if (!existing) {
        map.set(String(bom.product_sku), bom);
        return;
      }
      const left = `${existing.effective_from || ""}|${existing.id || 0}`;
      const right = `${bom.effective_from || ""}|${bom.id || 0}`;
      if (right > left) {
        map.set(String(bom.product_sku), bom);
      }
    });
    return map;
  }

  function defaultLineType(material) {
    const category = String(material?.category || "").toLowerCase();
    if (category.includes("pack")) return "packaging";
    if (category.includes("label")) return "label";
    if (category.includes("consum")) return "consumable";
    return "ingredient";
  }

  function defaultBomVersion(productSku) {
    const count = state.boms.filter((bom) => String(bom.product_sku) === String(productSku)).length;
    return `v${count + 1}`;
  }

  function setMakeStatus(message) {
    if (els.status) els.status.textContent = String(message || "");
  }

  function setBomStatus(message) {
    if (els.bomStatus) els.bomStatus.textContent = String(message || "");
  }

  function setMaterialStatus(message) {
    if (els.materialStatus) els.materialStatus.textContent = String(message || "");
  }

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

  function renderBomProductOptions() {
    if (!els.bomProduct) return;
    const selected = String(els.bomProduct.value || "");
    const options = state.products.map((product) => `
      <option value="${escapeHtml(product.sku)}">${escapeHtml(product.sku)} - ${escapeHtml(product.title)}</option>
    `).join("");
    els.bomProduct.innerHTML = `<option value="">Select product</option>${options}`;
    if (selected && state.products.some((product) => String(product.sku) === selected)) {
      els.bomProduct.value = selected;
    }
  }

  function renderBomMaterialOptions(selectedId = "") {
    if (!els.bomLineMaterial) return;
    const current = String(selectedId || els.bomLineMaterial.value || "");
    const options = state.materials.map((material) => `
      <option value="${material.id}">${escapeHtml(material.sku)} - ${escapeHtml(material.title)}</option>
    `).join("");
    els.bomLineMaterial.innerHTML = `<option value="">Select material</option>${options}`;
    if (current && state.materials.some((material) => String(material.id) === current)) {
      els.bomLineMaterial.value = current;
    }
  }

  function renderSupplierOptions(selectedId = "") {
    if (!els.materialSupplier) return;
    const current = String(selectedId || els.materialSupplier.value || "");
    const options = state.suppliers.map((supplier) => `
      <option value="${supplier.id}">${escapeHtml(supplier.name)}</option>
    `).join("");
    els.materialSupplier.innerHTML = `<option value="">Select supplier</option>${options}`;
    if (current && state.suppliers.some((supplier) => String(supplier.id) === current)) {
      els.materialSupplier.value = current;
    }
  }

  function renderProducts() {
    if (!els.productBody) return;
    const activeBoms = activeBomBySkuMap();
    const rows = filteredProducts();
    els.productBody.innerHTML = rows.length
      ? rows.map((product) => {
          const activeBom = activeBoms.get(product.sku) || null;
          return `
            <tr>
              <td><strong>${escapeHtml(product.sku)}</strong></td>
              <td>${escapeHtml(product.title)}</td>
              <td>${escapeHtml(product.flavour || "-")}</td>
              <td>${Number(product.available || 0)}</td>
              <td><input class="uo-input" type="number" min="0" step="1" value="${Number(state.qtyBySku.get(product.sku) || 0)}" data-make-sku="${escapeHtml(product.sku)}" /></td>
              <td>
                <button class="stock-secondaryBtn" type="button" data-make-edit-bom-sku="${escapeHtml(product.sku)}">${activeBom ? `Edit ${escapeHtml(activeBom.version || "BOM")}` : "Create BOM"}</button>
                <div class="uo-meta">${activeBom ? `${Number(activeBom.line_count || activeBom.lines?.length || 0)} lines` : "No active BOM"}</div>
              </td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No products match this filter.</td></tr>`;
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
    if (!state.latestRequirements.length && state.missingBom.length) {
      els.requirementsBody.innerHTML = `
        <tr>
          <td colspan="6" class="stock-emptyCell">Missing active BOM for: ${escapeHtml(state.missingBom.join(", "))}</td>
        </tr>`;
      return;
    }
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

  function renderBomLibrary() {
    if (!els.bomLibraryBody) return;
    els.bomLibraryBody.innerHTML = state.boms.length
      ? state.boms.map((bom) => `
          <tr>
            <td>
              <strong>${escapeHtml(bom.product_sku)}</strong>
              <div class="uo-meta">${escapeHtml(bom.product_title || bom.product_sku)}</div>
            </td>
            <td>${escapeHtml(bom.version || "-")}</td>
            <td>${escapeHtml(bom.effective_from || "-")}</td>
            <td>${Number(bom.yield_pct || 0)}%</td>
            <td>${Number(bom.waste_pct || 0)}%</td>
            <td>${Number(bom.line_count || bom.lines?.length || 0)}</td>
            <td><span class="uo-chip ${Number(bom.is_active) ? "uo-chip--success" : "uo-chip--muted"}">${Number(bom.is_active) ? "Active" : "History"}</span></td>
            <td><button class="stock-secondaryBtn" type="button" data-make-edit-bom-id="${bom.id}">Edit</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="8" class="stock-emptyCell">No BOMs have been created yet.</td></tr>`;
    setBomStatus(
      state.editingBomId
        ? `Editing BOM #${state.editingBomId}.`
        : `Loaded ${state.boms.length} BOM version${state.boms.length === 1 ? "" : "s"}.`
    );
  }

  function renderBomLines() {
    if (!els.bomLinesBody) return;
    els.bomLinesBody.innerHTML = state.bomEditorLines.length
      ? state.bomEditorLines.map((line, index) => {
          const material = materialById(line.material_id);
          return `
            <tr>
              <td><strong>${escapeHtml(material?.sku || "-")}</strong></td>
              <td>${escapeHtml(material?.title || `Material ${line.material_id}`)}</td>
              <td>
                <select class="uo-select" data-bom-line-index="${index}" data-bom-line-field="line_type">
                  <option value="ingredient" ${line.line_type === "ingredient" ? "selected" : ""}>Ingredient</option>
                  <option value="packaging" ${line.line_type === "packaging" ? "selected" : ""}>Packaging</option>
                  <option value="label" ${line.line_type === "label" ? "selected" : ""}>Label</option>
                  <option value="consumable" ${line.line_type === "consumable" ? "selected" : ""}>Consumable</option>
                </select>
              </td>
              <td><input class="uo-input" type="number" min="0" step="0.01" value="${Number(line.quantity || 0)}" data-bom-line-index="${index}" data-bom-line-field="quantity" /></td>
              <td><input class="uo-input" type="text" value="${escapeHtml(line.uom || "unit")}" data-bom-line-index="${index}" data-bom-line-field="uom" /></td>
              <td><button class="stock-secondaryBtn" type="button" data-bom-line-remove="${index}">Remove</button></td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">Add recipe lines to build a BOM version.</td></tr>`;
  }

  function syncBomVersionSuggestion(force = false) {
    if (!els.bomProduct || !els.bomVersion) return;
    if (state.editingBomId && !force) return;
    const productSku = String(els.bomProduct.value || "").trim();
    if (!productSku) return;
    if (!force && String(els.bomVersion.value || "").trim()) return;
    els.bomVersion.value = defaultBomVersion(productSku);
  }

  function syncBomLineDefaults() {
    const material = materialById(els.bomLineMaterial?.value);
    if (!material) return;
    if (els.bomLineUom && !String(els.bomLineUom.value || "").trim()) {
      els.bomLineUom.value = material.uom || "unit";
    }
    if (els.bomLineType && !String(els.bomLineType.value || "").trim()) {
      els.bomLineType.value = defaultLineType(material);
    }
  }

  function scrollBomEditor() {
    els.bomEditor?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetBomEditor(productSku = "") {
    state.editingBomId = null;
    state.bomEditorLines = [];
    if (els.bomProduct) els.bomProduct.value = productSku || "";
    if (els.bomVersion) els.bomVersion.value = productSku ? defaultBomVersion(productSku) : "";
    if (els.bomEffectiveFrom) els.bomEffectiveFrom.value = todayIso();
    if (els.bomYield) els.bomYield.value = "100";
    if (els.bomWaste) els.bomWaste.value = "0";
    if (els.bomActive) els.bomActive.checked = true;
    if (els.bomLineMaterial) els.bomLineMaterial.value = "";
    if (els.bomLineQty) els.bomLineQty.value = "0";
    if (els.bomLineUom) els.bomLineUom.value = "";
    if (els.bomLineType) els.bomLineType.value = "ingredient";
    renderBomLines();
    renderBomLibrary();
    setBomStatus(productSku ? `Create a new BOM for ${productSku}.` : "Select a product and build its recipe.");
  }

  function loadBomIntoEditor(bom) {
    if (!bom) return;
    state.editingBomId = Number(bom.id);
    state.bomEditorLines = Array.isArray(bom.lines)
      ? bom.lines.map((line) => ({
          material_id: Number(line.material_id),
          quantity: Number(line.quantity || 0),
          uom: String(line.uom || line.material_uom || "unit"),
          line_type: String(line.line_type || defaultLineType(materialById(line.material_id))).toLowerCase()
        }))
      : [];
    if (els.bomProduct) els.bomProduct.value = String(bom.product_sku || "");
    if (els.bomVersion) els.bomVersion.value = String(bom.version || "");
    if (els.bomEffectiveFrom) els.bomEffectiveFrom.value = String(bom.effective_from || todayIso());
    if (els.bomYield) els.bomYield.value = String(bom.yield_pct ?? 100);
    if (els.bomWaste) els.bomWaste.value = String(bom.waste_pct ?? 0);
    if (els.bomActive) els.bomActive.checked = Boolean(Number(bom.is_active));
    renderBomLines();
    renderBomLibrary();
    setBomStatus(`Editing ${bom.product_sku} ${bom.version || ""}.`);
    scrollBomEditor();
  }

  async function loadMasterData() {
    const [productsResp, materialsResp, suppliersResp, bomsResp] = await Promise.all([
      fetch(`${API_BASE}/catalog/products`),
      fetch(`${API_BASE}/catalog/materials`),
      fetch(`${API_BASE}/catalog/suppliers`),
      fetch(`${API_BASE}/catalog/boms`)
    ]);
    const [productsBody, materialsBody, suppliersBody, bomsBody] = await Promise.all([
      productsResp.json().catch(() => ({})),
      materialsResp.json().catch(() => ({})),
      suppliersResp.json().catch(() => ({})),
      bomsResp.json().catch(() => ({}))
    ]);
    state.products = Array.isArray(productsBody.products) ? productsBody.products : [];
    state.materials = Array.isArray(materialsBody.materials) ? materialsBody.materials : [];
    state.suppliers = Array.isArray(suppliersBody.suppliers) ? suppliersBody.suppliers : [];
    state.boms = Array.isArray(bomsBody.boms) ? bomsBody.boms : [];
    renderBomProductOptions();
    renderBomMaterialOptions();
    renderSupplierOptions();
    renderProducts();
    renderBomLibrary();
    renderBomLines();
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
      state.missingBom = [];
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
    state.missingBom = Array.isArray(body.missing_bom) ? body.missing_bom : [];
    renderRequirements();
    if (state.missingBom.length) {
      setMakeStatus(`Missing active BOM for: ${state.missingBom.join(", ")}.`);
    } else {
      setMakeStatus(`Loaded ${state.latestRequirements.length} material requirement${state.latestRequirements.length === 1 ? "" : "s"}.`);
    }
  }

  function addBomLine() {
    const materialId = Number(els.bomLineMaterial?.value || 0);
    const quantity = round2(els.bomLineQty?.value);
    const material = materialById(materialId);
    if (!material) {
      setBomStatus("Select a material before adding a recipe line.");
      return;
    }
    if (!(quantity > 0)) {
      setBomStatus("Recipe line quantity must be greater than zero.");
      return;
    }
    const uom = String(els.bomLineUom?.value || material.uom || "unit").trim() || "unit";
    const lineType = String(els.bomLineType?.value || defaultLineType(material)).trim().toLowerCase() || "ingredient";
    const existing = state.bomEditorLines.find((line) => Number(line.material_id) === materialId && line.uom === uom && line.line_type === lineType);
    if (existing) {
      existing.quantity = round2(Number(existing.quantity || 0) + quantity);
    } else {
      state.bomEditorLines.push({
        material_id: materialId,
        quantity,
        uom,
        line_type: lineType
      });
    }
    renderBomLines();
    if (els.bomLineQty) els.bomLineQty.value = "0";
    setBomStatus(`Added ${material.sku} to the recipe.`);
  }

  async function createMaterial() {
    const sku = String(els.materialSku?.value || "").trim().toUpperCase();
    const title = String(els.materialTitle?.value || "").trim();
    if (!sku || !title) {
      setMaterialStatus("Material SKU and title are required.");
      return;
    }
    if (els.materialCreate) els.materialCreate.disabled = true;
    setMaterialStatus("Creating material...");
    try {
      const resp = await fetch(`${API_BASE}/catalog/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          title,
          category: String(els.materialCategory?.value || "ingredient"),
          uom: String(els.materialUom?.value || "unit"),
          icon: String(els.materialIcon?.value || "").trim(),
          preferred_supplier_id: els.materialSupplier?.value ? Number(els.materialSupplier.value) : undefined,
          actor_type: "ui",
          actor_id: "make"
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not create material");
      await loadMasterData();
      if (body?.material?.id) {
        renderBomMaterialOptions(String(body.material.id));
        if (els.bomLineMaterial) els.bomLineMaterial.value = String(body.material.id);
        if (els.bomLineUom) els.bomLineUom.value = body.material.uom || "unit";
        if (els.bomLineType) els.bomLineType.value = defaultLineType(body.material);
      }
      if (els.materialSku) els.materialSku.value = "";
      if (els.materialTitle) els.materialTitle.value = "";
      if (els.materialIcon) els.materialIcon.value = "";
      setMaterialStatus(`Created material ${body?.material?.sku || sku}.`);
      setBomStatus(`Material ${body?.material?.sku || sku} is ready for recipe lines.`);
    } catch (error) {
      setMaterialStatus(String(error?.message || error));
    } finally {
      if (els.materialCreate) els.materialCreate.disabled = false;
    }
  }

  async function saveBom() {
    const productSku = String(els.bomProduct?.value || "").trim();
    if (!productSku) {
      setBomStatus("Select a product for this BOM.");
      return;
    }
    if (!state.bomEditorLines.length) {
      setBomStatus("Add at least one recipe line before saving.");
      return;
    }
    const wasEditing = Boolean(state.editingBomId);
    if (els.bomSave) els.bomSave.disabled = true;
    setBomStatus(state.editingBomId ? "Updating BOM..." : "Creating BOM...");
    try {
      const payload = {
        product_sku: productSku,
        version: String(els.bomVersion?.value || "").trim(),
        effective_from: String(els.bomEffectiveFrom?.value || todayIso()),
        yield_pct: round2(els.bomYield?.value || 100),
        waste_pct: round2(els.bomWaste?.value || 0),
        is_active: Boolean(els.bomActive?.checked),
        lines: state.bomEditorLines.map((line) => ({
          material_id: Number(line.material_id),
          quantity: round2(line.quantity),
          uom: String(line.uom || "unit"),
          line_type: String(line.line_type || "ingredient")
        })),
        actor_type: "ui",
        actor_id: "make"
      };
      const url = state.editingBomId
        ? `${API_BASE}/catalog/boms/${state.editingBomId}`
        : `${API_BASE}/catalog/boms`;
      const method = state.editingBomId ? "PUT" : "POST";
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not save BOM");
      await loadMasterData();
      if (body?.bom) {
        loadBomIntoEditor(body.bom);
      } else {
        resetBomEditor(productSku);
      }
      await refreshRequirements();
      setBomStatus(`${wasEditing ? "Updated" : "Created"} BOM for ${productSku}.`);
    } catch (error) {
      setBomStatus(String(error?.message || error));
    } finally {
      if (els.bomSave) els.bomSave.disabled = false;
    }
  }

  async function createOrder() {
    const lines = makeLines();
    if (!lines.length) {
      setMakeStatus("Queue at least one product before creating an order.");
      return;
    }
    if (els.createOrder) els.createOrder.disabled = true;
    setMakeStatus("Creating manufacturing order draft...");
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
      state.qtyBySku.clear();
      state.latestRequirements = Array.isArray(body.requirements) ? body.requirements : [];
      state.missingBom = Array.isArray(body.missing_bom) ? body.missing_bom : [];
      renderProducts();
      renderDraft();
      renderRequirements();
      await loadHistory();
      setMakeStatus(
        state.missingBom.length
          ? `Manufacturing order #${body.manufacturing_order?.id || "?"} created with missing BOM alerts for ${state.missingBom.join(", ")}.`
          : `Manufacturing order #${body.manufacturing_order?.id || "?"} created.`
      );
    } catch (error) {
      setMakeStatus(String(error?.message || error));
    } finally {
      if (els.createOrder) els.createOrder.disabled = false;
    }
  }

  async function createShortagePurchaseOrders() {
    const lines = makeLines();
    if (!lines.length) {
      setMakeStatus("Queue draft lines before creating linked shortage POs.");
      return;
    }
    if (els.createShortagePos) els.createShortagePos.disabled = true;
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
      setMakeStatus(`Created ${body.results?.length || 0} linked purchase order group${body.results?.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setMakeStatus(String(error?.message || error));
    } finally {
      if (els.createShortagePos) els.createShortagePos.disabled = false;
    }
  }

  els.search?.addEventListener("input", renderProducts);
  els.productBody?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-make-sku]");
    if (!input) return;
    state.qtyBySku.set(String(input.dataset.makeSku), Number(input.value || 0));
    void refreshRequirements();
  });
  els.productBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-make-edit-bom-sku]");
    if (!button) return;
    const sku = String(button.dataset.makeEditBomSku || "");
    const bom = activeBomBySkuMap().get(sku) || state.boms.find((entry) => String(entry.product_sku) === sku) || null;
    if (bom) {
      loadBomIntoEditor(bom);
    } else {
      resetBomEditor(sku);
      scrollBomEditor();
    }
  });
  els.bomLibraryBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-make-edit-bom-id]");
    if (!button) return;
    const bom = state.boms.find((entry) => Number(entry.id) === Number(button.dataset.makeEditBomId));
    if (bom) loadBomIntoEditor(bom);
  });
  els.bomProduct?.addEventListener("change", () => {
    if (!state.editingBomId) {
      syncBomVersionSuggestion(true);
    }
  });
  els.bomLineMaterial?.addEventListener("change", () => {
    if (els.bomLineUom) els.bomLineUom.value = "";
    if (els.bomLineType) els.bomLineType.value = "";
    syncBomLineDefaults();
  });
  els.bomAddLine?.addEventListener("click", addBomLine);
  els.bomLinesBody?.addEventListener("input", (event) => {
    const field = String(event.target?.dataset?.bomLineField || "");
    const index = Number(event.target?.dataset?.bomLineIndex);
    if (!field || !Number.isFinite(index) || !state.bomEditorLines[index]) return;
    if (field === "quantity") {
      state.bomEditorLines[index].quantity = round2(event.target.value);
    } else if (field === "uom") {
      state.bomEditorLines[index].uom = String(event.target.value || "").trim() || "unit";
    } else if (field === "line_type") {
      state.bomEditorLines[index].line_type = String(event.target.value || "ingredient").trim().toLowerCase();
    }
  });
  els.bomLinesBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bom-line-remove]");
    if (!button) return;
    const index = Number(button.dataset.bomLineRemove);
    if (!Number.isFinite(index)) return;
    state.bomEditorLines.splice(index, 1);
    renderBomLines();
  });
  els.bomSave?.addEventListener("click", saveBom);
  els.bomReset?.addEventListener("click", () => resetBomEditor(String(els.bomProduct?.value || "")));
  els.materialCreate?.addEventListener("click", createMaterial);
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
      setMakeStatus(`Manufacturing order #${body.manufacturing_order?.id || "?"} completed.`);
      await Promise.all([loadHistory(), loadMasterData()]);
      await refreshRequirements();
    } catch (error) {
      setMakeStatus(String(error?.message || error));
    } finally {
      button.disabled = false;
    }
  });

  Promise.resolve()
    .then(() => Promise.all([loadMasterData(), loadHistory()]))
    .then(() => {
      if (els.targetDate && !els.targetDate.value) {
        els.targetDate.value = todayIso();
      }
      resetBomEditor();
      renderDraft();
      renderRequirements();
      setMakeStatus("Build a manufacturing draft and manage BOMs directly from this view.");
      setMaterialStatus("Use this when a BOM needs a material that does not exist yet.");
    });
}
