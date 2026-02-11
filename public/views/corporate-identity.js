const API_BASE = "/api/v1/corporate-identity/labels";

let initialized = false;
let state = {
  id: "",
  title: "",
  flavors: [],
  blanketDesigns: []
};

const randomId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

const emptyVariant = () => ({
  id: randomId("var"),
  name: "",
  size: "",
  weight: "",
  barcode: "",
  ingredients: "",
  allergens: "",
  nutritionalInfoZA: "",
  labelSize: "",
  materialCoating: ""
});

const emptyFlavor = () => ({
  id: randomId("flv"),
  name: "",
  notes: "",
  variants: [emptyVariant()]
});

function byId(id) {
  return document.getElementById(id);
}

function getEls() {
  return {
    status: byId("ciStatus"),
    title: byId("ciTitle"),
    flavorWrap: byId("ciFlavors"),
    designInput: byId("ciBlanketDesign"),
    designList: byId("ciDesignList"),
    addFlavorBtn: byId("ciAddFlavor"),
    saveBtn: byId("ciSave"),
    resetBtn: byId("ciReset"),
    recordsWrap: byId("ciRecordList")
  };
}

function setStatus(msg) {
  const { status } = getEls();
  if (status) status.textContent = msg;
}

function renderDesigns() {
  const { designList } = getEls();
  if (!designList) return;
  designList.innerHTML = "";
  if (!state.blanketDesigns.length) {
    designList.innerHTML = `<div class="ci-empty">No blanket design uploaded yet.</div>`;
    return;
  }

  state.blanketDesigns.forEach((design, idx) => {
    const card = document.createElement("div");
    card.className = "ci-design";
    card.innerHTML = `
      <div><strong>${design.name || `Blanket design ${idx + 1}`}</strong></div>
      <div class="ci-recordMeta">Uploaded: ${new Date(design.uploadedAt).toLocaleString()}</div>
      <div class="ci-actions">
        <a class="ci-btn" href="${design.dataUrl}" download="${design.name || "blanket-design"}">Download</a>
        <button type="button" class="ci-btn" data-remove-design="${design.id}">Remove</button>
      </div>
    `;
    designList.appendChild(card);
  });

  designList.querySelectorAll("[data-remove-design]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-design");
      state.blanketDesigns = state.blanketDesigns.filter((item) => item.id !== id);
      renderDesigns();
    });
  });
}

function renderFlavors() {
  const { flavorWrap } = getEls();
  if (!flavorWrap) return;
  flavorWrap.innerHTML = "";

  state.flavors.forEach((flavor, flavorIdx) => {
    const flavorEl = document.createElement("div");
    flavorEl.className = "ci-flavor";

    const variantsHtml = flavor.variants
      .map(
        (variant, variantIdx) => `
          <div class="ci-variant" data-variant-id="${variant.id}">
            <div class="ci-subtitle">Variant ${variantIdx + 1}</div>
            <div class="ci-row">
              <label class="ci-field"><span>Variant name</span><input class="ci-input" data-variant-field="name" value="${variant.name || ""}" /></label>
              <label class="ci-field"><span>Size</span><input class="ci-input" data-variant-field="size" value="${variant.size || ""}" placeholder="e.g. 100mm x 140mm" /></label>
              <label class="ci-field"><span>Weight</span><input class="ci-input" data-variant-field="weight" value="${variant.weight || ""}" placeholder="e.g. 250 g" /></label>
            </div>
            <div class="ci-row">
              <label class="ci-field"><span>Barcode</span><input class="ci-input" data-variant-field="barcode" value="${variant.barcode || ""}" /></label>
              <label class="ci-field"><span>Label size</span><input class="ci-input" data-variant-field="labelSize" value="${variant.labelSize || ""}" /></label>
              <label class="ci-field"><span>Material coating</span>
                <select class="ci-select" data-variant-field="materialCoating">
                  <option value="">Select coating</option>
                  <option value="Gloss" ${variant.materialCoating === "Gloss" ? "selected" : ""}>Gloss</option>
                  <option value="Matte" ${variant.materialCoating === "Matte" ? "selected" : ""}>Matte</option>
                  <option value="Uncoated" ${variant.materialCoating === "Uncoated" ? "selected" : ""}>Uncoated</option>
                  <option value="Thermal" ${variant.materialCoating === "Thermal" ? "selected" : ""}>Thermal</option>
                </select>
              </label>
            </div>
            <label class="ci-field"><span>Ingredients</span><textarea class="ci-textarea" data-variant-field="ingredients">${variant.ingredients || ""}</textarea></label>
            <label class="ci-field"><span>Allergens</span><textarea class="ci-textarea" data-variant-field="allergens">${variant.allergens || ""}</textarea></label>
            <label class="ci-field"><span>Nutritional information (South Africa)</span><textarea class="ci-textarea" data-variant-field="nutritionalInfoZA">${variant.nutritionalInfoZA || ""}</textarea></label>
            <div class="ci-actions">
              <button type="button" class="ci-btn" data-remove-variant="${variant.id}">Remove variant</button>
            </div>
          </div>
        `
      )
      .join("");

    flavorEl.innerHTML = `
      <div class="ci-subtitle">Flavor ${flavorIdx + 1}</div>
      <div class="ci-row">
        <label class="ci-field"><span>Flavor name</span><input class="ci-input" data-flavor-field="name" value="${flavor.name || ""}" /></label>
        <label class="ci-field" style="grid-column: span 2;"><span>Flavor notes</span><input class="ci-input" data-flavor-field="notes" value="${flavor.notes || ""}" /></label>
      </div>
      <div class="ci-actions">
        <button type="button" class="ci-btn" data-add-variant="${flavor.id}">+ Add variant</button>
        <button type="button" class="ci-btn" data-remove-flavor="${flavor.id}">Remove flavor</button>
      </div>
      <div class="ci-variants">${variantsHtml}</div>
    `;

    flavorWrap.appendChild(flavorEl);

    flavorEl.querySelectorAll("[data-flavor-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.getAttribute("data-flavor-field");
        flavor[field] = input.value;
      });
    });

    flavorEl.querySelectorAll("[data-variant-id]").forEach((variantEl) => {
      const variantId = variantEl.getAttribute("data-variant-id");
      const variant = flavor.variants.find((item) => item.id === variantId);
      if (!variant) return;
      variantEl.querySelectorAll("[data-variant-field]").forEach((input) => {
        input.addEventListener("input", () => {
          const field = input.getAttribute("data-variant-field");
          variant[field] = input.value;
        });
      });
    });
  });

  flavorWrap.querySelectorAll("[data-add-variant]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flavorId = btn.getAttribute("data-add-variant");
      const flavor = state.flavors.find((item) => item.id === flavorId);
      if (!flavor) return;
      flavor.variants.push(emptyVariant());
      renderFlavors();
    });
  });

  flavorWrap.querySelectorAll("[data-remove-variant]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const variantId = btn.getAttribute("data-remove-variant");
      state.flavors = state.flavors.map((flavor) => ({
        ...flavor,
        variants: flavor.variants.filter((item) => item.id !== variantId)
      }));
      renderFlavors();
    });
  });

  flavorWrap.querySelectorAll("[data-remove-flavor]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flavorId = btn.getAttribute("data-remove-flavor");
      state.flavors = state.flavors.filter((item) => item.id !== flavorId);
      renderFlavors();
    });
  });
}

