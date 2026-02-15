function escHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function initContactsView({
  state,
  elements,
  getProxyBase,
  fetchImpl = fetch,
  provinces = [],
  appendDebug = () => {}
}) {
  const {
    contactsSearch,
    contactsTierFilter,
    contactsProvinceFilter,
    contactsMeta,
    contactsList
  } = elements;

  let contactsSearchTimer = null;
  const docsByCustomer = new Map();

  function customerKey(cust = {}) {
    return String(cust.id || cust.email || cust.phone || cust.name || "");
  }

  function activeFilteredCustomers() {
    const customers = Array.isArray(state.customers) ? state.customers : [];
    const q = state.query.toLowerCase();
    return customers.filter((cust) => {
      if (state.tier && String(cust.tier || "").toLowerCase() !== state.tier.toLowerCase()) return false;
      if (state.province && String(cust.province || "").toLowerCase() !== state.province.toLowerCase()) return false;
      if (!q) return true;
      return [cust.name, cust.phone, cust.email, cust.companyName].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }

  function renderContacts() {
    const customers = Array.isArray(state.customers) ? state.customers : [];

    if (contactsTierFilter) {
      const tiers = [...new Set(customers.map((c) => String(c?.tier || "").trim()).filter(Boolean))].sort();
      contactsTierFilter.innerHTML = `<option value="">All tiers</option>${tiers
        .map((tier) => `<option value="${escHtml(tier)}" ${state.tier === tier ? "selected" : ""}>${escHtml(tier)}</option>`)
        .join("")}`;
    }

    if (contactsProvinceFilter) {
      contactsProvinceFilter.innerHTML = `<option value="">All provinces</option>${provinces
        .map(
          (province) =>
            `<option value="${escHtml(province)}" ${state.province === province ? "selected" : ""}>${escHtml(province)}</option>`
        )
        .join("")}`;
    }

    const filtered = activeFilteredCustomers();

    if (contactsMeta) contactsMeta.textContent = `Showing ${filtered.length} of ${customers.length} customers.`;
    if (!contactsList) return;

    contactsList.innerHTML = `
      <div class="dispatchShipmentTable">
        <div class="dispatchShipmentRow dispatchShipmentRow--header" style="grid-template-columns:1.2fr 1fr .8fr .8fr .9fr">
          <div class="dispatchShipmentCell">Customer</div>
          <div class="dispatchShipmentCell">Contact number</div>
          <div class="dispatchShipmentCell">Tier</div>
          <div class="dispatchShipmentCell">Province</div>
          <div class="dispatchShipmentCell">Docs</div>
        </div>
        ${
          filtered
            .map((cust, idx) => {
              const key = customerKey(cust);
              const docs = docsByCustomer.get(key) || null;
              const docCount = Array.isArray(docs?.documents) ? docs.documents.length : 0;
              const docLabel = docs?.loading ? "Loading…" : docs?.error ? "Retry" : docCount ? `${docCount} docs` : "Check";

              const docRows = docCount
                ? docs.documents
                    .map(
                      (doc) => `
                  <div class="contactsDocRow">
                    <div>
                      <strong>${escHtml(doc.name || "Document")}</strong><br>
                      <small>${escHtml(doc.orderNo || "No order ref")} · ${escHtml(formatBytes(doc.size))}</small>
                    </div>
                    <div class="contactsDocActions">
                      <button type="button" class="dispatchSelectionBtn" data-action="print-doc" data-doc-id="${escHtml(doc.id)}">Print</button>
                      <button type="button" class="dispatchSelectionBtn dispatchSelectionBtn--primary" data-action="email-doc" data-doc-id="${escHtml(doc.id)}">Email</button>
                    </div>
                  </div>
                `
                    )
                    .join("")
                : `<div class="dispatchShipmentEmpty">${escHtml(docs?.error || "No generated documents found for this customer yet.")}</div>`;

              return `
          <div class="dispatchShipmentRow" style="grid-template-columns:1.2fr 1fr .8fr .8fr .9fr">
            <div class="dispatchShipmentCell">${escHtml(cust.name || "Unknown")}<br><small>${escHtml(cust.email || "")}</small></div>
            <div class="dispatchShipmentCell contactsPhone">${escHtml(cust.phone || "—")}</div>
            <div class="dispatchShipmentCell">${escHtml(cust.tier || "—")}</div>
            <div class="dispatchShipmentCell">${escHtml(cust.province || "—")}</div>
            <div class="dispatchShipmentCell">
              <button type="button" class="dispatchSelectionBtn" title="Open customer docs" data-action="open-docs" data-customer-idx="${idx}">✉️ ${escHtml(docLabel)}</button>
            </div>
          </div>
          ${
            docs?.open
              ? `<div class="dispatchShipmentRow" style="grid-template-columns:1fr"><div class="dispatchShipmentCell" style="grid-column:1/-1">
                <div class="contactsDocPanel">
                  <div class="dispatchShipmentInfo" style="margin-bottom:.4rem">Available generated documents for ${escHtml(cust.name || cust.email || "customer")}</div>
                  ${docRows}
                </div>
              </div></div>`
              : ""
          }
        `;
            })
            .join("") || `<div class="dispatchShipmentEmpty">No customers found.</div>`
        }
      </div>
    `;
  }

  async function refreshContacts() {
    if (state.retryTimer) {
      clearTimeout(state.retryTimer);
      state.retryTimer = null;
    }

    if (contactsMeta) contactsMeta.textContent = "Loading contacts…";

    try {
      const params = new URLSearchParams();
      if (state.tier) params.set("tier", state.tier);
      if (state.province) params.set("province", state.province);
      const suffix = params.toString() ? `?${params.toString()}` : "";

      const res = await fetchImpl(`${getProxyBase()}/customers${suffix}`);
      if (!res.ok) throw new Error(`Contacts request failed (${res.status})`);

      const data = await res.json();
      const customers = Array.isArray(data?.customers)
        ? data.customers
        : Array.isArray(data?.data?.customers)
          ? data.data.customers
          : Array.isArray(data)
            ? data
            : [];

      state.customers = customers;
      state.loaded = true;
      renderContacts();

      if (contactsMeta && !state.customers.length) {
        contactsMeta.textContent = "No customer contacts were returned from Shopify.";
      }
    } catch (err) {
      state.loaded = false;
      if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
      state.retryTimer = setTimeout(() => {
        refreshContacts().catch((refreshErr) => {
          appendDebug("Contacts retry failed: " + String(refreshErr));
        });
      }, 30000);
      throw err;
    }
  }

  async function loadCustomerDocs(cust) {
    const key = customerKey(cust);
    const current = docsByCustomer.get(key) || {};
    docsByCustomer.set(key, { ...current, open: true, loading: true, error: null });
    renderContacts();

    try {
      const params = new URLSearchParams();
      if (cust.email) params.set("email", cust.email);
      if (cust.name) params.set("name", cust.name);
      const res = await fetchImpl(`/api/v1/customer-docs?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.message || `Docs lookup failed (${res.status})`);
      docsByCustomer.set(key, {
        open: true,
        loading: false,
        error: null,
        documents: Array.isArray(payload.documents) ? payload.documents : [],
        emailConfigured: Boolean(payload.emailConfigured)
      });
    } catch (err) {
      docsByCustomer.set(key, {
        open: true,
        loading: false,
        error: String(err?.message || err),
        documents: []
      });
    }
    renderContacts();
  }

  async function emailDocument(cust, docId) {
    if (!cust?.email) throw new Error("Customer has no email address");
    const res = await fetchImpl("/api/v1/customer-docs/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerEmail: cust.email,
        customerName: cust.name,
        documentIds: [docId]
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Email failed");
  }

  async function printDocument(docId) {
    const res = await fetchImpl("/api/v1/customer-docs/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: docId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Print failed");
  }

  function bindEvents() {
    contactsSearch?.addEventListener("input", () => {
      if (contactsSearchTimer) clearTimeout(contactsSearchTimer);
      contactsSearchTimer = setTimeout(() => {
        state.query = contactsSearch.value.trim();
        renderContacts();
      }, 150);
    });

    contactsTierFilter?.addEventListener("change", () => {
      state.tier = contactsTierFilter.value || "";
      refreshContacts().catch((err) => {
        appendDebug("Contacts refresh failed: " + String(err));
        if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
      });
    });

    contactsProvinceFilter?.addEventListener("change", () => {
      state.province = contactsProvinceFilter.value || "";
      refreshContacts().catch((err) => {
        appendDebug("Contacts refresh failed: " + String(err));
        if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
      });
    });

    contactsList?.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      const action = btn.dataset.action;
      const customerIdx = Number(btn.dataset.customerIdx);
      const filtered = activeFilteredCustomers();
      const cust = Number.isFinite(customerIdx) ? filtered[customerIdx] : null;
      if (!cust && action === "open-docs") return;

      if (action === "open-docs") {
        loadCustomerDocs(cust).catch((err) => appendDebug("Docs load failed: " + String(err)));
      }

      if (action === "print-doc") {
        btn.disabled = true;
        printDocument(btn.dataset.docId)
          .then(() => {
            if (contactsMeta) contactsMeta.textContent = "Document sent to PrintNode.";
          })
          .catch((err) => {
            if (contactsMeta) contactsMeta.textContent = `Print failed: ${String(err?.message || err)}`;
          })
          .finally(() => {
            btn.disabled = false;
          });
      }

      if (action === "email-doc") {
        const row = btn.closest(".dispatchShipmentRow");
        const previous = row?.previousElementSibling;
        const trigger = previous?.querySelector('[data-action="open-docs"]');
        const pickIdx = Number(trigger?.dataset.customerIdx);
        const picked = Number.isFinite(pickIdx) ? filtered[pickIdx] : null;
        btn.disabled = true;
        emailDocument(picked, btn.dataset.docId)
          .then(() => {
            if (contactsMeta) contactsMeta.textContent = `Emailed document to ${picked?.email || "customer"}.`;
          })
          .catch((err) => {
            if (contactsMeta) contactsMeta.textContent = `Email failed: ${String(err?.message || err)}`;
          })
          .finally(() => {
            btn.disabled = false;
          });
      }
    });
  }

  bindEvents();

  return {
    renderContacts,
    refreshContacts
  };
}
