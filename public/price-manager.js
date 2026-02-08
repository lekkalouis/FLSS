(() => {
  const PRICE_TIERS = ["default", "agent", "retailer", "export", "private", "fkb"];
  const PRODUCT_UTILS = window.FLSS_PRODUCT_UTILS || { products: [] };
  const state = {
    products: [],
    allProducts: [],
    loading: false
  };

  const searchInput = document.getElementById("pmSearch");
  const refreshBtn = document.getElementById("pmRefreshBtn");
  const tableBody = document.getElementById("pmTableBody");
  const statusEl = document.getElementById("pmStatus");
  const toast = document.getElementById("pmToast");
  const priceBoard = document.getElementById("pmPriceBoard");

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
          <td colspan="9" class="pm-muted">No products found.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = state.products
      .map((product, idx) => {
        const tiers = normalizePriceTiers(product);
        const rowId = `pm-row-${idx}`;
        const flavourColor = product.flavourColor || "#cbd5f5";
        return `
        <tr class="pm-rowAccent" style="border-left:4px solid ${flavourColor};" data-row="${idx}" data-variant-id="${product.variantId}">
          <td class="pm-sku">${product.sku || "—"}</td>
          <td>${product.title || "Untitled"}</td>
          ${PRICE_TIERS.map((tier) => `
            <td>
              <input class="pm-input" type="number" step="0.01" data-field="${tier}" value="${formatInputValue(tiers[tier])}" />
            </td>
          `).join("")}
          <td>
            <div class="pm-actions" id="${rowId}">
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

    row.querySelector("[data-field='row-status']").textContent = "Saving…";

    try {
      const resp = await fetch("/shopify/variants/price-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: Number(variantId),
          priceTiers
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

  function applyFilter() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    state.products = state.allProducts.filter((product) => {
      if (!q) return true;
      return (
        String(product.sku || "").toLowerCase().includes(q) ||
        String(product.title || "").toLowerCase().includes(q)
      );
    });
    renderTable();
    renderPriceBoard();
    setStatus(state.products.length ? `Showing ${state.products.length} SKUs.` : "No products found.");
  }

  async function hydratePriceTiers() {
    if (state.loading) return;
    const variantIds = Array.from(
      new Set(state.allProducts.map((p) => p.variantId).filter(Boolean))
    );
    if (!variantIds.length) return;
    state.loading = true;
    setStatus("Refreshing price tiers…");
    try {
      const resp = await fetch("/shopify/variants/price-tiers/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIds })
      });
      if (!resp.ok) {
        throw new Error("Unable to refresh price tiers.");
      }
      const payload = await resp.json();
      const tiersByVariantId = payload?.priceTiersByVariantId || {};
      state.allProducts = state.allProducts.map((product) => {
        const tiers = tiersByVariantId[String(product.variantId)];
        return tiers ? { ...product, priceTiers: tiers } : product;
      });
      applyFilter();
      showToast("Price tiers refreshed.", "ok");
    } catch (err) {
      console.error("Load failed", err);
      setStatus("Error loading price tiers.");
      showToast("Failed to load price tiers.", "err");
    } finally {
      state.loading = false;
    }
  }

  function renderPriceBoard() {
    if (!priceBoard) return;
    const list = state.products;
    if (!list.length) {
      priceBoard.innerHTML = `<div class="pm-muted">No private prices available yet.</div>`;
      return;
    }
    priceBoard.innerHTML = list
      .map((product) => {
        const tiers = normalizePriceTiers(product);
        const privatePrice = tiers.private ?? tiers.default ?? tiers.standard ?? product.price ?? null;
        const colour = product.flavourColor || "#38bdf8";
        return `
          <div class="pm-priceCard" style="border-left-color:${colour}">
            <div class="pm-priceSku">${product.sku || "—"}</div>
            <div class="pm-priceTitle">${product.title || "Untitled"}</div>
            <div class="pm-priceValue">${privatePrice != null ? `R${Number(privatePrice).toFixed(2)}` : "—"}</div>
          </div>
        `;
      })
      .join("");
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => applyFilter());
  }
  if (refreshBtn) refreshBtn.addEventListener("click", hydratePriceTiers);

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

  state.allProducts = PRODUCT_UTILS.products || [];
  applyFilter();
  hydratePriceTiers();
})();
