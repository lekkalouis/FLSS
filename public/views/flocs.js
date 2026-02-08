let flocsInitialized = false;

export function initFlocsView() {
  if (flocsInitialized) return;
  flocsInitialized = true;
  "use strict";

  // ===== CONFIG =====
  const CONFIG = {
    SHOPIFY: { PROXY_BASE: "/api/v1/shopify" },
    PP_ENDPOINT: "/api/v1/pp",
    BOX_DIM: { dim1: 40, dim2: 40, dim3: 30, massKg: 5 }, // fallback parcel
    // Configure your real SKUs + variant IDs and optional weights/prices here.
   PRODUCTS: [
  { sku: "FL002", title: "FL002 – Original Multi-Purpose Spice 200ml", flavour: "Original", size: "200ml", variantId: 42912375701551, weightKg: 0.195, prices: { standard: 45.0 } },
  { sku: "FL003", title: "FL003 – Original Multi-Purpose Spice 500g", flavour: "Original", size: "500g", variantId: 42912375734319, weightKg: 0.5, prices: { standard: 100.0 } },
  { sku: "FL004", title: "FL004 – Original Multi-Purpose Spice 1kg", flavour: "Original", size: "1kg", variantId: 42912375767087, weightKg: 1.007, prices: { standard: 200.0 } },
  { sku: "FL005", title: "FL005 – 750g Original Multi-Purpose Spice Bag", flavour: "Original", size: "750g", variantId: 43610261061679, weightKg: 0.75, prices: { standard: 78.0 } },
  { sku: "FL005-1", title: "FL005-1 – Original Multi-Purpose Spice Tub", flavour: "Original", size: "750g Tub", variantId: 43874490023983, weightKg: 0.75, prices: { standard: 110.0 } },
  { sku: "FL008", title: "FL008 – Hot & Spicy Multi-Purpose Spice 200ml", flavour: "Hot & Spicy", size: "200ml", variantId: 42912377012271, weightKg: 0.19, prices: { standard: 45.0 } },
  { sku: "FL009", title: "FL009 – Hot & Spicy Multi-Purpose Spice 500g", flavour: "Hot & Spicy", size: "500g", variantId: 42912377045039, weightKg: 0.51, prices: { standard: 100.0 } },
  { sku: "FL010", title: "FL010 – Hot & Spicy Multi-Purpose Spice 1kg", flavour: "Hot & Spicy", size: "1kg", variantId: 42912377077807, weightKg: 1.007, prices: { standard: 200.0 } },
  { sku: "FL014", title: "FL014 – Worcester Sauce Spice 200ml", flavour: "Worcester Sauce", size: "200ml", variantId: 42850656354351, weightKg: 0.2, prices: { standard: 45.0 } },
  { sku: "FL015", title: "FL015 – Worcester Sauce Spice 500g", flavour: "Worcester Sauce", size: "500g", variantId: 42850656387119, weightKg: 0.51, prices: { standard: 100.0 } },
  { sku: "FL016", title: "FL016 – Worcester Sauce Spice 1kg", flavour: "Worcester Sauce", size: "1kg", variantId: 42850656419887, weightKg: 1.007, prices: { standard: 200.0 } },
  { sku: "FL017", title: "FL017 – 750g Worcester Sauce Spice Bag", flavour: "Worcester Sauce", size: "750g", variantId: 43688854945839, weightKg: 0.75, prices: { standard: 78.0 } },
  { sku: "FL017-1", title: "FL017-1 – Worcester Sauce Spice Tub", flavour: "Worcester Sauce", size: "750g Tub", variantId: 43874490744879, weightKg: 0.75, prices: { standard: 110.0 } },
  { sku: "FL026", title: "FL026 – Red Wine & Garlic Sprinkle 200ml", flavour: "Red Wine & Garlic", size: "200ml", variantId: 42912378224687, weightKg: 0.2, prices: { standard: 45.0 } },
  { sku: "FL027", title: "FL027 – Red Wine & Garlic Sprinkle 500g", flavour: "Red Wine & Garlic", size: "500g", variantId: 42912378257455, weightKg: 0.51, prices: { standard: 100.0 } },
  { sku: "FL028", title: "FL028 – Red Wine & Garlic Sprinkle 1kg", flavour: "Red Wine & Garlic", size: "1kg", variantId: 42912378290223, weightKg: 1.007, prices: { standard: 200.0 } },
  { sku: "FL031", title: "FL031 – Flippen Lekka Curry Mix 250ml", flavour: "Curry", size: "250ml", variantId: 42912372031535, weightKg: 0.18, prices: { standard: 50.0 } },
  { sku: "FL032", title: "FL032 – Flippen Lekka Curry Mix 500g", flavour: "Curry", size: "500g", variantId: 42912372097071, weightKg: 0.51, prices: { standard: 110.0 } },
  { sku: "FL033", title: "FL033 – Flippen Lekka Curry Mix 1kg", flavour: "Curry", size: "1kg", variantId: 42912372129839, weightKg: 1.007, prices: { standard: 220.0 } },
  { sku: "FL035", title: "FL035 – Chutney Sprinkle 200ml", flavour: "Chutney", size: "200ml", variantId: 42873122291759, weightKg: 0.22, prices: { standard: 45.0 } },
  { sku: "FL036", title: "FL036 – Chutney Sprinkle 500g", flavour: "Chutney", size: "500g", variantId: 42873122324527, weightKg: 0.51, prices: { standard: 100.0 } },
  { sku: "FL037", title: "FL037 – Chutney Sprinkle 1kg", flavour: "Chutney", size: "1kg", variantId: 42873122357295, weightKg: 1.007, prices: { standard: 200.0 } },
  { sku: "FL038", title: "FL038 – Flippen Lekka Savoury Herb Mix 200ml", flavour: "Savoury Herb", size: "200ml", variantId: 43582507352111, weightKg: 0.12, prices: { standard: 45.0 } },
  { sku: "FL039", title: "FL039 – Flippen Lekka Savoury Herb Mix 500g", flavour: "Savoury Herb", size: "500g", variantId: 43582507384879, weightKg: 0.51, prices: { standard: 130.0 } },
  { sku: "FL041", title: "FL041 – Salt & Vinegar Seasoning 200ml", flavour: "Salt & Vinegar", size: "200ml", variantId: 42853317083183, weightKg: 0.22, prices: { standard: 45.0 } },
  { sku: "FL042", title: "FL042 – Salt & Vinegar Seasoning 500g", flavour: "Salt & Vinegar", size: "500g", variantId: 42853317115951, weightKg: 0.5, prices: { standard: 100.0 } },
  { sku: "FL043", title: "FL043 – Salt & Vinegar Seasoning 1kg", flavour: "Salt & Vinegar", size: "1kg", variantId: 42853317148719, weightKg: 0.2, prices: { standard: 200.0 } },
  { sku: "FL050", title: "FL050 – Butter Popcorn Sprinkle 100ml", flavour: "Butter", size: "100ml", variantId: 43609203376175, weightKg: 0.12, prices: { standard: 25.0 } },
  { sku: "FL053", title: "FL053 – Sour Cream & Chives Popcorn Sprinkle 100ml", flavour: "Sour Cream & Chives", size: "100ml", variantId: 43610081001519, weightKg: 0.12, prices: { standard: 25.0 } },
  { sku: "FL056", title: "FL056 – Chutney Popcorn Sprinkle 100ml", flavour: "Chutney", size: "100ml", variantId: 43610215350319, weightKg: 0.12, prices: { standard: 25.0 } },
  { sku: "FL059", title: "FL059 – Parmesan Cheese Popcorn Sprinkle 100ml", flavour: "Parmesan Cheese", size: "100ml", variantId: 43610217775151, weightKg: 0.11, prices: { standard: 25.0 } },
  { sku: "FL062", title: "FL062 – Cheese & Onion Popcorn Sprinkle 100ml", flavour: "Cheese & Onion", size: "100ml", variantId: 43610218037295, weightKg: 0.12, prices: { standard: 25.0 } },
  { sku: "FL065", title: "FL065 – Salt & Vinegar Popcorn Sprinkle 100ml", flavour: "Salt & Vinegar", size: "100ml", variantId: 43610218659887, weightKg: 0.15, prices: { standard: 25.0 } },
  { sku: "FLBS001", title: "FLBS001 – Original Multi Purpose Basting Sauce 375ml", flavour: "Original", size: "375ml", variantId: 43610234912815, weightKg: 0.42, prices: { standard: 30.0 } },
 
  // ... continues for all 54 variants
]
  };

  // ===== DOM =====
  const shell            = document.getElementById("flocs-shell");
  const customerSearch   = document.getElementById("flocs-customerSearch");
  const customerSearchClear = document.getElementById("flocs-customerSearchClear");
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
  const addrSelect       = document.getElementById("flocs-addressSelect");
  const addrPreview      = document.getElementById("flocs-addressPreview");
  const billingAddrSelect = document.getElementById("flocs-billingAddressSelect");
  const billingAddrPreview = document.getElementById("flocs-billingAddressPreview");

  const productsBody     = document.getElementById("flocs-productsBody");
  const filterFlavour    = document.getElementById("flocs-filterFlavour");
  const filterSize       = document.getElementById("flocs-filterSize");
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
    delivery: "ship",        // ship | pickup | deliver
    shippingAddressIndex: null,      // index in customer.addresses
    billingAddressIndex: null,       // index in customer.addresses
    items: {},               // sku -> qty
    products: [...CONFIG.PRODUCTS],
    shippingQuote: null,     // { service, total, quoteno, raw }
    errors: [],
    isSubmitting: false,
    lastDraftOrderId: null,
    priceTier: null,
    customerTags: [],
    filters: { flavour: "", size: "200ml" },
    priceOverrides: {},
    priceOverrideEnabled: {},
    azLetters: []
  };

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

  const flavourKey = (flavour) => String(flavour || "").toLowerCase().trim();
  const flavourColor = (flavour) => FLAVOUR_COLORS[flavourKey(flavour)] || "#22d3ee";
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

  const PRICE_TAGS = ["agent", "retailer", "export", "private", "fkb"];
  const QUICK_QTY = [1, 3, 6, 10, 12, 24, 50, 100];

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
    return (
      PRICE_TAGS.find((tag) => normalized.includes(tag)) || null
    );
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

  function priceForCustomer(product) {
    if (!product) return null;
    const tier = state.priceTier;
    const tiers = normalizePriceTiers(product);
    if (tier && tiers && tiers[tier] != null) {
      return Number(tiers[tier]);
    }
    if (tiers) {
      const fallback = tiers.default != null ? tiers.default : tiers.standard;
      if (fallback != null) return Number(fallback);
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
    return state.delivery || "ship";
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
        price: resolveLinePrice(p) // optional
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
    const shipping = state.shippingQuote?.total || 0;
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

  // ===== UI: products table rendering =====
  function renderProductsTable() {
    if (!productsBody) return;
    const flavourFilter = (state.filters.flavour || "").toLowerCase();
    const sizeFilter = (state.filters.size || "").toLowerCase();

    const filtered = state.products.filter((p) => {
      const flavour = (p.flavour || "").toLowerCase();
      const size = (p.size || "").toLowerCase();
      if (flavourFilter && flavour !== flavourFilter) return false;
      if (sizeFilter) {
        if (sizeFilter === "other") {
          if (size === "100ml" || size === "200ml") return false;
        } else if (size !== sizeFilter) {
          return false;
        }
      }
      return true;
    });

    productsBody.innerHTML = filtered
      .map((p) => {
        const name = displayProductTitle(p);
        const key = productKey(p);
        const value = state.items[key] || "";
        const price = priceForCustomer(p);
        const overrideEnabled = !!state.priceOverrideEnabled[key];
        const overrideValue =
          state.priceOverrides[key] != null ? state.priceOverrides[key] : "";
        const overridePrice = priceOverrideForKey(key);
        const rowStyle = p.flavour ? ` style="--flavour-color:${flavourColor(p.flavour)}"` : "";
        const quickButtons = QUICK_QTY.map(
          (qty) =>
            `<button class="flocs-qtyQuickBtn" type="button" data-action="quick-add" data-key="${key}" data-amount="${qty}">${qty}</button>`
        ).join("");
        return `
        <tr${rowStyle}>
          <td><code>${p.sku}</code></td>
          <td><span class="flocs-productName" title="${name}">${name}</span></td>
          <td>${flavourTag(p.flavour)}</td>
          <td>${p.size || "—"}</td>
          <td>${price != null ? money(price) : "—"}</td>
          <td>
            <div class="flocs-overrideWrap">
              <button class="flocs-overrideBtn ${overrideEnabled ? "is-active" : ""}" type="button" data-action="toggle-override" data-key="${key}">
                ${overrideEnabled ? "Custom" : "Override"}
              </button>
              <input class="flocs-overrideInput"
                     type="number"
                     min="0"
                     step="0.01"
                     inputmode="decimal"
                     placeholder="R0.00"
                     data-action="override-input"
                     data-key="${key}"
                     value="${overrideValue}"
                     ${overrideEnabled ? "" : "disabled"} />
            </div>
            <div class="flocs-overrideHint">
              ${overridePrice != null ? `Using ${money(overridePrice)}` : "Auto price"}
            </div>
          </td>
          <td>
            <div class="flocs-qtyArea">
              <div class="flocs-qtyQuick">
                ${quickButtons}
              </div>
              <div class="flocs-qtyWrap">
                <button class="flocs-qtyBtn" type="button" data-action="dec" data-key="${key}">−</button>
                <input class="flocs-qtyInput"
                       type="number"
                       min="0"
                       step="1"
                       data-key="${key}"
                       data-sku="${p.sku || ""}"
                       inputmode="numeric"
                       value="${value}" />
                <button class="flocs-qtyBtn" type="button" data-action="inc" data-key="${key}">＋</button>
              </div>
            </div>
          </td>
        </tr>
      `;
      })
      .join("");
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
      delivery === "pickup"
        ? "Pickup at Flippen Lekka"
        : delivery === "deliver"
        ? "Deliver (own vehicle)"
        : "Ship via SWE";

    const billToText = state.customer
      ? `${customerName}
${state.customer.email || ""}${
          state.customer.phone ? "\n" + state.customer.phone : ""
        }${
          state.customer.companyName ? "\n" + state.customer.companyName : ""
        }${
          state.customer.vatNumber ? "\nVAT: " + state.customer.vatNumber : ""
        }${
          billAddr ? "\n" + formatAddress(billAddr) : ""
        }`
      : "No customer selected";

    const shipToLabel = delivery === "ship" ? "Ship to" : "Shipping address";
    const shipToText =
      shipAddr
        ? formatAddress(shipAddr)
        : delivery === "ship"
        ? "Ship selected but no address chosen"
        : "Not selected";

    const shippingLine =
      delivery === "ship" && state.shippingQuote
        ? `Shipping (${state.shippingQuote.service || "Courier"} @ ${money(
            state.shippingQuote.ratePerKg || 0
          )}/kg, quoteno ${state.shippingQuote.quoteno}): ${money(
            state.shippingQuote.total
          )} (base ${money(state.shippingQuote.baseTotal || 0)} + 5% margin)`
        : delivery === "ship"
        ? "Shipping will be added once SWE quote is calculated"
        : "R0.00 (pickup/deliver)";

    const itemsRows = items.length
      ? items
          .map(
            (li) => `
          <tr>
            <td>${li.title || li.sku}</td>
            <td>${li.sku}</td>
            <td>${li.quantity}</td>
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
            <th>Qty</th>
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
        ${pricingNote}${overrideNote}. Final pricing and tax are still controlled in Shopify.
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

    if (currentDelivery() === "ship") {
      if (!currentShippingAddress()) {
        errs.push("Select a ship-to address.");
      }
      if (!state.shippingQuote) {
        errs.push("Calculate shipping (SWE quote) before creating the order.");
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
      } else if (currentDelivery() === "ship" && !state.shippingQuote) {
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

  async function requestShippingQuote() {
    if (currentDelivery() !== "ship") {
      state.shippingQuote = null;
      shippingSummary.textContent =
        "Delivery type is pickup/deliver – no courier shipping.";
      validate();
      renderInvoice();
      return;
    }
    const addr = currentShippingAddress();
    if (!addr) {
      showToast("Select a ship-to address first.", "err");
      return;
    }
    const items = buildItemsArray();
    if (!items.length) {
      showToast("Enter at least one item quantity first.", "err");
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
        Number(picked.total ?? picked.subtotal ?? picked.charge ?? 0) || 0;
      const marginRate = 1.05;
      const total = baseTotal * marginRate;
      const marginAmount = total - baseTotal;
      const ratePerKg = grossWeightKg ? total / grossWeightKg : 0;
      state.shippingQuote = {
        service: picked.service,
        total,
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
        `Quote: ${picked.service} – ${money(total)} (base ${money(baseTotal)} + 5% margin)` +
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
  const searchCustomersDebounced = debounce(searchCustomersNow, 320);

  async function searchCustomersNow() {
    const q = (customerSearch.value || "").trim();
    if (!q) {
      customerResults.hidden = true;
      customerResults.innerHTML = "";
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
      )}`;
      const res = await fetch(url);
      const data = await res.json();
      const list = Array.isArray(data.customers) ? data.customers : [];

      if (!list.length) {
        customerResults.innerHTML =
          `<div class="flocs-customerEmpty">No customers found.</div>`;
        customerStatus.textContent = "No match yet. Refine search.";
        return;
      }

      customerResults.innerHTML = list
        .map(
          (c, idx) => `
        <div class="flocs-customerItem" data-idx="${idx}">
          <strong>${c.name}</strong>
          <div class="flocs-customerItem-meta">
            ${c.email || "no email"} · ${c.phone || "no phone"}${
              c.delivery_method
                ? ` · default delivery: ${c.delivery_method}`
                : ""
            }${c.tags ? ` · tags: ${c.tags}` : ""}
          </div>
        </div>
      `
        )
        .join("");
      customerResults._data = list;
      customerStatus.textContent =
        "Click a row to select customer.";
    } catch (e) {
      console.error("Customer search error:", e);
      customerResults.innerHTML =
        `<div class="flocs-customerEmpty">Error searching: ${String(
          e?.message || e
        )}</div>`;
      customerStatus.textContent = "Error searching customers.";
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

      applySelectedCustomer(data.customer);
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

    if (c.delivery_method) {
      state.delivery = c.delivery_method;
    } else {
      state.delivery = "ship";
    }

    const addrs = Array.isArray(c.addresses) ? c.addresses : [];
    const defaultIdx = resolveDefaultAddressIndex(addrs, c.default_address);
    state.shippingAddressIndex = defaultIdx;
    state.billingAddressIndex = defaultIdx;

    if (customerResults) customerResults.hidden = true;
    if (customerStatus) customerStatus.textContent = `Selected: ${c.name}`;
    state.customerTags = normalizeTags(c.tags);
    state.priceTier = resolvePriceTier(state.customerTags);
    renderCustomerChips();
    renderProductsTable();
    renderBillingAddressSelect();
    renderShippingAddressSelect();
    renderInvoice();
    validate();
    hydratePriceTiersForProducts(state.products);
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

  function updateFiltersFromProducts() {
    if (!filterFlavour || !filterSize) return;
    const flavours = new Set();
    const sizes = new Set();
    const flavourStats = new Map();
    state.products.forEach((p) => {
      if (p.flavour) {
        flavours.add(p.flavour);
        const stats = flavourStats.get(p.flavour) || {
          hasPopcorn: false,
          hasNonPopcorn: false
        };
        const isPopcorn = String(p.title || "")
          .toLowerCase()
          .includes("popcorn sprinkle");
        if (isPopcorn) {
          stats.hasPopcorn = true;
        } else {
          stats.hasNonPopcorn = true;
        }
        flavourStats.set(p.flavour, stats);
      }
      if (p.size) sizes.add(p.size);
    });
    const flavourOptions = [
      "",
      ...Array.from(flavours)
        .filter((flavour) => {
          const stats = flavourStats.get(flavour);
          return !(stats?.hasPopcorn && !stats.hasNonPopcorn);
        })
        .sort()
    ];
    const sizeOptions = ["", "100ml", "200ml", "Other"].filter((s) => {
      if (!s) return true;
      if (s === "Other") {
        return Array.from(sizes).some(
          (size) => !["100ml", "200ml"].includes(String(size).toLowerCase())
        );
      }
      return Array.from(sizes).some(
        (size) => String(size).toLowerCase() === s.toLowerCase()
      );
    });

    filterFlavour.innerHTML = flavourOptions
      .map((f) => {
        const label = f || "All flavours";
        const active = (state.filters.flavour || "") === f;
        const flavourStyle = f
          ? ` style="--flavour-color:${flavourColor(f)}"`
          : "";
        const neutralClass = f ? "" : " is-neutral";
        return `<button class="flocs-filterBtn flocs-filterBtn--flavour${neutralClass} ${
          active ? "is-active" : ""
        }" type="button" data-filter="flavour" data-value="${f}"${flavourStyle}>${label}</button>`;
      })
      .join("");
    filterSize.innerHTML = sizeOptions
      .map((s) => {
        const label = s || "All sizes";
        const active = (state.filters.size || "") === s;
        return `<button class="flocs-filterBtn ${active ? "is-active" : ""}" type="button" data-filter="size" data-value="${s}">${label}</button>`;
      })
      .join("");
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
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.total
        : null;
    const shippingService =
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.service
        : null;
    const shippingQuoteNo =
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.quoteno
        : null;

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
      shippingService,
      shippingQuoteNo,
      billingAddress,
      shippingAddress,
      customerTags: state.customerTags,
      priceTier: state.priceTier,
      lineItems: items.map((li) => ({
        sku: li.sku,
        title: li.title,
        variantId: li.variantId,
        quantity: li.quantity,
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
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.total
        : null;
    const shippingService =
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.service
        : null;
    const shippingQuoteNo =
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.quoteno
        : null;

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
      shippingService,
      shippingQuoteNo,
      billingAddress,
      shippingAddress,
      customerTags: state.customerTags,
      lineItems: items.map((li) => ({
        sku: li.sku,
        title: li.title,
        variantId: li.variantId,
        quantity: li.quantity,
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
    state.delivery = "ship";
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
    state.filters = { flavour: "", size: "200ml" };
    state.priceOverrides = {};
    state.priceOverrideEnabled = {};
    state.azLetters = [];

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
      const radios = deliveryGroup.querySelectorAll(
        "input[name='delivery']"
      );
      radios.forEach((r) => {
        r.checked = r.value === "ship";
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
    updateFiltersFromProducts();
    renderProductsTable();
    renderBillingAddressSelect();
    renderShippingAddressSelect();
    renderInvoice();
    validate();
    renderConvertButton();
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

    if (customerResults) {
      customerResults.addEventListener("click", (e) => {
        const row = e.target.closest(".flocs-customerItem");
        if (!row || !customerResults._data) return;
        const idx = Number(row.dataset.idx);
        const list = customerResults._data;
        const c = list[idx];
        if (!c) return;
        applySelectedCustomer(c);
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
        state.delivery = t.value;
        if (t.value !== "ship") {
          state.shippingQuote = null;
          shippingSummary.textContent =
            "No courier shipping for pickup/deliver.";
        }
        renderCustomerChips();
        renderInvoice();
        validate();
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
        if (t.dataset.action === "override-input") {
          const raw = t.value;
          if (raw === "") {
            delete state.priceOverrides[key];
          } else {
            const num = Number(raw);
            if (Number.isFinite(num)) {
              state.priceOverrides[key] = num;
            }
          }
        } else {
          const v = Number(t.value || 0);
          if (!v || v < 0) {
            delete state.items[key];
          } else {
            state.items[key] = Math.floor(v);
            t.value = String(Math.floor(v));
          }
        }
        renderInvoice();
        validate();
      });

      productsBody.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const key = btn.dataset.key;
        if (!key) return;
        const current = Number(state.items[key] || 0);
        if (action === "toggle-override") {
          state.priceOverrideEnabled[key] = !state.priceOverrideEnabled[key];
          if (!state.priceOverrideEnabled[key]) {
            delete state.priceOverrides[key];
          }
          renderProductsTable();
          renderInvoice();
          validate();
          return;
        }
        if (action === "quick-add") {
          const amount = Number(btn.dataset.amount || 0);
          if (Number.isFinite(amount) && amount > 0) {
            state.items[key] = current + amount;
          }
        } else if (action === "inc") {
          state.items[key] = current + 1;
        } else if (action === "dec") {
          const next = Math.max(0, current - 1);
          if (next === 0) {
            delete state.items[key];
          } else {
            state.items[key] = next;
          }
        } else {
          return;
        }
        const input = productsBody.querySelector(
          `.flocs-qtyInput[data-key="${CSS.escape(key)}"]`
        );
        if (input) {
          input.value = state.items[key] ? String(state.items[key]) : "";
        }
        renderInvoice();
        validate();
      });
    }

    if (filterFlavour) {
      filterFlavour.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-filter='flavour']");
        if (!btn) return;
        state.filters.flavour = btn.dataset.value || "";
        updateFiltersFromProducts();
        renderProductsTable();
      });
    }

    if (filterSize) {
      filterSize.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-filter='size']");
        if (!btn) return;
        state.filters.size = btn.dataset.value || "";
        updateFiltersFromProducts();
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
    updateFiltersFromProducts();
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
