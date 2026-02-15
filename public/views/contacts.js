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

  function renderContacts() {
    const customers = Array.isArray(state.customers) ? state.customers : [];

    if (contactsTierFilter) {
      const tiers = [...new Set(customers.map((c) => String(c?.tier || "").trim()).filter(Boolean))].sort();
      contactsTierFilter.innerHTML = `<option value="">All tiers</option>${tiers
        .map((tier) => `<option value="${tier}" ${state.tier === tier ? "selected" : ""}>${tier}</option>`)
        .join("")}`;
    }

    if (contactsProvinceFilter) {
      contactsProvinceFilter.innerHTML = `<option value="">All provinces</option>${provinces
        .map(
          (province) =>
            `<option value="${province}" ${state.province === province ? "selected" : ""}>${province}</option>`
        )
        .join("")}`;
    }

    const q = state.query.toLowerCase();
    const filtered = customers.filter((cust) => {
      if (state.tier && String(cust.tier || "").toLowerCase() !== state.tier.toLowerCase()) return false;
      if (state.province && String(cust.province || "").toLowerCase() !== state.province.toLowerCase()) return false;
      if (!q) return true;
      return [cust.name, cust.phone, cust.email, cust.companyName].some((v) => String(v || "").toLowerCase().includes(q));
    });

    if (contactsMeta) contactsMeta.textContent = `Showing ${filtered.length} of ${customers.length} customers.`;
    if (!contactsList) return;

    contactsList.innerHTML = `
      <div class="dispatchShipmentTable">
        <div class="dispatchShipmentRow dispatchShipmentRow--header">
          <div class="dispatchShipmentCell">Customer</div>
          <div class="dispatchShipmentCell">Contact number</div>
          <div class="dispatchShipmentCell">Tier</div>
          <div class="dispatchShipmentCell">Province</div>
        </div>
        ${
          filtered
            .map(
              (cust) => `
          <div class="dispatchShipmentRow">
            <div class="dispatchShipmentCell">${cust.name || "Unknown"}<br><small>${cust.email || ""}</small></div>
            <div class="dispatchShipmentCell contactsPhone">${cust.phone || "—"}</div>
            <div class="dispatchShipmentCell">${cust.tier || "—"}</div>
            <div class="dispatchShipmentCell">${cust.province || "—"}</div>
          </div>
        `
            )
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
  }

  bindEvents();

  return {
    renderContacts,
    refreshContacts
  };
}
