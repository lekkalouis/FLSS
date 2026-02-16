import { PRODUCT_LIST } from "./products.js";

let priceManagerInitialized = false;

export function initPriceManagerView() {
  if (priceManagerInitialized) return;
  priceManagerInitialized = true;
  const PRICE_TIERS = ["agent", "retailer", "export", "private", "fkb"];
  const DEFAULT_COLLECTION_HANDLE = "most-popular-products";
  const FLAVOUR_COLORS = {
    "hot & spicy": "#DA291C",
    "chutney": "#7340B2",
    "original": "#8BAF84",
    "worcester sauce": "#FF8200",
    "red wine & garlic": "#904066",
    "savoury herb": "#A1C935",
    "savoury herbs": "#A1C935",
    "salt & vinegar": "#40B2FF",
    "curry": "#FFC72C",
    "butter": "#FFE66D",
    "sour cream & chives": "#7BC96F",
    "parmesan cheese": "#FACC15",
    "cheese & onion": "#C4E36A"
  };
  const skuOrder = new Map(
    PRODUCT_LIST.map((product, index) => [product.sku, index])
  );
  const productMeta = new Map(
    PRODUCT_LIST.map((product) => [product.sku, product])
  );
  const state = {
    allProducts: [],
    products: [],
    loading: false,
    searchTerm: "",
    knownOnly: false
  };

  const tableBody = document.getElementById("pmTableBody");
  const statusEl = document.getElementById("pmStatus");
  const toast = document.getElementById("pmToast");
  const searchInput = document.getElementById("pmSearch");
  const knownOnlyInput = document.getElementById("pmKnownOnly");
  const reloadBtn = document.getElementById("pmReload");

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

  function flavourKey(flavour) {
    return String(flavour || "").toLowerCase().trim();
  }

  function flavourColor(flavour) {
    return FLAVOUR_COLORS[flavourKey(flavour)] || "#22d3ee";
  }

  function flavourBadge(flavour) {
    if (!flavour) return "";
    return `<span class="pm-flavourBadge" style="--flavour-color:${flavourColor(flavour)}">${flavour}</span>`;
  }

  function sortProducts(products = []) {
    return [...products].sort((a, b) => {
      const aRank = skuOrder.has(a.sku) ? skuOrder.get(a.sku) : Number.MAX_SAFE_INTEGER;
      const bRank = skuOrder.has(b.sku) ? skuOrder.get(b.sku) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return String(a.sku || a.title || "").localeCompare(String(b.sku || b.title || ""));
    });
  }

  function applyFilters() {
    const search = state.searchTerm.trim().toLowerCase();
    const filtered = state.allProducts.filter((product) => {
      if (state.knownOnly && !skuOrder.has(product.sku)) return false;
      if (!search) return true;
      const meta = productMeta.get(product.sku) || {};
      const haystack = [
        product.sku,
        product.title,
        product.flavour,
        meta.flavour,
        meta.title
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });

    state.products = sortProducts(filtered);
    renderTable();
    setStatus(
      `Showing ${state.products.length} of ${state.allProducts.length} products${
        state.knownOnly ? " (known catalogue)" : ""
      }.`
    );
  }

  function renderTable() {
    if (!tableBody) return;
    if (!state.products.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="pm-muted">No products found for the current filters.</td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = state.products
      .map((product, idx) => {
        const tiers = normalizePriceTiers(product);
        const meta = productMeta.get(product.sku) || {};
        const sku = product.sku || meta.sku || "—";
        const title = product.title || meta.title || "Untitled";
        const flavour = meta.flavour || product.flavour || "";
        const rowId = `pm-row-${idx}`;
        return `
        <tr data-row="${idx}" data-variant-id="${product.variantId}">
          <td class="pm-sku"><strong>${sku}</strong></td>
          <td>
            <div class="pm-productLine">
              ${flavourBadge(flavour)}
              <span class="pm-productTitle">${title}</span>
            </div>
          </td>
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
    if (state.loading) return 0;
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
      const deduped = [];
      const seen = new Set();
      list.forEach((product) => {
        const key = String(product.variantId || product.sku || "");
        if (!key || seen.has(key)) return;
        seen.add(key);
        deduped.push(product);
      });

      state.allProducts = sortProducts(deduped);
      applyFilters();
      return deduped.length;
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
    )}&includePriceTiers=1&limit=250`;
    const count = await loadProducts(collectionUrl, "product list");
    if (count) return;
    const knownProducts = PRODUCT_LIST.filter((product) => product?.variantId).map((product) => ({
      variantId: product.variantId,
      sku: product.sku || "",
      title: product.title || product.sku || "Untitled",
      price: product.price != null ? Number(product.price) : null,
      priceTiers: product.priceTiers && typeof product.priceTiers === "object"
        ? { ...product.priceTiers }
        : undefined
    }));

    const variantIdsToHydrate = knownProducts
      .filter((product) => !product.priceTiers || !Object.keys(product.priceTiers).length)
      .map((product) => String(product.variantId))
      .filter(Boolean)
      .slice(0, 250);

    if (variantIdsToHydrate.length) {
      try {
        const resp = await fetch("/api/v1/shopify/variants/price-tiers/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantIds: variantIdsToHydrate })
        });
        if (resp.ok) {
          const payload = await resp.json();
          const tiersByVariantId = payload?.priceTiersByVariantId || {};
          knownProducts.forEach((product) => {
            const tiers = tiersByVariantId[String(product.variantId)];
            if (tiers && typeof tiers === "object") {
              product.priceTiers = tiers;
            }
          });
        }
      } catch (err) {
        console.warn("Known catalogue tier hydration failed", err);
      }
    }

    state.allProducts = sortProducts(knownProducts);
    applyFilters();
    setStatus(
      `Showing ${state.products.length} of ${state.allProducts.length} products (known catalogue fallback).`
    );
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

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.searchTerm = searchInput.value || "";
      applyFilters();
    });
  }

  if (knownOnlyInput) {
    knownOnlyInput.addEventListener("change", () => {
      state.knownOnly = knownOnlyInput.checked;
      applyFilters();
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      loadDefaultProducts();
    });
  }

  loadDefaultProducts();
}
