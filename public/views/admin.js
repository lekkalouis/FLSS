let adminInitialized = false;

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

function boolFlag(value) {
  return value === true || value === 1 || String(value ?? "").trim().toLowerCase() === "true";
}

async function fetchCollection(url, key) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller && typeof window !== "undefined"
    ? window.setTimeout(() => controller.abort(), 8000)
    : null;
  try {
    const response = await fetch(url, controller ? { signal: controller.signal } : undefined);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || body?.message || `Could not load ${key}`);
    }
    return {
      items: Array.isArray(body?.[key]) ? body[key] : [],
      error: null
    };
  } catch (error) {
    return {
      items: [],
      error: String(error?.name === "AbortError" ? `${key} timed out` : error?.message || error)
    };
  } finally {
    if (timeoutId != null && typeof window !== "undefined") {
      window.clearTimeout(timeoutId);
    }
  }
}

function renderShell(root) {
  root.innerHTML = `
    <div class="uo-shell">
      <section class="uo-hero">
        <div>
          <p class="uo-eyebrow">Admin</p>
          <h2>Catalog and sourcing</h2>
          <p class="uo-copy">Products, materials, and suppliers are managed here. Buy and Make read these records directly.</p>
        </div>
        <div class="uo-toolbar">
          <button class="stock-secondaryBtn" type="button" data-route="/buy" data-buy-tab="plan">Open Buy</button>
          <button class="stock-secondaryBtn" type="button" data-route="/make" data-make-tab="planner">Open Make</button>
        </div>
      </section>

      <section class="uo-card">
        <div class="uo-tabRow" role="tablist" aria-label="Admin tabs">
          <button class="uo-tabBtn is-active" type="button" data-admin-tab="products" aria-selected="true">Products</button>
          <button class="uo-tabBtn" type="button" data-admin-tab="materials" aria-selected="false">Materials</button>
          <button class="uo-tabBtn" type="button" data-admin-tab="suppliers" aria-selected="false">Suppliers</button>
        </div>
        <div id="adminStatus" class="uo-inlineStatus">Loading catalog...</div>
      </section>

      <section data-admin-panel="products"></section>
      <section data-admin-panel="materials" hidden></section>
      <section data-admin-panel="suppliers" hidden></section>
    </div>
  `;
}

