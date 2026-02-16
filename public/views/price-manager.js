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
    products: [],
    loading: false
  };
  const STANDARD_CATALOGUE = PRODUCT_LIST.filter((product) => product.variantId);

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
        includePriceTiers: "1",
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

  async function loadDefaultProducts() {
    if (state.loading) return;
    state.loading = true;
    setStatus("Loading standard catalogue…");
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="pm-muted">Loading…</td>
      </tr>
    `;

    try {
      let remoteProducts = [];
      try {
        remoteProducts = await loadSearchProductsPaginated("FL");
      } catch (err) {
        console.warn("Search catalogue load failed, falling back to collection", err);
        const collectionUrl = `/api/v1/shopify/products/collection?handle=${encodeURIComponent(
          DEFAULT_COLLECTION_HANDLE
        )}&includePriceTiers=1`;
        const collectionResp = await fetch(collectionUrl);
        const collectionPayload = await collectionResp.json();
        remoteProducts = Array.isArray(collectionPayload.products) ? collectionPayload.products : [];
      }

      state.products = buildStandardCatalogueProducts(remoteProducts)
        .filter((product) => skuOrder.has(product.sku))
        .sort((a, b) => skuOrder.get(a.sku) - skuOrder.get(b.sku));

      const pricedCount = state.products.filter((product) => product.price != null).length;
      renderTable();
      setStatus(`Loaded ${state.products.length} standard SKUs (${pricedCount} with live Shopify pricing).`);
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
