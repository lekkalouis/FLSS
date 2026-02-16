import { PRODUCT_LIST } from "./views/products.js";

const STORAGE_KEY = "fl_custom_order_access_v1";
const API_BASE = "/api/v1/shopify";

const $ = (id) => document.getElementById(id);
const els = {
  lockScreen: $("lock-screen"),
  lockCopy: $("lock-copy"),
  lockPassword: $("lock-password"),
  lockConfirm: $("lock-confirm"),
  lockAction: $("lock-action"),
  lockStatus: $("lock-status"),

  orderDate: $("order-date"),
  poNumber: $("po-number"),

  customerSearch: $("customer-search"),
  customerSearchBtn: $("customer-search-btn"),
  customerStatus: $("customer-status"),
  customerResults: $("customer-results"),

  productBody: $("product-body"),
  selectedCount: $("selected-count"),
  orderTotal: $("order-total"),
  receipt: $("receipt"),

  submitOrder: $("submit-order"),
  printForm: $("print-form"),
  lockPage: $("lock-page"),
  resetPassword: $("reset-password"),
  orderStatus: $("order-status"),

  billCompany: $("bill-company"),
  billName: $("bill-name"),
  billAddress1: $("bill-address1"),
  billAddress2: $("bill-address2"),
  billSuburb: $("bill-suburb"),
  billCity: $("bill-city"),
  billProvince: $("bill-province"),
  billZip: $("bill-zip"),
  billPhone: $("bill-phone"),
  billEmail: $("bill-email"),
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
  shipEmail: $("ship-email"),
  shipNotes: $("ship-notes")
};

const state = {
  customers: [],
  selectedCustomer: null,
  qtyBySku: new Map()
};

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? `R${n.toFixed(2)}` : "R0.00";
}

function setStatus(el, message, tone = "") {
  if (!el) return;
  el.className = `status${tone ? ` ${tone}` : ""}`;
  el.textContent = message;
}

function toBase64(bytes) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
async function deriveHash(password, saltBytes) {
  const encoded = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey("raw", encoded, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 210000, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

function getStoredAccess() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.salt || !parsed?.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function savePassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ salt: toBase64(salt), hash: toBase64(hash), createdAt: new Date().toISOString() })
  );
}

async function verifyPassword(password) {
  const stored = getStoredAccess();
  if (!stored) return false;
  const derived = await deriveHash(password, fromBase64(stored.salt));
  return toBase64(derived) === stored.hash;
}

function configureLockScreen() {
  const hasPassword = Boolean(getStoredAccess());
  els.lockCopy.textContent = hasPassword
    ? "Enter your local password to unlock this order form."
    : "No password found yet. Create one now.";
  els.lockConfirm.hidden = hasPassword;
  els.lockAction.textContent = hasPassword ? "Unlock" : "Set password & unlock";
  els.lockScreen.hidden = false;
  els.lockPassword.value = "";
  els.lockConfirm.value = "";
}

function unlockPage() {
  els.lockScreen.hidden = true;
  setStatus(els.lockStatus, "");
}

async function handleLockAction() {
  const password = String(els.lockPassword.value || "");
  const confirm = String(els.lockConfirm.value || "");
  const hasPassword = Boolean(getStoredAccess());

  if (password.length < 8) {
    setStatus(els.lockStatus, "Use at least 8 characters.", "err");
    return;
  }

  els.lockAction.disabled = true;
  try {
    if (!hasPassword) {
      if (password !== confirm) {
        setStatus(els.lockStatus, "Passwords do not match.", "err");
        return;
      }
      await savePassword(password);
      unlockPage();
      return;
    }

    const ok = await verifyPassword(password);
    if (!ok) {
      setStatus(els.lockStatus, "Wrong password.", "err");
      return;
    }
    unlockPage();
  } catch (error) {
    console.error(error);
    setStatus(els.lockStatus, "Unable to process password in this browser.", "err");
  } finally {
    els.lockAction.disabled = false;
  }
}

