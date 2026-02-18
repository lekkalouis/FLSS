import { PRODUCT_LIST } from "./views/products.js";

const API_BASE = "/api/v1/shopify";
const VAT_RATE = 0.15;
const SEGMENTS = ["all", "agent", "retailer", "export"];
const DEFAULT_PAYMENT_TERMS = ["Due on delivery", "7 days", "30 days", "60 days", "90 days"];
const PAGE_MODE = new URLSearchParams(window.location.search).get("mode") === "standalone" ? "standalone" : "internal";

const $ = (id) => document.getElementById(id);
const els = {
  orderDate: $("order-date"),
  poNumber: $("po-number"),
  paymentTerms: $("payment-terms"),
  orderWeight: $("order-weight"),
  estimatedParcels: $("estimated-parcels"),

  customerAccessRow: $("customer-access-row"),
  customerAccessCode: $("customer-access-code"),
  customerAccessLoad: $("customer-access-load"),

  customerSearch: $("customer-search"),
  customerSearchBtn: $("customer-search-btn"),
  quickPickerBtn: $("quick-picker-btn"),
  deliveryTypeSelect: $("delivery-type-select"),
  customerTier: $("customer-tier"),
  clearForm: $("clear-form"),
  customerStatus: $("customer-status"),
  customerResults: $("customer-results"),

  quickPicker: $("quick-picker"),
  quickPickerClose: $("quick-picker-close"),
  quickPickerSegments: $("quick-picker-segments"),
  quickPickerGrid: $("quick-picker-grid"),
  quickPickerSort: $("quick-picker-sort"),
  quickPickerProvince: $("quick-picker-province"),
  quickPickerSearch: $("quick-picker-search"),

  productBody: $("product-body"),
  selectedCount: $("selected-count"),
  orderTotal: $("order-total"),
  subtotalTotal: $("subtotal-total"),
  shippingTotal: $("shipping-total"),
  vatTotal: $("vat-total"),
  grandTotal: $("grand-total"),

  submitOrder: $("submit-order"),
  submitDraftOrder: $("submit-draft-order"),
  submitLoader: $("submit-loader"),
  printForm: $("print-form"),
  orderStatus: $("order-status"),

  customerFirstName: $("customer-first-name"),
  customerLastName: $("customer-last-name"),
  customerEmail: $("customer-email"),
  customerPhone: $("customer-phone"),

  billCompany: $("bill-company"),
  billName: $("bill-name"),
  billAddress1: $("bill-address1"),
  billAddress2: $("bill-address2"),
  billSuburb: $("bill-suburb"),
  billCity: $("bill-city"),
  billProvince: $("bill-province"),
  billZip: $("bill-zip"),
  billPhone: $("bill-phone"),
  billVat: $("bill-vat"),

  shipCompany: $("ship-company"),
  shipName: $("ship-name"),
  shipAddress1: $("ship-address1"),
  shipAddress2: $("ship-address2"),
  shipSuburb: $("ship-suburb"),
  shipCity: $("ship-city"),
  shipProvince: $("ship-province"),
  shipZip: $("ship-zip"),
  shipPhone: $("ship-phone"),
  shipNotes: $("ship-notes")
};

const state = {
  customers: [],
  visibleCustomers: [],
  activeSegment: "all",
  quickSort: "name",
  quickProvince: "",
  quickSearch: "",
  selectedCustomer: null,
  qtyBySku: new Map(),
  nextPageInfo: null,
  lastSearchQuery: "",
  customerLoadMode: "recent",
  shippingQuote: null,
  shippingQuotePending: false,
  deliveryTypeOverride: "",
  spaceTapTimes: [],
  paymentTermOptions: [...DEFAULT_PAYMENT_TERMS],
  accessLockedCustomerId: null
};

