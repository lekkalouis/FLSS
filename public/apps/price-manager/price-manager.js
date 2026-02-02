(() => {
  const PRICE_TIERS = ["default", "agent", "retailer", "export", "private", "fkb"];
  const state = {
    products: [],
    loading: false
  };

  const searchInput = document.getElementById("pmSearch");
  const searchBtn = document.getElementById("pmSearchBtn");
  const collectionInput = document.getElementById("pmCollection");
  const collectionBtn = document.getElementById("pmCollectionBtn");
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
    const tiers = product.priceTiers && typeof product.priceTiers === "object"
      ? { ...product.priceTiers }
      : {};
    if (tiers.default == null && product.price != null) {
      tiers.default = product.price;
    }
    return tiers;
  }

  function renderTable() {
    if (!tableBody) return;
    if (!state.products.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="pm-muted">No products found.</td>
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
                <input type="checkbox" data-field="sync" checked /> Sync public price
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
      const resp = await fetch("/shopify/variants/price-tiers", {
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
        <td colspan="10" class="pm-muted">Loading…</td>
      </tr>
    `;

    try {
      const resp = await fetch(url);
      const payload = await resp.json();
      const list = Array.isArray(payload.products) ? payload.products : [];
      state.products = list;
      renderTable();
      setStatus(list.length ? `Loaded ${list.length} SKUs.` : "No products found.");
    } catch (err) {
      console.error("Load failed", err);
      setStatus("Error loading products.");
      showToast("Failed to load products.", "err");
    } finally {
      state.loading = false;
    }
  }

  function handleSearch() {
    const q = (searchInput?.value || "").trim();
    if (!q) {
      showToast("Enter a search term.", "err");
      return;
    }
    const url = `/shopify/products/search?q=${encodeURIComponent(q)}&includePriceTiers=1`;
    loadProducts(url, `search results for "${q}"`);
  }

  function handleCollection() {
    const handle = (collectionInput?.value || "").trim();
    if (!handle) {
      showToast("Enter a collection handle.", "err");
      return;
    }
    const url = `/shopify/products/collection?handle=${encodeURIComponent(handle)}&includePriceTiers=1`;
    loadProducts(url, `collection ${handle}`);
  }

  if (searchBtn) searchBtn.addEventListener("click", handleSearch);
  if (collectionBtn) collectionBtn.addEventListener("click", handleCollection);
  if (searchInput) {
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handleSearch();
    });
  }
  if (collectionInput) {
    collectionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handleCollection();
    });
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
})();