function productPanelMarkup() {
  return `
    <div class="uo-grid uo-grid--two">
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Product editor</h3><p>Local operational fields plus Shopify mapping hints.</p></div></div>
        <div class="uo-formGrid uo-formGrid--compact">
          <label class="uo-label">SKU<input id="adminProductSku" class="uo-input" type="text" /></label>
          <label class="uo-label">Title<input id="adminProductTitle" class="uo-input" type="text" /></label>
          <label class="uo-label">Flavour<input id="adminProductFlavour" class="uo-input" type="text" /></label>
          <label class="uo-label">Size<input id="adminProductSize" class="uo-input" type="text" /></label>
          <label class="uo-label">Weight kg<input id="adminProductWeight" class="uo-input" type="number" step="0.01" value="0" /></label>
          <label class="uo-label">Crate units<input id="adminProductCrateUnits" class="uo-input" type="number" step="1" value="0" /></label>
          <label class="uo-label">Status<select id="adminProductStatus" class="uo-select"><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
          <label class="uo-label">Shopify product ID<input id="adminProductShopifyProductId" class="uo-input" type="text" /></label>
          <label class="uo-label">Shopify variant ID<input id="adminProductShopifyVariantId" class="uo-input" type="text" /></label>
          <label class="uo-label uo-checkbox"><input id="adminProductActive" type="checkbox" checked /><span>Active in FLSS</span></label>
        </div>
        <div class="uo-actions">
          <button id="adminProductSave" class="stock-primaryBtn" type="button">Save product</button>
          <button id="adminProductReset" class="stock-secondaryBtn" type="button">New product</button>
        </div>
        <div id="adminProductStatusText" class="uo-inlineStatus">Select a product or create a new one.</div>
      </article>
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Products</h3><p>Used by Stock, Buy, and Make.</p></div></div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>SKU</th><th>Title</th><th>Flavour</th><th>Free stock</th><th>Demand</th><th>Shopify</th><th>Action</th></tr></thead>
            <tbody id="adminProductsBody"></tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

function materialPanelMarkup() {
  return `
    <div class="uo-grid uo-grid--two">
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Material editor</h3><p>Supplier mappings in this form drive the Buy supplier selector.</p></div></div>
        <div class="uo-formGrid uo-formGrid--compact">
          <label class="uo-label">SKU<input id="adminMaterialSku" class="uo-input" type="text" /></label>
          <label class="uo-label">Title<input id="adminMaterialTitle" class="uo-input" type="text" /></label>
          <label class="uo-label">Category<select id="adminMaterialCategory" class="uo-select"><option value="ingredient">Ingredient</option><option value="packaging">Packaging</option><option value="labels">Labels</option><option value="consumable">Consumable</option></select></label>
          <label class="uo-label">UoM<input id="adminMaterialUom" class="uo-input" type="text" value="kg" /></label>
          <label class="uo-label">Icon<input id="adminMaterialIcon" class="uo-input" type="text" maxlength="4" /></label>
          <label class="uo-label">Reorder point<input id="adminMaterialReorderPoint" class="uo-input" type="number" step="0.01" value="0" /></label>
          <label class="uo-label">Lead time days<input id="adminMaterialLeadTimeDays" class="uo-input" type="number" step="1" value="0" /></label>
          <label class="uo-label">Shopify variant ID<input id="adminMaterialShopifyVariantId" class="uo-input" type="number" step="1" /></label>
          <label class="uo-label">Shopify unit<input id="adminMaterialShopifyInventoryUnit" class="uo-input" type="text" /></label>
          <label class="uo-label">Shopify multiplier<input id="adminMaterialShopifyMultiplier" class="uo-input" type="number" step="1" /></label>
        </div>
        <div class="uo-sectionHead"><div><h3>Supplier options</h3><p>Mark one mapping as preferred.</p></div><button id="adminMaterialAddSupplierOption" class="stock-secondaryBtn" type="button">Add supplier</button></div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>Preferred</th><th>Supplier</th><th>Supplier SKU</th><th>Price</th><th>MOQ</th><th>Lead</th><th>Action</th></tr></thead>
            <tbody id="adminMaterialSupplierOptionsBody"></tbody>
          </table>
        </div>
        <div class="uo-actions">
          <button id="adminMaterialSave" class="stock-primaryBtn" type="button">Save material</button>
          <button id="adminMaterialReset" class="stock-secondaryBtn" type="button">New material</button>
        </div>
        <div id="adminMaterialStatusText" class="uo-inlineStatus">Select a material or create a new one.</div>
      </article>
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Materials</h3><p>Supplier mappings, reorder settings, and stock units.</p></div></div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>SKU</th><th>Title</th><th>Category</th><th>Available</th><th>Suppliers</th><th>Preferred</th><th>Action</th></tr></thead>
            <tbody id="adminMaterialsBody"></tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

function supplierPanelMarkup() {
  return `
    <div class="uo-grid uo-grid--two">
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Supplier editor</h3><p>Suppliers stay FLSS-native and feed purchase-order routing.</p></div></div>
        <div class="uo-formGrid uo-formGrid--compact">
          <label class="uo-label">Name<input id="adminSupplierName" class="uo-input" type="text" /></label>
          <label class="uo-label">Contact<input id="adminSupplierContact" class="uo-input" type="text" /></label>
          <label class="uo-label">Email<input id="adminSupplierEmail" class="uo-input" type="email" /></label>
          <label class="uo-label">Phone<input id="adminSupplierPhone" class="uo-input" type="text" /></label>
        </div>
        <div class="uo-actions">
          <button id="adminSupplierSave" class="stock-primaryBtn" type="button">Save supplier</button>
          <button id="adminSupplierReset" class="stock-secondaryBtn" type="button">New supplier</button>
        </div>
        <div id="adminSupplierStatusText" class="uo-inlineStatus">Add suppliers here, then map them to materials.</div>
      </article>
      <article class="uo-card uo-card--inner">
        <div class="uo-sectionHead"><div><h3>Suppliers</h3><p>Material counts show sourcing usage.</p></div></div>
        <div class="uo-tableWrap">
          <table class="stock-table">
            <thead><tr><th>Name</th><th>Contact</th><th>Email</th><th>Phone</th><th>Materials</th><th>Action</th></tr></thead>
            <tbody id="adminSuppliersBody"></tbody>
          </table>
        </div>
      </article>
    </div>
  `;
}

export function initAdminView() {
  if (adminInitialized) return;
  adminInitialized = true;

  const API_BASE = "/api/v1";
  const root = document.getElementById("viewAdmin");
  if (!root) return;
  renderShell(root);
  root.querySelector('[data-admin-panel="products"]').innerHTML = productPanelMarkup();
  root.querySelector('[data-admin-panel="materials"]').innerHTML = materialPanelMarkup();
  root.querySelector('[data-admin-panel="suppliers"]').innerHTML = supplierPanelMarkup();

  const els = {
    status: document.getElementById("adminStatus"),
    tabs: Array.from(root.querySelectorAll("[data-admin-tab]")),
    panels: Array.from(root.querySelectorAll("[data-admin-panel]")),
    productsBody: document.getElementById("adminProductsBody"),
    materialsBody: document.getElementById("adminMaterialsBody"),
    suppliersBody: document.getElementById("adminSuppliersBody"),
    productSku: document.getElementById("adminProductSku"),
    productTitle: document.getElementById("adminProductTitle"),
    productFlavour: document.getElementById("adminProductFlavour"),
    productSize: document.getElementById("adminProductSize"),
    productWeight: document.getElementById("adminProductWeight"),
    productCrateUnits: document.getElementById("adminProductCrateUnits"),
    productStatus: document.getElementById("adminProductStatus"),
    productShopifyProductId: document.getElementById("adminProductShopifyProductId"),
    productShopifyVariantId: document.getElementById("adminProductShopifyVariantId"),
    productActive: document.getElementById("adminProductActive"),
    productSave: document.getElementById("adminProductSave"),
    productReset: document.getElementById("adminProductReset"),
    productStatusText: document.getElementById("adminProductStatusText"),
    materialSku: document.getElementById("adminMaterialSku"),
    materialTitle: document.getElementById("adminMaterialTitle"),
    materialCategory: document.getElementById("adminMaterialCategory"),
    materialUom: document.getElementById("adminMaterialUom"),
    materialIcon: document.getElementById("adminMaterialIcon"),
    materialReorderPoint: document.getElementById("adminMaterialReorderPoint"),
    materialLeadTimeDays: document.getElementById("adminMaterialLeadTimeDays"),
    materialShopifyVariantId: document.getElementById("adminMaterialShopifyVariantId"),
    materialShopifyInventoryUnit: document.getElementById("adminMaterialShopifyInventoryUnit"),
    materialShopifyMultiplier: document.getElementById("adminMaterialShopifyMultiplier"),
    materialSupplierOptionsBody: document.getElementById("adminMaterialSupplierOptionsBody"),
    materialAddSupplierOption: document.getElementById("adminMaterialAddSupplierOption"),
    materialSave: document.getElementById("adminMaterialSave"),
    materialReset: document.getElementById("adminMaterialReset"),
    materialStatusText: document.getElementById("adminMaterialStatusText"),
    supplierName: document.getElementById("adminSupplierName"),
    supplierContact: document.getElementById("adminSupplierContact"),
    supplierEmail: document.getElementById("adminSupplierEmail"),
    supplierPhone: document.getElementById("adminSupplierPhone"),
    supplierSave: document.getElementById("adminSupplierSave"),
    supplierReset: document.getElementById("adminSupplierReset"),
    supplierStatusText: document.getElementById("adminSupplierStatusText")
  };

  const state = {
    activeTab: "products",
    products: [],
    materials: [],
    suppliers: [],
    editingProductId: null,
    editingMaterialId: null,
    editingSupplierId: null,
    materialSupplierOptions: []
  };

  const setStatus = (message) => {
    if (els.status) els.status.textContent = String(message || "");
  };

  function setActiveTab(tab) {
    state.activeTab = tab;
    els.tabs.forEach((button) => {
      const active = button.dataset.adminTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.panels.forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== tab;
    });
  }

  function resetProductForm() {
    state.editingProductId = null;
    els.productSku.value = "";
    els.productTitle.value = "";
    els.productFlavour.value = "";
    els.productSize.value = "";
    els.productWeight.value = "0";
    els.productCrateUnits.value = "0";
    els.productStatus.value = "active";
    els.productShopifyProductId.value = "";
    els.productShopifyVariantId.value = "";
    els.productActive.checked = true;
    els.productStatusText.textContent = "Select a product or create a new one.";
  }

  function resetMaterialForm() {
    state.editingMaterialId = null;
    state.materialSupplierOptions = [];
    els.materialSku.value = "";
    els.materialTitle.value = "";
    els.materialCategory.value = "ingredient";
    els.materialUom.value = "kg";
    els.materialIcon.value = "";
    els.materialReorderPoint.value = "0";
    els.materialLeadTimeDays.value = "0";
    els.materialShopifyVariantId.value = "";
    els.materialShopifyInventoryUnit.value = "";
    els.materialShopifyMultiplier.value = "";
    els.materialStatusText.textContent = "Select a material or create a new one.";
    renderMaterialSupplierOptions();
  }

  function resetSupplierForm() {
    state.editingSupplierId = null;
    els.supplierName.value = "";
    els.supplierContact.value = "";
    els.supplierEmail.value = "";
    els.supplierPhone.value = "";
    els.supplierStatusText.textContent = "Add suppliers here, then map them to materials.";
  }

  function renderMaterialSupplierOptions() {
    const supplierOptions = state.suppliers.map((supplier) => `<option value="${supplier.id}">${escapeHtml(supplier.name)}</option>`).join("");
    els.materialSupplierOptionsBody.innerHTML = state.materialSupplierOptions.length
      ? state.materialSupplierOptions.map((entry, index) => `
          <tr>
            <td><input type="radio" name="adminMaterialPreferredSupplier" data-preferred-index="${index}" ${entry.is_preferred ? "checked" : ""} /></td>
            <td><select class="uo-select" data-option-index="${index}" data-option-field="supplier_id"><option value="">Select</option>${supplierOptions}</select></td>
            <td><input class="uo-input" type="text" data-option-index="${index}" data-option-field="supplier_sku" value="${escapeHtml(entry.supplier_sku || "")}" /></td>
            <td><input class="uo-input" type="number" step="0.01" data-option-index="${index}" data-option-field="price_per_unit" value="${round2(entry.price_per_unit)}" /></td>
            <td><input class="uo-input" type="number" step="0.01" data-option-index="${index}" data-option-field="min_order_qty" value="${round2(entry.min_order_qty)}" /></td>
            <td><input class="uo-input" type="number" step="1" data-option-index="${index}" data-option-field="lead_time_days" value="${Math.max(0, Math.floor(asNumber(entry.lead_time_days, 0)))}" /></td>
            <td><button class="stock-secondaryBtn" type="button" data-remove-index="${index}">Remove</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="7" class="stock-emptyCell">Add supplier mappings so Buy can group and validate purchase orders correctly.</td></tr>`;
    state.materialSupplierOptions.forEach((entry, index) => {
      const select = els.materialSupplierOptionsBody.querySelector(`[data-option-index="${index}"][data-option-field="supplier_id"]`);
      if (select) select.value = entry.supplier_id ? String(entry.supplier_id) : "";
    });
  }

  function renderProducts() {
    els.productsBody.innerHTML = state.products.length
      ? state.products.map((product) => `
          <tr>
            <td><strong>${escapeHtml(product.sku)}</strong></td>
            <td>${escapeHtml(product.title)}</td>
            <td>${escapeHtml(product.flavour || "-")}</td>
            <td>${round2(product.free_stock)}</td>
            <td>${round2(product.open_demand)}</td>
            <td>${product.shopify_variant_id ? `<span class="uo-chip uo-chip--success">Mapped</span>` : `<span class="uo-chip uo-chip--muted">Unmapped</span>`}</td>
            <td><button class="stock-secondaryBtn" type="button" data-edit-product="${product.id}">Edit</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="7" class="stock-emptyCell">No products available.</td></tr>`;
  }

  function renderMaterials() {
    els.materialsBody.innerHTML = state.materials.length
      ? state.materials.map((material) => `
          <tr>
            <td><strong>${escapeHtml(material.sku)}</strong></td>
            <td>${escapeHtml(material.title)}</td>
            <td>${escapeHtml(material.category)}</td>
            <td>${round2(material.available)}</td>
            <td>${Array.isArray(material.supplier_options) ? material.supplier_options.length : 0}</td>
            <td>${escapeHtml(material.preferred_supplier?.name || "Missing")}</td>
            <td><button class="stock-secondaryBtn" type="button" data-edit-material="${material.id}">Edit</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="7" class="stock-emptyCell">No materials available.</td></tr>`;
  }

  function renderSuppliers() {
    els.suppliersBody.innerHTML = state.suppliers.length
      ? state.suppliers.map((supplier) => `
          <tr>
            <td><strong>${escapeHtml(supplier.name)}</strong></td>
            <td>${escapeHtml(supplier.contact_name || "-")}</td>
            <td>${escapeHtml(supplier.email || "-")}</td>
            <td>${escapeHtml(supplier.phone || "-")}</td>
            <td>${Math.max(0, Number(supplier.material_count || 0))}</td>
            <td><button class="stock-secondaryBtn" type="button" data-edit-supplier="${supplier.id}">Edit</button></td>
          </tr>
        `).join("")
      : `<tr><td colspan="6" class="stock-emptyCell">No suppliers available.</td></tr>`;
  }

  function loadProductIntoForm(productId) {
    const product = state.products.find((entry) => Number(entry.id) === Number(productId));
    if (!product) return;
    state.editingProductId = Number(product.id);
    els.productSku.value = product.sku || "";
    els.productTitle.value = product.title || "";
    els.productFlavour.value = product.flavour || "";
    els.productSize.value = product.size || "";
    els.productWeight.value = String(product.weight_kg ?? 0);
    els.productCrateUnits.value = String(product.crate_units ?? 0);
    els.productStatus.value = product.status_label || "active";
    els.productShopifyProductId.value = product.shopify_product_id || "";
    els.productShopifyVariantId.value = product.shopify_variant_id || "";
    els.productActive.checked = boolFlag(product.is_active);
    els.productStatusText.textContent = `Editing ${product.sku}.`;
    setActiveTab("products");
  }

  function loadMaterialIntoForm(materialId) {
    const material = state.materials.find((entry) => Number(entry.id) === Number(materialId));
    if (!material) return;
    state.editingMaterialId = Number(material.id);
    state.materialSupplierOptions = Array.isArray(material.supplier_options)
      ? material.supplier_options.map((entry) => ({
          supplier_id: Number(entry.supplier_id || entry.supplier?.id || 0) || null,
          supplier_sku: entry.supplier_sku || "",
          price_per_unit: round2(entry.price_per_unit),
          min_order_qty: round2(entry.min_order_qty),
          lead_time_days: Math.max(0, Math.floor(asNumber(entry.lead_time_days, 0))),
          is_preferred: Boolean(entry.is_preferred)
        }))
      : [];
    els.materialSku.value = material.sku || "";
    els.materialTitle.value = material.title || "";
    els.materialCategory.value = material.category || "ingredient";
    els.materialUom.value = material.uom || "unit";
    els.materialIcon.value = material.icon || "";
    els.materialReorderPoint.value = String(material.reorder_point ?? 0);
    els.materialLeadTimeDays.value = String(material.lead_time_days ?? 0);
    els.materialShopifyVariantId.value = material.shopify_variant_id ? String(material.shopify_variant_id) : "";
    els.materialShopifyInventoryUnit.value = material.shopify_inventory_unit || "";
    els.materialShopifyMultiplier.value = material.shopify_inventory_multiplier ? String(material.shopify_inventory_multiplier) : "";
    els.materialStatusText.textContent = `Editing ${material.sku}.`;
    renderMaterialSupplierOptions();
    setActiveTab("materials");
  }

  function loadSupplierIntoForm(supplierId) {
    const supplier = state.suppliers.find((entry) => Number(entry.id) === Number(supplierId));
    if (!supplier) return;
    state.editingSupplierId = Number(supplier.id);
    els.supplierName.value = supplier.name || "";
    els.supplierContact.value = supplier.contact_name || "";
    els.supplierEmail.value = supplier.email || "";
    els.supplierPhone.value = supplier.phone || "";
    els.supplierStatusText.textContent = `Editing ${supplier.name}.`;
    setActiveTab("suppliers");
  }

  async function loadAll() {
    setStatus("Loading catalog...");
    const [productsResult, materialsResult, suppliersResult] = await Promise.all([
      fetchCollection(`${API_BASE}/catalog/products?live=0`, "products"),
      fetchCollection(`${API_BASE}/catalog/materials?live=0`, "materials"),
      fetchCollection(`${API_BASE}/catalog/suppliers`, "suppliers")
    ]);
    state.products = productsResult.items;
    state.materials = materialsResult.items;
    state.suppliers = suppliersResult.items;
    renderProducts();
    renderMaterials();
    renderSuppliers();
    renderMaterialSupplierOptions();
    const warnings = [
      productsResult.error ? `Products unavailable: ${productsResult.error}` : "",
      materialsResult.error ? `Materials unavailable: ${materialsResult.error}` : "",
      suppliersResult.error ? `Suppliers unavailable: ${suppliersResult.error}` : ""
    ].filter(Boolean);
    setStatus(
      warnings.length
        ? `Loaded Admin with warnings. ${warnings.join(" ")}`
        : `Loaded ${state.products.length} products, ${state.materials.length} materials, and ${state.suppliers.length} suppliers.`
    );
  }

  async function saveProduct() {
    const payload = {
      sku: String(els.productSku.value || "").trim().toUpperCase(),
      title: String(els.productTitle.value || "").trim(),
      flavour: String(els.productFlavour.value || "").trim(),
      size: String(els.productSize.value || "").trim(),
      weight_kg: round2(els.productWeight.value),
      crate_units: Math.max(0, Math.floor(asNumber(els.productCrateUnits.value, 0))),
      status: String(els.productStatus.value || "active"),
      shopify_product_id: String(els.productShopifyProductId.value || "").trim() || null,
      shopify_variant_id: String(els.productShopifyVariantId.value || "").trim() || null,
      is_active: els.productActive.checked,
      actor_type: "ui",
      actor_id: "admin"
    };
    if (!payload.sku || !payload.title) throw new Error("Product SKU and title are required");
    const response = await fetch(state.editingProductId ? `${API_BASE}/catalog/products/${state.editingProductId}` : `${API_BASE}/catalog/products`, {
      method: state.editingProductId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not save product");
    await loadAll();
    if (body?.product?.id) loadProductIntoForm(body.product.id);
    els.productStatusText.textContent = body?.shopify_lookup?.variant_id ? `Saved. Exact Shopify SKU match found: variant ${body.shopify_lookup.variant_id}.` : "Product saved.";
  }

  async function saveMaterial() {
    const payload = {
      sku: String(els.materialSku.value || "").trim().toUpperCase(),
      title: String(els.materialTitle.value || "").trim(),
      category: String(els.materialCategory.value || "ingredient"),
      uom: String(els.materialUom.value || "unit").trim(),
      icon: String(els.materialIcon.value || "").trim() || null,
      reorder_point: round2(els.materialReorderPoint.value),
      lead_time_days: Math.max(0, Math.floor(asNumber(els.materialLeadTimeDays.value, 0))),
      shopify_variant_id: els.materialShopifyVariantId.value ? Number(els.materialShopifyVariantId.value) : null,
      shopify_inventory_unit: String(els.materialShopifyInventoryUnit.value || "").trim() || null,
      shopify_inventory_multiplier: els.materialShopifyMultiplier.value ? Number(els.materialShopifyMultiplier.value) : null,
      supplier_options: state.materialSupplierOptions.map((entry) => ({
        supplier_id: entry.supplier_id,
        supplier_sku: String(entry.supplier_sku || "").trim() || null,
        price_per_unit: round2(entry.price_per_unit),
        min_order_qty: round2(entry.min_order_qty),
        lead_time_days: Math.max(0, Math.floor(asNumber(entry.lead_time_days, 0))),
        is_preferred: Boolean(entry.is_preferred)
      })).filter((entry) => entry.supplier_id),
      actor_type: "ui",
      actor_id: "admin"
    };
    if (!payload.sku || !payload.title) throw new Error("Material SKU and title are required");
    const response = await fetch(state.editingMaterialId ? `${API_BASE}/catalog/materials/${state.editingMaterialId}` : `${API_BASE}/catalog/materials`, {
      method: state.editingMaterialId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not save material");
    await loadAll();
    if (body?.material?.id) loadMaterialIntoForm(body.material.id);
    els.materialStatusText.textContent = "Material saved.";
  }

  async function saveSupplier() {
    const payload = {
      name: String(els.supplierName.value || "").trim(),
      contact_name: String(els.supplierContact.value || "").trim() || null,
      email: String(els.supplierEmail.value || "").trim() || null,
      phone: String(els.supplierPhone.value || "").trim() || null,
      actor_type: "ui",
      actor_id: "admin"
    };
    if (!payload.name) throw new Error("Supplier name is required");
    const response = await fetch(state.editingSupplierId ? `${API_BASE}/catalog/suppliers/${state.editingSupplierId}` : `${API_BASE}/catalog/suppliers`, {
      method: state.editingSupplierId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "Could not save supplier");
    await loadAll();
    if (body?.supplier?.id) loadSupplierIntoForm(body.supplier.id);
    els.supplierStatusText.textContent = "Supplier saved.";
  }

  els.tabs.forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.adminTab || "products")));
  els.productsBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-product]");
    if (button) loadProductIntoForm(button.dataset.editProduct);
  });
  els.materialsBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-material]");
    if (button) loadMaterialIntoForm(button.dataset.editMaterial);
  });
  els.suppliersBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-supplier]");
    if (button) loadSupplierIntoForm(button.dataset.editSupplier);
  });
  els.materialAddSupplierOption.addEventListener("click", () => {
    state.materialSupplierOptions.push({ supplier_id: null, supplier_sku: "", price_per_unit: 0, min_order_qty: 0, lead_time_days: 0, is_preferred: state.materialSupplierOptions.length === 0 });
    renderMaterialSupplierOptions();
  });
  els.materialSupplierOptionsBody.addEventListener("input", (event) => {
    const field = event.target.closest("[data-option-field]");
    if (!field) return;
    const entry = state.materialSupplierOptions[Number(field.dataset.optionIndex)];
    if (!entry) return;
    const key = field.dataset.optionField;
    entry[key] = key === "supplier_id" ? (field.value ? Number(field.value) : null) : key === "price_per_unit" || key === "min_order_qty" ? round2(field.value) : key === "lead_time_days" ? Math.max(0, Math.floor(asNumber(field.value, 0))) : field.value;
  });
  els.materialSupplierOptionsBody.addEventListener("change", (event) => {
    const radio = event.target.closest("[data-preferred-index]");
    if (!radio) return;
    const preferredIndex = Number(radio.dataset.preferredIndex);
    state.materialSupplierOptions = state.materialSupplierOptions.map((entry, index) => ({ ...entry, is_preferred: index === preferredIndex }));
    renderMaterialSupplierOptions();
  });
  els.materialSupplierOptionsBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-index]");
    if (!button) return;
    state.materialSupplierOptions.splice(Number(button.dataset.removeIndex), 1);
    if (state.materialSupplierOptions.length && !state.materialSupplierOptions.some((entry) => entry.is_preferred)) state.materialSupplierOptions[0].is_preferred = true;
    renderMaterialSupplierOptions();
  });
  els.productSave.addEventListener("click", async () => { try { await saveProduct(); } catch (error) { els.productStatusText.textContent = String(error?.message || error); } });
  els.materialSave.addEventListener("click", async () => { try { await saveMaterial(); } catch (error) { els.materialStatusText.textContent = String(error?.message || error); } });
  els.supplierSave.addEventListener("click", async () => { try { await saveSupplier(); } catch (error) { els.supplierStatusText.textContent = String(error?.message || error); } });
  els.productReset.addEventListener("click", resetProductForm);
  els.materialReset.addEventListener("click", resetMaterialForm);
  els.supplierReset.addEventListener("click", resetSupplierForm);

  setActiveTab("products");
  resetProductForm();
  resetMaterialForm();
  resetSupplierForm();
  loadAll().catch((error) => setStatus(String(error?.message || error)));
}
