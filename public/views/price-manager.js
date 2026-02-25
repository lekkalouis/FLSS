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
  const STANDARD_CATALOGUE = PRODUCT_LIST.filter((product) => product.variantId);

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
    const updatePublicPrice = true;

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

<<<<<<< HEAD
  async function loadProducts(url, contextLabel) {
    if (state.loading) return 0;
=======
  function buildStandardCatalogueProducts(remoteProducts) {
    const byVariantId = new Map();
    const bySku = new Map();

    remoteProducts.forEach((product) => {
      if (product?.variantId) byVariantId.set(String(product.variantId), product);
      if (product?.sku) bySku.set(String(product.sku).trim().toLowerCase(), product);
    });

    return STANDARD_CATALOGUE.map((product) => {
      const byId = byVariantId.get(String(product.variantId));
      const byCode = bySku.get(String(product.sku || "").trim().toLowerCase());
      const live = byId || byCode || null;
      const livePrice = live?.price;

      return {
        ...product,
        ...(live || {}),
        variantId: live?.variantId || product.variantId,
        sku: product.sku,
        title: product.title,
        price: Number.isFinite(Number(livePrice)) ? Number(livePrice) : product.price,
        priceTiers: normalizePriceTiers(live) || normalizePriceTiers(product)
      };
    });
  }

  async function loadSearchProductsPaginated(query) {
    const seenVariantIds = new Set();
    const seenSkus = new Set();
    const products = [];
    let productPageInfo = "";
    let variantPageInfo = "";
    const maxPages = 25;

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        q: query,
        includePriceTiers: "0",
        limit: "50"
      });
      if (productPageInfo) params.set("productPageInfo", productPageInfo);
      if (variantPageInfo) params.set("variantPageInfo", variantPageInfo);

      const resp = await fetch(`/api/v1/shopify/products/search?${params.toString()}`);
      const payload = await resp.json();
      if (!resp.ok) {
        throw new Error(payload?.message || payload?.error || "Unable to load product catalogue");
      }

      const current = Array.isArray(payload.products) ? payload.products : [];
      current.forEach((product) => {
        const variantKey = product?.variantId ? String(product.variantId) : "";
        const skuKey = String(product?.sku || "").trim().toLowerCase();
        if (!variantKey && !skuKey) return;
        if (variantKey && seenVariantIds.has(variantKey)) return;
        if (!variantKey && skuKey && seenSkus.has(skuKey)) return;
        if (variantKey) seenVariantIds.add(variantKey);
        if (skuKey) seenSkus.add(skuKey);
        products.push(product);
      });

      const nextProductPage = payload?.pageInfo?.products?.next || "";
      const nextVariantPage = payload?.pageInfo?.variants?.next || "";
      if (!nextProductPage && !nextVariantPage) break;
      if (nextProductPage === productPageInfo && nextVariantPage === variantPageInfo) break;
      productPageInfo = nextProductPage;
      variantPageInfo = nextVariantPage;
    }

    return products;
  }


  async function hydrateMissingPriceTiers(products) {
    const variantIds = Array.from(
      new Set(
        (products || [])
          .filter((product) => product?.variantId && (!product.priceTiers || !Object.keys(product.priceTiers).length))
          .map((product) => product.variantId)
      )
    );
    if (!variantIds.length) return products;

    try {
      const resp = await fetch("/api/v1/shopify/variants/price-tiers/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIds })
      });
      const payload = await resp.json();
      if (!resp.ok) return products;
      const map = payload?.priceTiersByVariantId || {};
      return products.map((product) => {
        const tiers = map[String(product.variantId)];
        return tiers ? { ...product, priceTiers: tiers } : product;
      });
    } catch {
      return products;
    }
  }

  async function loadDefaultProducts() {
    if (state.loading) return;
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51
    state.loading = true;
    setStatus("Loading standard catalogue…");
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="pm-muted">Loading…</td>
      </tr>
    `;

    try {
<<<<<<< HEAD
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
=======
      let remoteProducts = [];
      try {
        remoteProducts = await loadSearchProductsPaginated("FL");
      } catch (err) {
        console.warn("Search catalogue load failed, falling back to collection", err);
        const collectionUrl = `/api/v1/shopify/products/collection?handle=${encodeURIComponent(
          DEFAULT_COLLECTION_HANDLE
        )}&includePriceTiers=0`;
        const collectionResp = await fetch(collectionUrl);
        const collectionPayload = await collectionResp.json();
        remoteProducts = Array.isArray(collectionPayload.products) ? collectionPayload.products : [];
      }

      const mergedProducts = buildStandardCatalogueProducts(remoteProducts)
        .filter((product) => skuOrder.has(product.sku))
        .sort((a, b) => skuOrder.get(a.sku) - skuOrder.get(b.sku));
      state.products = await hydrateMissingPriceTiers(mergedProducts);

      const pricedCount = state.products.filter((product) => product.price != null).length;
      renderTable();
      setStatus(`Loaded ${state.products.length} standard SKUs (${pricedCount} with live Shopify pricing).`);
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51
    } catch (err) {
      console.error("Load failed", err);
      setStatus("Error loading products.");
      showToast("Failed to load products.", "err");
      state.products = [];
      renderTable();
    } finally {
      state.loading = false;
    }
  }

<<<<<<< HEAD
  async function loadDefaultProducts() {
    const collectionUrl = `/api/v1/shopify/products/collection?handle=${encodeURIComponent(
      DEFAULT_COLLECTION_HANDLE
    )}&includePriceTiers=1&limit=250`;
    const count = await loadProducts(collectionUrl, "product list");
    if (count) return;
    const fallbackUrl = `/api/v1/shopify/products/search?q=${encodeURIComponent("FL")}&includePriceTiers=1&limit=50`;
    await loadProducts(fallbackUrl, "product list");
  }

=======
>>>>>>> 2026-02-25/create-mind-map-and-process-flow-chart/11-55-51
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
