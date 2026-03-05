import { PRODUCT_LIST } from "./products.js";
import { normalizeFlavourKey, resolveFlavourColor } from "./flavour-map.js";
import { isHenniesCustomerContext, normalizeTagList } from "./customer-specialization.js";

let flocsInitialized = false;
let flocsInitPromise = null;
let googlePlacesScriptPromise = null;

const MATRIX_POPCORN_SIZES = ["100ml"];
const MATRIX_BASE_SIZES = ["200ml"];
const MATRIX_BULK_SIZES = ["500g", "750g", "750g Tub", "1kg"];
const MATRIX_SIZES = [...MATRIX_POPCORN_SIZES, ...MATRIX_BASE_SIZES, ...MATRIX_BULK_SIZES];

const SPICE_FLAVOUR_ORDER_LABELS = [
  "Original",
  "Hot & Spicy",
  "Worcester Sauce",
  "Red Wine & Garlic",
  "Chutney Sprinkle",
  "Savoury Herbs",
  "Salt & Vinegar"
];
const POPCORN_FLAVOUR_ORDER_LABELS = [
  "Butter",
  "Sour Cream & Chives",
  "Chutney",
  "Parmesan Cheese",
  "Cheese & Onion",
  "Salt & Vinegar"
];
const SPICE_FLAVOUR_ORDER = SPICE_FLAVOUR_ORDER_LABELS.map((flavour) => normalizeFlavourKey(flavour));
const POPCORN_FLAVOUR_ORDER = POPCORN_FLAVOUR_ORDER_LABELS.map((flavour) => normalizeFlavourKey(flavour));