function buildProductTable() {
  const products = PRODUCT_LIST.filter((product) => product.variantId && product.prices?.retail != null);
  els.productBody.innerHTML = products
    .map(
      (product) => `<tr>
      <td>${product.sku}</td>
      <td>${product.title}</td>
      <td>${money(product.prices.retail)}</td>
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
    price: Number(product.prices?.retail || 0),
    quantity: Number(state.qtyBySku.get(product.sku) || 0)
  }));
}

function renderSummary() {
  const lines = selectedLineItems();
  let total = 0;
  const receipt = ["Flippen Lekka Order Form", "--------------------------"];
  lines.forEach((line) => {
    const lineTotal = line.quantity * Number(line.price || 0);
    total += lineTotal;
    const lineCell = document.querySelector(`[data-line="${line.sku}"]`);
    if (lineCell) lineCell.textContent = money(lineTotal);
    receipt.push(`${line.sku} ${line.quantity} x ${money(line.price)} = ${money(lineTotal)}`);
  });
  PRODUCT_LIST.forEach((product) => {
    const qty = Number(state.qtyBySku.get(product.sku) || 0);
    if (!qty) {
      const lineCell = document.querySelector(`[data-line="${product.sku}"]`);
      if (lineCell) lineCell.textContent = money(0);
    }
  });

  els.selectedCount.textContent = `${lines.length} products selected`;
  els.orderTotal.textContent = money(total);
  receipt.push("--------------------------", `TOTAL: ${money(total)}`);
  els.receipt.textContent = lines.length ? receipt.join("\n") : "Receipt preview appears as quantities are entered.";
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
  els.billEmail.value = customer?.email || "";

  els.shipCompany.value = first.company || "";
  els.shipName.value = `${first.first_name || ""} ${first.last_name || ""}`.trim();
  els.shipAddress1.value = first.address1 || "";
  els.shipAddress2.value = first.address2 || "";
  els.shipSuburb.value = first.address2 || "";
  els.shipCity.value = first.city || "";
  els.shipProvince.value = first.province || "";
  els.shipZip.value = first.zip || "";
  els.shipPhone.value = customer?.phone || first.phone || "";
  els.shipEmail.value = customer?.email || "";
}

function renderCustomerOptions(customers) {
  if (!customers.length) {
    els.customerResults.innerHTML = "";
    return;
  }
  els.customerResults.innerHTML = customers
    .map((customer, index) => {
      const label = `${customer.name || "Unnamed"} · ${customer.companyName || customer.email || customer.phone || "No contact"}`;
      return `<option value="${index}">${label}</option>`;
    })
    .join("");
  els.customerResults.value = "0";
  state.selectedCustomer = customers[0];
  applyAddressFields(state.selectedCustomer);
}

async function searchCustomers() {
  const q = els.customerSearch.value.trim();
  if (!q) {
    setStatus(els.customerStatus, "Enter a search term first.", "warn");
    return;
  }

  setStatus(els.customerStatus, "Searching Shopify customers...");
  try {
    const params = new URLSearchParams({ q, limit: "20" });
    const response = await fetch(`${API_BASE}/customers/search?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.message || "Customer search failed");

    state.customers = Array.isArray(data.customers) ? data.customers : [];
    renderCustomerOptions(state.customers);
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

async function submitOrder() {
  const lineItems = selectedLineItems();
  if (!state.selectedCustomer?.id) {
    setStatus(els.orderStatus, "Select a customer first.", "err");
    return;
  }
  if (!lineItems.length) {
    setStatus(els.orderStatus, "Enter quantities for at least one product.", "err");
    return;
  }

  const payload = {
    customerId: state.selectedCustomer.id,
    poNumber: els.poNumber.value.trim() || undefined,
    deliveryDate: els.orderDate.value || undefined,
    shippingMethod: "shipping",
    billingAddress: billingAddressPayload(),
    shippingAddress: shippingAddressPayload(),
    lineItems,
    companyName: els.billCompany.value.trim() || undefined,
    vatNumber: els.billVat.value.trim() || undefined,
    customerTags: state.selectedCustomer.tags || ""
  };

  const shipNotes = els.shipNotes.value.trim();
  if (shipNotes) payload.poNumber = payload.poNumber ? `${payload.poNumber} | ${shipNotes}` : shipNotes;

  els.submitOrder.disabled = true;
  setStatus(els.orderStatus, "Creating normal order...");
  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.message || data?.error || "Failed to create order");
    }
    setStatus(
      els.orderStatus,
      `Order created (${data.order?.name || data.order?.orderNumber || "OK"}).`,
      "ok"
    );
  } catch (error) {
    console.error(error);
    setStatus(els.orderStatus, error.message || "Unable to create order.", "err");
  } finally {
    els.submitOrder.disabled = false;
  }
}

function wireEvents() {
  els.lockAction.addEventListener("click", handleLockAction);
  els.lockPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleLockAction();
  });

  els.productBody.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches(".qty[data-sku]")) return;
    const sku = target.dataset.sku;
    const qty = Math.max(0, Number(target.value || 0));
    state.qtyBySku.set(sku, Math.floor(qty));
    if (String(Math.floor(qty)) !== target.value) target.value = String(Math.floor(qty));
    renderSummary();
  });

  els.customerSearchBtn.addEventListener("click", searchCustomers);
  els.customerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchCustomers();
    }
  });
  els.customerResults.addEventListener("change", () => {
    const index = Number(els.customerResults.value);
    const customer = state.customers[index] || null;
    state.selectedCustomer = customer;
    if (customer) applyAddressFields(customer);
  });

  els.submitOrder.addEventListener("click", submitOrder);
  els.printForm.addEventListener("click", () => window.print());
  els.lockPage.addEventListener("click", () => {
    configureLockScreen();
    setStatus(els.orderStatus, "Page locked.", "warn");
  });
  els.resetPassword.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    configureLockScreen();
    setStatus(els.orderStatus, "Password reset. Set a new password to continue.", "warn");
  });
}

function boot() {
  const today = new Date();
  els.orderDate.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  buildProductTable();
  renderSummary();
  wireEvents();
  configureLockScreen();
}

boot();