function parseTags(rawTags) {
  if (!rawTags) return [];
  if (Array.isArray(rawTags)) {
    return rawTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  }
  return String(rawTags)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function customerSegment(customer) {
  const tags = parseTags(customer?.tags);
  if (tags.includes("online")) return "online";
  if (tags.includes("agent")) return "agent";
  if (tags.includes("retailer") || tags.includes("retail")) return "retailer";
  if (tags.includes("export")) return "export";
  if (tags.includes("local")) return "local";
  if (tags.includes("private")) return "private";
  return "retailer";
}


function normalizePriceTiers(product) {
  if (!product) return null;
  const raw = product.priceTiers || product.prices || null;
  if (!raw || typeof raw !== "object") return null;
  return { ...raw };
}

function resolveTierValue(tiers, tier) {
  if (!tiers || !tier) return null;
  const aliases = { retail: ["retail", "retailer"], retailer: ["retailer", "retail"] };
  const keys = aliases[tier] || [tier];
  for (const key of keys) {
    const numeric = Number(tiers[key]);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function customerTier(customer) {
  const selectedTier = String(els.customerTier?.value || "").trim().toLowerCase();
  if (selectedTier) return selectedTier;
  const explicit = String(customer?.tier || "").trim().toLowerCase();
  if (explicit) return explicit;
  const tags = parseTags(customer?.tags);
  const tiers = ["agent", "retailer", "retail", "export", "fkb", "public"];
  return tiers.find((tag) => tags.includes(tag)) || null;
}

function unitPriceForProduct(product) {
  const tiers = normalizePriceTiers(product);
  const tier = customerTier(state.selectedCustomer);
  if (tiers && tier) {
    const tierValue = resolveTierValue(tiers, tier);
    if (tierValue != null) return tierValue;
  }
  if (tiers) {
    const fallback = ["default", "standard", "retail", "public"].map((k) => Number(tiers[k])).find((v) => Number.isFinite(v));
    if (Number.isFinite(fallback)) return fallback;
  }
  const legacy = Number(product?.prices?.retail);
  return Number.isFinite(legacy) ? legacy : 0;
}


async function hydratePriceTiers() {
  try {
    const variantIds = PRODUCT_LIST.filter((p) => p.variantId).map((p) => p.variantId);
    if (!variantIds.length) return;
    const response = await fetch(`${API_BASE}/variants/price-tiers/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variantIds })
    });
    const payload = await response.json();
    if (!response.ok) return;
    const tiersByVariantId = payload?.priceTiersByVariantId || {};
    PRODUCT_LIST.forEach((product) => {
      const tiers = tiersByVariantId[String(product.variantId || "")];
      if (tiers && typeof tiers === "object") product.priceTiers = tiers;
    });
    buildProductTable();
    renderSummary();
    scheduleShippingQuote();
  } catch (error) {
    console.warn("Price tier hydration failed", error);
  }
}

function shippingEstimate() {
  if (state.shippingQuote && Number.isFinite(Number(state.shippingQuote.total))) {
    return Number(state.shippingQuote.total);
  }
  const segment = customerSegment(state.selectedCustomer);
  if (segment === "local") return 0;
  const subtotal = selectedLineItems().reduce((sum, line) => sum + line.quantity * Number(line.price || 0), 0);
  if (!subtotal) return 0;
  const base = subtotal >= 2000 ? 120 : 180;
  return base;
}

function roundUpToNearestFive(amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 5) * 5;
}

function quotedShippingRounded() {
  return roundUpToNearestFive(shippingEstimate());
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? `R${n.toFixed(2)}` : "R0.00";
}

function setStatus(el, message, tone = "") {
  if (!el) return;
  el.className = `status${tone ? ` ${tone}` : ""}`;
  el.textContent = message;
}

function buildProductTable() {
  const products = PRODUCT_LIST.filter((product) => product.variantId && product.prices?.retail != null);
  els.productBody.innerHTML = products
    .map(
      (product) => `<tr>
      <td>${product.sku}</td>
      <td>${product.title}</td>
      <td>${money(unitPriceForProduct(product))}</td>
      <td data-line="${product.sku}">${money(0)}</td>
      <td><input class="qty" type="number" min="0" step="1" value="0" data-sku="${product.sku}" /></td>
    </tr>`
    )
    .join("");
}

function selectedLineItems() {
  return PRODUCT_LIST.filter((product) => {
    const qty = Number(state.qtyBySku.get(product.sku) || 0);
    return product.variantId && qty > 0;
  }).map((product) => ({
    variantId: product.variantId,
    sku: product.sku,
    title: product.title,
    price: unitPriceForProduct(product),
    quantity: Number(state.qtyBySku.get(product.sku) || 0)
  }));
}

function computeTotalWeightKg(lineItems = selectedLineItems()) {
  const total = lineItems.reduce((sum, line) => {
    const product = PRODUCT_LIST.find((entry) => entry.sku === line.sku);
    const unitWeight = Number(product?.weightKg || 0);
    return sum + unitWeight * Number(line.quantity || 0);
  }, 0);
  return total > 0 ? total : 0;
}

function computeEstimatedParcels(lineItems = selectedLineItems()) {
  const totalWeightKg = computeTotalWeightKg(lineItems);
  const boxes = Math.ceil(totalWeightKg * 0.051 + 0.5);
  return Math.max(boxes, 0);
}

function renderOrderWeightSummary(lineItems = selectedLineItems()) {
  const totalWeightKg = computeTotalWeightKg(lineItems);
  const estimatedParcels = computeEstimatedParcels(lineItems);
  if (els.orderWeight) els.orderWeight.textContent = `${totalWeightKg.toFixed(2)} kg`;
  if (els.estimatedParcels) els.estimatedParcels.textContent = String(estimatedParcels);
}

function updatePaymentTermsOptions(options = state.paymentTermOptions, preferredValue = "") {
  if (!els.paymentTerms) return;
  const unique = Array.from(new Set((Array.isArray(options) ? options : []).map((v) => String(v || "").trim()).filter(Boolean)));
  state.paymentTermOptions = unique.length ? unique : [...DEFAULT_PAYMENT_TERMS];
  const current = preferredValue || els.paymentTerms.value || "";
  els.paymentTerms.innerHTML =
    `<option value="">Payment terms (optional)</option>` +
    state.paymentTermOptions.map((value) => `<option value="${value}">${value}</option>`).join("");
  if (current && state.paymentTermOptions.includes(current)) {
    els.paymentTerms.value = current;
  } else {
    els.paymentTerms.value = current || "";
  }
}


function currentDeliveryType() {
  const override = String(state.deliveryTypeOverride || "").trim().toLowerCase();
  if (override) return override;
  return resolveShippingMethodForCustomer(state.selectedCustomer);
}

function scheduleShippingQuote() {
  if (state.shippingQuotePending) return;
  const lineItems = selectedLineItems();
  const deliveryType = currentDeliveryType();
  if (!lineItems.length || deliveryType !== "shipping") {
    state.shippingQuote = null;
    renderSummary();
    return;
  }
  const addr = shippingAddressPayload();
  if (!addr.city || !addr.zip || !addr.address1) {
    state.shippingQuote = null;
    return;
  }
  state.shippingQuotePending = true;
  setStatus(els.orderStatus, "Calculating ParcelPerfect shipping…");
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
    notes: "Custom order quote",
    destpers: addr.name || state.selectedCustomer?.name || "Customer",
    destperadd1: addr.address1 || "",
    destperadd2: addr.address2 || "",
    destperadd3: addr.city || "",
    destperadd4: addr.province || "",
    destperpcode: addr.zip || "",
    desttown: addr.city || "",
    destplace: 4663,
    destpercontact: addr.name || "",
    destperphone: addr.phone || "",
    destpercell: addr.phone || "",
    destperemail: state.selectedCustomer?.email || "",
    notifydestpers: 1
  };
  const weightKg = Math.max(1, lineItems.reduce((sum, line) => sum + Number(line.quantity || 0) * 0.2, 0));
  fetch("/api/v1/pp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "requestQuote",
      classVal: "Quote",
      params: {
        details,
        contents: [{ item: 1, pieces: 1, dim1: 40, dim2: 40, dim3: 30, actmass: Number(weightKg.toFixed(2)) }]
      }
    })
  })
    .then((res) => res.json().catch(() => ({})))
    .then((data) => {
      const rates = Array.isArray(data?.results?.[0]?.rates) ? data.results[0].rates : Array.isArray(data?.rates) ? data.rates : [];
      const pick = rates.find((r) => ["RFX", "ECO", "RDF"].includes(String(r?.service || "").toUpperCase())) || rates[0];
      const total = Number(pick?.subtotal ?? pick?.total ?? pick?.charge ?? 0);
      state.shippingQuote = Number.isFinite(total) ? { total, service: pick?.service || null } : null;
      if (state.shippingQuote) setStatus(els.orderStatus, `Shipping updated (${state.shippingQuote.service || "SWE"}).`, "ok");
      renderSummary();
    })
    .catch((error) => {
      console.warn("ParcelPerfect quote failed", error);
      state.shippingQuote = null;
      setStatus(els.orderStatus, "Shipping quote unavailable; using fallback estimate.", "warn");
      renderSummary();
    })
    .finally(() => {
      state.shippingQuotePending = false;
    });
}

function renderSummary() {
  const lines = selectedLineItems();
  let subtotal = 0;
  lines.forEach((line) => {
    const lineTotal = line.quantity * Number(line.price || 0);
    subtotal += lineTotal;
    const lineCell = document.querySelector(`[data-line="${line.sku}"]`);
    if (lineCell) lineCell.textContent = money(lineTotal);
  });
  PRODUCT_LIST.forEach((product) => {
    const qty = Number(state.qtyBySku.get(product.sku) || 0);
    if (!qty) {
      const lineCell = document.querySelector(`[data-line="${product.sku}"]`);
      if (lineCell) lineCell.textContent = money(0);
    }
  });

  els.selectedCount.textContent = `${lines.length} products selected`;
  const shipping = quotedShippingRounded();
  const vat = (subtotal + shipping) * VAT_RATE;
  const grand = subtotal + shipping + vat;
  els.orderTotal.textContent = money(subtotal);
  els.subtotalTotal.textContent = money(subtotal);
  els.shippingTotal.textContent = money(shipping);
  els.vatTotal.textContent = money(vat);
  els.grandTotal.textContent = money(grand);
  renderOrderWeightSummary(lines);
}

function billingAddressPayload() {
  return {
    company: els.billCompany.value.trim() || undefined,
    name: els.billName.value.trim() || undefined,
    address1: els.billAddress1.value.trim() || undefined,
    address2: els.billAddress2.value.trim() || undefined,
    city: els.billCity.value.trim() || undefined,
    province: els.billProvince.value.trim() || undefined,
    zip: els.billZip.value.trim() || undefined,
    phone: els.billPhone.value.trim() || undefined
  };
}

function shippingAddressPayload() {
  return {
    company: els.shipCompany.value.trim() || undefined,
    name: els.shipName.value.trim() || undefined,
    address1: els.shipAddress1.value.trim() || undefined,
    address2: els.shipAddress2.value.trim() || undefined,
    city: els.shipCity.value.trim() || undefined,
    province: els.shipProvince.value.trim() || undefined,
    zip: els.shipZip.value.trim() || undefined,
    phone: els.shipPhone.value.trim() || undefined
  };
}


async function hydrateCustomerCustomFields(customer) {
  if (!customer?.id || customer.customFieldsLoaded) return customer;
  try {
    const response = await fetch(`${API_BASE}/customers/${encodeURIComponent(customer.id)}/metafields`);
    const payload = await response.json();
    if (!response.ok) return customer;
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

function applyAddressFields(customer) {
  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
  const first = addresses[0] || customer?.default_address || {};

  els.billCompany.value = first.company || "";
  els.billName.value = `${first.first_name || ""} ${first.last_name || ""}`.trim();
  els.billAddress1.value = first.address1 || "";
  els.billAddress2.value = first.address2 || "";
  els.billSuburb.value = first.address2 || "";
  els.billCity.value = first.city || "";
  els.billProvince.value = first.province || "";
  els.billZip.value = first.zip || "";
  els.billPhone.value = customer?.phone || first.phone || "";
  if (els.customerFirstName) els.customerFirstName.value = first.first_name || "";
  if (els.customerLastName) els.customerLastName.value = first.last_name || "";
  if (els.customerEmail) els.customerEmail.value = customer?.email || "";
  if (els.customerPhone) els.customerPhone.value = customer?.phone || first.phone || "";

  els.shipCompany.value = first.company || "";
  els.shipName.value = `${first.first_name || ""} ${first.last_name || ""}`.trim();
  els.shipAddress1.value = first.address1 || "";
  els.shipAddress2.value = first.address2 || "";
  els.shipSuburb.value = first.address2 || "";
  els.shipCity.value = first.city || "";
  els.shipProvince.value = first.province || "";
  els.shipZip.value = first.zip || "";
  els.shipPhone.value = customer?.phone || first.phone || "";
  updatePaymentTermsOptions(state.paymentTermOptions, customer?.paymentTerms || "");
  const preferredDelivery = String(customer?.delivery_type || customer?.delivery_method || "").trim().toLowerCase();
  if (els.deliveryTypeSelect) {
    const normalized = ["shipping", "pickup", "delivery", "local"].includes(preferredDelivery) ? preferredDelivery : "";
    if (!state.deliveryTypeOverride) els.deliveryTypeSelect.value = normalized;
  }
  if (els.customerTier) {
    els.customerTier.value = customerTier(customer) || "public";
  }
}

function resetForm({ keepCustomerSearch = true } = {}) {
  state.selectedCustomer = null;
  state.qtyBySku.clear();
  state.shippingQuote = null;
  state.deliveryTypeOverride = "";
  if (els.customerTier) els.customerTier.value = "public";
  if (els.deliveryTypeSelect) els.deliveryTypeSelect.value = "";
  if (els.poNumber) els.poNumber.value = "";
  updatePaymentTermsOptions(state.paymentTermOptions, "");
  if (els.billCompany) els.billCompany.value = "";
  if (els.billName) els.billName.value = "";
  if (els.billAddress1) els.billAddress1.value = "";
  if (els.billAddress2) els.billAddress2.value = "";
  if (els.billSuburb) els.billSuburb.value = "";
  if (els.billCity) els.billCity.value = "";
  if (els.billProvince) els.billProvince.value = "";
  if (els.billZip) els.billZip.value = "";
  if (els.billPhone) els.billPhone.value = "";
  if (els.billVat) els.billVat.value = "";
  if (els.shipCompany) els.shipCompany.value = "";
  if (els.shipName) els.shipName.value = "";
  if (els.shipAddress1) els.shipAddress1.value = "";
  if (els.shipAddress2) els.shipAddress2.value = "";
  if (els.shipSuburb) els.shipSuburb.value = "";
  if (els.shipCity) els.shipCity.value = "";
  if (els.shipProvince) els.shipProvince.value = "";
  if (els.shipZip) els.shipZip.value = "";
  if (els.shipPhone) els.shipPhone.value = "";
  if (els.shipNotes) els.shipNotes.value = "";
  if (els.customerFirstName) els.customerFirstName.value = "";
  if (els.customerLastName) els.customerLastName.value = "";
  if (els.customerEmail) els.customerEmail.value = "";
  if (els.customerPhone) els.customerPhone.value = "";
  if (!keepCustomerSearch && els.customerSearch) els.customerSearch.value = "";
  renderSummary();
  buildProductTable();
  setStatus(els.orderStatus, "Form cleared.", "ok");
  if (els.customerFirstName) els.customerFirstName.focus();
}

async function loadPaymentTermsOptions() {
  try {
    const response = await fetch(`${API_BASE}/payment-terms/options`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "Unable to load payment terms options");
    const options = Array.isArray(data?.options) ? data.options : [];
    updatePaymentTermsOptions(options, els.paymentTerms?.value || "");
  } catch {
    updatePaymentTermsOptions(DEFAULT_PAYMENT_TERMS, els.paymentTerms?.value || "");
  }
}

function enforceModeUI() {
  if (PAGE_MODE === "standalone") {
    if (els.customerAccessRow) els.customerAccessRow.hidden = false;
    if (els.quickPickerBtn) els.quickPickerBtn.hidden = true;
    if (els.customerResults) els.customerResults.hidden = true;
    if (els.customerSearch) els.customerSearch.hidden = true;
    setStatus(els.customerStatus, "Enter your access code to load your account.");
    return;
  }
  if (els.customerAccessRow) els.customerAccessRow.hidden = true;
  if (els.customerResults) els.customerResults.hidden = false;
}

async function loadCustomerByAccessCode() {
  const code = String(els.customerAccessCode?.value || "").trim();
  if (!code) {
    setStatus(els.customerStatus, "Enter your access code first.", "warn");
    return;
  }
  setStatus(els.customerStatus, "Loading customer profile...");
  try {
    const params = new URLSearchParams({ code });
    const response = await fetch(`${API_BASE}/customers/by-access-code?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || "Access code lookup failed");
    const customer = data?.customer || null;
    if (!customer?.id) throw new Error("No customer linked to this access code.");
    state.accessLockedCustomerId = String(customer.id);
    state.customers = mergeCustomers(state.customers, [customer]);
    applySelectedCustomer(customer);
    if (els.customerTier) els.customerTier.disabled = true;
    if (els.customerFirstName) els.customerFirstName.disabled = true;
    if (els.customerLastName) els.customerLastName.disabled = true;
    if (els.customerEmail) els.customerEmail.disabled = true;
    if (els.customerPhone) els.customerPhone.disabled = true;
    setStatus(els.customerStatus, `Loaded ${customer.name || customer.email || "customer"}.`, "ok");
  } catch (error) {
    console.error(error);
    setStatus(els.customerStatus, error.message || "Unable to load access code.", "err");
  }
}

function maybeHandleDoubleSpaceClear(event) {
  if (event.key !== " " || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return false;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return false;
  const now = Date.now();
  state.spaceTapTimes = state.spaceTapTimes.filter((time) => now - time < 450);
  state.spaceTapTimes.push(now);
  if (state.spaceTapTimes.length >= 2) {
    state.spaceTapTimes = [];
    event.preventDefault();
    resetForm({ keepCustomerSearch: true });
    return true;
  }
  return false;
}

async function createCustomerForOrderIfNeeded() {
  if (state.selectedCustomer?.id) return state.selectedCustomer;
  if (PAGE_MODE === "standalone") {
    throw new Error("Load your customer profile with your access code first.");
  }
  throw new Error("Select a customer first.");
}

function renderCustomerOptions(customers) {
  state.visibleCustomers = customers;
  if (!customers.length) {
    els.customerResults.innerHTML = "";
    state.selectedCustomer = null;
    return;
  }
  els.customerResults.innerHTML = customers
    .map((customer, index) => {
      const label = `${customer.name || "Unnamed"} · ${customer.companyName || customer.email || customer.phone || "No contact"}`;
      return `<option value="${index}">${label}</option>`;
    })
    .join("");
  const selectedId = String(state.selectedCustomer?.id || "");
  const selectedIndex = customers.findIndex((customer) => String(customer?.id || "") === selectedId);
  const resolvedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  els.customerResults.value = String(resolvedIndex);
  const resolvedCustomer = customers[resolvedIndex];
  if (!state.selectedCustomer || String(state.selectedCustomer.id || "") !== String(resolvedCustomer?.id || "")) {
    state.selectedCustomer = resolvedCustomer;
    applyAddressFields(state.selectedCustomer);
  }
  renderSummary();
}

function customerProvince(customer) {
  const first = (Array.isArray(customer?.addresses) ? customer.addresses[0] : null) || customer?.default_address || {};
  return String(first?.province || "").trim();
}

function customerCity(customer) {
  const first = (Array.isArray(customer?.addresses) ? customer.addresses[0] : null) || customer?.default_address || {};
  return String(first?.city || "").trim();
}

function filteredCustomers() {
  const list = Array.isArray(state.customers) ? state.customers : [];
  let next = list.filter((customer) => !["online", "private"].includes(customerSegment(customer)));
  if (state.activeSegment !== "all") next = next.filter((customer) => customerSegment(customer) === state.activeSegment);
  if (state.quickProvince) {
    next = next.filter((customer) => customerProvince(customer).toLowerCase() === state.quickProvince.toLowerCase());
  }
  const q = state.quickSearch.trim().toLowerCase();
  if (q) {
    next = next.filter((customer) => {
      const hay = [customer?.name, customer?.companyName, customerCity(customer), customerProvince(customer)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  next.sort((a, b) => {
    const aValue = state.quickSort === "city" ? customerCity(a) || a?.name || "" : a?.name || "";
    const bValue = state.quickSort === "city" ? customerCity(b) || b?.name || "" : b?.name || "";
    return String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base" });
  });
  return next;
}

function renderSegmentControls() {
  const html = SEGMENTS.map((segment) => {
    const label = segment === "all" ? "All" : segment[0].toUpperCase() + segment.slice(1);
    const active = segment === state.activeSegment ? "active" : "";
    return `<button type="button" class="${active}" data-segment="${segment}">${label}</button>`;
  }).join("");
  if (els.quickPickerSegments) els.quickPickerSegments.innerHTML = html;
}

function renderQuickPicker() {
  const list = filteredCustomers();
  state.visibleCustomers = list;
  if (!list.length) {
    els.quickPickerGrid.innerHTML = `<div class="searchHint">No customers in this segment.</div>`;
    return;
  }
  els.quickPickerGrid.innerHTML = list
    .map((customer, idx) => {
      const segment = customerSegment(customer);
      return `<button type="button" class="customerTile" data-pick="${idx}">
        <strong>${customer.name || "Unnamed"}</strong>
        <small>${customer.companyName || customerCity(customer) || customerProvince(customer) || customer.phone || "No contact"}</small>
        <small>${segment.toUpperCase()}</small>
      </button>`;
    })
    .join("");
}

function renderProvinceFilterOptions() {
  const provinces = Array.from(new Set((state.customers || []).map(customerProvince).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  els.quickPickerProvince.innerHTML = `<option value="">All provinces</option>` + provinces.map((p)=>`<option value="${p}">${p}</option>`).join("");
  els.quickPickerProvince.value = state.quickProvince;
}

function openQuickPicker() {
  renderQuickPicker();
  els.quickPicker.hidden = false;
}

function closeQuickPicker() {
  els.quickPicker.hidden = true;
}

function applySelectedCustomer(customer) {
  if (!customer) return;
  state.selectedCustomer = customer;
  applyAddressFields(customer);
  buildProductTable();
  const all = filteredCustomers();
  const idx = all.findIndex((entry) => Number(entry.id) === Number(customer.id));
  if (idx >= 0) {
    renderCustomerOptions(all);
    els.customerResults.value = String(idx);
    state.selectedCustomer = all[idx];
    applyAddressFields(state.selectedCustomer);
    buildProductTable();
  }
  renderSummary();

  hydrateCustomerCustomFields(customer).then((hydrated) => {
    if (!hydrated || Number(hydrated.id) !== Number(state.selectedCustomer?.id)) return;
    state.selectedCustomer = hydrated;
    applyAddressFields(hydrated);
    buildProductTable();
    renderSummary();
    scheduleShippingQuote();
  });
}


function mergeCustomers(existing = [], incoming = []) {
  const map = new Map();
  [...existing, ...incoming].forEach((c) => {
    if (!c?.id) return;
    map.set(String(c.id), c);
  });
  return Array.from(map.values());
}

async function preloadCustomers() {
  if (PAGE_MODE === "standalone") {
    setStatus(els.customerStatus, "Enter your access code to load your profile.");
    return;
  }
  setStatus(els.customerStatus, "Loading recent customers...");
  try {
    const response = await fetch(`${API_BASE}/customers/recent?limit=100`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || "Unable to preload customers");
    state.customerLoadMode = "recent";
    state.lastSearchQuery = "";
    state.nextPageInfo = data.nextPageInfo || null;
    state.customers = Array.isArray(data.customers) ? data.customers : [];
    renderSegmentControls();
    renderProvinceFilterOptions();
    const initial = filteredCustomers();
    renderCustomerOptions(initial);
    renderQuickPicker();
    setStatus(els.customerStatus, `Loaded ${state.customers.length} recent customer(s).`, "ok");
  } catch (error) {
    console.error(error);
    setStatus(els.customerStatus, "Recent list unavailable. Search by name/email.", "warn");
  }
}

let searchTimer = null;

async function searchCustomers() {
  const q = els.customerSearch.value.trim();
  if (!q) {
    setStatus(els.customerStatus, "Enter a search term first.", "warn");
    return;
  }

  setStatus(els.customerStatus, "Searching Shopify customers...");
  try {
    const params = new URLSearchParams({ q, limit: "100" });
    const response = await fetch(`${API_BASE}/customers/search?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || "Customer search failed");

    state.customerLoadMode = "search";
    state.lastSearchQuery = q;
    state.nextPageInfo = data.nextPageInfo || null;
    state.customers = Array.isArray(data.customers) ? data.customers : [];
    renderSegmentControls();
    renderProvinceFilterOptions();
    const visible = filteredCustomers();
    renderCustomerOptions(visible);
    renderQuickPicker();
    if (!state.customers.length) {
      state.selectedCustomer = null;
      setStatus(els.customerStatus, "No customers found.", "warn");
      return;
    }
    setStatus(els.customerStatus, `Loaded ${state.customers.length} customer(s).`, "ok");
  } catch (error) {
    console.error(error);
    setStatus(els.customerStatus, error.message || "Customer search failed.", "err");
  }
}


function resolveShippingMethodForCustomer(customer) {
  const tags = parseTags(customer?.tags);
  if (tags.includes("local")) return "local";
  const preferred = String(customer?.delivery_type || customer?.delivery_method || "").trim().toLowerCase();
  if (["pickup", "delivery", "local", "shipping"].includes(preferred)) return preferred;
  return "shipping";
}

function getOrderPayload(customer, lineItems) {
  const shippingRounded = quotedShippingRounded();
  const shippingService = state.shippingQuote?.service || "Courier";
  const estimatedParcels = computeEstimatedParcels(lineItems);

  const payload = {
    customerId: customer.id,
    priceTier: els.customerTier?.value || undefined,
    poNumber: els.poNumber.value.trim() || undefined,
    deliveryDate: els.orderDate.value || undefined,
    shippingMethod: currentDeliveryType(),
    shippingPrice: shippingRounded,
    shippingBaseTotal: shippingRounded,
    shippingService,
    estimatedParcels,
    billingAddress: billingAddressPayload(),
    shippingAddress: shippingAddressPayload(),
    lineItems,
    companyName: els.billCompany.value.trim() || undefined,
    vatNumber: els.billVat.value.trim() || undefined,
    paymentTerms: els.paymentTerms?.value?.trim() || undefined,
    customerTags: customer.tags || ""
  };

  const shipNotes = els.shipNotes.value.trim();
  if (shipNotes) payload.poNumber = payload.poNumber ? `${payload.poNumber} | ${shipNotes}` : shipNotes;
  return payload;
}

async function submitLiveOrDraft(kind = "live") {
  const lineItems = selectedLineItems();
  if (!lineItems.length) {
    setStatus(els.orderStatus, "Enter quantities for at least one product.", "err");
    return;
  }

  const isDraft = kind === "draft";
  const button = isDraft ? els.submitDraftOrder : els.submitOrder;
  const originalLabel = button?.textContent || "";
  if (button) button.disabled = true;
  if (els.submitLoader) els.submitLoader.hidden = false;
  setStatus(els.orderStatus, isDraft ? "Creating draft order..." : "Creating order...");

  try {
    const customer = await createCustomerForOrderIfNeeded();
    const payload = getOrderPayload(customer, lineItems);
    const endpoint = isDraft ? `${API_BASE}/draft-orders` : `${API_BASE}/orders`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || data?.error || (isDraft ? "Failed to create draft order" : "Failed to create order"));
    }

    if (isDraft) {
      setStatus(els.orderStatus, `Draft order created (${data.draftOrder?.name || data.draftOrder?.id || "OK"}).`, "ok");
    } else {
      setStatus(els.orderStatus, `Order created (${data.order?.name || data.order?.id || "OK"}).`, "ok");
    }
  } catch (error) {
    console.error(error);
    setStatus(els.orderStatus, error.message || "Unable to submit order.", "err");
  } finally {
    if (button) {
      button.disabled = false;
      if (originalLabel) button.textContent = originalLabel;
    }
    if (els.submitLoader) els.submitLoader.hidden = true;
  }
}

async function submitOrder() {
  await submitLiveOrDraft("live");
}

async function submitDraftOrder() {
  await submitLiveOrDraft("draft");
}

function wireEvents() {
  els.productBody.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches(".qty[data-sku]")) return;
    const sku = target.dataset.sku;
    const qty = Math.max(0, Number(target.value || 0));
    state.qtyBySku.set(sku, Math.floor(qty));
    if (String(Math.floor(qty)) !== target.value) target.value = String(Math.floor(qty));
    renderSummary();
    scheduleShippingQuote();
  });

  els.customerSearchBtn?.addEventListener("click", searchCustomers);
  els.deliveryTypeSelect?.addEventListener("change", () => {
    state.deliveryTypeOverride = els.deliveryTypeSelect.value || "";
    state.shippingQuote = null;
    renderSummary();
    scheduleShippingQuote();
  });
  els.customerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchCustomers();
    }
  });
  els.customerSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchCustomers();
      openQuickPicker();
    }, 350);
  });

  document.addEventListener("keydown", (event) => {
    if (maybeHandleDoubleSpaceClear(event)) return;
    const active = document.activeElement;
    if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return;
    els.customerSearch.value = `${els.customerSearch.value || ""}${event.key}`;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchCustomers();
      openQuickPicker();
    }, 250);
  });
  els.customerResults.addEventListener("change", () => {
    const index = Number(els.customerResults.value);
    const customer = state.visibleCustomers[index] || null;
    if (customer) applySelectedCustomer(customer);
  });

  els.quickPickerSegments?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const segment = target.dataset.segment;
    if (!segment) return;
    state.activeSegment = segment;
    renderSegmentControls();
    renderCustomerOptions(filteredCustomers());
    renderQuickPicker();
  });

  els.quickPickerGrid.addEventListener("click", (event) => {
    const target = event.target;
    const pickBtn = target instanceof Element ? target.closest("[data-pick]") : null;
    if (!pickBtn) return;
    const idx = Number(pickBtn.getAttribute("data-pick"));
    const customer = state.visibleCustomers[idx] || null;
    if (customer) {
      applySelectedCustomer(customer);
      closeQuickPicker();
    }
  });

  els.quickPickerSort.addEventListener("change", () => {
    state.quickSort = els.quickPickerSort.value === "city" ? "city" : "name";
    renderCustomerOptions(filteredCustomers());
    renderQuickPicker();
  });
  els.quickPickerProvince.addEventListener("change", () => {
    state.quickProvince = els.quickPickerProvince.value || "";
    renderCustomerOptions(filteredCustomers());
    renderQuickPicker();
  });
  els.quickPickerSearch.addEventListener("input", () => {
    state.quickSearch = els.quickPickerSearch.value || "";
    renderCustomerOptions(filteredCustomers());
    renderQuickPicker();
  });

  els.quickPickerBtn.addEventListener("click", openQuickPicker);
  els.quickPickerClose.addEventListener("click", closeQuickPicker);
  els.quickPicker.addEventListener("click", (event) => {
    if (event.target === els.quickPicker) closeQuickPicker();
  });

  els.submitOrder.addEventListener("click", submitOrder);
  els.submitDraftOrder?.addEventListener("click", submitDraftOrder);
  els.customerAccessLoad?.addEventListener("click", loadCustomerByAccessCode);
  els.customerAccessCode?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadCustomerByAccessCode();
    }
  });
  els.clearForm?.addEventListener("click", () => resetForm({ keepCustomerSearch: false }));
  els.customerTier?.addEventListener("change", () => {
    buildProductTable();
    renderSummary();
  });
  els.printForm.addEventListener("click", () => window.print());
}

function boot() {
  const today = new Date();
  els.orderDate.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  buildProductTable();
  renderSummary();
  renderSegmentControls();
  enforceModeUI();
  loadPaymentTermsOptions();
  wireEvents();
  preloadCustomers();
  hydratePriceTiers();
  renderProvinceFilterOptions();
}

boot();
