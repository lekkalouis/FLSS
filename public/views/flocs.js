import { PRODUCT_LIST } from "./products.js";

let flocsInitialized = false;

export function initFlocsView() {
  if (flocsInitialized) return;
  flocsInitialized = true;
  "use strict";

  // ===== CONFIG =====
  const CONFIG = {
    SHOPIFY: { PROXY_BASE: "/api/v1/shopify" },
    PP_ENDPOINT: "/api/v1/pp",
    BOX_DIM: { dim1: 40, dim2: 40, dim3: 30, massKg: 5 } // fallback parcel
  };

  // ===== DOM =====
  const shell            = document.getElementById("flocs-shell");
  const customerSearch   = document.getElementById("flocs-customerSearch");
  const customerQuickSearch = document.getElementById("flocs-customerQuickSearch");
  const customerSearchClear = document.getElementById("flocs-customerSearchClear");
  const customerProvinceFilter = document.getElementById("flocs-customerProvinceFilter");
  const customerSort = document.getElementById("flocs-customerSort");
  const customerResults  = document.getElementById("flocs-customerResults");
  const customerStatus   = document.getElementById("flocs-customerStatus");
  const customerChips    = document.getElementById("flocs-selectedCustomerChips");
  const customerCreateToggle = document.getElementById("flocs-customerCreateToggle");
  const customerCreatePanel = document.getElementById("flocs-customerCreatePanel");
  const customerCreateStatus = document.getElementById("flocs-customerCreateStatus");
  const customerFirst    = document.getElementById("flocs-customerFirst");
  const customerLast     = document.getElementById("flocs-customerLast");
  const customerEmail    = document.getElementById("flocs-customerEmail");
  const customerPhone    = document.getElementById("flocs-customerPhone");
  const customerCompany  = document.getElementById("flocs-customerCompany");
  const customerVat      = document.getElementById("flocs-customerVat");
  const customerPaymentTerms = document.getElementById("flocs-customerPaymentTerms");
  const customerDeliveryNotes = document.getElementById("flocs-customerDeliveryNotes");
  const customerDelivery = document.getElementById("flocs-customerDelivery");
  const customerAddr1    = document.getElementById("flocs-customerAddr1");
  const customerAddr2    = document.getElementById("flocs-customerAddr2");
  const customerCity     = document.getElementById("flocs-customerCity");
  const customerProvince = document.getElementById("flocs-customerProvince");
  const customerZip      = document.getElementById("flocs-customerZip");
  const customerCountry  = document.getElementById("flocs-customerCountry");
  const customerCreateBtn = document.getElementById("flocs-customerCreateBtn");
  const customerResetBtn = document.getElementById("flocs-customerResetBtn");

  const poInput          = document.getElementById("flocs-po");
  const deliveryDateInput = document.getElementById("flocs-deliveryDate");
  const deliveryGroup    = document.getElementById("flocs-deliveryGroup");
  const deliveryHint     = document.getElementById("flocs-deliveryHint");
  const addrSelect       = document.getElementById("flocs-addressSelect");
  const addrPreview      = document.getElementById("flocs-addressPreview");
  const billingAddrSelect = document.getElementById("flocs-billingAddressSelect");
  const billingAddrPreview = document.getElementById("flocs-billingAddressPreview");

  const productsBody     = document.getElementById("flocs-productsBody");
  const productsHeadRow  = document.getElementById("flocs-productsHeadRow");
  const productTypeFilter = document.getElementById("flocs-productTypeFilter");
  const bulkColumnsToggle = document.getElementById("flocs-bulkColumnsToggle");
  const bulkColumnsWrap  = document.getElementById("flocs-bulkColumnsWrap");
  const qtyModeGroup     = document.getElementById("flocs-qtyModeGroup");
  const cartonSizeGroup  = document.getElementById("flocs-cartonSizeGroup");
  const calcShipBtn      = document.getElementById("flocs-calcShip");
  const shippingSummary  = document.getElementById("flocs-shippingSummary");
  const errorsBox        = document.getElementById("flocs-errors");

  const invoice          = document.getElementById("flocs-invoice");
  const previewTag       = document.getElementById("flocs-previewTag");
  const convertBtn       = document.getElementById("flocs-convertBtn");
  const createOrderBtn   = document.getElementById("flocs-createOrderBtn");
  const createDraftBtn   = document.getElementById("flocs-createDraftBtn");
  const azBar            = document.getElementById("flocs-azBar");

  const toast            = document.getElementById("flocs-toast");

  // ===== STATE =====
  const state = {
    customer: null,
    po: "",
    deliveryDate: "",
    delivery: "",        // shipping | pickup | delivery
    shippingAddressIndex: null,      // index in customer.addresses
    billingAddressIndex: null,       // index in customer.addresses
    items: {},               // sku -> qty
    products: PRODUCT_LIST.filter((product) => product.variantId || product.sku === "GBOX"),
    shippingQuote: null,     // { service, total, quoteno, raw }
    errors: [],
    isSubmitting: false,
    lastDraftOrderId: null,
    priceTier: null,
    customerTags: [],
    productType: "spices",
    showBulkColumns: false,
    qtyMode: "units",
    cartonUnits: 12,
    priceOverrides: {},
    priceOverrideEnabled: {},
    azLetters: []
  };

  const CUSTOMER_QUICK_PICK_EXCLUDED_SEGMENTS = new Set(["local", "private"]);

  const FLAVOUR_COLORS = {
    "hot & spicy": "#DA291C",
    "original": "#8BAF84",
    "worcester sauce": "#FF8200",
    "red wine & garlic": "#904066",
    "savoury herb": "#A1C935",
    "savoury herbs": "#A1C935",
    "salt & vinegar": "#40B2FF",
    "curry": "#FFC72C",
    "butter": "#FFE66D",
    "sour cream & chives": "#7BC96F",
    "parmesan cheese": "#7E22CE",
    "cheese & onion": "#C4E36A"
  };

  const flavourKey = (flavour) => String(flavour || "").toLowerCase().trim();
  const flavourColor = (flavour) => {
    const key = flavourKey(flavour);
    if (key === "chutney") {
      return state.productType === "popcorn" ? "#DA291C" : "#7E22CE";
    }
    return FLAVOUR_COLORS[key] || "#22d3ee";
  };
  const flavourTag = (flavour) =>
    flavour
      ? `<span class="flocs-flavourTag" style="--flavour-color:${flavourColor(flavour)}">${flavour}</span>`
      : "—";
  let priceTierLoading = false;

  // ===== HELPERS =====
  const money = (v) =>
    v == null || isNaN(v) ? "R0.00" : "R" + Number(v).toFixed(2);

  const debounce = (fn, ms) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const normalizeAzLetters = (value) =>
    String(value || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4)
      .split("");

  const updateAzBarActive = (letters = []) => {
    if (!azBar) return;
    azBar.querySelectorAll(".is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
    letters.forEach((char) => {
      const target = azBar.querySelector(
        `[data-letter="${CSS.escape(char)}"]`
      );
      if (target) target.classList.add("is-active");
    });
  };

  function showToast(msg, tone = "ok") {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = "block";
    toast.style.borderColor =
      tone === "err"
        ? "rgba(248,113,113,.8)"
        : "rgba(34,197,94,.7)";
    toast.style.color =
      tone === "err" ? "#fecaca" : "#bbf7d0";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.style.display = "none";
    }, 4500);
  }

  const productKey = (p) =>
    String(p.variantId || p.sku || p.title || "").trim();

  const PRICE_TAGS = ["agent", "retail", "retailer", "export", "private", "fkb"];
  const QUICK_QTY = [1, 3, 5, 6, 10, 12, 24, 48, 50, 100, 250];
  const MATRIX_POPCORN_SIZES = ["100ml"];
  const MATRIX_BASE_SIZES = ["200ml", "250ml"];
  const MATRIX_BULK_SIZES = ["500g", "1kg", "750g", "750g Tubs"];
  const MATRIX_SIZES = [...MATRIX_POPCORN_SIZES, ...MATRIX_BASE_SIZES, ...MATRIX_BULK_SIZES];
  const SPICE_FLAVOUR_ORDER = [
    "original",
    "hot & spicy",
    "worcester sauce",
    "red wine & garlic",
    "chutney",
    "savoury herb",
    "salt & vinegar",
    "curry"
  ];
  const POPCORN_FLAVOUR_ORDER = [
    "butter",
    "sour cream & chives",
    "chutney",
    "parmesan cheese",
    "cheese & onion",
    "salt & vinegar"
  ];
  const AUTO_QUOTE_DELAY_MS = 3000;
  const REQUIRE_RESOLVED_PRICING = CONFIG?.FLOCS?.REQUIRE_RESOLVED_PRICING !== false;
  let autoQuoteTimer = null;
  const deliveryHintDefault = deliveryHint ? deliveryHint.textContent : "";

  function normalizeTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) {
      return tags.map((t) => String(t).trim()).filter(Boolean);
    }
    if (typeof tags === "string") {
      return tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
    return [];
  }

  function resolvePriceTier(tags) {
    const normalized = tags.map((t) => t.toLowerCase());
    const found = PRICE_TAGS.find((tag) => normalized.includes(tag)) || null;
    return found;
  }

  function resolveTierValue(tiers, tier) {
    if (!tiers || !tier) return null;
    const aliases = {
      retail: ["retail", "retailer"],
      retailer: ["retailer", "retail"],
      fkb: ["fkb", "public"],
      public: ["public", "fkb"]
    };
    const keys = aliases[tier] || [tier];
    for (const key of keys) {
      if (tiers[key] == null) continue;
      const numeric = Number(tiers[key]);
      if (Number.isFinite(numeric)) return numeric;
    }
    return null;
  }

  function customerPrimaryAddress(customer) {
    const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
    return addresses[0] || customer?.default_address || {};
  }

  function customerProvinceLabel(customer) {
    return String(customerPrimaryAddress(customer)?.province || "").trim();
  }

  function customerCityLabel(customer) {
    return String(customerPrimaryAddress(customer)?.city || "").trim();
  }

  function customerSegment(customer) {
    const tags = normalizeTags(customer?.tags).map((tag) => String(tag).toLowerCase());
    if (tags.includes("online")) return "online";
    if (tags.includes("agent")) return "agent";
    if (tags.includes("retailer") || tags.includes("retail")) return "retailer";
    if (tags.includes("export")) return "export";
    if (tags.includes("local")) return "local";
    if (tags.includes("private")) return "private";
    return "retailer";
  }

  function renderProvinceFilterOptions(customers = []) {
    if (!customerProvinceFilter) return;
    const provinces = Array.from(
      new Set((customers || []).map(customerProvinceLabel).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    const selectedProvince = customerProvinceFilter.value || "";
    customerProvinceFilter.innerHTML =
      `<option value="">All provinces</option>` +
      provinces.map((province) => `<option value="${province}">${province}</option>`).join("");
    customerProvinceFilter.value = provinces.includes(selectedProvince) ? selectedProvince : "";
  }

  function filteredQuickPickCustomers(customers = []) {
    let next = Array.isArray(customers) ? [...customers] : [];
    next = next.filter((customer) => !CUSTOMER_QUICK_PICK_EXCLUDED_SEGMENTS.has(customerSegment(customer)));

    if (customerProvinceFilter?.value) {
      const activeProvince = customerProvinceFilter.value.toLowerCase();
      next = next.filter((customer) => customerProvinceLabel(customer).toLowerCase() === activeProvince);
    }

    const quickSearch = (customerQuickSearch?.value || "").trim().toLowerCase();
    if (quickSearch) {
      next = next.filter((customer) => {
        const haystack = [
          customer?.name,
          customer?.companyName,
          customerCityLabel(customer),
          customerProvinceLabel(customer),
          customer?.phone
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(quickSearch);
      });
    }

    const sortBy = customerSort?.value === "city" ? "city" : "name";
    next.sort((a, b) => {
      const aName = String(a?.name || "");
      const bName = String(b?.name || "");
      if (sortBy === "city") {
        const byCity = String(customerCityLabel(a) || "").localeCompare(
          String(customerCityLabel(b) || ""),
          undefined,
          { sensitivity: "base" }
        );
        if (byCity !== 0) return byCity;
      }
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    });

    return next;
  }

  function renderCustomerQuickPicker(customers = []) {
    const filtered = filteredQuickPickCustomers(customers);

    if (!filtered.length) {
      customerResults.innerHTML = `<div class="flocs-customerEmpty">No customers match the current filters.</div>`;
      customerResults._data = [];
      customerResults._allData = Array.isArray(customers) ? customers : [];
      customerStatus.textContent = "No match yet. Refine search.";
      return;
    }

    customerResults.innerHTML = filtered
      .map((customer, idx) => {
        const city = customerCityLabel(customer);
        const province = customerProvinceLabel(customer);
        const location = [city, province].filter(Boolean).join(", ") || "Location unavailable";
        return `
        <div class="flocs-customerItem" data-idx="${idx}">
          <strong>${customer.name || "Unnamed"}</strong>
          <div class="flocs-customerItem-meta">${location}</div>
        </div>
      `;
      })
      .join("");
    customerResults._data = filtered;
    customerResults._allData = Array.isArray(customers) ? customers : [];
    customerStatus.textContent = "Click a row to select customer.";
  }

  function normalizePriceTiers(product) {
    if (!product) return null;
    const raw = product.priceTiers || product.prices || null;
    if (!raw || typeof raw !== "object") return null;
    const normalized = { ...raw };
    if (normalized.default == null) {
      if (product.price != null) {
        normalized.default = product.price;
      } else if (product.prices && product.prices.standard != null) {
        normalized.default = product.prices.standard;
      }
    }
    if (normalized.standard == null && product.prices && product.prices.standard != null) {
      normalized.standard = product.prices.standard;
    }
    return normalized;
  }

  function retailPriceForProduct(product) {
    if (!product) return null;
    const tiers = normalizePriceTiers(product);
    if (tiers && tiers.default != null) return Number(tiers.default);
    if (tiers && tiers.standard != null) return Number(tiers.standard);
    if (product.price != null) return Number(product.price);
    return null;
  }


  function priceForCustomer(product) {
    if (!product) return null;
    const tier = state.priceTier;
    const tiers = normalizePriceTiers(product);
    if (tier && tiers) {
      const tierValue = resolveTierValue(tiers, tier);
      if (tierValue != null) return tierValue;
    }
    if (tiers) {
      const fallback =
        resolveTierValue(tiers, "default") ??
        resolveTierValue(tiers, "standard") ??
        resolveTierValue(tiers, "retail") ??
        resolveTierValue(tiers, "public");
      if (fallback != null) return fallback;
    }
    if (product.price != null) {
      return Number(product.price);
    }
    return null;
  }

  function priceOverrideForKey(key) {
    if (!key) return null;
    const enabled = state.priceOverrideEnabled[key];
    const raw = state.priceOverrides[key];
    if (!enabled) return null;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
    return null;
  }

  function resolveLinePrice(product) {
    if (!product) return null;
    const key = productKey(product);
    const override = priceOverrideForKey(key);
    if (override != null) return override;
    return priceForCustomer(product);
  }

  function displayProductTitle(product) {
    if (!product) return "";
    const sku = String(product.sku || "").trim();
    let title = String(product.title || "").trim();
    if (!title) return sku;
    if (sku) {
      const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      title = title.replace(new RegExp(`^${escaped}\\s*[–-]\\s*`, "i"), "");
    }
    return title || sku;
  }

  function setShellReady(ready) {
    if (!shell) return;
    if (ready) shell.classList.add("flocs-ready");
    else shell.classList.remove("flocs-ready");
  }

  function renderConvertButton() {
    if (!convertBtn) return;
    convertBtn.hidden = !state.lastDraftOrderId;
  }

  function renderCreateOrderButton(ready) {
    if (!createOrderBtn) return;
    createOrderBtn.disabled = !ready || state.isSubmitting;
    createOrderBtn.classList.toggle("is-ready", ready && !state.isSubmitting);
  }

  function setCustomerCreateVisible(visible) {
    if (customerCreatePanel) {
      customerCreatePanel.hidden = !visible;
    }
    if (customerCreateToggle) {
      customerCreateToggle.textContent = visible
        ? "Hide new customer form"
        : "Add new customer";
    }
    if (visible && customerFirst) {
      customerFirst.focus();
    }
  }

  function currentDelivery() {
    return state.delivery || "";
  }

  function currentShippingAddress() {
    if (!state.customer || !Array.isArray(state.customer.addresses)) return null;
    const idx =
      state.shippingAddressIndex != null ? state.shippingAddressIndex : 0;
    return state.customer.addresses[idx] || null;
  }

  function currentBillingAddress() {
    if (!state.customer || !Array.isArray(state.customer.addresses)) return null;
    const idx =
      state.billingAddressIndex != null ? state.billingAddressIndex : 0;
    return state.customer.addresses[idx] || null;
  }

  function formatAddress(addr) {
    if (!addr) return "";
    const parts = [];
    if (addr.company) parts.push(addr.company);
    const name = `${addr.first_name || ""} ${addr.last_name || ""}`.trim();
    if (name) parts.push(name);
    if (addr.address1) parts.push(addr.address1);
    if (addr.address2) parts.push(addr.address2);
    const cityLine = [addr.city, addr.province, addr.zip]
      .filter(Boolean)
      .join(" ");
    if (cityLine) parts.push(cityLine);
    if (addr.country) parts.push(addr.country);
    return parts.join("\n");
  }

  function buildItemsArray() {
    const out = [];
    for (const p of state.products) {
      const key = productKey(p);
      const qty = Number(state.items[key] || 0);
      if (!qty || qty <= 0) continue;
      out.push({
        sku: p.sku,
        title: displayProductTitle(p),
        variantId: p.variantId,
        quantity: qty,
        weightKg: p.weightKg || 0,
        retailPrice: retailPriceForProduct(p),
        price: resolveLinePrice(p) // optional tier/net target
      });
    }
    return out.sort((a, b) =>
      String(a.sku || "").localeCompare(String(b.sku || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      })
    );
  }

  function computeTotals(items) {
    let subtotal = 0;
    for (const li of items) {
      if (li.price != null) {
        subtotal += Number(li.price) * li.quantity;
      }
    }
    const shipping = state.shippingQuote?.subtotal ?? state.shippingQuote?.total ?? 0;
    return {
      subtotal,
      shipping,
      total: subtotal + shipping
    };
  }

  function computeTotalWeightKg(items) {
    let kg = 0;
    for (const li of items) {
      const w = Number(li.weightKg || 0);
      if (!w) continue;
      kg += w * li.quantity;
    }
    if (!kg) return CONFIG.BOX_DIM.massKg;
    return kg;
  }

  function computeBoxCount(totalWeightKg) {
    const base = Number(totalWeightKg || 0);
    const boxes = Math.ceil(base * 0.051 + 0.5);
    return Math.max(boxes, 0);
  }

  function computeBoxWeightKg(totalWeightKg) {
    const boxes = computeBoxCount(totalWeightKg);
    return boxes * 0.5;
  }

  function computeGrossWeightKg(totalWeightKg) {
    const boxWeight = computeBoxWeightKg(totalWeightKg);
    return totalWeightKg + boxWeight;
  }

  function computeEstimatedParcels(items) {
    const totalWeightKg = computeTotalWeightKg(items);
    return computeBoxCount(totalWeightKg);
  }

  function normalizeDeliveryMethod(value) {
    const normalized = String(value || "").toLowerCase().trim();
    if (normalized === "ship" || normalized === "shipping") return "shipping";
    if (normalized === "deliver" || normalized === "delivery") return "delivery";
    if (normalized === "pickup") return "pickup";
        return "";
  }

  function syncDeliveryGroup() {
    if (!deliveryGroup) return;
    const radios = deliveryGroup.querySelectorAll("input[name='delivery']");
    radios.forEach((radio) => {
      radio.checked = radio.value === state.delivery;
    });
  }

  function updateDeliveryPrompt(hasDeliveryMetafield) {
    if (!deliveryGroup) return;
    if (state.customer && !hasDeliveryMetafield) {
      deliveryGroup.classList.add("is-attention");
      if (deliveryHint) {
        deliveryHint.textContent = "Select delivery type to continue.";
      }
    } else {
      deliveryGroup.classList.remove("is-attention");
      if (deliveryHint && deliveryHintDefault) {
        deliveryHint.textContent = deliveryHintDefault;
      }
    }
  }

  function scheduleAutoQuote() {
    if (autoQuoteTimer) {
      clearTimeout(autoQuoteTimer);
      autoQuoteTimer = null;
    }
    if (calcShipBtn && calcShipBtn.disabled) return;
    if (currentDelivery() !== "shipping") return;
    if (!state.customer) return;
    if (!currentShippingAddress()) return;
    const items = buildItemsArray();
    if (!items.length) return;
    autoQuoteTimer = setTimeout(() => {
      autoQuoteTimer = null;
      requestShippingQuote({ auto: true });
    }, AUTO_QUOTE_DELAY_MS);
  }

  // ===== UI: products table rendering =====
  function normalizeMatrixSize(size) {
    const normalized = String(size || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (normalized === "750g tub" || normalized === "750g tubs") return "750g tubs";
    return normalized;
  }

  function visibleMatrixSizes() {
    if (state.productType === "popcorn") return [...MATRIX_POPCORN_SIZES];
    const sizes = [...MATRIX_BASE_SIZES];
    if (state.showBulkColumns) sizes.push(...MATRIX_BULK_SIZES);
    return sizes;
  }

  function renderProductsHeader() {
    if (!productsHeadRow) return;
    const sizeHeaders = visibleMatrixSizes().map((size) => `<th>${size}</th>`).join("");
    productsHeadRow.innerHTML = `<th>SKU</th><th>Description</th>${sizeHeaders}`;
  }

  function renderBulkToggleState() {
    if (bulkColumnsWrap) bulkColumnsWrap.hidden = state.productType === "popcorn";
    if (bulkColumnsToggle) bulkColumnsToggle.checked = Boolean(state.showBulkColumns);
  }

  function isPopcornSprinkleProduct(product) {
    const title = String(product?.title || "").toLowerCase();
    return title.includes("popcorn sprinkle");
  }

  function filteredProductsForMatrix() {
    const type = state.productType === "popcorn" ? "popcorn" : "spices";
    return state.products.filter((product) =>
      type === "popcorn"
        ? isPopcornSprinkleProduct(product)
        : !isPopcornSprinkleProduct(product)
    );
  }

  function flavourSortIndex(flavour) {
    const key = flavourKey(flavour);
    const order = state.productType === "popcorn" ? POPCORN_FLAVOUR_ORDER : SPICE_FLAVOUR_ORDER;
    const idx = order.indexOf(key);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  }

  function groupedProductsForMatrix() {
    const grouped = new Map();
    for (const product of filteredProductsForMatrix()) {
      const flavour = String(product.flavour || "Other").trim() || "Other";
      if (!grouped.has(flavour)) grouped.set(flavour, []);
      grouped.get(flavour).push(product);
    }

    return Array.from(grouped.entries())
      .map(([flavour, products]) => {
        const bySize = new Map();
        products
          .slice()
          .sort((a, b) =>
            String(a.sku || "").localeCompare(String(b.sku || ""), undefined, {
              numeric: true,
              sensitivity: "base"
            })
          )
          .forEach((product) => {
            const normalizedSize = normalizeMatrixSize(product.size);
            if (!bySize.has(normalizedSize)) {
              bySize.set(normalizedSize, product);
            }
          });
        return [flavour, bySize];
      })
      .sort((a, b) => {
        const flavourCmp = flavourSortIndex(a[0]) - flavourSortIndex(b[0]);
        if (flavourCmp !== 0) return flavourCmp;
        return String(a[0]).localeCompare(String(b[0]), undefined, {
          sensitivity: "base"
        });
      });
  }


  function toDisplayQty(units) {
    const base = Number(units || 0);
    if (!base) return "";
    if (state.qtyMode === "cartons") {
      return String(Math.floor(base / Number(state.cartonUnits || 12)));
    }
    return String(base);
  }

  function displayQtyToUnits(displayQty) {
    const base = Number(displayQty || 0);
    if (!Number.isFinite(base) || base <= 0) return 0;
    if (state.qtyMode === "cartons") {
      return Math.floor(base) * Number(state.cartonUnits || 12);
    }
    return Math.floor(base);
  }

  function renderProductsTable() {
    if (!productsBody) return;
    const activeSizes = visibleMatrixSizes();
    renderProductsHeader();
    renderBulkToggleState();
    const grouped = groupedProductsForMatrix();
    const nonMatrixProducts = filteredProductsForMatrix().filter((product) => {
      const normalizedSize = normalizeMatrixSize(product.size);
      return !normalizedSize || !MATRIX_SIZES.includes(normalizedSize);
    });
    if (!grouped.length) {
      const extraRows = nonMatrixProducts.map((product) => {
        const key = productKey(product);
        const units = Number(state.items[key] || 0);
        const value = toDisplayQty(units);
        const quickButtons = QUICK_QTY.map(
          (qty) => `<button class="flocs-qtyQuickBtn" type="button" data-action="quick-add" data-key="${key}" data-amount="${qty}">${qty}</button>`
        ).join("");
        return `<tr style="--flavour-color:${flavourColor(product.flavour)}">
          <td>${product.sku || ""}</td>
          <td><span class="flocs-productName">${displayProductTitle(product)}</span></td>
          <td class="flocs-matrixCell" colspan="${activeSizes.length}">
            <div class="flocs-qtyArea">
              <div class="flocs-qtyQuick">${quickButtons}</div>
              <div class="flocs-qtyWrap">
                <button class="flocs-qtyBtn" type="button" data-action="dec" data-key="${key}">−</button>
                <input class="flocs-qtyInput" type="number" min="0" step="1" data-key="${key}" inputmode="numeric" value="${value}" />
                <button class="flocs-qtyBtn" type="button" data-action="inc" data-key="${key}">＋</button>
              </div>
            </div>
          </td>
        </tr>`;
      }).join("");
      const emptyRow = `<tr><td colspan="${2 + activeSizes.length}" class="flocs-matrixCell flocs-matrixCell--empty">No products in this filter.</td></tr>`;
      productsBody.innerHTML = `${emptyRow}${extraRows}`;
      return;
    }
    const groupedRows = grouped
      .map(([flavour, bySize]) => {
        const cells = activeSizes.map((label) => {
          const lookup = normalizeMatrixSize(label);
          const product = bySize.get(lookup);
          if (!product) return `<td class="flocs-matrixCell flocs-matrixCell--empty">—</td>`;
          const key = productKey(product);
          const units = Number(state.items[key] || 0);
          const value = toDisplayQty(units);
          const quickButtons = QUICK_QTY.map(
            (qty) => `<button class="flocs-qtyQuickBtn" type="button" data-action="quick-add" data-key="${key}" data-amount="${qty}">${qty}</button>`
          ).join("");
          const sourceButtons = `<button class="flocs-qtyQuickBtn" type="button" data-action="quick-add" data-key="${key}" data-amount="12">Source</button><button class="flocs-qtyQuickBtn" type="button" data-action="quick-add" data-key="${key}" data-amount="24">G-box</button>`;
          return `
            <td class="flocs-matrixCell">
              <div class="flocs-matrixSku">${product.sku || ""}</div>
              <div class="flocs-qtyArea">
                <div class="flocs-qtyQuick">${quickButtons}${sourceButtons}</div>
                <div class="flocs-qtyWrap">
                  <button class="flocs-qtyBtn" type="button" data-action="dec" data-key="${key}">−</button>
                  <input class="flocs-qtyInput" type="number" min="0" step="1" data-key="${key}" inputmode="numeric" value="${value}" />
                  <button class="flocs-qtyBtn" type="button" data-action="inc" data-key="${key}">＋</button>
                </div>
              </div>
            </td>`;
        }).join("");
        return `
          <tr style="--flavour-color:${flavourColor(flavour)}">
            <td><span class="flocs-flavourTag" style="--flavour-color:${flavourColor(flavour)}">${flavour}</span></td>
            <td><span class="flocs-productName">${flavour} products</span></td>
            ${cells}
          </tr>`;
      })
      .join("");

    const extraRows = nonMatrixProducts.map((product) => {
      const key = productKey(product);
      const units = Number(state.items[key] || 0);
      const value = toDisplayQty(units);
      const quickButtons = QUICK_QTY.map(
        (qty) => `<button class="flocs-qtyQuickBtn" type="button" data-action="quick-add" data-key="${key}" data-amount="${qty}">${qty}</button>`
      ).join("");
      return `<tr style="--flavour-color:${flavourColor(product.flavour)}">
        <td>${product.sku || ""}</td>
        <td><span class="flocs-productName">${displayProductTitle(product)}</span></td>
        <td class="flocs-matrixCell" colspan="${activeSizes.length}">
          <div class="flocs-qtyArea">
            <div class="flocs-qtyQuick">${quickButtons}</div>
            <div class="flocs-qtyWrap">
              <button class="flocs-qtyBtn" type="button" data-action="dec" data-key="${key}">−</button>
              <input class="flocs-qtyInput" type="number" min="0" step="1" data-key="${key}" inputmode="numeric" value="${value}" />
              <button class="flocs-qtyBtn" type="button" data-action="inc" data-key="${key}">＋</button>
            </div>
          </div>
        </td>
      </tr>`;
    }).join("");

    productsBody.innerHTML = `${groupedRows}${extraRows}`;
  }


  async function hydratePriceTiersForProducts(products) {
    if (priceTierLoading) return;
    const missingIds = Array.from(
      new Set(
        products
          .filter(
            (p) =>
              p?.variantId &&
              (!p.priceTiers || !Object.keys(p.priceTiers).length)
          )
          .map((p) => String(p.variantId))
          .filter(Boolean)
      )
    );
    if (!missingIds.length) return;

    priceTierLoading = true;
    try {
      const resp = await fetch(
        `${CONFIG.SHOPIFY.PROXY_BASE}/variants/price-tiers/fetch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantIds: missingIds })
        }
      );
      if (!resp.ok) {
        console.warn("Price tier fetch failed:", resp.status, resp.statusText);
        return;
      }
      const payload = await resp.json();
      const tiersByVariantId = payload?.priceTiersByVariantId || {};
      let updated = false;
      products.forEach((product) => {
        const tiers = tiersByVariantId[String(product.variantId)];
        if (tiers) {
          product.priceTiers = tiers;
          updated = true;
        }
      });
      if (updated) {
        renderProductsTable();
        renderInvoice();
        validate();
      }
    } catch (err) {
      console.warn("Price tier hydration failed:", err);
    } finally {
      priceTierLoading = false;
    }
  }

  // ===== UI: selected customer chips & address selector =====
  function renderCustomerChips() {
    if (!customerChips) return;
    if (!state.customer) {
      customerChips.innerHTML = "";
      return;
    }
    const c = state.customer;
    const chips = [
      c.name,
      c.email,
      c.phone,
      c.companyName,
      c.paymentTerms ? `Terms: ${c.paymentTerms}` : null,
      state.priceTier ? `Tier: ${state.priceTier}` : null
    ].filter(Boolean);

    customerChips.innerHTML = chips
      .map((chip) => `<span class="flocs-chip">${chip}</span>`)
      .join("");
  }

  function renderAddressSelect(selectEl, previewEl, addressIndexKey) {
    if (!selectEl) return;
    if (!state.customer) {
      selectEl.innerHTML =
        `<option value="">Select a customer first…</option>`;
      selectEl.disabled = true;
      if (previewEl) previewEl.hidden = true;
      return;
    }
    const addrs = Array.isArray(state.customer.addresses)
      ? state.customer.addresses
      : [];
    if (!addrs.length) {
      selectEl.innerHTML =
        `<option value="">No addresses on customer</option>`;
      selectEl.disabled = true;
      if (previewEl) previewEl.hidden = true;
      return;
    }
    selectEl.disabled = false;
    selectEl.innerHTML = addrs
      .map((a, idx) => {
        const labelParts = [];
        if (a.company) labelParts.push(a.company);
        const n = `${a.first_name || ""} ${a.last_name || ""}`.trim();
        if (n) labelParts.push(n);
        if (a.city) labelParts.push(a.city);
        if (a.zip) labelParts.push(a.zip);
        return `<option value="${idx}">${labelParts.join(" · ")}</option>`;
      })
      .join("");

    const idx =
      state[addressIndexKey] != null ? state[addressIndexKey] : 0;
    selectEl.value = String(Math.min(idx, addrs.length - 1));
    state[addressIndexKey] = Number(selectEl.value);
    if (previewEl) {
      previewEl.hidden = true;
      previewEl.textContent = "";
    }
  }

  function renderBillingAddressSelect() {
    renderAddressSelect(billingAddrSelect, billingAddrPreview, "billingAddressIndex");
  }

  function renderShippingAddressSelect() {
    renderAddressSelect(addrSelect, addrPreview, "shippingAddressIndex");
  }

  // ===== UI: invoice preview =====
  function renderInvoice() {
    if (!invoice) return;
    const items = buildItemsArray();
    const shipAddr = currentShippingAddress();
    const billAddr = currentBillingAddress();

    const delivery = currentDelivery();
    const totals = computeTotals(items);

    const customerName = state.customer ? state.customer.name : "—";
    const po = state.po || "—";
    const deliveryLabel =
      delivery === ""
        ? "Not selected"
        : delivery === "pickup"
        ? "Pickup at Flippen Lekka"
        : delivery === "delivery"
        ? "Delivery (own vehicle)"
        : "Shipping via SWE";

    const billToText = state.customer
      ? `${customerName}
${state.customer.email || ""}${
          state.customer.phone ? "\n" + state.customer.phone : ""
        }${
          state.customer.companyName ? "\n" + state.customer.companyName : ""
        }${
          state.customer.vatNumber ? "\nVAT: " + state.customer.vatNumber : ""
        }${
          state.customer.paymentTerms ? "\nTerms: " + state.customer.paymentTerms : ""
        }${
          billAddr ? "\n" + formatAddress(billAddr) : ""
        }`
      : "No customer selected";

    const shipToLabel = delivery === "shipping" ? "Ship to" : "Shipping address";
    const shipToText =
      shipAddr
        ? formatAddress(shipAddr)
        : delivery === "shipping"
        ? "Ship selected but no address chosen"
        : "Not selected";

    const shippingLine =
      delivery === "shipping" && state.shippingQuote
        ? `Shipping (${state.shippingQuote.service || "Courier"} @ ${money(
            state.shippingQuote.ratePerKg || 0
          )}/kg, quoteno ${state.shippingQuote.quoteno}): ${money(
            state.shippingQuote.subtotal ?? state.shippingQuote.total
          )}`
        : delivery === "shipping"
        ? "Shipping will be added once SWE quote is calculated"
        : "R0.00 (pickup/delivery)";

    const itemsRows = items.length
      ? items
          .map(
            (li) => `
          <tr>
            <td>${li.title || li.sku}</td>
            <td>${li.sku}</td>
            <td>${state.qtyMode === "cartons" ? Math.floor(li.quantity / Number(state.cartonUnits || 12)) : li.quantity}</td>
            <td>${li.price != null ? money(li.price) : "—"}</td>
            <td>${li.price != null ? money(li.price * li.quantity) : "—"}</td>
          </tr>
        `
          )
          .join("")
      : "";

    const overrideCount = Object.keys(state.priceOverrideEnabled || {}).filter(
      (key) => priceOverrideForKey(key) != null
    ).length;
    const pricingNote = state.priceTier
      ? `Pricing tier: ${state.priceTier}`
      : "Pricing tier: default";
    const unresolvedPricingCount = items.filter((li) => state.priceTier && li.variantId && li.price == null).length;
    const overrideNote = overrideCount
      ? ` · ${overrideCount} price override${overrideCount === 1 ? "" : "s"}`
      : "";

    invoice.innerHTML = `
      <div class="flocs-invoiceHeader">
        <div>
          <div class="flocs-invoiceBrand">Flippen Lekka Holdings (Pty) Ltd</div>
          <div class="flocs-invoiceSub">Draft order preview</div>
        </div>
        <div class="flocs-invoiceSub" style="text-align:right">
          PO: <strong>${po}</strong><br/>
          Delivery: ${deliveryLabel}
        </div>
      </div>

      <div class="flocs-invoiceCols">
        <div class="flocs-invoiceCol">
          <div class="flocs-invoiceColTitle">Bill to</div>
          ${billToText}
        </div>
        <div class="flocs-invoiceCol">
          <div class="flocs-invoiceColTitle">${shipToLabel}</div>
          ${shipToText}
        </div>
      </div>

      <table class="flocs-invoiceTable">
        <thead>
          <tr>
            <th>Item</th>
            <th>SKU</th>
            <th>${state.qtyMode === "cartons" ? "Cartons" : "Qty"}</th>
            <th>Unit price</th>
            <th>Line total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="flocs-invoiceTotals">
        <div class="flocs-invoiceTotalsRow">
          <span class="label">Subtotal</span>
          <span class="val">${money(totals.subtotal)}</span>
        </div>
        <div class="flocs-invoiceTotalsRow">
          <span class="label">${shippingLine}</span>
          <span class="val"></span>
        </div>
        <div class="flocs-invoiceTotalsRow">
          <span class="label">Estimated total</span>
          <span class="val">${money(totals.total)}</span>
        </div>
      </div>

      <div class="flocs-invoiceNote">
        ${pricingNote}${overrideNote}${unresolvedPricingCount ? ` • ${unresolvedPricingCount} line(s) missing tier pricing` : ""}. Final pricing and tax are still controlled in Shopify.
      </div>
    `;
  }

  // ===== UI: validation =====
  function validate() {
    const errs = [];
    if (!state.customer) {
      errs.push("Select a customer.");
    }

    const items = buildItemsArray();
    if (!items.length) {
      errs.push("Enter at least one item quantity.");
    }

    if (currentDelivery() === "shipping") {
      if (!currentShippingAddress()) {
        errs.push("Select a ship-to address.");
      }
      if (!state.shippingQuote) {
        errs.push("Calculate shipping (SWE quote) before creating the order.");
      }
    }

    if (REQUIRE_RESOLVED_PRICING && state.priceTier) {
      const unresolved = items.filter((li) => li.variantId && li.price == null);
      if (unresolved.length) {
        errs.push(`Pricing unresolved for ${unresolved.length} line(s). Tier price is required.`);
      }
    }

    state.errors = errs;
    if (errorsBox) {
      errorsBox.textContent = errs.length ? errs.join("\n") : "";
    }

    const ready = !errs.length && !state.isSubmitting;
    setShellReady(ready);
    if (previewTag) {
      if (!state.customer) {
        previewTag.textContent = "Waiting for customer…";
      } else if (!items.length) {
        previewTag.textContent = "Add item quantities…";
      } else if (currentDelivery() === "shipping" && !state.shippingQuote) {
        previewTag.textContent = "Awaiting SWE shipping quote…";
      } else if (ready) {
        previewTag.textContent = "Ready to create order";
      } else {
        previewTag.textContent = "Incomplete order";
      }
    }

    if (createDraftBtn) {
      createDraftBtn.disabled = !ready || state.isSubmitting;
      createDraftBtn.classList.toggle(
        "is-ready",
        ready && !state.isSubmitting
      );
    }

    renderConvertButton();
    renderCreateOrderButton(ready);
  }

  // ===== SWE quote helpers (reusing your v28 flow) =====
  function extractQuoteFromV28(shape) {
    const obj = shape || {};
    if (obj.quoteno) {
      return { quoteno: obj.quoteno, rates: obj.rates || [] };
    }
    const res =
      Array.isArray(obj.results) && obj.results[0] ? obj.results[0] : null;
    const quoteno = (res && res.quoteno) || null;
    const rates = res && Array.isArray(res.rates) ? res.rates : [];
    return { quoteno, rates };
  }

  function pickService(rates) {
    if (!rates || !rates.length) return null;
    // prefer RFX → ECO → RDF → first
    const prio = ["RFX", "ECO", "RDF"];
    const svcList = rates.map((r) => String(r.service || "").toUpperCase());
    for (const s of prio) {
      const idx = svcList.indexOf(s);
      if (idx !== -1) return rates[idx];
    }
    return rates[0];
  }

  async function lookupPlaceCodeForAddress(addr) {
    const queries = [];
    const postcode = (addr.zip || "").trim();
    const city = (addr.city || "").trim();
    const suburb = (addr.address2 || "").trim();

    if (postcode) queries.push(postcode);
    if (suburb) queries.push(suburb);
    if (city && city.toLowerCase() !== suburb.toLowerCase()) {
      queries.push(city);
      if (suburb) queries.push(`${suburb} ${city}`);
    }

    for (const q of queries) {
      try {
        const res = await fetch(`${CONFIG.PP_ENDPOINT}/place?q=${encodeURIComponent(q)}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.errorcode && Number(data.errorcode) !== 0) continue;

        const list = Array.isArray(data.results) ? data.results : [];
        if (!list.length) continue;

        const normalized = list.map((p) => {
          const name = (p.name || p.town || p.place || p.pcode || "").toString();
          const town = (p.town || p.name || "").toString();
          const place = p.place ?? p.pcode ?? p.placecode ?? null;
          const ring = p.ring ?? "0";
          return { ...p, name, town, place, ring };
        });

        const targetTown = city.toLowerCase();
        const targetSuburb = suburb.toLowerCase();

        const best =
          (targetSuburb &&
            normalized.find((p) => {
              const n = (p.name || "").toLowerCase();
              const t = (p.town || "").toLowerCase();
              return (n.includes(targetSuburb) || t.includes(targetSuburb)) && String(p.ring) === "0";
            })) ||
          (targetTown &&
            normalized.find((p) => (p.town || "").trim().toLowerCase() === targetTown && String(p.ring) === "0")) ||
          normalized.find((p) => String(p.ring) === "0") ||
          normalized[0];

        if (!best || best.place == null) continue;
        return Number(best.place) || best.place;
      } catch (e) {
        console.warn("PP place lookup failed:", e);
      }
    }

    return null;
  }

  async function requestShippingQuote(options = {}) {
    if (currentDelivery() !== "shipping") {
      state.shippingQuote = null;
      shippingSummary.textContent =
        "Delivery type is pickup/delivery – no courier shipping.";
      validate();
      renderInvoice();
      return;
    }
    const addr = currentShippingAddress();
    if (!addr) {
      if (!options.auto) {
        showToast("Select a ship-to address first.", "err");
      }
      return;
    }
    const items = buildItemsArray();
    if (!items.length) {
      if (!options.auto) {
        showToast("Enter at least one item quantity first.", "err");
      }
      return;
    }

    calcShipBtn.disabled = true;
    shippingSummary.textContent = "Fetching SWE quote…";

    const destplace = await lookupPlaceCodeForAddress(addr);
    if (!destplace) {
      showToast("Could not resolve a place code for this address.", "err");
      shippingSummary.textContent = "Quote error: missing destination place code.";
      state.shippingQuote = null;
      validate();
      renderInvoice();
      calcShipBtn.disabled = false;
      return;
    }

    // Details (origin is your Scan Station ORIGIN equivalent – simplified here)
    const details = {
      origpers: "Flippen Lekka Holdings (Pty) Ltd",
      origperadd1: "7 Papawer Street",
      origperadd2: "Blomtuin, Bellville",
      origperadd3: "Cape Town, Western Cape",
      origperadd4: "ZA",
      origperpcode: "7530",
      origtown: "Cape Town",
      origplace: 4663,
      origpercontact: "Louis",
      origperphone: "0730451885",
      origpercell: "0730451885",
      notifyorigpers: 1,
      origperemail: "admin@flippenlekkaspices.co.za",
      notes: `Draft pre-quote`,

      destpers:
        `${addr.first_name || ""} ${addr.last_name || ""}`.trim() ||
        state.customer?.name ||
        "Customer",
      destperadd1: addr.address1 || "",
      destperadd2: addr.address2 || "",
      destperadd3: addr.city || "",
      destperadd4: addr.province || "",
      destperpcode: addr.zip || "",
      desttown: addr.city || "",
      destplace,
      destpercontact:
        `${addr.first_name || ""} ${addr.last_name || ""}`.trim(),
      destperphone: state.customer?.phone || "",
      destpercell: state.customer?.phone || "",
      destperemail: state.customer?.email || "",
      notifydestpers: 1
    };

    const totalWeightKg = computeTotalWeightKg(items);
    const boxCount = computeBoxCount(totalWeightKg);
    const boxWeightKg = computeBoxWeightKg(totalWeightKg);
    const grossWeightKg = computeGrossWeightKg(totalWeightKg);
    const contents = [
      {
        item: 1,
        pieces: 1,
        dim1: CONFIG.BOX_DIM.dim1,
        dim2: CONFIG.BOX_DIM.dim2,
        dim3: CONFIG.BOX_DIM.dim3,
        actmass: grossWeightKg
      }
    ];

    try {
      const res = await fetch(CONFIG.PP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "requestQuote",
          classVal: "Quote",
          params: { details, contents }
        })
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!res.ok) {
        shippingSummary.textContent =
          "Quote error: HTTP " + res.status + " " + res.statusText;
        state.shippingQuote = null;
        validate();
        renderInvoice();
        return;
      }

      const { quoteno, rates } = extractQuoteFromV28(data);
      const picked = pickService(rates);
      if (!quoteno || !picked) {
        shippingSummary.textContent = "Could not find a valid rate.";
        state.shippingQuote = null;
        validate();
        renderInvoice();
        return;
      }

      const baseTotal =
        Number(picked.subtotal ?? picked.total ?? picked.charge ?? 0) || 0;
      const subtotal = baseTotal;
      const marginRate = 1;
      const marginAmount = 0;
      const ratePerKg = grossWeightKg ? subtotal / grossWeightKg : 0;
      state.shippingQuote = {
        service: picked.service,
        total: subtotal,
        subtotal,
        baseTotal,
        marginRate,
        marginAmount,
        quoteno,
        ratePerKg,
        grossWeightKg,
        boxCount,
        boxWeightKg,
        raw: { rates }
      };

      shippingSummary.textContent =
        `Quote: ${picked.service} – ${money(subtotal)}` +
        ` · ${money(ratePerKg)}/kg · ${grossWeightKg.toFixed(2)}kg gross incl ${boxCount} boxes` +
        ` (quoteno ${quoteno})`;

      validate();
      renderInvoice();
    } catch (e) {
      console.error("SWE quote error:", e);
      shippingSummary.textContent = "Quote error: " + String(e?.message || e);
      state.shippingQuote = null;
      validate();
      renderInvoice();
    } finally {
      calcShipBtn.disabled = false;
    }
  }

  // ===== Shopify calls =====
  const searchCustomersDebounced = debounce(searchCustomersNow, 1000);

  async function searchCustomersNow() {
    const q = (customerSearch.value || "").trim();
    if (!q) {
      customerResults.hidden = true;
      customerResults.innerHTML = "";
      customerResults._data = [];
      customerResults._allData = [];
      customerStatus.textContent = "Search by name, email, company, or phone";
      return;
    }

    customerStatus.textContent = "Searching…";
    customerResults.hidden = false;
    customerResults.innerHTML =
      `<div class="flocs-customerEmpty">Searching…</div>`;

    try {
      const url = `${CONFIG.SHOPIFY.PROXY_BASE}/customers/search?q=${encodeURIComponent(
        q
      )}&limit=100`;
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data.customers) ? data.customers : [];

      renderProvinceFilterOptions(list);

      if (!list.length) {
        customerResults.innerHTML =
          `<div class="flocs-customerEmpty">No customers found.</div>`;
        customerResults._data = [];
        customerResults._allData = [];
        customerStatus.textContent = "No match yet. Refine search.";
        return;
      }

      renderCustomerQuickPicker(list);
    } catch (e) {
      console.error("Customer search error:", e);
      customerResults.innerHTML =
        `<div class="flocs-customerEmpty">Error searching: ${String(
          e?.message || e
        )}</div>`;
      customerResults._data = [];
      customerResults._allData = [];
      customerStatus.textContent = "Error searching customers.";
    }
  }


  async function hydrateCustomerCustomFields(customer) {
    if (!customer?.id || customer.customFieldsLoaded) return customer;
    try {
      const resp = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/customers/${encodeURIComponent(customer.id)}/metafields`);
      const payload = await resp.json();
      if (!resp.ok) return customer;
      return {
        ...customer,
        ...(payload?.metafields || {}),
        delivery_method: payload?.metafields?.delivery_method || customer.delivery_method || null,
        deliveryInstructions:
          payload?.metafields?.delivery_instructions || customer.deliveryInstructions || null,
        companyName: payload?.metafields?.company_name || customer.companyName || null,
        vatNumber: payload?.metafields?.vat_number || customer.vatNumber || null,
        paymentTerms: payload?.metafields?.payment_terms || customer.paymentTerms || null,
        tier: payload?.metafields?.tier || customer.tier || null,
        customFieldsLoaded: true
      };
    } catch {
      return customer;
    }
  }

  async function createCustomer() {
    if (!customerCreateBtn) return;
    const firstName = customerFirst?.value?.trim() || "";
    const lastName = customerLast?.value?.trim() || "";
    const email = customerEmail?.value?.trim() || "";
    const phone = customerPhone?.value?.trim() || "";
    const company = customerCompany?.value?.trim() || "";
    const vatNumber = customerVat?.value?.trim() || "";
    const paymentTerms = customerPaymentTerms?.value || "";
    const deliveryInstructions = customerDeliveryNotes?.value?.trim() || "";
    const deliveryMethod = customerDelivery?.value || "";
    const address1 = customerAddr1?.value?.trim() || "";
    const address2 = customerAddr2?.value?.trim() || "";
    const city = customerCity?.value?.trim() || "";
    const province = customerProvince?.value?.trim() || "";
    const zip = customerZip?.value?.trim() || "";
    const country = customerCountry?.value?.trim() || "";

    if (!firstName && !lastName && !email && !phone) {
      showToast("Provide at least a name, email, or phone.", "err");
      if (customerCreateStatus) {
        customerCreateStatus.textContent =
          "Please enter name, email, or phone before creating.";
      }
      return;
    }

    customerCreateBtn.disabled = true;
    if (customerCreateStatus) {
      customerCreateStatus.textContent = "Creating customer…";
    }

    const payload = {
      firstName,
      lastName,
      email,
      phone,
      company,
      vatNumber,
      paymentTerms,
      deliveryInstructions,
      deliveryMethod,
      address: address1 || address2 || city || province || zip || country
        ? { address1, address2, city, province, zip, country }
        : null
    };

    try {
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!res.ok || !data.ok) {
        console.error("Customer create error:", data);
        showToast("Customer create failed.", "err");
        if (customerCreateStatus) {
          customerCreateStatus.textContent =
            data?.body?.errors || data?.message || "Customer create failed.";
        }
        return;
      }

      if (!data.customer) {
        showToast("Customer created, but no data returned.", "err");
        return;
      }

      applySelectedCustomer({ ...data.customer, customFieldsLoaded: true });
      if (customerCreateStatus) {
        customerCreateStatus.textContent =
          `Created: ${data.customer.name}`;
      }
      showToast("Customer created.", "ok");
      resetCustomerForm();
      setCustomerCreateVisible(false);
    } catch (e) {
      console.error("Customer create error:", e);
      showToast("Customer create failed.", "err");
      if (customerCreateStatus) {
        customerCreateStatus.textContent = String(e?.message || e);
      }
    } finally {
      customerCreateBtn.disabled = false;
    }
  }

  function resetCustomerForm() {
    if (customerFirst) customerFirst.value = "";
    if (customerLast) customerLast.value = "";
    if (customerEmail) customerEmail.value = "";
    if (customerPhone) customerPhone.value = "";
    if (customerCompany) customerCompany.value = "";
    if (customerVat) customerVat.value = "";
    if (customerPaymentTerms) customerPaymentTerms.value = "";
    if (customerDeliveryNotes) customerDeliveryNotes.value = "";
    if (customerDelivery) customerDelivery.value = "";
    if (customerAddr1) customerAddr1.value = "";
    if (customerAddr2) customerAddr2.value = "";
    if (customerCity) customerCity.value = "";
    if (customerProvince) customerProvince.value = "";
    if (customerZip) customerZip.value = "";
    if (customerCountry) customerCountry.value = "South Africa";
    if (customerCreateStatus) {
      customerCreateStatus.textContent =
        "Add a customer if search returns nothing.";
    }
  }

  function resolveDefaultAddressIndex(addresses, defaultAddress) {
    const addrs = Array.isArray(addresses) ? addresses : [];
    if (defaultAddress && defaultAddress.id) {
      const foundIdx = addrs.findIndex((a) => a.id === defaultAddress.id);
      if (foundIdx >= 0) return foundIdx;
    }
    return addrs.length ? 0 : null;
  }

  function applySelectedCustomer(c) {
    state.customer = c;

    const hasDeliveryMethod = !!c.delivery_method;
    if (hasDeliveryMethod) {
      state.delivery = normalizeDeliveryMethod(c.delivery_method);
    } else {
      state.delivery = "";
    }

    const tags = normalizeTags(c.tags).map((tag) => tag.toLowerCase());
    state.qtyMode = tags.includes("export") ? "cartons" : "units";
    if (qtyModeGroup) {
      qtyModeGroup.querySelectorAll("input[name='qtyMode']").forEach((radio) => {
        radio.checked = radio.value === state.qtyMode;
      });
    }
    if (cartonSizeGroup) cartonSizeGroup.hidden = state.qtyMode !== "cartons";
    syncDeliveryGroup();

    const addrs = Array.isArray(c.addresses) ? c.addresses : [];
    const defaultIdx = resolveDefaultAddressIndex(addrs, c.default_address);
    state.shippingAddressIndex = defaultIdx;
    state.billingAddressIndex = defaultIdx;

    if (customerResults) customerResults.hidden = true;
    if (customerStatus) customerStatus.textContent = `Selected: ${c.name}`;
    state.customerTags = normalizeTags(c.tags);
    state.priceTier = c.tier || resolvePriceTier(state.customerTags);
    renderCustomerChips();
    renderProductsTable();
    renderBillingAddressSelect();
    renderShippingAddressSelect();
    renderInvoice();
    validate();
    hydratePriceTiersForProducts(state.products);
    updateDeliveryPrompt(hasDeliveryMethod);
    scheduleAutoQuote();
  }

  function addProductToOrder(product) {
    if (!product) return;
    const key = productKey(product);
    if (!key) return;
    const existing = state.products.find((p) => productKey(p) === key);
    if (!existing) {
      state.products.push(product);
    }
    state.items[key] = (state.items[key] || 0) + 1;
    renderProductsTable();
    renderInvoice();
    validate();
  }



  async function createDraftOrder() {
    if (state.errors.length) {
      showToast("Fix errors before creating draft order.", "err");
      return;
    }

    const items = buildItemsArray();
    if (!items.length) {
      showToast("No line items.", "err");
      return;
    }

    state.isSubmitting = true;
    validate();
    if (createDraftBtn) {
      createDraftBtn.disabled = true;
      createDraftBtn.textContent = "Creating draft order…";
    }

    const delivery = currentDelivery();
    const addr = currentShippingAddress();
    const shippingPrice =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.subtotal ?? state.shippingQuote.total
        : null;
    const shippingBaseTotal =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.baseTotal
        : null;
    const shippingService =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.service
        : null;
    const shippingQuoteNo =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.quoteno
        : null;
    const estimatedParcels = computeEstimatedParcels(items);

    const billingAddress =
      currentBillingAddress() || state.customer?.default_address || null;
    const shippingAddress =
      addr || null;

    const payload = {
      customerId: state.customer.id,
      poNumber: state.po || null,
      deliveryDate: state.deliveryDate || null,
      shippingMethod: delivery,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      vatNumber: state.customer?.vatNumber || null,
      companyName: state.customer?.companyName || null,
      billingAddress,
      shippingAddress,
      customerTags: state.customerTags,
      priceTier: state.priceTier,
      lineItems: items.map((li) => ({
        sku: li.sku,
        title: li.title,
        variantId: li.variantId,
        quantity: li.quantity,
        retailPrice: li.retailPrice,
        price: li.price
      }))
    };

    try {
      const resp = await fetch(
        `${CONFIG.SHOPIFY.PROXY_BASE}/draft-orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!resp.ok || !data.ok) {
        console.error("Draft order create error:", text);
        showToast(
          "Draft order failed: " +
            (data?.body?.errors || resp.statusText || "unknown"),
          "err"
        );
        return;
      }

      const d = data.draftOrder || {};
      let link = "";
      if (d.adminUrl) {
        link = `\nOpen: ${d.adminUrl}`;
      } else if (d.invoiceUrl) {
        link = `\nInvoice URL: ${d.invoiceUrl}`;
      }

      showToast(
        `Draft order ${d.name || d.id} created.${link ? " See console for link." : ""}`,
        "ok"
      );
      if (d.adminUrl) {
        console.log("Draft order admin URL:", d.adminUrl);
      }
      const openUrl = d.adminUrl || d.invoiceUrl || null;
      if (openUrl) {
        window.open(openUrl, "_blank", "noopener");
      }

      state.lastDraftOrderId = d.id || null;

      // Reset form (keep convert action available)
      resetForm({ keepDraftOrder: true });
    } catch (e) {
      console.error("Draft order create exception:", e);
      showToast("Draft order error: " + String(e?.message || e), "err");
    } finally {
      state.isSubmitting = false;
      if (createDraftBtn) {
        createDraftBtn.textContent = "Create draft order";
      }
      validate();
    }
  }

  async function createOrderNow() {
    if (state.errors.length) {
      showToast("Fix errors before creating order.", "err");
      return;
    }

    const items = buildItemsArray();
    if (!items.length) {
      showToast("No line items.", "err");
      return;
    }

    state.isSubmitting = true;
    validate();
    if (createOrderBtn) {
      createOrderBtn.disabled = true;
    }

    const delivery = currentDelivery();
    const addr = currentShippingAddress();
    const shippingPrice =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.subtotal ?? state.shippingQuote.total
        : null;
    const shippingBaseTotal =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.baseTotal
        : null;
    const shippingService =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.service
        : null;
    const shippingQuoteNo =
      delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.quoteno
        : null;
    const estimatedParcels = computeEstimatedParcels(items);

    const billingAddress =
      currentBillingAddress() || state.customer?.default_address || null;
    const shippingAddress =
      addr || null;

    const payload = {
      customerId: state.customer.id,
      poNumber: state.po || null,
      deliveryDate: state.deliveryDate || null,
      shippingMethod: delivery,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      vatNumber: state.customer?.vatNumber || null,
      companyName: state.customer?.companyName || null,
      billingAddress,
      shippingAddress,
      customerTags: state.customerTags,
      lineItems: items.map((li) => ({
        sku: li.sku,
        title: li.title,
        variantId: li.variantId,
        quantity: li.quantity,
        retailPrice: li.retailPrice,
        price: li.price
      }))
    };

    try {
      const resp = await fetch(
        `${CONFIG.SHOPIFY.PROXY_BASE}/orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!resp.ok || !data.ok) {
        console.error("Order create error:", text);
        showToast(
          "Order create failed: " +
            (data?.body?.errors || resp.statusText || "unknown"),
          "err"
        );
        return;
      }

      showToast(
        `Order ${data.order?.name || data.order?.id || ""} created.`,
        "ok"
      );
      resetForm();
    } catch (e) {
      console.error("Order create exception:", e);
      showToast("Order create error: " + String(e?.message || e), "err");
    } finally {
      state.isSubmitting = false;
      if (createOrderBtn) {
        createOrderBtn.disabled = false;
      }
      validate();
    }
  }

  function resetForm(options = {}) {
    const { keepDraftOrder = false } = options;
    state.customer = null;
    state.po = "";
    state.deliveryDate = "";
    state.delivery = "shipping";
    state.shippingAddressIndex = null;
    state.billingAddressIndex = null;
    state.items = {};
    state.shippingQuote = null;
    state.errors = [];
    state.isSubmitting = false;
    if (!keepDraftOrder) {
      state.lastDraftOrderId = null;
    }
    state.customerTags = [];
    state.priceTier = null;
    state.priceOverrides = {};
    state.priceOverrideEnabled = {};
    state.azLetters = [];
    state.productType = "spices";
    state.qtyMode = "units";
    state.cartonUnits = 12;

    if (customerSearch) customerSearch.value = "";
    updateAzBarActive([]);
    if (poInput) poInput.value = "";
    if (deliveryDateInput) deliveryDateInput.value = "";
    if (customerResults) {
      customerResults.hidden = true;
      customerResults.innerHTML = "";
    }
    if (customerStatus) {
      customerStatus.textContent =
        "Search by name, email, company, or phone";
    }
    if (deliveryGroup) {
      syncDeliveryGroup();
    }
    if (productTypeFilter) {
      productTypeFilter.querySelectorAll("button[data-type]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.type === state.productType);
      });
    }
    if (qtyModeGroup) {
      qtyModeGroup.querySelectorAll("input[name='qtyMode']").forEach((radio) => {
        radio.checked = radio.value === state.qtyMode;
      });
    }
    if (cartonSizeGroup) {
      cartonSizeGroup.hidden = true;
      cartonSizeGroup.querySelectorAll("input[name='cartonUnits']").forEach((radio) => {
        radio.checked = Number(radio.value) === state.cartonUnits;
      });
    }
    if (shippingSummary) {
      shippingSummary.textContent = "No shipping quote yet.";
    }
    if (errorsBox) {
      errorsBox.textContent = "";
    }
    if (createDraftBtn) {
      createDraftBtn.textContent = "Create draft order";
    }
    setCustomerCreateVisible(false);
    // reset qty inputs
    if (productsBody) {
      const inputs = productsBody.querySelectorAll("input[data-key]");
      inputs.forEach((inp) => (inp.value = ""));
    }

    renderCustomerChips();
    renderProductsTable();
    renderBillingAddressSelect();
    renderShippingAddressSelect();
    renderInvoice();
    validate();
    renderConvertButton();
    updateDeliveryPrompt(true);
  }

  async function convertDraftToOrder() {
    if (!state.lastDraftOrderId) {
      showToast("No draft order to convert yet.", "err");
      return;
    }

    convertBtn.disabled = true;
    try {
      const resp = await fetch(
        `${CONFIG.SHOPIFY.PROXY_BASE}/draft-orders/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftOrderId: state.lastDraftOrderId })
        }
      );
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (!resp.ok || !data.ok) {
        console.error("Draft order complete error:", text);
        showToast(
          "Draft order convert failed: " +
            (data?.body?.errors || resp.statusText || "unknown"),
          "err"
        );
        return;
      }

      showToast(`Draft converted to order ${data.order?.name || ""}`.trim(), "ok");
      state.lastDraftOrderId = null;
      renderConvertButton();
    } catch (e) {
      console.error("Draft order complete exception:", e);
      showToast("Convert error: " + String(e?.message || e), "err");
    } finally {
      convertBtn.disabled = false;
    }
  }

  // ===== EVENT WIRING =====
  function initEvents() {
    if (customerSearch) {
      customerSearch.addEventListener("input", () =>
        searchCustomersDebounced()
      );
    }

    if (customerQuickSearch) {
      customerQuickSearch.addEventListener("input", () => {
        renderCustomerQuickPicker(customerResults?._allData || []);
      });
    }

    if (customerProvinceFilter) {
      customerProvinceFilter.addEventListener("change", () => {
        renderCustomerQuickPicker(customerResults?._allData || []);
      });
    }

    if (customerSort) {
      customerSort.addEventListener("change", () => {
        renderCustomerQuickPicker(customerResults?._allData || []);
      });
    }

    if (customerResults) {
      customerResults.addEventListener("click", async (e) => {
        const row = e.target.closest(".flocs-customerItem");
        if (!row || !customerResults._data) return;
        const idx = Number(row.dataset.idx);
        const list = customerResults._data;
        const c = list[idx];
        if (!c) return;
        customerStatus.textContent = "Loading customer details…";
        const hydrated = await hydrateCustomerCustomFields(c);
        applySelectedCustomer(hydrated);
      });
    }

    if (customerCreateBtn) {
      customerCreateBtn.addEventListener("click", () => {
        createCustomer();
      });
    }

    if (customerResetBtn) {
      customerResetBtn.addEventListener("click", () => {
        resetCustomerForm();
      });
    }

    if (customerCreateToggle) {
      customerCreateToggle.addEventListener("click", () => {
        const isHidden = customerCreatePanel?.hidden !== false;
        setCustomerCreateVisible(isHidden);
      });
    }

    if (poInput) {
      poInput.addEventListener("input", () => {
        state.po = poInput.value || "";
        renderInvoice();
        validate();
      });
    }

    if (deliveryDateInput) {
      deliveryDateInput.addEventListener("input", () => {
        state.deliveryDate = deliveryDateInput.value || "";
      });
    }

    if (deliveryGroup) {
      deliveryGroup.addEventListener("change", (e) => {
        const t = e.target;
        if (!t || t.name !== "delivery") return;
        state.delivery = normalizeDeliveryMethod(t.value);
        updateDeliveryPrompt(true);
        if (state.delivery !== "shipping") {
          state.shippingQuote = null;
          shippingSummary.textContent =
            "No courier shipping for pickup/delivery.";
        }
        renderCustomerChips();
        renderInvoice();
        validate();
        scheduleAutoQuote();
      });
    }

    if (addrSelect) {
      addrSelect.addEventListener("change", () => {
        const v = addrSelect.value;
        if (!state.customer) return;
        state.shippingAddressIndex =
          v === "" ? null : Number(v);
        const addr = currentShippingAddress();
        if (addrPreview) {
          addrPreview.hidden = true;
          addrPreview.textContent = "";
        }
        renderCustomerChips();
        renderInvoice();
        validate();
        scheduleAutoQuote();
      });
    }

    if (billingAddrSelect) {
      billingAddrSelect.addEventListener("change", () => {
        const v = billingAddrSelect.value;
        if (!state.customer) return;
        state.billingAddressIndex =
          v === "" ? null : Number(v);
        if (billingAddrPreview) {
          billingAddrPreview.hidden = true;
          billingAddrPreview.textContent = "";
        }
        renderCustomerChips();
        renderInvoice();
        validate();
      });
    }

    if (productsBody) {
      productsBody.addEventListener("input", (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement)) return;
        const key = t.dataset.key;
        if (!key) return;
        const units = displayQtyToUnits(t.value || 0);
        if (!units) {
          delete state.items[key];
        } else {
          state.items[key] = units;
          t.value = toDisplayQty(units);
        }
        renderInvoice();
        validate();
        scheduleAutoQuote();
      });

      productsBody.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const key = btn.dataset.key;
        if (!key) return;
        const current = Number(state.items[key] || 0);
        const step = state.qtyMode === "cartons" ? Number(state.cartonUnits || 12) : 1;
        if (action === "quick-add") {
          const amount = Number(btn.dataset.amount || 0);
          if (Number.isFinite(amount) && amount > 0) {
            state.items[key] = current + displayQtyToUnits(amount);
          }
        } else if (action === "inc") {
          state.items[key] = current + step;
        } else if (action === "dec") {
          const next = Math.max(0, current - step);
          if (next === 0) delete state.items[key];
          else state.items[key] = next;
        } else {
          return;
        }
        const input = productsBody.querySelector(`.flocs-qtyInput[data-key="${CSS.escape(key)}"]`);
        if (input) input.value = toDisplayQty(state.items[key] || 0);
        renderInvoice();
        validate();
        scheduleAutoQuote();
      });
    }

    if (qtyModeGroup) {
      qtyModeGroup.addEventListener("change", (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || t.name !== "qtyMode") return;
        state.qtyMode = t.value === "cartons" ? "cartons" : "units";
        if (cartonSizeGroup) cartonSizeGroup.hidden = state.qtyMode !== "cartons";
        renderProductsTable();
      });
    }

    if (cartonSizeGroup) {
      cartonSizeGroup.addEventListener("change", (e) => {
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || t.name !== "cartonUnits") return;
        const next = Number(t.value || 12);
        state.cartonUnits = next === 24 ? 24 : 12;
        renderProductsTable();
      });
    }

    if (productTypeFilter) {
      productTypeFilter.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-type]");
        if (!btn) return;
        state.productType = btn.dataset.type === "popcorn" ? "popcorn" : "spices";
        productTypeFilter.querySelectorAll("button[data-type]").forEach((node) => {
          node.classList.toggle("is-active", node === btn);
        });
        renderProductsTable();
      });
    }

    if (bulkColumnsToggle) {
      bulkColumnsToggle.addEventListener("change", () => {
        state.showBulkColumns = Boolean(bulkColumnsToggle.checked);
        renderProductsTable();
      });
    }

    if (azBar && customerSearch) {
      azBar.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-letter]");
        if (!btn) return;
        const letter = String(btn.dataset.letter || "")
          .toUpperCase()
          .trim();
        if (!letter) return;
        const currentValue = customerSearch.value || "";
        let currentLetters =
          state.azLetters && state.azLetters.length
            ? [...state.azLetters]
            : normalizeAzLetters(currentValue);
        const normalizedValue = normalizeAzLetters(currentValue);
        let nextLetters = [];

        const maxLetters = 4;
        if (
          currentLetters.length === 1 &&
          currentLetters[0] === letter &&
          normalizedValue.length === 1
        ) {
          nextLetters = [];
        } else if (currentLetters.length < maxLetters) {
          nextLetters = [...currentLetters, letter];
        } else {
          nextLetters = [...currentLetters.slice(1), letter];
        }

        state.azLetters = nextLetters;
        customerSearch.value = nextLetters.join("");
        updateAzBarActive(nextLetters);
        searchCustomersNow();
      });
    }

    if (customerSearchClear && customerSearch) {
      customerSearchClear.addEventListener("click", () => {
        customerSearch.value = "";
        if (customerQuickSearch) customerQuickSearch.value = "";
        if (customerProvinceFilter) customerProvinceFilter.value = "";
        if (customerSort) customerSort.value = "name";
        state.azLetters = [];
        updateAzBarActive([]);
        searchCustomersNow();
      });
    }

    if (calcShipBtn) {
      calcShipBtn.addEventListener("click", () => {
        requestShippingQuote();
      });
    }

    if (createDraftBtn) {
      createDraftBtn.addEventListener("click", () => {
        createDraftOrder();
      });
    }

    if (convertBtn) {
      convertBtn.addEventListener("click", () => {
        convertDraftToOrder();
      });
    }

    if (createOrderBtn) {
      createOrderBtn.addEventListener("click", () => {
        createOrderNow();
      });
    }
  }

  // ===== BOOT =====
  function boot() {
    renderProductsTable();
    resetForm();
    hydratePriceTiersForProducts(state.products);
    initEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