export function flavourSortIndexForType(flavour, productType = "spices") {
  const key = normalizeFlavourKey(flavour);
  const order = productType === "popcorn" ? POPCORN_FLAVOUR_ORDER : SPICE_FLAVOUR_ORDER;
  const idx = order.indexOf(key);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export function initFlocsView() {
  if (flocsInitialized) return flocsInitPromise || Promise.resolve();
  flocsInitialized = true;
  flocsInitPromise = (async () => {
  "use strict";

  // ===== CONFIG =====
  const CONFIG = {
    SHOPIFY: { PROXY_BASE: "/api/v1/shopify" },
    UI_CONFIG_ENDPOINT: "/api/v1/config",
    PP_ENDPOINT: "/api/v1/pp",
    BOX_DIM: { dim1: 40, dim2: 40, dim3: 30, massKg: 5 }, // fallback parcel
    GOOGLE_MAPS_API_KEY: ""
  };

  // ===== DOM =====
  const shell            = document.getElementById("flocs-shell");
  const customerSearch   = document.getElementById("flocs-customerSearch");
  const customerQuickSearch = document.getElementById("flocs-customerQuickSearch");
  const customerProvinceFilter = document.getElementById("flocs-customerProvinceFilter");
  const customerSort = document.getElementById("flocs-customerSort");
  const customerResults  = document.getElementById("flocs-customerResults");
  const customerStatus   = document.getElementById("flocs-customerStatus");
  const customerSegmentFilters = document.getElementById("flocs-customerSegmentFilters");
  const customerChips    = document.getElementById("flocs-selectedCustomerChips");
  const resetSearchBtn   = document.getElementById("flocs-resetSearchBtn");
  const chatSearchResetBtn = document.getElementById("flocs-chatSearchResetBtn");
  const clearCustomerBtn = document.getElementById("flocs-clearCustomerBtn");
  const customerCreateToggle = document.getElementById("flocs-customerCreateToggle");
  const customerCreatePanel = document.getElementById("flocs-customerCreatePanel");
  const customerCreateStatus = document.getElementById("flocs-customerCreateStatus");
  const customerFirst    = document.getElementById("flocs-customerFirst");
  const customerLast     = document.getElementById("flocs-customerLast");
  const customerEmail    = document.getElementById("flocs-customerEmail");
  const customerPhone    = document.getElementById("flocs-customerPhone");
  const customerAccountEmail = document.getElementById("flocs-customerAccountEmail");
  const customerAccountContact = document.getElementById("flocs-customerAccountContact");
  const customerTier = document.getElementById("flocs-customerTier");
  const customerCompany  = document.getElementById("flocs-customerCompany");
  const customerVat      = document.getElementById("flocs-customerVat");
  const customerPaymentTerms = document.getElementById("flocs-customerPaymentTerms");
  const customerPaymentBeforeShipping = document.getElementById("flocs-customerPaymentBeforeShipping");
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
  const clearAllQtyBtn   = document.getElementById("flocs-clearAllQtyBtn");
  const quickQtyToggleBtn = document.getElementById("flocs-toggleQuickQtyBtn");
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
    customerSpecialization: { isHennies: false },
    productType: "combined",
    showBulkColumns: true,
    showQuickQtyButtons: true,
    qtyMode: "units",
    cartonUnits: 12,
    priceOverrides: {},
    priceOverrideEnabled: {},
    azLetters: [],
    customers: [],
    loadingCustomers: false,
    spaceTapTimes: [],
    customerCandidateId: null,
    orderTagsText: "",
    customerLetterFilter: "",
    customerSegment: ""
  };

  const CUSTOMER_QUICK_PICK_EXCLUDED_SEGMENTS = new Set(["local", "private"]);
  const CUSTOMER_SEGMENT_FILTERS = new Set([
    "agent",
    "retail",
    "export",
    "chain_joeys",
    "chain_boer_butcher",
    "chain_spar",
    "chain_ok_foods",
    "chain_pick_n_pay",
    "chain_famous_kalahari",
    "chain_laeveld"
  ]);
  const CUSTOMER_CHAIN_ITEM_CLASS = Object.freeze({
    chain_joeys: "is-chain-joeys",
    chain_boer_butcher: "is-chain-boer-butcher",
    chain_spar: "is-chain-spar",
    chain_ok_foods: "is-chain-ok-foods",
    chain_pick_n_pay: "is-chain-pick-n-pay",
    chain_famous_kalahari: "is-chain-famous-kalahari",
    chain_laeveld: "is-chain-laeveld"
  });

  const flavourKey = (flavour) => normalizeFlavourKey(flavour);
  const flavourColor = (flavour, productType = state.productType) =>
    resolveFlavourColor(flavour, {
      productType: productType === "combined" ? "spices" : productType
    });
  const flavourTag = (flavour) =>
    flavour
      ? `<span class="flocs-flavourTag" style="--flavour-color:${flavourColor(flavour)}">${flavour}</span>`
      : "—";
  let priceTierLoading = false;
  let autoCustomerSelectVersion = 0;

  // ===== HELPERS =====
  const money = (v) =>
    v == null || isNaN(v) ? "R0.00" : "R" + Number(v).toFixed(2);
  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const debounce = (fn, ms) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  async function loadUiConfig() {
    try {
      const response = await fetch(CONFIG.UI_CONFIG_ENDPOINT, { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const payload = await response.json();
      const key = String(payload?.GOOGLE_MAPS_API_KEY || "").trim();
      if (key) CONFIG.GOOGLE_MAPS_API_KEY = key;
    } catch {
      // Non-blocking enhancement.
    }
  }

  async function ensureGooglePlacesLibrary() {
    const apiKey = String(CONFIG.GOOGLE_MAPS_API_KEY || "").trim();
    if (!apiKey) return null;
    if (window.google?.maps?.places?.Autocomplete) return window.google;
    if (!googlePlacesScriptPromise) {
      googlePlacesScriptPromise = new Promise((resolve, reject) => {
        const existing = document.getElementById("flocs-google-places-script");
        if (existing) {
          existing.addEventListener("load", () => resolve(window.google || null), { once: true });
          existing.addEventListener("error", () => reject(new Error("Failed to load Google Places script.")), {
            once: true
          });
          return;
        }
        const script = document.createElement("script");
        script.id = "flocs-google-places-script";
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
        script.addEventListener("load", () => resolve(window.google || null), { once: true });
        script.addEventListener("error", () => reject(new Error("Failed to load Google Places script.")), {
          once: true
        });
        document.head.appendChild(script);
      });
    }
    try {
      await googlePlacesScriptPromise;
    } catch {
      return null;
    }
    return window.google?.maps?.places?.Autocomplete ? window.google : null;
  }

  function addressPart(place, type, short = false) {
    const parts = Array.isArray(place?.address_components) ? place.address_components : [];
    const match = parts.find((entry) => Array.isArray(entry?.types) && entry.types.includes(type));
    if (!match) return "";
    return String(short ? match.short_name : match.long_name || "").trim();
  }

  function fillCustomerAddressFromPlace(place) {
    if (!place) return;
    const streetNumber = addressPart(place, "street_number");
    const route = addressPart(place, "route");
    const premise = addressPart(place, "premise");
    const subpremise = addressPart(place, "subpremise");
    const suburb =
      addressPart(place, "sublocality_level_1") ||
      addressPart(place, "sublocality") ||
      addressPart(place, "neighborhood");
    const city = addressPart(place, "locality") || addressPart(place, "postal_town");
    const province = addressPart(place, "administrative_area_level_1");
    const zip = addressPart(place, "postal_code");
    const country = addressPart(place, "country");

    const line1 = [streetNumber, route].filter(Boolean).join(" ").trim() || premise || place?.name || "";
    const line2 = [subpremise, suburb].filter(Boolean).join(", ");

    if (customerAddr1 && line1) customerAddr1.value = line1;
    if (customerAddr2 && line2) customerAddr2.value = line2;
    if (customerCity && city) customerCity.value = city;
    if (customerProvince && province) customerProvince.value = province;
    if (customerZip && zip) customerZip.value = zip;
    if (customerCountry && country) customerCountry.value = country;
  }

  async function initCustomerAddressAutocomplete() {
    if (!(customerAddr1 instanceof HTMLInputElement)) return;
    const googleApi = await ensureGooglePlacesLibrary();
    if (!googleApi?.maps?.places?.Autocomplete) {
      console.warn("Google Places autocomplete unavailable: missing GOOGLE_MAPS_API_KEY or blocked by CSP.");
      return;
    }
    const autocomplete = new googleApi.maps.places.Autocomplete(customerAddr1, {
      types: ["address"],
      componentRestrictions: { country: "za" },
      fields: ["address_components", "formatted_address", "name"]
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      fillCustomerAddressFromPlace(place);
    });
  }

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

  function activeCustomerSearchInput() {
    if (customerQuickSearch && !customerQuickSearch.hidden) return customerQuickSearch;
    if (customerSearch && !customerSearch.hidden) return customerSearch;
    return customerSearch || customerQuickSearch || null;
  }

  function customerSearchQuery() {
    return String(activeCustomerSearchInput()?.value || "").trim();
  }

  function customerOrderCount(customer) {
    const raw = Number(customer?.orders_count ?? customer?.ordersCount ?? 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.floor(raw);
  }

  function compareCustomersByOrders(a, b) {
    const byOrders = customerOrderCount(b) - customerOrderCount(a);
    if (byOrders !== 0) return byOrders;
    return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
      sensitivity: "base"
    });
  }

  function keyboardDrivenInput(event) {
    const inputType = String(event?.inputType || "");
    return (
      inputType.startsWith("insertText") ||
      inputType.startsWith("deleteContentBackward") ||
      inputType.startsWith("deleteContentForward")
    );
  }

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

  function flashQuoteReady() {
    if (!shell) return;
    shell.classList.remove("flocs-shell--flash-green");
    void shell.offsetWidth;
    shell.classList.add("flocs-shell--flash-green");
    window.setTimeout(() => {
      shell.classList.remove("flocs-shell--flash-green");
    }, 900);
  }

  function showQuoteReadyPrompt() {
    if (!shell) return;
    const existing = document.getElementById("flocs-quoteReadyPrompt");
    if (existing) existing.remove();
    const prompt = document.createElement("div");
    prompt.id = "flocs-quoteReadyPrompt";
    prompt.className = "flocs-quoteReadyPrompt";
    prompt.innerHTML = `
      <div class="flocs-quoteReadyPromptCard">
        <div class="flocs-quoteReadyPromptTitle">Shipping quote ready</div>
        <div class="flocs-quoteReadyPromptText">Create this as a draft order or a live order now.</div>
        <div class="flocs-quoteReadyPromptActions">
          <button type="button" class="flocs-btn primary" data-action="draft">Create draft order</button>
          <button type="button" class="flocs-btn" data-action="live">Create live order</button>
          <button type="button" class="flocs-miniBtn" data-action="dismiss">Dismiss</button>
        </div>
      </div>
    `;
    prompt.addEventListener("click", async (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("[data-action]") : null;
      if (!target) return;
      const action = target.getAttribute("data-action");
      if (action === "draft") {
        prompt.remove();
        await createDraftOrder();
        return;
      }
      if (action === "live") {
        prompt.remove();
        await createOrderNow();
        return;
      }
      prompt.remove();
    });
    shell.appendChild(prompt);
  }

  const productKey = (p) =>
    String(p.variantId || p.sku || p.title || "").trim();

  const PRICE_TAGS = ["agent", "retail", "retailer", "export", "private", "fkb"];
  const QUICK_QTY = [5, 6, 10, 12, 24];
  const AUTO_QUOTE_DELAY_MS = 5000;
  const REQUIRE_RESOLVED_PRICING = CONFIG?.FLOCS?.REQUIRE_RESOLVED_PRICING !== false;
  let autoQuoteTimer = null;
  const deliveryHintDefault = deliveryHint ? deliveryHint.textContent : "";

  function normalizeTags(tags) {
    return normalizeTagList(tags).map((tag) => String(tag).trim());
  }

  function resolveCustomerSpecialization(customer) {
    if (!customer) return { isHennies: false };
    const primaryAddress = customerPrimaryAddress(customer);
    return {
      isHennies: isHenniesCustomerContext({
        tags: customer.tags,
        customerName: customer.name,
        companyName: customer.companyName,
        shippingCompany: primaryAddress?.company,
        shippingName: [primaryAddress?.first_name, primaryAddress?.last_name].filter(Boolean).join(" ")
      })
    };
  }

  function resolvePriceTier(tags) {
    const normalized = tags.map((t) => t.toLowerCase());
    const found = PRICE_TAGS.find((tag) => normalized.includes(tag)) || null;
    return found;
  }

  function normalizeCustomerTier(tier) {
    const normalized = String(tier || "").trim().toLowerCase();
    const aliases = {
      retailer: "retail",
      public: "fkb"
    };
    const resolved = aliases[normalized] || normalized;
    return PRICE_TAGS.includes(resolved) ? resolved : null;
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

  function normalizeCustomerSegmentFilter(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (CUSTOMER_SEGMENT_FILTERS.has(normalized)) return normalized;
    return "";
  }

  const SPAR_CHAIN_REGEX = /\b(?:super[\s-]*spar|spar)\b/;

  function customerMatchesChain(customer, segment) {
    const haystack = [
      customer?.name,
      customer?.companyName,
      customer?.email,
      customer?.phone,
      normalizeTags(customer?.tags).join(" "),
      ...(Array.isArray(customer?.addresses) ? customer.addresses.map((addr) => addr?.company) : []),
      customer?.default_address?.company
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (segment === "chain_joeys") return /\bjoey'?s\b/.test(haystack);
    if (segment === "chain_boer_butcher") return /\bboer\s*(?:&|and)?\s*butcher\b/.test(haystack);
    if (segment === "chain_spar") return SPAR_CHAIN_REGEX.test(haystack);
    if (segment === "chain_ok_foods") return /\bok(?:\s|-)?foods?\b/.test(haystack);
    if (segment === "chain_pick_n_pay") {
      return /\bpnp\b|\bp\s*n\s*p\b|\bpick\s*['’]?\s*n\s*['’]?\s*pay\b/.test(haystack);
    }
    if (segment === "chain_famous_kalahari") {
      return /\bfamous\s+kalahari\s+biltong\b|\bkalahari\s+biltong\b/.test(haystack);
    }
    if (segment === "chain_laeveld") return /\blaeveld(?:\s+biltong)?\b/.test(haystack);
    return false;
  }

  function customerSegmentMatchesFilter(customer, segment = state.customerSegment) {
    const resolved = normalizeCustomerSegmentFilter(segment);
    if (!resolved) return false;
    if (resolved.startsWith("chain_")) return customerMatchesChain(customer, resolved);
    const tags = normalizeTags(customer?.tags).map((tag) => String(tag).toLowerCase());
    if (resolved === "retail") return tags.includes("retailer");
    const segmentValue = customerSegment(customer);
    if (resolved === "agent") return segmentValue === "agent";
    if (resolved === "export") return segmentValue === "export";
    return segmentValue !== "agent" && segmentValue !== "export";
  }

  function customerSegmentQueryValue(segment = state.customerSegment) {
    const resolved = normalizeCustomerSegmentFilter(segment);
    if (resolved === "agent") return "agent";
    if (resolved === "export") return "export";
    return "retail";
  }

  function customerSegmentLabel(segment = state.customerSegment) {
    const resolved = normalizeCustomerSegmentFilter(segment);
    if (!resolved) return "No group";
    if (resolved === "agent") return "Agent";
    if (resolved === "export") return "Export";
    if (resolved === "chain_joeys") return "Joey's";
    if (resolved === "chain_boer_butcher") return "Boer & Butcher";
    if (resolved === "chain_spar") return "SPAR";
    if (resolved === "chain_ok_foods") return "OK Foods";
    if (resolved === "chain_pick_n_pay") return "Pick n Pay";
    if (resolved === "chain_famous_kalahari") return "Famous Kalahari Biltong";
    if (resolved === "chain_laeveld") return "Laeveld Biltong";
    return "Retail";
  }

  function customerChainItemClass(segment = state.customerSegment) {
    const resolved = normalizeCustomerSegmentFilter(segment);
    return CUSTOMER_CHAIN_ITEM_CLASS[resolved] || "";
  }

  function renderCustomerSegmentFilters() {
    if (!customerSegmentFilters) return;
    const active = normalizeCustomerSegmentFilter(state.customerSegment);
    customerSegmentFilters
      .querySelectorAll("button[data-segment]")
      .forEach((btn) => {
        const segment = normalizeCustomerSegmentFilter(btn.dataset.segment || "");
        btn.classList.toggle("is-active", segment === active);
        btn.disabled = Boolean(state.loadingCustomers);
      });
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
    const activeSegment = normalizeCustomerSegmentFilter(state.customerSegment);
    const quickSearch = customerSearchQuery().toLowerCase();
    if (activeSegment) {
      next = next.filter((customer) => customerSegmentMatchesFilter(customer));
    } else if (!quickSearch) {
      next = [];
    }
    const letterFilter = String(state.customerLetterFilter || "").toLowerCase();
    if (!letterFilter) {
      next = next.filter((customer) => !CUSTOMER_QUICK_PICK_EXCLUDED_SEGMENTS.has(customerSegment(customer)));
    }

    if (customerProvinceFilter?.value) {
      const activeProvince = customerProvinceFilter.value.toLowerCase();
      next = next.filter((customer) => customerProvinceLabel(customer).toLowerCase() === activeProvince);
    }

    if (letterFilter) {
      next = next.filter((customer) => {
        const name = String(customer?.name || customer?.companyName || "")
          .trim()
          .toLowerCase();
        return name.startsWith(letterFilter);
      });
    } else {
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
    }

    const sortBy = customerSort?.value === "city" ? "city" : "orders";
    next.sort((a, b) => {
      if (sortBy === "city") {
        const byCity = String(customerCityLabel(a) || "").localeCompare(
          String(customerCityLabel(b) || ""),
          undefined,
          { sensitivity: "base" }
        );
        if (byCity !== 0) return byCity;
      }
      return compareCustomersByOrders(a, b);
    });

    return next;
  }

  function customerMatchScore(customer, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return 0;
    const name = String(customer?.name || "").toLowerCase();
    const company = String(customer?.companyName || "").toLowerCase();
    const email = String(customer?.email || "").toLowerCase();
    const phone = String(customer?.phone || "").toLowerCase();
    if (name === q) return 1000;
    if (company === q) return 980;
    if (email === q) return 960;
    if (phone === q) return 940;
    if (name.startsWith(q)) return 900;
    if (company.startsWith(q)) return 880;
    if (email.startsWith(q)) return 860;
    if (phone.startsWith(q)) return 840;
    if (name.includes(q)) return 700;
    if (company.includes(q)) return 680;
    if (email.includes(q)) return 660;
    if (phone.includes(q)) return 640;
    return 0;
  }

  function resolveCustomerCandidate(customers = []) {
    const list = Array.isArray(customers) ? customers : [];
    if (!list.length) return null;
    const quickSearch = customerSearchQuery();
    if (!quickSearch) return list.slice().sort(compareCustomersByOrders)[0] || null;
    return list
      .map((customer) => ({ customer, score: customerMatchScore(customer, quickSearch) }))
      .sort((a, b) => {
        const scoreDelta = b.score - a.score;
        if (scoreDelta !== 0) return scoreDelta;
        return compareCustomersByOrders(a.customer, b.customer);
      })[0]?.customer || list.slice().sort(compareCustomersByOrders)[0];
  }

  function renderCustomerQuickPicker(customers = []) {
    if (customerResults) customerResults.hidden = false;
    const filtered = filteredQuickPickCustomers(customers);

    if (!filtered.length) {
      customerResults.innerHTML = `<div class="flocs-customerEmpty">No customers match the current filters.</div>`;
      customerResults._data = [];
      customerResults._allData = Array.isArray(customers) ? customers : [];
      state.customerCandidateId = null;
      customerStatus.textContent = "No match yet. Refine search.";
      return;
    }

    const candidate = resolveCustomerCandidate(filtered);
    state.customerCandidateId = String(candidate?.id || "");
    const selectedId = String(state.customer?.id || "");
    const chainItemClass = customerChainItemClass();
    customerResults.innerHTML = filtered
      .map((customer, idx) => {
        const city = customerCityLabel(customer);
        const province = customerProvinceLabel(customer);
        const location = [city, province].filter(Boolean).join(", ") || "Location unavailable";
        const orders = customerOrderCount(customer);
        const ordersLabel = `${orders} order${orders === 1 ? "" : "s"}`;
        const isActive = selectedId && String(customer?.id || "") === selectedId;
        const isCandidate = state.customerCandidateId && String(customer?.id || "") === state.customerCandidateId;
        return `
        <button type="button" class="flocs-customerItem${chainItemClass ? ` ${chainItemClass}` : ""}${isActive ? " is-active" : ""}${isCandidate ? " is-candidate" : ""}" data-idx="${idx}">
          <strong>${customer.name || "Unnamed"}</strong>
          <div class="flocs-customerItem-meta">${location} · ${ordersLabel}</div>
        </button>
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
    title = title.replace(/\s*-\s*OTHER\b/i, "").trim();
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
      const label = visible ? "Hide new customer form" : "Add new customer";
      customerCreateToggle.innerHTML = `<span aria-hidden="true">${visible ? "-" : "+"}</span>`;
      customerCreateToggle.setAttribute("title", label);
      customerCreateToggle.setAttribute("aria-label", label);
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

  function resolveInvoiceEmail(customer) {
    const accounts = String(customer?.accountEmail || "").trim();
    if (accounts.includes("@")) return accounts;
    const primary = String(customer?.email || "").trim();
    return primary.includes("@") ? primary : null;
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
    if (normalized === "free_shipping" || normalized === "free shipping") return "free_shipping";
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
    if (normalized === "250ml") return "200ml";
    if (normalized === "750g tubs") return "750g tub";
    return normalized;
  }

  function isMatrixSize(size) {
    const normalized = normalizeMatrixSize(size);
    return MATRIX_SIZES.some((matrixSize) => normalizeMatrixSize(matrixSize) === normalized);
  }

  function visibleMatrixSizes() {
    if (state.productType === "popcorn") return [...MATRIX_POPCORN_SIZES];
    if (state.productType === "combined") {
      const sizes = [...MATRIX_BASE_SIZES];
      if (state.showBulkColumns) sizes.push(...MATRIX_BULK_SIZES);
      return sizes;
    }
    const sizes = [...MATRIX_BASE_SIZES];
    if (state.showBulkColumns) sizes.push(...MATRIX_BULK_SIZES);
    return sizes;
  }

  function quoteSummaryText() {
    const fromBadge = String(shippingSummary?.textContent || "").trim();
    if (fromBadge) return fromBadge;
    const delivery = currentDelivery();
    if (delivery === "free_shipping") return "Free Shipping selected - shipping cost will be R0.";
    if (delivery !== "shipping") return "Delivery type is pickup/delivery - no courier shipping.";
    return "No shipping quote yet.";
  }

  function renderProductsHeader() {
    if (!productsHeadRow) return;
    const sizeHeaders = visibleMatrixSizes()
      .map((size) => `<th>${size}</th>`)
      .join("");
    productsHeadRow.innerHTML = `<th>Flippen Lekka Spice</th>${sizeHeaders}`;
  }

  function renderBulkToggleState() {
    if (bulkColumnsWrap) bulkColumnsWrap.hidden = state.productType === "popcorn";
    if (bulkColumnsToggle) bulkColumnsToggle.checked = Boolean(state.showBulkColumns);
  }

  function renderQuickQtyToggleButton() {
    if (!quickQtyToggleBtn) return;
    quickQtyToggleBtn.textContent = state.showQuickQtyButtons ? "Hide quick qty" : "Show quick qty";
    quickQtyToggleBtn.setAttribute("aria-pressed", state.showQuickQtyButtons ? "true" : "false");
  }

  function isPopcornSprinkleProduct(product) {
    const title = String(product?.title || "").toLowerCase();
    return title.includes("popcorn sprinkle");
  }

  function matrixProductType(product) {
    return isPopcornSprinkleProduct(product) ? "popcorn" : "spices";
  }

  function filteredProductsForMatrix() {
    if (state.productType === "popcorn") {
      return state.products.filter((product) => isPopcornSprinkleProduct(product));
    }
    if (state.productType === "spices") {
      return state.products.filter((product) => !isPopcornSprinkleProduct(product));
    }
    return [...state.products];
  }

  function flavourSortIndex(flavour, productType = state.productType) {
    const type = productType === "combined" ? "spices" : productType;
    return flavourSortIndexForType(flavour, type);
  }

  function groupedProductsForMatrix() {
    const grouped = new Map();
    for (const product of filteredProductsForMatrix()) {
      const productType = matrixProductType(product);
      const flavour = String(product.flavour || "Other").trim() || "Other";
      const key = state.productType === "combined" ? `${productType}::${flavour}` : flavour;
      if (!grouped.has(key)) grouped.set(key, { flavour, productType, products: [] });
      grouped.get(key).products.push(product);
    }

    return Array.from(grouped.values())
      .map(({ flavour, productType, products }) => {
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
        return { flavour, productType, bySize };
      })
      .sort((a, b) => {
        if (state.productType === "combined" && a.productType !== b.productType) {
          return a.productType === "spices" ? -1 : 1;
        }
        const flavourCmp = flavourSortIndex(a.flavour, a.productType) - flavourSortIndex(b.flavour, b.productType);
        if (flavourCmp !== 0) return flavourCmp;
        return String(a.flavour).localeCompare(String(b.flavour), undefined, {
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

  function renderSizeQtyControl({ key, value, sizeLabel = "" }) {
    const sizeTag = sizeLabel ? `<span class="flocs-sizeTag">${sizeLabel}</span>` : "";
    const quickButtons = QUICK_QTY.map(
      (qty) => `<button class="flocs-qtyQuickBtn" type="button" data-action="quick-add" data-key="${key}" data-amount="${qty}" title="Quick add ${qty}">${qty}</button>`
    ).join("");
    const quickControls = state.showQuickQtyButtons
      ? `<div class="flocs-qtyQuick" aria-label="Quick add quantity">${quickButtons}</div>`
      : "";
    return `<div class="flocs-qtyArea">
      ${sizeTag}
      <div class="flocs-qtyWrap">
        <button class="flocs-qtyBtn" type="button" data-action="dec" data-key="${key}" title="Decrease">−</button>
        <input class="flocs-qtyInput" type="number" min="0" step="1" data-key="${key}" inputmode="numeric" value="${value}" />
        <button class="flocs-qtyBtn" type="button" data-action="inc" data-key="${key}" title="Increase">＋</button>
        <button class="flocs-qtyBtn flocs-qtyBtn--clear" type="button" data-action="clear" data-key="${key}" title="Clear quantity">⨯</button>
        ${quickControls}
      </div>
    </div>`;
  }

  function applyQtyAction(action, key, amount = 0) {
    if (!key) return;
    const current = Number(state.items[key] || 0);
    const step = state.qtyMode === "cartons" ? Number(state.cartonUnits || 12) : 1;
    if (action === "quick-add") {
      if (Number.isFinite(amount) && amount > 0) {
        state.items[key] = current + displayQtyToUnits(amount);
      }
    } else if (action === "inc") {
      state.items[key] = current + step;
    } else if (action === "dec") {
      const next = Math.max(0, current - step);
      if (next === 0) delete state.items[key];
      else state.items[key] = next;
    } else if (action === "clear") {
      delete state.items[key];
    } else {
      return;
    }

    const input = productsBody?.querySelector(`.flocs-qtyInput[data-key="${CSS.escape(key)}"]`);
    if (input) input.value = toDisplayQty(state.items[key] || 0);
    renderInvoice();
    validate();
    scheduleAutoQuote();
  }

  function renderProductsTable() {
    if (!productsBody) return;
    if (productTypeFilter) productTypeFilter.hidden = true;
    const activeSizes = visibleMatrixSizes();
    renderProductsHeader();
    renderBulkToggleState();
    renderQuickQtyToggleButton();
    const grouped = groupedProductsForMatrix();
    const matrixColumnCount = Math.max(activeSizes.length, 1);
    const nonMatrixProducts = filteredProductsForMatrix().filter((product) => {
      const normalizedSize = normalizeMatrixSize(product.size);
      return !normalizedSize || !isMatrixSize(normalizedSize);
    });
    const nonMatrixPrioritySku = new Map([
      ["FLBS001", 0],
      ["GBOX", 1]
    ]);
    nonMatrixProducts.sort((a, b) => {
      const aSku = String(a?.sku || "").trim().toUpperCase();
      const bSku = String(b?.sku || "").trim().toUpperCase();
      const aPriority = nonMatrixPrioritySku.has(aSku) ? nonMatrixPrioritySku.get(aSku) : Number.POSITIVE_INFINITY;
      const bPriority = nonMatrixPrioritySku.has(bSku) ? nonMatrixPrioritySku.get(bSku) : Number.POSITIVE_INFINITY;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return aSku.localeCompare(bSku, undefined, { sensitivity: "base" });
    });
    const groupedRowsSource = grouped.filter((entry) => flavourKey(entry.flavour) !== "other");
    const renderNonMatrixIdentity = (product) => {
      const sku = String(product?.sku || "").trim().toUpperCase();
      if (sku === "FLBS001") {
        return `<span class="flocs-flavourTag flocs-flavourTag--black">BASTING SAUCE</span>`;
      }
      if (sku === "GBOX") {
        return `<span class="flocs-flavourTag flocs-flavourTag--neutral">GBOX</span>`;
      }
      const label = sku || String(product?.flavour || "").trim() || "ITEM";
      return `<span class="flocs-flavourTag" style="--flavour-color:${flavourColor(product.flavour, matrixProductType(product))}">${label}</span>`;
    };
    const nonMatrixDisplayTitle = (product) => {
      const sku = String(product?.sku || "").trim().toUpperCase();
      if (sku === "FLBS001") return "";
      return displayProductTitle(product);
    };
    const nonMatrixSizeLabel = (product) => {
      const sku = String(product?.sku || "").trim().toUpperCase();
      if (sku === "FLBS001" || sku === "GBOX") return "";
      return product.size || displayProductTitle(product) || "Standard";
    };

    const groupedRowEntries = groupedRowsSource
      .map(({ flavour, productType, bySize }) => {
        const flavourLabel = String(flavour || "").trim();
        const displayFlavour = flavourLabel || "Other";
        const flavourIdentity = `<span class="flocs-flavourTag" style="--flavour-color:${flavourColor(flavour, productType)}">${displayFlavour}</span>`;
        const sizeCells = activeSizes.map((label, index) => {
          let lookup = normalizeMatrixSize(label);
          if (state.productType === "combined" && productType === "popcorn" && index === 0) {
            lookup = normalizeMatrixSize(MATRIX_POPCORN_SIZES[0]);
          }
          const product = bySize.get(lookup);
          if (!product) return `<td class="flocs-matrixCell"><span class="flocs-matrixCell--empty">-</span></td>`;
          const key = productKey(product);
          const units = Number(state.items[key] || 0);
          const value = toDisplayQty(units);
          const qtyControl = renderSizeQtyControl({ key, value });
          return `<td class="flocs-matrixCell">${qtyControl}</td>`;
        }).join("");
        return {
          productType,
          html: `
          <tr style="--flavour-color:${flavourColor(flavour, productType)}">
            <td><div class="flocs-productIdentity">${flavourIdentity}</div></td>
            ${sizeCells}
          </tr>`
        };
      })
      .filter((entry) => entry && entry.html);

    const buildNonMatrixRowEntry = (product) => {
      const key = productKey(product);
      const units = Number(state.items[key] || 0);
      const value = toDisplayQty(units);
      const sizeLabel = nonMatrixSizeLabel(product);
      const qtyControl = renderSizeQtyControl({ key, value, sizeLabel });
      const title = nonMatrixDisplayTitle(product);
      const sku = String(product?.sku || "").trim().toUpperCase();
      const forcedSectionType =
        state.productType === "combined" && (sku === "FLBS001" || sku === "GBOX")
          ? "popcorn"
          : matrixProductType(product);
      return {
        productType: forcedSectionType,
        html: `<tr style="--flavour-color:${flavourColor(product.flavour, matrixProductType(product))}">
        <td>
          <div class="flocs-productIdentity">
            ${renderNonMatrixIdentity(product)}
            ${title ? `<span class="flocs-productName">${title}</span>` : ""}
          </div>
        </td>
        <td class="flocs-matrixCell" colspan="${matrixColumnCount}">${qtyControl}</td>
      </tr>`
      };
    };

    const extraRowEntries = [];
    nonMatrixProducts.forEach((product) => {
      const entry = buildNonMatrixRowEntry(product);
      if (entry?.html) extraRowEntries.push(entry);
    });

    const emptyRow = `<tr><td colspan="${1 + matrixColumnCount}" class="flocs-matrixCell flocs-matrixCell--empty">No products in this filter.</td></tr>`;

    if (state.productType === "combined") {
      const sectionOrder = [
        { key: "spices", label: "Spices" },
        { key: "popcorn", label: "Popcorn Sprinkle" }
      ];
      const renderCombinedSectionHeader = (sectionKey) => {
        if (sectionKey !== "popcorn") return "";
        const sizeHeaders = activeSizes
          .map((_, index) => (index === 0 ? "<th>100ml</th>" : "<th></th>"))
          .join("");
        return `<tr class="flocs-productsSubHeadRow"><th>Popcorn Sprinkle</th>${sizeHeaders}</tr>`;
      };
      const combinedRows = sectionOrder
        .map((section) => {
          const rows = [
            ...groupedRowEntries
              .filter((entry) => entry.productType === section.key)
              .map((entry) => entry.html),
            ...extraRowEntries
              .filter((entry) => entry.productType === section.key)
              .map((entry) => entry.html)
          ];
          if (!rows.length) return "";
          return `${renderCombinedSectionHeader(section.key)}${rows.join("")}`;
        })
        .filter(Boolean)
        .join("");
      productsBody.innerHTML = combinedRows || emptyRow;
      return;
    }

    if (!groupedRowEntries.length) {
      const extraRows = extraRowEntries.map((entry) => entry.html).join("");
      productsBody.innerHTML = `${emptyRow}${extraRows}`;
      return;
    }

    const groupedRows = groupedRowEntries.map((entry) => entry.html).join("");
    const extraRows = extraRowEntries.map((entry) => entry.html).join("");
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

  function renderInvoiceAddressOptions(selectedIndex) {
    if (!state.customer) {
      return `<option value="">Select a customer first…</option>`;
    }
    const addresses = Array.isArray(state.customer.addresses) ? state.customer.addresses : [];
    if (!addresses.length) {
      return `<option value="">No addresses on customer</option>`;
    }
    return addresses
      .map((address, idx) => {
        const labelParts = [];
        if (address.company) labelParts.push(address.company);
        const name = `${address.first_name || ""} ${address.last_name || ""}`.trim();
        if (name) labelParts.push(name);
        if (address.city) labelParts.push(address.city);
        if (address.zip) labelParts.push(address.zip);
        const selected = Number(selectedIndex) === idx ? " selected" : "";
        return `<option value="${idx}"${selected}>${labelParts.join(" · ") || `Address ${idx + 1}`}</option>`;
      })
      .join("");
  }

  function parseOrderTags(rawText) {
    return String(rawText || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  // ===== UI: invoice preview =====
  function renderInvoice() {
    if (!invoice) return;
    const items = buildItemsArray();
    const shipAddr = currentShippingAddress();
    const billAddr = currentBillingAddress();

    const delivery = currentDelivery();
    const totals = computeTotals(items);
    const quoteSummary = quoteSummaryText();
    const manualQuoteDisabled =
      delivery !== "shipping" ||
      !state.customer ||
      !shipAddr ||
      !items.length ||
      Boolean(calcShipBtn?.disabled);

    const customerName = state.customer ? state.customer.name : "—";
    const deliveryLabel =
      delivery === ""
        ? "Not selected"
        : delivery === "free_shipping"
        ? "Free Shipping"
        : delivery === "pickup"
        ? "Pickup at Flippen Lekka"
        : delivery === "delivery"
        ? "Delivery"
        : "Shipping via SWE";
    const sweCarrierLogo =
      delivery === "shipping"
        ? `<div class="flocs-invoiceCarrier"><img class="flocs-invoiceCarrierLogo" src="/img/download.jpg" alt="SWE courier logo" loading="lazy" /></div>`
        : "";
    const deliveryDateValue = String(state.deliveryDate || "");

    const billToText = state.customer
      ? `${customerName}
${state.customer.email || ""}${
          state.customer.accountEmail ? `\nAccounts: ${state.customer.accountEmail}` : ""
        }${
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

    const shipToLabel = delivery === "shipping" || delivery === "free_shipping" ? "Ship to" : "Shipping address";
    const shipToText =
      shipAddr
        ? formatAddress(shipAddr)
        : delivery === "shipping" || delivery === "free_shipping"
        ? "Ship selected but no address chosen"
        : "Not selected";

    const shippingLine =
      delivery === "free_shipping"
        ? "Free Shipping: R0"
        : delivery === "shipping" && state.shippingQuote
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
          <div class="flocs-invoiceSub flocs-invoiceSub--delivery">Delivery: ${deliveryLabel}</div>
          ${sweCarrierLogo}
        </div>
        <div class="flocs-invoiceHeaderMeta">
          <label class="flocs-invoiceHeaderField">
            <span class="flocs-invoiceInlineLabel">PO Number</span>
            <input id="flocs-invoice-po" class="flocs-input" type="text" value="${state.po || ""}" placeholder="PO / reference (optional)" />
          </label>
          <label class="flocs-invoiceHeaderField">
            <span class="flocs-invoiceInlineLabel">Delivery date</span>
            <input id="flocs-invoice-delivery-date" class="flocs-input" type="date" value="${deliveryDateValue}" />
          </label>
        </div>
      </div>

      <div class="flocs-invoiceMetaControls">
        <label class="flocs-invoiceInlineField flocs-invoiceInlineField--wide">
          <span class="flocs-invoiceInlineLabel">Order Tags</span>
          <input id="flocs-invoice-tags" class="flocs-input" type="text" value="${state.orderTagsText || ""}" placeholder="tag-one, tag-two, priority" />
        </label>
      </div>

      <div class="flocs-invoiceCols">
        <div class="flocs-invoiceCol">
          <div class="flocs-invoiceColTitleRow">
            <div class="flocs-invoiceColTitle">Bill to</div>
            <select id="flocs-invoice-billAddress" class="flocs-select flocs-invoiceSelect" ${!state.customer ? "disabled" : ""}>
              ${renderInvoiceAddressOptions(state.billingAddressIndex)}
            </select>
          </div>
          ${billToText}
        </div>
        <div class="flocs-invoiceCol">
          <div class="flocs-invoiceColTitleRow">
            <div class="flocs-invoiceColTitle">${shipToLabel}</div>
            <select id="flocs-invoice-shipAddress" class="flocs-select flocs-invoiceSelect" ${!state.customer ? "disabled" : ""}>
              ${renderInvoiceAddressOptions(state.shippingAddressIndex)}
            </select>
          </div>
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

      <div class="flocs-invoiceQuoteBox">
        <div class="flocs-invoiceQuoteBody">
          <div class="flocs-invoiceQuoteTitle">Shipping quote summary</div>
          <div class="flocs-invoiceQuoteText">${escapeHtml(quoteSummary)}</div>
        </div>
        <button
          id="flocs-invoice-quoteNow"
          class="flocs-miniBtn flocs-invoiceQuoteBtn"
          type="button"
          ${manualQuoteDisabled ? "disabled" : ""}
        >
          Get quote now
        </button>
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
        previewTag.textContent = "Select customer to begin.";
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
        currentDelivery() === "free_shipping"
          ? "Free Shipping selected — shipping cost will be R0."
          : "Delivery type is pickup/delivery – no courier shipping.";
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
    renderInvoice();

    const destplace = await lookupPlaceCodeForAddress(addr);
    if (!destplace) {
      showToast("Could not resolve a place code for this address.", "err");
      shippingSummary.textContent = "Quote error: missing destination place code.";
      state.shippingQuote = null;
      validate();
      calcShipBtn.disabled = false;
      renderInvoice();
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
      flashQuoteReady();
      showQuoteReadyPrompt();
    } catch (e) {
      console.error("SWE quote error:", e);
      shippingSummary.textContent = "Quote error: " + String(e?.message || e);
      state.shippingQuote = null;
      validate();
      renderInvoice();
    } finally {
      calcShipBtn.disabled = false;
      renderInvoice();
    }
  }

  // ===== Shopify calls =====
  const searchCustomersDebounced = debounce(searchCustomersNow, 300);

  async function preloadCustomers() {
    if (state.loadingCustomers) return;
    if (Array.isArray(state.customers) && state.customers.length) {
      await searchCustomersNow();
      return;
    }

    state.loadingCustomers = true;
    renderCustomerSegmentFilters();
    if (customerStatus) customerStatus.textContent = "Loading customers…";
    if (customerResults) {
      customerResults.hidden = false;
      customerResults.innerHTML = `<div class="flocs-customerEmpty">Loading customers…</div>`;
    }

    try {
      const allCustomers = [];
      let pageInfo = "";
      do {
        const params = new URLSearchParams({ limit: "250" });
        if (pageInfo) params.set("pageInfo", pageInfo);
        const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/customers/recent?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Customer preload failed");
        const list = Array.isArray(data.customers) ? data.customers : [];
        allCustomers.push(...list);
        pageInfo = data.nextPageInfo || "";
      } while (pageInfo);

      state.customers = allCustomers;
      renderProvinceFilterOptions(state.customers);
      await searchCustomersNow();
      if (customerStatus && !state.customer) {
        customerStatus.textContent = `Loaded ${state.customers.length} customers.`;
      }
    } catch (e) {
      console.error("Customer preload error:", e);
      if (customerResults) {
        customerResults.innerHTML = `<div class="flocs-customerEmpty">Error loading customers: ${String(e?.message || e)}</div>`;
      }
      if (customerStatus) customerStatus.textContent = "Error loading customers.";
    } finally {
      state.loadingCustomers = false;
      renderCustomerSegmentFilters();
    }
  }

  async function searchCustomersNow({ autoSelect = false } = {}) {
    const q = customerSearchQuery().toLowerCase();
    const source = Array.isArray(state.customers) ? state.customers : [];
    const activeSegment = normalizeCustomerSegmentFilter(state.customerSegment);

    if (state.loadingCustomers) {
      if (customerStatus) customerStatus.textContent = "Loading customers…";
      return;
    }

    if (!activeSegment && !q) {
      if (customerResults) {
        customerResults.hidden = false;
        customerResults.innerHTML =
          `<div class="flocs-customerEmpty">Select a customer group or chain, or type to search all customers.</div>`;
        customerResults._data = [];
        customerResults._allData = source;
      }
      if (customerStatus && !state.customer) {
        customerStatus.textContent = "Select a customer group, or type to search all customers.";
      }
      return;
    }

    let list = source;
    if (activeSegment) {
      list = list.filter((customer) => customerSegmentMatchesFilter(customer));
    }
    if (q) {
      list = source.filter((customer) => {
        const haystack = [
          customer?.name,
          customer?.email,
          customer?.companyName,
          customer?.phone,
          customerCityLabel(customer),
          customerProvinceLabel(customer)
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
        return activeSegment ? customerSegmentMatchesFilter(customer) : true;
      });
    }

    if (!q && !source.length) {
      customerResults.hidden = false;
      customerResults.innerHTML = `<div class="flocs-customerEmpty">No customers loaded yet.</div>`;
      customerResults._data = [];
      customerResults._allData = [];
      customerStatus.textContent = "No customers loaded.";
      return;
    }

    renderProvinceFilterOptions(list.length ? list : source);
    renderCustomerQuickPicker(list);
    if (autoSelect) {
      autoSelectCustomerDebounced();
    }
  }

  async function autoSelectClosestCustomerCandidate() {
    const query = customerSearchQuery();
    if (!query) return false;
    const list = customerResults?._data || [];
    if (!list.length) return false;

    const candidateId = String(state.customerCandidateId || "");
    const candidate = candidateId
      ? list.find((entry) => String(entry?.id || "") === candidateId)
      : list[0];
    if (!candidate) return false;

    const candidateKey = String(candidate?.id || "");
    const currentKey = String(state.customer?.id || "");
    if (candidateKey && currentKey && candidateKey === currentKey) return true;

    const version = ++autoCustomerSelectVersion;
    const selected = await selectCustomerForInput(candidate, { focusQty: true });
    if (version !== autoCustomerSelectVersion) return false;
    return selected;
  }

  const autoSelectCustomerDebounced = debounce(() => {
    autoSelectClosestCustomerCandidate();
  }, 220);


  async function hydrateCustomerCustomFields(customer) {
    if (!customer?.id || customer.customFieldsLoaded) return customer;
    try {
      const resp = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/customers/${encodeURIComponent(customer.id)}/metafields`);
      const payload = await resp.json();
      if (!resp.ok) return customer;
      return {
        ...customer,
        ...(payload?.metafields || {}),
        delivery_method:
          payload?.metafields?.delivery_method ||
          payload?.metafields?.delivery_type ||
          customer.delivery_method ||
          customer.delivery_type ||
          null,
        deliveryInstructions:
          payload?.metafields?.delivery_instructions || customer.deliveryInstructions || null,
        companyName: payload?.metafields?.company_name || customer.companyName || null,
        accountEmail: payload?.metafields?.account_email || customer.accountEmail || null,
        accountContact: payload?.metafields?.account_contact || customer.accountContact || null,
        vatNumber: payload?.metafields?.vat_number || customer.vatNumber || null,
        paymentTerms: payload?.metafields?.payment_terms || customer.paymentTerms || null,
        paymentBeforeShippingRequired:
          payload?.metafields?.payment_before_shipping ??
          payload?.metafields?.payment_before_delivery ??
          customer.paymentBeforeShippingRequired ??
          null,
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
    const accountEmail = customerAccountEmail?.value?.trim() || "";
    const accountContact = customerAccountContact?.value?.trim() || "";
    const tier = customerTier?.value || "";
    const vatNumber = customerVat?.value?.trim() || "";
    const paymentTerms = customerPaymentTerms?.value || "";
    const paymentBeforeShippingRequired = Boolean(customerPaymentBeforeShipping?.checked);
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
      accountEmail,
      accountContact,
      tier,
      vatNumber,
      paymentTerms,
      paymentBeforeShippingRequired,
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
    if (customerAccountEmail) customerAccountEmail.value = "";
    if (customerAccountContact) customerAccountContact.value = "";
    if (customerTier) customerTier.value = "";
    if (customerCompany) customerCompany.value = "";
    if (customerVat) customerVat.value = "";
    if (customerPaymentTerms) customerPaymentTerms.value = "";
    if (customerPaymentBeforeShipping) customerPaymentBeforeShipping.checked = false;
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

  function firstInvoiceInputTarget() {
    if (!invoice) return null;
    return invoice.querySelector(
      "#flocs-invoice-po, #flocs-invoice-delivery-date, #flocs-invoice-tags, #flocs-invoice-billAddress, #flocs-invoice-shipAddress"
    );
  }

  function focusPrimaryQtyInput() {
    if (!productsBody) return;
    const primary = state.products.find((product) => {
      const flavour = String(product?.flavour || "").trim().toLowerCase();
      const size = normalizeMatrixSize(product?.size);
      return flavour === "original" && size === "200ml";
    });
    const primaryKey = primary ? productKey(primary) : "";
    const selector = primaryKey
      ? `.flocs-qtyInput[data-key="${CSS.escape(primaryKey)}"]`
      : ".flocs-qtyInput";
    const input = productsBody.querySelector(selector) || productsBody.querySelector(".flocs-qtyInput");
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  async function selectCustomerForInput(customer, { focusQty = false } = {}) {
    if (!customer) return false;
    if (customerStatus) customerStatus.textContent = "Loading customer details…";
    const hydrated = await hydrateCustomerCustomFields(customer);
    applySelectedCustomer(hydrated);
    if (focusQty) {
      window.requestAnimationFrame(() => focusPrimaryQtyInput());
    }
    return true;
  }

  async function selectCurrentCustomerCandidate(options = {}) {
    const list = customerResults?._data || [];
    if (!list.length) return false;
    const candidateId = String(state.customerCandidateId || "");
    const candidate = candidateId
      ? list.find((entry) => String(entry?.id || "") === candidateId)
      : list[0];
    return selectCustomerForInput(candidate || list[0], options);
  }

  function applySelectedCustomer(c) {
    state.customer = c;

    const resolvedDelivery = normalizeDeliveryMethod(c.delivery_method);
    state.delivery = resolvedDelivery || "shipping";

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
    if (clearCustomerBtn) clearCustomerBtn.disabled = false;
    state.customerTags = normalizeTags(c.tags);
    state.customerSpecialization = resolveCustomerSpecialization(c);
    const metafieldTier = normalizeCustomerTier(c.tier);
    state.priceTier = metafieldTier || resolvePriceTier(state.customerTags);
    renderCustomerChips();
    renderProductsTable();
    renderBillingAddressSelect();
    renderShippingAddressSelect();
    renderInvoice();
    validate();
    hydratePriceTiersForProducts(state.products);
    updateDeliveryPrompt(true);
    scheduleAutoQuote();
  }

  function clearSelectedCustomer() {
    if (!state.customer) return;
    state.customer = null;
    state.shippingAddressIndex = null;
    state.billingAddressIndex = null;
    state.shippingQuote = null;
    state.customerTags = [];
    state.customerSpecialization = { isHennies: false };
    state.priceTier = null;
    state.delivery = "shipping";
    if (deliveryGroup) syncDeliveryGroup();
    if (shippingSummary) shippingSummary.textContent = "No shipping quote yet.";
    if (customerStatus) customerStatus.textContent = "Customer cleared. Select another customer.";
    if (clearCustomerBtn) clearCustomerBtn.disabled = true;
    state.customerCandidateId = null;
    renderCustomerChips();
    renderProductsTable();
    renderBillingAddressSelect();
    renderShippingAddressSelect();
    renderInvoice();
    validate();

    const pickerSource = customerResults?._allData || state.customers || [];
    if (pickerSource.length) {
      renderCustomerQuickPicker(pickerSource);
    } else if (customerResults) {
      customerResults.hidden = false;
      customerResults.innerHTML = `<div class="flocs-customerEmpty">No customers loaded yet.</div>`;
    }
  }

  function resetCustomerSearch(options = {}) {
    const { focus = false } = options;
    if (customerSearch) customerSearch.value = "";
    if (customerQuickSearch) customerQuickSearch.value = "";
    state.azLetters = [];
    state.customerLetterFilter = "";
    state.customerCandidateId = null;
    updateAzBarActive([]);

    const source = Array.isArray(state.customers) ? state.customers : [];
    if (source.length) {
      renderCustomerQuickPicker(source);
      if (customerResults) customerResults.hidden = false;
    } else if (customerResults) {
      customerResults.hidden = false;
      customerResults.innerHTML = `<div class="flocs-customerEmpty">No customers loaded yet.</div>`;
      customerResults._data = [];
      customerResults._allData = [];
    }

    if (customerStatus && !state.customer) {
      customerStatus.textContent = "Search reset. Start typing to find a customer.";
    } else if (customerStatus && state.customer) {
      customerStatus.textContent = `Selected: ${state.customer.name}`;
    }

    if (focus) {
      const quickInput = activeCustomerSearchInput();
      quickInput?.focus();
    }
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
      delivery === "free_shipping"
        ? 0
        : delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.subtotal ?? state.shippingQuote.total
        : null;
    const shippingBaseTotal =
      delivery === "free_shipping"
        ? 0
        : delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.baseTotal
        : null;
    const shippingService =
      delivery === "free_shipping"
        ? "Free Shipping"
        : delivery === "shipping" && state.shippingQuote
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

    const orderTags = parseOrderTags(state.orderTagsText);
    const invoiceEmail = resolveInvoiceEmail(state.customer);
    const payload = {
      customerId: state.customer.id,
      poNumber: state.po || null,
      orderTags,
      tags: orderTags,
      deliveryDate: state.deliveryDate || null,
      shippingMethod: delivery,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      vatNumber: state.customer?.vatNumber || null,
      companyName: state.customer?.companyName || null,
      invoiceEmail,
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
      delivery === "free_shipping"
        ? 0
        : delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.subtotal ?? state.shippingQuote.total
        : null;
    const shippingBaseTotal =
      delivery === "free_shipping"
        ? 0
        : delivery === "shipping" && state.shippingQuote
        ? state.shippingQuote.baseTotal
        : null;
    const shippingService =
      delivery === "free_shipping"
        ? "Free Shipping"
        : delivery === "shipping" && state.shippingQuote
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

    const orderTags = parseOrderTags(state.orderTagsText);
    const invoiceEmail = resolveInvoiceEmail(state.customer);
    const payload = {
      customerId: state.customer.id,
      poNumber: state.po || null,
      orderTags,
      tags: orderTags,
      deliveryDate: state.deliveryDate || null,
      shippingMethod: delivery,
      shippingPrice,
      shippingBaseTotal,
      shippingService,
      shippingQuoteNo,
      estimatedParcels,
      vatNumber: state.customer?.vatNumber || null,
      companyName: state.customer?.companyName || null,
      invoiceEmail,
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
      const openUrl = data.order?.adminUrl || null;
      if (openUrl) {
        window.open(openUrl, "_blank", "noopener");
      }
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
    state.customerSpecialization = { isHennies: false };
    state.priceTier = null;
    state.priceOverrides = {};
    state.priceOverrideEnabled = {};
    state.azLetters = [];
    state.customerLetterFilter = "";
    state.customerCandidateId = null;
    state.orderTagsText = "";
    state.productType = "combined";
    state.qtyMode = "units";
    state.cartonUnits = 12;

    if (customerSearch) customerSearch.value = "";
    if (customerQuickSearch) customerQuickSearch.value = "";
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
    if (clearCustomerBtn) {
      clearCustomerBtn.disabled = true;
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
    renderQuickQtyToggleButton();
    renderCustomerSegmentFilters();
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

  function maybeHandleDoubleSpaceQuickPicker(event) {
    if (event.key !== " " || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return false;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return false;
    const now = Date.now();
    state.spaceTapTimes = state.spaceTapTimes.filter((time) => now - time < 450);
    state.spaceTapTimes.push(now);
    if (state.spaceTapTimes.length >= 2) {
      state.spaceTapTimes = [];
      event.preventDefault();
      const quickInput = activeCustomerSearchInput();
      quickInput?.focus();
      if (customerResults) customerResults.hidden = false;
      return true;
    }
    return false;
  }

  // ===== EVENT WIRING =====
  function initEvents() {
    const syncChatSearchResetButton = () => {
      if (!chatSearchResetBtn) return;
      chatSearchResetBtn.disabled = customerSearchQuery().length === 0 && !state.customerLetterFilter;
    };

    syncChatSearchResetButton();

    if (customerSearch) {
      customerSearch.addEventListener("input", (event) => {
        state.customerLetterFilter = "";
        state.azLetters = [];
        updateAzBarActive([]);
        searchCustomersDebounced({ autoSelect: keyboardDrivenInput(event) });
        syncChatSearchResetButton();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (maybeHandleDoubleSpaceQuickPicker(e)) return;
      if (!shell || shell.closest("[hidden]")) return;
      const active = document.activeElement;
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
      const quickInput = activeCustomerSearchInput();
      if (!quickInput) return;
      e.preventDefault();
      quickInput.value = `${quickInput.value || ""}${e.key}`;
      state.customerLetterFilter = "";
      state.azLetters = [];
      updateAzBarActive([]);
      renderCustomerQuickPicker(customerResults?._allData || state.customers || []);
      autoSelectCustomerDebounced();
      customerResults.hidden = false;
      syncChatSearchResetButton();
      if (!quickInput.hidden) {
        quickInput.focus();
        quickInput.selectionStart = quickInput.value.length;
        quickInput.selectionEnd = quickInput.value.length;
      }
    });

    const handleCustomerSearchCommit = async (event) => {
      if (event.key !== "Enter" && event.key !== "Tab") return;
      const hasCandidate = Boolean(state.customerCandidateId) || Boolean(customerResults?._data?.length);
      if (!hasCandidate) return;
      event.preventDefault();
      await selectCurrentCustomerCandidate({ focusQty: true });
    };

    if (customerSearch) {
      customerSearch.addEventListener("keydown", handleCustomerSearchCommit);
    }

    if (customerQuickSearch) {
      customerQuickSearch.addEventListener("input", (event) => {
        state.customerLetterFilter = "";
        state.azLetters = [];
        updateAzBarActive([]);
        renderCustomerQuickPicker(customerResults?._allData || []);
        if (keyboardDrivenInput(event)) {
          autoSelectCustomerDebounced();
        }
        syncChatSearchResetButton();
      });
      customerQuickSearch.addEventListener("keydown", handleCustomerSearchCommit);
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
        await selectCustomerForInput(c, { focusQty: true });
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

    if (clearCustomerBtn) {
      clearCustomerBtn.addEventListener("click", () => {
        clearSelectedCustomer();
      });
    }

    if (resetSearchBtn) {
      resetSearchBtn.addEventListener("click", () => {
        resetCustomerSearch({ focus: true });
        syncChatSearchResetButton();
      });
    }

    if (chatSearchResetBtn) {
      chatSearchResetBtn.addEventListener("click", () => {
        resetCustomerSearch({ focus: true });
        syncChatSearchResetButton();
      });
    }

    if (customerCreateToggle) {
      customerCreateToggle.addEventListener("click", () => {
        const isHidden = customerCreatePanel?.hidden !== false;
        setCustomerCreateVisible(isHidden);
      });
    }

    if (customerSegmentFilters) {
      customerSegmentFilters.addEventListener("click", async (event) => {
        const button = event.target instanceof HTMLElement ? event.target.closest("button[data-segment]") : null;
        if (!button) return;
        const nextSegment = normalizeCustomerSegmentFilter(button.dataset.segment || "");
        if (state.loadingCustomers) return;
        state.customerSegment = nextSegment;
        state.customerLetterFilter = "";
        state.azLetters = [];
        state.customerCandidateId = null;
        if (customerSearch) customerSearch.value = "";
        if (customerQuickSearch) customerQuickSearch.value = "";
        if (customerProvinceFilter) customerProvinceFilter.value = "";
        updateAzBarActive([]);
        renderCustomerSegmentFilters();
        await searchCustomersNow();
        syncChatSearchResetButton();
      });
    }

    if (invoice) {
      invoice.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.id === "flocs-invoice-po" && target instanceof HTMLInputElement) {
          state.po = target.value || "";
          validate();
          return;
        }
        if (target.id === "flocs-invoice-delivery-date" && target instanceof HTMLInputElement) {
          state.deliveryDate = target.value || "";
          return;
        }
        if (target.id === "flocs-invoice-tags" && target instanceof HTMLInputElement) {
          state.orderTagsText = target.value || "";
          return;
        }
      });
      invoice.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.id === "flocs-invoice-po" && target instanceof HTMLInputElement) {
          state.po = target.value || "";
          renderInvoice();
          validate();
          return;
        }
        if (target.id === "flocs-invoice-delivery-date" && target instanceof HTMLInputElement) {
          state.deliveryDate = target.value || "";
          renderInvoice();
          return;
        }
        if (target.id === "flocs-invoice-shipAddress" && target instanceof HTMLSelectElement) {
          if (!state.customer) return;
          state.shippingAddressIndex = target.value === "" ? null : Number(target.value);
          renderCustomerChips();
          renderInvoice();
          validate();
          scheduleAutoQuote();
          return;
        }
        if (target.id === "flocs-invoice-billAddress" && target instanceof HTMLSelectElement) {
          if (!state.customer) return;
          state.billingAddressIndex = target.value === "" ? null : Number(target.value);
          renderCustomerChips();
          renderInvoice();
          validate();
        }
      });
      invoice.addEventListener("click", (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest("#flocs-invoice-quoteNow") : null;
        if (!target) return;
        requestShippingQuote();
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
            state.delivery === "free_shipping"
              ? "Free Shipping selected — shipping cost will be R0."
              : "No courier shipping for pickup/delivery.";
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
        applyQtyAction(action, key, Number(btn.dataset.amount || 0));
      });

      productsBody.addEventListener("keydown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.classList.contains("flocs-qtyInput")) return;
        if (event.key !== "Tab") return;
        const inputs = Array.from(productsBody.querySelectorAll(".flocs-qtyInput"));
        if (!inputs.length) return;
        const currentIndex = inputs.indexOf(target);
        if (currentIndex < 0) return;
        event.preventDefault();
        if (event.shiftKey) {
          const prev = inputs[currentIndex - 1];
          if (prev) {
            prev.focus();
            prev.select();
            return;
          }
          target.focus();
          target.select();
          return;
        }
        const next = inputs[currentIndex + 1];
        if (next) {
          next.focus();
          next.select();
          return;
        }
        const invoiceTarget = firstInvoiceInputTarget();
        if (invoiceTarget instanceof HTMLElement) {
          invoiceTarget.focus();
        }
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

    if (clearAllQtyBtn) {
      clearAllQtyBtn.addEventListener("click", () => {
        state.items = {};
        renderProductsTable();
        renderInvoice();
        validate();
        scheduleAutoQuote();
      });
    }

    if (quickQtyToggleBtn) {
      quickQtyToggleBtn.addEventListener("click", () => {
        state.showQuickQtyButtons = !state.showQuickQtyButtons;
        renderProductsTable();
      });
    }

    if (bulkColumnsToggle) {
      bulkColumnsToggle.addEventListener("change", () => {
        state.showBulkColumns = Boolean(bulkColumnsToggle.checked);
        renderProductsTable();
      });
    }

    if (azBar) {
      azBar.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-letter]");
        if (!btn) return;
        const letter = String(btn.dataset.letter || "")
          .toUpperCase()
          .trim();
        if (!letter) return;
        const current = String(state.customerLetterFilter || "").toUpperCase();
        const nextLetter = current === letter ? "" : letter;
        state.customerLetterFilter = nextLetter;
        state.azLetters = nextLetter ? [nextLetter] : [];
        if (customerSearch) customerSearch.value = "";
        if (customerQuickSearch) customerQuickSearch.value = "";
        updateAzBarActive(state.azLetters);
        renderCustomerQuickPicker(customerResults?._allData || state.customers || []);
        syncChatSearchResetButton();
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
  async function boot() {
    renderCustomerSegmentFilters();
    renderProductsTable();
    resetForm();
    await loadUiConfig();
    await initCustomerAddressAutocomplete();
    hydratePriceTiersForProducts(state.products);
    initEvents();
    await preloadCustomers();
  }

  await boot();
  })();
  return flocsInitPromise;
}
