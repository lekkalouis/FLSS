let priceManagerInitialized = false;

export function initPriceManagerView() {
  if (priceManagerInitialized) return;
  priceManagerInitialized = true;
  const PRICE_TIERS = ["agent", "retailer", "export", "private", "fkb"];
  const DEFAULT_COLLECTION_HANDLE = "most-popular-products";
  const SKU_ALLOWLIST = [
    "FL002",
    "FL003",
    "FL004",
    "FL005",
    "FL006",
    "FL007",
    "FL008",
    "FL009",
    "FL010",
    "FL011",
    "FL012",
    "FL013",
    "FL014",
    "FL015",
    "FL016",
    "FL017",
    "FL018",
    "FL019",
    "FL020",
    "FL021",
    "FL022",
    "FL023",
    "FL024",
    "FL025",
    "FL026",
    "FL027",
    "FL028",
    "FL029",
    "FL030",
    "FL031",
    "FL032",
    "FL033",
    "FL034",
    "FL035",
    "FL036",
    "FL037",
    "FL038",
    "FL039",
    "FL040",
    "FL041",
    "FL042",
    "FL043",
    "FL044",
    "FL045",
    "FL046",
    "FL047",
    "FL048",
    "FL049",
    "FL050",
    "FL051",
    "FL052",
    "FL053",
    "FL054",
    "FL055",
    "FL056",
    "FL057",
    "FL058",
    "FL059",
    "FL060",
    "FL061",
    "FL062",
    "FL063",
    "FL064",
    "FL065",
    "FLBS001",
    "GBOX"
  ];
  const skuOrder = new Map(SKU_ALLOWLIST.map((sku, index) => [sku, index]));
  const state = {
    products: [],
    loading: false
  };

  const tableBody = document.getElementById("pmTableBody");
  const statusEl = document.getElementById("pmStatus");
  const toast = document.getElementById("pmToast");

  function showToast(message, tone = "ok") {
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = "block";
    toast.style.background = tone === "err" ? "#b91c1c" : "#0f172a";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.style.display = "none";
    }, 4000);
  }

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
  }

  function formatInputValue(value) {
    if (value == null) return "";
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    return String(num);
  }

  function normalizePriceTiers(product) {
    return product.priceTiers && typeof product.priceTiers === "object"
      ? { ...product.priceTiers }
      : {};
  }

  function renderTable() {
    if (!tableBody) return;
    if (!state.products.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="pm-muted">No products found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = state.products
      .map((product, idx) => {
        const tiers = normalizePriceTiers(product);
        const rowId = `pm-row-${idx}`;
        return `
        <tr data-row="${idx}" data-variant-id="${product.variantId}">
          <td class="pm-sku">${product.sku || "—"}</td>
          <td>${product.title || "Untitled"}</td>
          <td>
            <input class="pm-input" type="number" step="0.01" data-field="public" value="${formatInputValue(product.price)}" />
          </td>
          ${PRICE_TIERS.map((tier) => `
            <td>
              <input class="pm-input" type="number" step="0.01" data-field="${tier}" value="${formatInputValue(tiers[tier])}" />
            </td>
          `).join("")}
          <td>
            <div class="pm-actions" id="${rowId}">
              <label class="pm-sync">
                <input type="checkbox" data-field="sync" checked /> SPP
              </label>
              <button class="pm-saveBtn" type="button" data-action="save">Save</button>
              <span class="pm-muted" data-field="row-status"></span>
            </div>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  function readRow(row) {
    const inputs = row.querySelectorAll("input");
    const data = {};
    inputs.forEach((input) => {
      const field = input.dataset.field;
      if (!field) return;
      if (input.type === "checkbox") {
        data[field] = input.checked;
        return;
      }
      data[field] = input.value;
    });
    return data;
  }

  async function saveRow(row) {
    const variantId = row.dataset.variantId;
    if (!variantId) return;
    const data = readRow(row);
    const priceTiers = {};
    PRICE_TIERS.forEach((tier) => {
      const raw = data[tier];
      if (raw === "" || raw == null) return;
      const num = Number(raw);
      if (Number.isFinite(num)) priceTiers[tier] = num;
    });

    const publicPrice = data.public !== "" ? Number(data.public) : null;
    const updatePublicPrice = Boolean(data.sync);

    row.querySelector("[data-field='row-status']").textContent = "Saving…";

    try {
      const resp = await fetch("/api/v1/shopify/variants/price-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: Number(variantId),
          priceTiers,
          updatePublicPrice,
          publicPrice: Number.isFinite(publicPrice) ? publicPrice : undefined
        })
      });
      const payload = await resp.json();
      const result = payload?.results?.[0];
      if (!resp.ok || !result?.ok) {
        row.querySelector("[data-field='row-status']").textContent = "Save failed.";
        showToast("Failed to save price tiers.", "err");
        return;
      }

      row.querySelector("[data-field='row-status']").textContent = "Saved.";
      showToast("Price tiers saved.", "ok");
    } catch (err) {
      console.error("Save failed", err);
      row.querySelector("[data-field='row-status']").textContent = "Save failed.";
      showToast("Save failed.", "err");
    }
  }

  async function loadProducts(url, contextLabel) {
    if (state.loading) return;
    state.loading = true;
    setStatus(`Loading ${contextLabel}…`);
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="pm-muted">Loading…</td>
      </tr>
    `;

    try {
      const resp = await fetch(url);
      const payload = await resp.json();
      const list = Array.isArray(payload.products) ? payload.products : [];
      const filteredList = list
        .filter((product) => skuOrder.has(product.sku))
        .sort(
          (a, b) => skuOrder.get(a.sku) - skuOrder.get(b.sku)
        );
      state.products = filteredList;
      renderTable();
      setStatus(
        filteredList.length ? `Loaded ${filteredList.length} SKUs.` : "No products found."
      );
      return filteredList.length;
    } catch (err) {
      console.error("Load failed", err);
      setStatus("Error loading products.");
      showToast("Failed to load products.", "err");
      return 0;
    } finally {
      state.loading = false;
    }
  }

  async function loadDefaultProducts() {
    const collectionUrl = `/api/v1/shopify/products/collection?handle=${encodeURIComponent(
      DEFAULT_COLLECTION_HANDLE
    )}&includePriceTiers=1`;
    const count = await loadProducts(collectionUrl, "product list");
    if (count) return;
    const fallbackUrl = `/api/v1/shopify/products/search?q=${encodeURIComponent("FL")}&includePriceTiers=1`;
    await loadProducts(fallbackUrl, "product list");
  }

  if (tableBody) {
    tableBody.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.action === "save") {
        const row = target.closest("tr");
        if (row) saveRow(row);
      }
    });
  }

  loadDefaultProducts();
}
