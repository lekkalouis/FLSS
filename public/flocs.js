(() => {
  "use strict";

  // ===== CONFIG =====
  const CONFIG = {
    SHOPIFY: { PROXY_BASE: "/shopify" }, // existing proxy base
    PP_ENDPOINT: "/pp",
    BOX_DIM: { dim1: 40, dim2: 40, dim3: 30, massKg: 5 }, // fallback parcel
    // Configure your real SKUs + variant IDs and optional weights/prices here.
    PRODUCTS: [
      // Example entries – replace variantId / title / weightKg / price as needed
      { sku: "FL002", title: "FL002 – Braai Spice 200ml", variantId: 0, weightKg: 0.25, price: 24.00 },
      { sku: "FL003", title: "FL003 – Chicken Spice 200ml", variantId: 0, weightKg: 0.25, price: 24.00 },
      { sku: "FL004", title: "FL004 – Steak & Chops 200ml", variantId: 0, weightKg: 0.25, price: 24.00 },
      // Add as many as you want, sorted by SKU
      // { sku:"FL101", title:"FL101 – Example", variantId:1234567890, weightKg:1.0, price:80 }
    ]
  };

  // ===== DOM =====
  const shell            = document.getElementById("flocs-shell");
  const customerSearch   = document.getElementById("flocs-customerSearch");
  const customerResults  = document.getElementById("flocs-customerResults");
  const customerStatus   = document.getElementById("flocs-customerStatus");
  const customerChips    = document.getElementById("flocs-selectedCustomerChips");

  const poInput          = document.getElementById("flocs-po");
  const deliveryGroup    = document.getElementById("flocs-deliveryGroup");
  const shipSection      = document.getElementById("flocs-shipSection");
  const addrSelect       = document.getElementById("flocs-addressSelect");
  const addrPreview      = document.getElementById("flocs-addressPreview");

  const productsBody     = document.getElementById("flocs-productsBody");
  const calcShipBtn      = document.getElementById("flocs-calcShip");
  const shippingSummary  = document.getElementById("flocs-shippingSummary");
  const errorsBox        = document.getElementById("flocs-errors");

  const invoice          = document.getElementById("flocs-invoice");
  const previewTag       = document.getElementById("flocs-previewTag");

  const toast            = document.getElementById("flocs-toast");
  const confirmOverlay   = document.getElementById("flocs-confirmOverlay");
  const confirmBtn       = document.getElementById("flocs-confirmBtn");

  // ===== STATE =====
  const state = {
    customer: null,
    po: "",
    delivery: "ship",        // ship | pickup | deliver
    addressIndex: null,      // index in customer.addresses
    items: {},               // sku -> qty
    shippingQuote: null,     // { service, total, quoteno, raw }
    errors: [],
    isSubmitting: false
  };

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

  function setShellReady(ready) {
    if (!shell) return;
    if (ready) shell.classList.add("flocs-ready");
    else shell.classList.remove("flocs-ready");
  }

  function currentDelivery() {
    return state.delivery || "ship";
  }

  function currentAddress() {
    if (!state.customer || !Array.isArray(state.customer.addresses)) return null;
    const idx =
      state.addressIndex != null ? state.addressIndex : 0;
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
    for (const p of CONFIG.PRODUCTS) {
      const qty = Number(state.items[p.sku] || 0);
      if (!qty || qty <= 0) continue;
      out.push({
        sku: p.sku,
        title: p.title,
        variantId: p.variantId,
        quantity: qty,
        weightKg: p.weightKg || 0,
        price: p.price // optional
      });
    }
    return out;
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

  // ===== UI: products table rendering =====
  function renderProductsTable() {
    if (!productsBody) return;
    productsBody.innerHTML = CONFIG.PRODUCTS.map((p) => {
      const name = (p.title || p.sku || "").trim();
      return `
        <tr>
          <td><code>${p.sku}</code></td>
          <td>${name}</td>
          <td>
            <input class="flocs-qtyInput"
                   type="number"
                   min="0"
                   step="1"
                   data-sku="${p.sku}"
                   inputmode="numeric" />
          </td>
        </tr>
      `;
    }).join("");
  }

  // ===== UI: selected customer chips & address selector =====
  function renderCustomerChips() {
    if (!customerChips) return;
    if (!state.customer) {
      customerChips.innerHTML = "";
      return;
    }
    const c = state.customer;
    const addr = currentAddress();

    const deliveryLabel =
      currentDelivery() === "pickup"
        ? "Pickup"
        : currentDelivery() === "deliver"
        ? "Deliver"
        : "Ship";

    customerChips.innerHTML = `
      <span class="flocs-chip">Customer: ${c.name}</span>
      <span class="flocs-chip">Delivery: ${deliveryLabel}</span>
      ${
        addr
          ? `<span class="flocs-chip">Ship-to: ${addr.city || ""} ${addr.zip || ""}</span>`
          : ""
      }
    `;
  }

  function renderAddressSelect() {
    if (!addrSelect) return;
    if (!state.customer) {
      addrSelect.innerHTML =
        `<option value="">Select a customer first…</option>`;
      addrSelect.disabled = true;
      addrPreview.hidden = true;
      return;
    }
    const addrs = Array.isArray(state.customer.addresses)
      ? state.customer.addresses
      : [];
    if (!addrs.length) {
      addrSelect.innerHTML =
        `<option value="">No addresses on customer</option>`;
      addrSelect.disabled = true;
      addrPreview.hidden = true;
      return;
    }
    addrSelect.disabled = false;
    addrSelect.innerHTML = addrs
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
      state.addressIndex != null ? state.addressIndex : 0;
    addrSelect.value = String(Math.min(idx, addrs.length - 1));
    state.addressIndex = Number(addrSelect.value);
    const addr = currentAddress();
    if (addr) {
      addrPreview.textContent = formatAddress(addr);
      addrPreview.hidden = false;
    } else {
      addrPreview.hidden = true;
    }
  }

  // ===== UI: invoice preview =====
  function renderInvoice() {
    if (!invoice) return;
    const items = buildItemsArray();
    const addr = currentAddress();

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
        }`
      : "No customer selected";

    const shipToText =
      delivery === "ship"
        ? addr
          ? formatAddress(addr)
          : "Ship selected but no address chosen"
        : "Not applicable";

    const shippingLine =
      delivery === "ship" && state.shippingQuote
        ? `Shipping (${state.shippingQuote.service || "Courier"}): ${money(
            state.shippingQuote.total
          )}`
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
      : `
        <tr>
          <td colspan="4" style="text-align:center;color:#6b7280">
            No line items yet. Enter quantities on the left.
          </td>
        </tr>
      `;

    invoice.innerHTML = `
      <div class="flocs-invoiceHeader">
        <div>
          <div class="flocs-invoiceBrand">Flippen Lekka Holdings (Pty) Ltd</div>
          <div class="flocs-invoiceSub">Draft order preview (FLOCS)</div>
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
          <div class="flocs-invoiceColTitle">${
            delivery === "ship" ? "Ship to" : "Delivery context"
          }</div>
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
        Final pricing and tax are still controlled in Shopify. FLOCS only seeds the draft order.
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
      if (!currentAddress()) {
        errs.push("Select a ship-to address.");
      }
      if (!state.shippingQuote) {
        errs.push("Calculate shipping (SWE quote) before locking the order.");
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
        previewTag.textContent = "Ready to lock in (green)";
      } else {
        previewTag.textContent = "Incomplete order";
      }
    }

    confirmBtn.disabled = !ready;
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

  async function requestShippingQuote() {
    if (currentDelivery() !== "ship") {
      state.shippingQuote = null;
      shippingSummary.textContent =
        "Delivery type is pickup/deliver – no courier shipping.";
      validate();
      renderInvoice();
      return;
    }
    const addr = currentAddress();
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
      notes: `FLOCS draft pre-quote`,

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
      destplace: null, // you can wire place codes later, this is only for quoting
      destpercontact:
        `${addr.first_name || ""} ${addr.last_name || ""}`.trim(),
      destperphone: state.customer?.phone || "",
      destpercell: state.customer?.phone || "",
      destperemail: state.customer?.email || "",
      notifydestpers: 1
    };

    const totalWeightKg = computeTotalWeightKg(items);
    const contents = [
      {
        item: 1,
        pieces: 1,
        dim1: CONFIG.BOX_DIM.dim1,
        dim2: CONFIG.BOX_DIM.dim2,
        dim3: CONFIG.BOX_DIM.dim3,
        actmass: totalWeightKg
      }
    ];

    try {
      const res = await fetch(CONFIG.PP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "requestQuote",
          classVal: "quote",
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

      const total =
        Number(picked.total ?? picked.subtotal ?? picked.charge ?? 0) || 0;
      state.shippingQuote = {
        service: picked.service,
        total,
        quoteno,
        raw: { rates }
      };

      shippingSummary.textContent =
        `Quote: ${picked.service} – ${money(total)} (quoteno ${quoteno})`;

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
            }
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

  async function createDraftOrder() {
    if (state.errors.length) {
      showToast("Fix errors before locking order.", "err");
      return;
    }

    const items = buildItemsArray();
    if (!items.length) {
      showToast("No line items.", "err");
      return;
    }

    state.isSubmitting = true;
    validate();
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Creating draft order…";

    const delivery = currentDelivery();
    const addr = currentAddress();
    const shippingPrice =
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.total
        : null;
    const shippingService =
      delivery === "ship" && state.shippingQuote
        ? state.shippingQuote.service
        : null;

    const billingAddress =
      state.customer?.default_address || null;
    const shippingAddress =
      delivery === "ship" && addr ? addr : null;

    const payload = {
      customerId: state.customer.id,
      poNumber: state.po || null,
      shippingMethod: delivery,
      shippingPrice,
      shippingService,
      billingAddress,
      shippingAddress,
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

      // Reset form
      resetForm();
    } catch (e) {
      console.error("Draft order create exception:", e);
      showToast("Draft order error: " + String(e?.message || e), "err");
    } finally {
      state.isSubmitting = false;
      confirmBtn.textContent = "Lock order & create Shopify draft";
      validate();
    }
  }

  function resetForm() {
    state.customer = null;
    state.po = "";
    state.delivery = "ship";
    state.addressIndex = null;
    state.items = {};
    state.shippingQuote = null;
    state.errors = [];
    state.isSubmitting = false;

    if (customerSearch) customerSearch.value = "";
    if (poInput) poInput.value = "";
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
    // reset qty inputs
    if (productsBody) {
      const inputs = productsBody.querySelectorAll("input[data-sku]");
      inputs.forEach((inp) => (inp.value = ""));
    }

    renderCustomerChips();
    renderAddressSelect();
    renderInvoice();
    validate();
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

        state.customer = c;

        // Default delivery from metafield if set
        if (c.delivery_method) {
          state.delivery = c.delivery_method;
        } else {
          state.delivery = "ship";
        }

        // Prefer default_address index
        const addrs = Array.isArray(c.addresses) ? c.addresses : [];
        if (c.default_address) {
          const did = c.default_address.id;
          const foundIdx = addrs.findIndex((a) => a.id === did);
          state.addressIndex =
            foundIdx >= 0 ? foundIdx : addrs.length ? 0 : null;
        } else {
          state.addressIndex = addrs.length ? 0 : null;
        }

        customerResults.hidden = true;
        customerStatus.textContent = `Selected: ${c.name}`;
        renderCustomerChips();
        renderAddressSelect();
        renderInvoice();
        validate();
      });
    }

    if (poInput) {
      poInput.addEventListener("input", () => {
        state.po = poInput.value || "";
        renderInvoice();
        validate();
      });
    }

    if (deliveryGroup) {
      deliveryGroup.addEventListener("change", (e) => {
        const t = e.target;
        if (!t || t.name !== "delivery") return;
        state.delivery = t.value;
        shipSection.style.display =
          t.value === "ship" ? "" : "none";
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
        state.addressIndex =
          v === "" ? null : Number(v);
        const addr = currentAddress();
        if (addr) {
          addrPreview.textContent = formatAddress(addr);
          addrPreview.hidden = false;
        } else {
          addrPreview.hidden = true;
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
        const sku = t.dataset.sku;
        if (!sku) return;
        const v = Number(t.value || 0);
        if (!v || v < 0) {
          delete state.items[sku];
        } else {
          state.items[sku] = Math.floor(v);
          t.value = String(Math.floor(v));
        }
        renderInvoice();
        validate();
      });
    }

    if (calcShipBtn) {
      calcShipBtn.addEventListener("click", () => {
        requestShippingQuote();
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        createDraftOrder();
      });
    }
  }

  // ===== BOOT =====
  function boot() {
    renderProductsTable();
    resetForm();
    initEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