function renderRecords(records = []) {
  const { recordsWrap } = getEls();
  if (!recordsWrap) return;
  recordsWrap.innerHTML = "";
  if (!records.length) {
    recordsWrap.innerHTML = `<div class="ci-empty">No saved label records yet.</div>`;
    return;
  }

  records.forEach((record) => {
    const totalVariants = (record.flavors || []).reduce(
      (sum, flavor) => sum + ((flavor.variants || []).length || 0),
      0
    );
    const card = document.createElement("article");
    card.className = "ci-recordItem";
    card.innerHTML = `
      <div><strong>${record.title}</strong></div>
      <div class="ci-recordMeta">Flavors: ${(record.flavors || []).length} · Variants: ${totalVariants}</div>
      <div class="ci-recordMeta">Blanket designs: ${(record.blanketDesigns || []).length}</div>
      <div class="ci-recordMeta">Updated: ${record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "-"}</div>
      <div class="ci-actions">
        <button type="button" class="ci-btn" data-load-record="${record.id}">Load</button>
      </div>
    `;
    recordsWrap.appendChild(card);
  });

  recordsWrap.querySelectorAll("[data-load-record]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const recordId = btn.getAttribute("data-load-record");
      const result = await fetch(API_BASE, { headers: { Accept: "application/json" } });
      if (!result.ok) return;
      const data = await result.json();
      const found = (data.records || []).find((item) => item.id === recordId);
      if (!found) return;
      state = {
        id: found.id || "",
        title: found.title || "",
        flavors: Array.isArray(found.flavors) ? found.flavors : [emptyFlavor()],
        blanketDesigns: Array.isArray(found.blanketDesigns) ? found.blanketDesigns : []
      };
      const { title } = getEls();
      if (title) title.value = state.title;
      renderFlavors();
      renderDesigns();
      setStatus(`Loaded record: ${state.title}`);
    });
  });
}

async function loadRecords() {
  const response = await fetch(API_BASE, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Failed to load records (${response.status})`);
  const data = await response.json();
  renderRecords(data.records || []);
}

function bindActions() {
  const { title, addFlavorBtn, saveBtn, resetBtn, designInput } = getEls();

  title?.addEventListener("input", () => {
    state.title = title.value;
  });

  addFlavorBtn?.addEventListener("click", () => {
    state.flavors.push(emptyFlavor());
    renderFlavors();
  });

  resetBtn?.addEventListener("click", () => {
    state = { id: "", title: "", flavors: [emptyFlavor()], blanketDesigns: [] };
    if (title) title.value = "";
    renderFlavors();
    renderDesigns();
    setStatus("Form reset.");
  });

  designInput?.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      state.blanketDesigns.push({
        id: randomId("dsg"),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
        dataUrl: String(dataUrl || "")
      });
    }
    event.target.value = "";
    renderDesigns();
    setStatus("Blanket design uploaded to record.");
  });

  saveBtn?.addEventListener("click", async () => {
    if (!state.title.trim()) {
      setStatus("Please provide a record title first.");
      return;
    }

    if (!state.flavors.length || !state.flavors.some((flavor) => (flavor.variants || []).length > 0)) {
      setStatus("Add at least one flavor with one variant before saving.");
      return;
    }

    saveBtn.disabled = true;
    setStatus("Saving label record…");

    try {
      const payload = {
        id: state.id || undefined,
        title: state.title,
        category: "Corporate Identity",
        flavors: state.flavors,
        blanketDesigns: state.blanketDesigns
      };

      const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Save failed");

      state.id = result?.record?.id || state.id;
      setStatus("Label record saved.");
      await loadRecords();
    } catch (error) {
      setStatus(`Save failed: ${String(error.message || error)}`);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

export function initCorporateIdentityView() {
  if (initialized) return;
  initialized = true;

  state = { id: "", title: "", flavors: [emptyFlavor()], blanketDesigns: [] };

  bindActions();
  renderFlavors();
  renderDesigns();
  loadRecords()
    .then(() => setStatus("Corporate Identity labels ready."))
    .catch((error) => setStatus(`Could not load saved records: ${String(error.message || error)}`));
}
