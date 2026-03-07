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

export function initStockView() {
  if (stockInitialized) return;
  stockInitialized = true;

  const API_BASE = "/api/v1";
  const els = {
    root: document.getElementById("viewStock"),
    primaryTabs: Array.from(document.querySelectorAll("[data-stock-primary]")),
    inventoryTabs: Array.from(document.querySelectorAll("[data-stock-inventory-tab]")),
    primaryPanels: {
      inventory: document.getElementById("stockPanelInventory"),
      batches: document.getElementById("stockPanelBatches"),
      stocktakes: document.getElementById("stockPanelStocktakes")
    },
    inventoryPanels: {
      products: document.getElementById("stockInventoryProducts"),
      materials: document.getElementById("stockInventoryMaterials")
    },
    search: document.getElementById("stockSearch"),
    location: document.getElementById("stockLocation"),
    productsBody: document.getElementById("stockProductsBody"),
    materialsBody: document.getElementById("stockMaterialsBody"),
    materialSku: document.getElementById("stockMaterialSku"),
    materialTitle: document.getElementById("stockMaterialTitle"),
    materialCategory: document.getElementById("stockMaterialCategory"),
    materialUom: document.getElementById("stockMaterialUom"),
    materialIcon: document.getElementById("stockMaterialIcon"),
    materialSupplier: document.getElementById("stockMaterialSupplier"),
    materialReorderPoint: document.getElementById("stockMaterialReorderPoint"),
    materialLeadTimeDays: document.getElementById("stockMaterialLeadTimeDays"),
    materialShopifyVariantId: document.getElementById("stockMaterialShopifyVariantId"),
    materialShopifyInventoryUnit: document.getElementById("stockMaterialShopifyInventoryUnit"),
    materialShopifyMultiplier: document.getElementById("stockMaterialShopifyMultiplier"),
    materialSave: document.getElementById("stockMaterialSave"),
    materialReset: document.getElementById("stockMaterialReset"),
    materialStatus: document.getElementById("stockMaterialStatus"),
    batchesBody: document.getElementById("stockBatchesBody"),
    stocktakeScope: document.getElementById("stocktakeScope"),
    stocktakeSearch: document.getElementById("stocktakeSearch"),
    stocktakeBody: document.getElementById("stocktakeBody"),
    stocktakeSubmit: document.getElementById("stocktakeSubmit"),
    stocktakeStatus: document.getElementById("stocktakeStatus"),
    stocktakeHistory: document.getElementById("stocktakeHistory"),
    auditFilters: document.getElementById("stockAuditFilters"),
    auditBody: document.getElementById("stockAuditBody"),
    auditStatus: document.getElementById("stockAuditStatus")
  };

  const state = {
    primaryTab: "inventory",
    inventoryTab: "products",
    products: [],
    materials: [],
    suppliers: [],
    batches: [],
    stocktakes: [],
    auditRows: [],
    locations: [],
    stocktakeCounts: new Map(),
    editingMaterialId: null
  };

  function filteredProducts() {
    const query = String(els.search?.value || "").trim().toLowerCase();
    return state.products.filter((product) => {
      const haystack = `${product.sku} ${product.title} ${product.flavour || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function filteredMaterials() {
    const query = String(els.search?.value || "").trim().toLowerCase();
    return state.materials.filter((material) => {
      const haystack = `${material.sku} ${material.title} ${material.category} ${material.preferred_supplier?.name || ""}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function filteredStocktakeItems() {
    const query = String(els.stocktakeSearch?.value || "").trim().toLowerCase();
    const scope = String(els.stocktakeScope?.value || "full");
    const products = state.products
      .filter((product) => scope === "full" || scope === "finished-goods")
      .map((product) => ({
        entity_type: "product",
        key: `product:${product.sku}`,
        sku: product.sku,
        title: product.title,
        category: "Finished good",
        current: Number(product.on_hand || 0)
      }));
    const materials = state.materials
      .filter((material) => scope === "full" || scope === "raw-materials")
      .map((material) => ({
        entity_type: "material",
        key: `material:${material.id}`,
        material_id: material.id,
        sku: material.sku,
        title: material.title,
        category: material.category,
        current: Number(material.on_hand || 0)
      }));
    return [...products, ...materials].filter((item) => {
      const haystack = `${item.sku} ${item.title} ${item.category}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }

  function setMaterialStatus(message) {
    if (els.materialStatus) els.materialStatus.textContent = String(message || "");
  }

  function formatShopifySyncSummary(sync) {
    if (!sync) return "";
    if (!sync.configured) return "Shopify inventory sync was skipped because Shopify inventory is not configured.";
    const synced = Array.isArray(sync.succeeded) ? sync.succeeded.length : 0;
    const failed = Array.isArray(sync.failed) ? sync.failed.length : 0;
    const skipped = Array.isArray(sync.skipped) ? sync.skipped.length : 0;
    const parts = [`Shopify synced ${synced}`];
    if (skipped) parts.push(`${skipped} skipped`);
    if (failed) parts.push(`${failed} failed`);
    return parts.join(" | ");
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

  function defaultShopifyUnitForUom(uom) {
    const normalized = String(uom || "").trim().toLowerCase();
    if (["kg", "kgs", "kilogram", "kilograms"].includes(normalized)) return "g";
    if (["l", "lt", "liter", "litre", "liters", "litres"].includes(normalized)) return "ml";
    return String(uom || "unit").trim() || "unit";
  }

  function defaultShopifyMultiplierForUom(uom) {
    const normalized = String(uom || "").trim().toLowerCase();
    if (["kg", "kgs", "kilogram", "kilograms", "l", "lt", "liter", "litre", "liters", "litres"].includes(normalized)) {
      return 1000;
    }
    return 1;
  }

  function resetMaterialEditor() {
    state.editingMaterialId = null;
    if (els.materialSku) els.materialSku.value = "";
    if (els.materialTitle) els.materialTitle.value = "";
    if (els.materialCategory) els.materialCategory.value = "ingredient";
    if (els.materialUom) els.materialUom.value = "kg";
    if (els.materialIcon) els.materialIcon.value = "";
    if (els.materialSupplier) els.materialSupplier.value = "";
    if (els.materialReorderPoint) els.materialReorderPoint.value = "0";
    if (els.materialLeadTimeDays) els.materialLeadTimeDays.value = "0";
    if (els.materialShopifyVariantId) els.materialShopifyVariantId.value = "";
    if (els.materialShopifyInventoryUnit) els.materialShopifyInventoryUnit.value = "g";
    if (els.materialShopifyMultiplier) els.materialShopifyMultiplier.value = "1000";
    setMaterialStatus("Create or edit raw materials here, then use them in BOMs from Make.");
  }

  function loadMaterialIntoEditor(material) {
    if (!material) return;
    state.editingMaterialId = Number(material.id);
    if (els.materialSku) els.materialSku.value = String(material.sku || "");
    if (els.materialTitle) els.materialTitle.value = String(material.title || "");
    if (els.materialCategory) els.materialCategory.value = String(material.category || "ingredient");
    if (els.materialUom) els.materialUom.value = String(material.uom || "unit");
    if (els.materialIcon) els.materialIcon.value = String(material.icon || "");
    if (els.materialSupplier) els.materialSupplier.value = material.preferred_supplier?.id ? String(material.preferred_supplier.id) : "";
    if (els.materialReorderPoint) els.materialReorderPoint.value = String(material.reorder_point ?? 0);
    if (els.materialLeadTimeDays) els.materialLeadTimeDays.value = String(material.lead_time_days ?? 0);
    if (els.materialShopifyVariantId) {
      els.materialShopifyVariantId.value = material.shopify_variant_id ? String(material.shopify_variant_id) : "";
    }
    if (els.materialShopifyInventoryUnit) {
      els.materialShopifyInventoryUnit.value = String(
        material.shopify_inventory_unit || defaultShopifyUnitForUom(material.uom)
      );
    }
    if (els.materialShopifyMultiplier) {
      els.materialShopifyMultiplier.value = String(
        material.shopify_inventory_multiplier || defaultShopifyMultiplierForUom(material.uom)
      );
    }
    setMaterialStatus(`Editing ${material.sku}.`);
  }

  function setPrimaryTab(tab) {
    state.primaryTab = tab;
    els.primaryTabs.forEach((button) => {
      const active = button.dataset.stockPrimary === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.entries(els.primaryPanels).forEach(([key, panel]) => {
      if (!panel) return;
      panel.hidden = key !== tab;
    });
  }

  function setInventoryTab(tab) {
    state.inventoryTab = tab;
    els.inventoryTabs.forEach((button) => {
      const active = button.dataset.stockInventoryTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.entries(els.inventoryPanels).forEach(([key, panel]) => {
      if (!panel) return;
      panel.hidden = key !== tab;
    });
  }

  function renderProducts() {
    if (!els.productsBody) return;
    const rows = filteredProducts();
    els.productsBody.innerHTML = rows.length
      ? rows.map((product) => `
          <tr>
            <td><strong>${escapeHtml(product.sku)}</strong></td>
            <td>${escapeHtml(product.title)}</td>
            <td><span class="stock-flavourBadge" style="--flavour-color:${resolveFlavourColor(product.flavour)}">${escapeHtml(product.flavour || "-")}</span></td>
            <td>${Number(product.on_hand || 0)}</td>
            <td>${Number(product.committed || 0)}</td>
            <td class="${Number(product.available || 0) < 0 ? "stock-neg" : ""}">${Number(product.available || 0)}</td>
            <td>${Number(product.incoming || 0)}</td>
            <td><span class="stock-statusBadge stock-statusBadge--${escapeHtml(product.status || "ok")}">${escapeHtml(product.status || "ok")}</span></td>
          </tr>
        `).join("")
      : `<tr><td colspan="8" class="stock-emptyCell">No products match this filter.</td></tr>`;
  }

  function renderMaterials() {
    if (!els.materialsBody) return;
    const rows = filteredMaterials();
    els.materialsBody.innerHTML = rows.length
      ? rows.map((material) => `
          <tr>
            <td><span class="stock-materialIcon">${escapeHtml(material.icon || "*")}</span></td>
            <td><strong>${escapeHtml(material.sku)}</strong></td>
            <td>${escapeHtml(material.title)}</td>
            <td>${escapeHtml(material.category)}</td>
            <td>${escapeHtml(material.preferred_supplier?.name || "Missing supplier")}</td>
            <td>${Number(material.on_hand || 0)}</td>
            <td>${Number(material.allocated || 0)}</td>
            <td class="${Number(material.available || 0) <= Number(material.reorder_point || 0) ? "stock-neg" : ""}">${Number(material.available || 0)}</td>
            <td>${Number(material.reorder_point || 0)}</td>
            <td>${Number(material.lead_time_days || 0)}d</td>
            <td><span class="uo-chip ${material.inventory_source === "shopify" ? "uo-chip--success" : "uo-chip--muted"}">${escapeHtml(material.inventory_source || "local")}</span></td>
            <td><button class="stock-secondaryBtn" type="button" data-material-edit="${material.id}">Edit</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="12" class="stock-emptyCell">No materials match this filter.</td></tr>`;
  }

  function renderBatches() {
    if (!els.batchesBody) return;
    els.batchesBody.innerHTML = state.batches.length
      ? state.batches.map((batch) => `
          <tr>
            <td><strong>${escapeHtml(batch.batch_code)}</strong></td>
            <td>${escapeHtml(batch.batch_type)}</td>
            <td>${escapeHtml(batch.product_sku || batch.material_title || "-")}</td>
            <td>${escapeHtml(batch.supplier_name || "-")}</td>
            <td>${Number(batch.qty_total || 0)}</td>
            <td>${Number(batch.qty_remaining || 0)}</td>
            <td>${escapeHtml(batch.purchase_order_name || batch.manufacturing_order_id || "-")}</td>
            <td>${escapeHtml(batch.expiry_date || "-")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="8" class="stock-emptyCell">No batches recorded yet.</td></tr>`;
  }

  function renderStocktakeRows() {
    if (!els.stocktakeBody) return;
    const items = filteredStocktakeItems().slice(0, 60);
    els.stocktakeBody.innerHTML = items.length
      ? items.map((item) => {
          const value = state.stocktakeCounts.get(item.key) ?? item.current;
          return `
            <tr data-stocktake-key="${escapeHtml(item.key)}">
              <td>${escapeHtml(item.entity_type)}</td>
              <td><strong>${escapeHtml(item.sku)}</strong></td>
              <td>${escapeHtml(item.title)}</td>
              <td>${escapeHtml(item.category)}</td>
              <td>${Number(item.current || 0)}</td>
              <td><input class="stock-qtyInput" type="number" step="1" data-stocktake-count value="${Number(value || 0)}" /></td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No stocktake items match this filter.</td></tr>`;
  }

  function renderStocktakeHistory() {
    if (!els.stocktakeHistory) return;
    els.stocktakeHistory.innerHTML = state.stocktakes.length
      ? state.stocktakes.map((row) => `
          <article class="stock-historyCard">
            <strong>#${row.id}</strong>
            <span>${escapeHtml(row.scope)}</span>
            <span>${escapeHtml(row.status)}</span>
            <span>${escapeHtml(row.closed_at || row.created_at || "-")}</span>
          </article>
        `).join("")
      : `<div class="stock-emptyCard">No stocktakes have been recorded yet.</div>`;
  }

  function renderAuditRows() {
    if (!els.auditBody) return;
    els.auditBody.innerHTML = state.auditRows.length
      ? state.auditRows.map((row) => `
          <tr>
            <td>${escapeHtml(row.occurred_at || "-")}</td>
            <td>${escapeHtml(row.surface || "-")}</td>
            <td>${escapeHtml(row.action || "-")}</td>
            <td>${escapeHtml(row.entity_type || "-")}</td>
            <td>${escapeHtml(row.entity_id || "-")}</td>
            <td>${escapeHtml(row.status || "-")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No audit rows found.</td></tr>`;
  }

  async function loadLocations() {
    if (!els.location) return;
    const resp = await fetch("/api/v1/shopify/locations");
    const body = await resp.json().catch(() => ({}));
    const locations = Array.isArray(body.locations) ? body.locations : [];
    state.locations = locations;
    els.location.innerHTML = locations.length
      ? locations.map((location) => `<option value="${location.id}">${escapeHtml(location.name || location.id)}</option>`).join("")
      : `<option value="">Primary</option>`;
  }

  async function loadSuppliers() {
    const resp = await fetch(`${API_BASE}/catalog/suppliers`);
    const body = await resp.json().catch(() => ({}));
    state.suppliers = Array.isArray(body.suppliers) ? body.suppliers : [];
    renderSupplierOptions();
  }

  async function loadInventory() {
    const resp = await fetch(`${API_BASE}/inventory/overview`);
    const body = await resp.json().catch(() => ({}));
    state.products = Array.isArray(body.products) ? body.products : [];
    state.materials = Array.isArray(body.materials) ? body.materials : [];
    if (state.editingMaterialId) {
      const current = state.materials.find((material) => Number(material.id) === Number(state.editingMaterialId));
      if (current) {
        renderSupplierOptions(current.preferred_supplier?.id ? String(current.preferred_supplier.id) : "");
        loadMaterialIntoEditor(current);
      }
    }
    renderProducts();
    renderMaterials();
    renderStocktakeRows();
  }

  async function loadBatches() {
    const resp = await fetch(`${API_BASE}/inventory/batches`);
    const body = await resp.json().catch(() => ({}));
    state.batches = Array.isArray(body.batches) ? body.batches : [];
    renderBatches();
  }

  async function loadStocktakes() {
    const resp = await fetch(`${API_BASE}/inventory/stocktakes`);
    const body = await resp.json().catch(() => ({}));
    state.stocktakes = Array.isArray(body.stocktakes) ? body.stocktakes : [];
    renderStocktakeHistory();
  }

  async function loadAudit() {
    const formData = new FormData(els.auditFilters);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (String(value || "").trim()) params.set(key, String(value));
    }
    const resp = await fetch(`${API_BASE}/audit/log?${params.toString()}`);
    const body = await resp.json().catch(() => ({}));
    state.auditRows = Array.isArray(body.rows) ? body.rows : [];
    if (els.auditStatus) {
      els.auditStatus.textContent = `Loaded ${state.auditRows.length} audit row${state.auditRows.length === 1 ? "" : "s"}.`;
    }
    renderAuditRows();
  }

  async function saveMaterial() {
    const sku = String(els.materialSku?.value || "").trim().toUpperCase();
    const title = String(els.materialTitle?.value || "").trim();
    if (!sku || !title) {
      setMaterialStatus("Material SKU and title are required.");
      return;
    }

    const uom = String(els.materialUom?.value || "unit").trim() || "unit";
    const variantIdRaw = String(els.materialShopifyVariantId?.value || "").trim();
    const shopifyUnitRaw = String(els.materialShopifyInventoryUnit?.value || "").trim();
    const shopifyMultiplierRaw = String(els.materialShopifyMultiplier?.value || "").trim();
    const payload = {
      sku,
      title,
      category: String(els.materialCategory?.value || "ingredient").trim() || "ingredient",
      uom,
      icon: String(els.materialIcon?.value || "").trim(),
      preferred_supplier_id: els.materialSupplier?.value ? Number(els.materialSupplier.value) : null,
      reorder_point: Number(els.materialReorderPoint?.value || 0),
      lead_time_days: Number(els.materialLeadTimeDays?.value || 0),
      shopify_variant_id: variantIdRaw ? Number(variantIdRaw) : null,
      shopify_inventory_unit: shopifyUnitRaw || defaultShopifyUnitForUom(uom),
      shopify_inventory_multiplier: shopifyMultiplierRaw ? Number(shopifyMultiplierRaw) : defaultShopifyMultiplierForUom(uom),
      actor_type: "ui",
      actor_id: "stock"
    };

    const isEditing = Number.isFinite(Number(state.editingMaterialId)) && Number(state.editingMaterialId) > 0;
    if (els.materialSave) els.materialSave.disabled = true;
    setMaterialStatus(isEditing ? "Updating material..." : "Creating material...");
    try {
      const resp = await fetch(
        isEditing ? `${API_BASE}/catalog/materials/${state.editingMaterialId}` : `${API_BASE}/catalog/materials`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not save material");
      await loadInventory();
      const savedMaterial = body?.material || null;
      if (savedMaterial?.id) {
        loadMaterialIntoEditor(savedMaterial);
      } else if (!isEditing) {
        resetMaterialEditor();
      }
      setMaterialStatus(`${isEditing ? "Updated" : "Created"} ${body?.material?.sku || sku}. Raw materials are maintained here under Stock > Raw Materials.`);
    } catch (error) {
      setMaterialStatus(String(error?.message || error));
    } finally {
      if (els.materialSave) els.materialSave.disabled = false;
    }
  }

  async function submitStocktake() {
    const items = filteredStocktakeItems().slice(0, 60);
    const lines = items
      .map((item) => {
        const counted = Number(state.stocktakeCounts.get(item.key));
        return {
          entity_type: item.entity_type,
          product_sku: item.entity_type === "product" ? item.sku : undefined,
          material_id: item.entity_type === "material" ? item.material_id : undefined,
          counted_qty: Number.isFinite(counted) ? counted : item.current
        };
      })
      .filter((line) => Number.isFinite(line.counted_qty));
    els.stocktakeSubmit.disabled = true;
    if (els.stocktakeStatus) els.stocktakeStatus.textContent = "Closing stocktake...";
    try {
      const resp = await fetch(`${API_BASE}/inventory/stocktakes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: String(els.stocktakeScope?.value || "full"),
          location_key: String(els.location?.value || "primary"),
          lines,
          actor_type: "ui",
          actor_id: "stock"
        })
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error || body?.message || "Could not create stocktake");
      if (els.stocktakeStatus) {
        const syncSummary = formatShopifySyncSummary(body.shopify_sync);
        els.stocktakeStatus.textContent = `Stocktake #${body.stocktake?.id || "?"} closed.${syncSummary ? ` ${syncSummary}` : ""}`;
      }
      state.stocktakeCounts.clear();
      await Promise.all([loadInventory(), loadStocktakes(), loadAudit()]);
    } catch (error) {
      if (els.stocktakeStatus) els.stocktakeStatus.textContent = String(error?.message || error);
    } finally {
      els.stocktakeSubmit.disabled = false;
    }
  }

  els.primaryTabs.forEach((button) => {
    button.addEventListener("click", () => setPrimaryTab(button.dataset.stockPrimary));
  });
  els.inventoryTabs.forEach((button) => {
    button.addEventListener("click", () => setInventoryTab(button.dataset.stockInventoryTab));
  });
  els.search?.addEventListener("input", () => {
    renderProducts();
    renderMaterials();
  });
  els.stocktakeSearch?.addEventListener("input", renderStocktakeRows);
  els.stocktakeScope?.addEventListener("change", renderStocktakeRows);
  els.stocktakeBody?.addEventListener("input", (event) => {
    const input = event.target.closest("[data-stocktake-count]");
    if (!input) return;
    const row = input.closest("[data-stocktake-key]");
    if (!row) return;
    state.stocktakeCounts.set(row.dataset.stocktakeKey, Number(input.value || 0));
  });
  els.materialSave?.addEventListener("click", () => {
    void saveMaterial();
  });
  els.materialReset?.addEventListener("click", () => {
    resetMaterialEditor();
    renderSupplierOptions();
  });
  els.materialUom?.addEventListener("change", () => {
    if (!els.materialShopifyInventoryUnit || !els.materialShopifyMultiplier) return;
    if (!String(els.materialShopifyInventoryUnit.value || "").trim()) {
      els.materialShopifyInventoryUnit.value = defaultShopifyUnitForUom(els.materialUom.value);
    }
    if (!String(els.materialShopifyMultiplier.value || "").trim()) {
      els.materialShopifyMultiplier.value = String(defaultShopifyMultiplierForUom(els.materialUom.value));
    }
  });
  els.materialsBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-material-edit]");
    if (!button) return;
    const material = state.materials.find((entry) => Number(entry.id) === Number(button.dataset.materialEdit));
    if (!material) return;
    loadMaterialIntoEditor(material);
  });
  els.stocktakeSubmit?.addEventListener("click", submitStocktake);
  els.auditFilters?.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadAudit();
  });

  Promise.resolve()
    .then(loadLocations)
    .then(() => Promise.all([loadSuppliers(), loadInventory(), loadBatches(), loadStocktakes(), loadAudit()]))
    .then(() => {
      setPrimaryTab("inventory");
      setInventoryTab("products");
      resetMaterialEditor();
    });
}
