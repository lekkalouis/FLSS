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
    contactsList,
    contactsPrevPage,
    contactsNextPage,
    contactsPageInfo
  } = elements;

  let contactsSearchTimer = null;

  const PAGE_SIZE = 20;
  state.page = Number.isFinite(Number(state.page)) ? Number(state.page) : 1;

  const TIER_LABELS = {
    agent: "Agents",
    retailer: "Retailers",
    private: "Private",
    online: "Online",
    fkb: "FKB"
  };

  function normalizeTier(value) {
    const tier = String(value || "").trim().toLowerCase();
    if (["agent", "agents"].includes(tier)) return "agent";
    if (["retail", "retailer", "retailers"].includes(tier)) return "retailer";
    if (["private", "privaat"].includes(tier)) return "private";
    if (["online", "export", "ecommerce", "e-commerce", "web"].includes(tier)) return "online";
    if (tier === "fkb") return "fkb";
    return tier;
  }

  function formatTierLabel(value) {
    const normalized = normalizeTier(value);
    return TIER_LABELS[normalized] || (normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "—");
  }

  function renderPageControls(totalItems) {
    const pageCount = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    if (state.page > pageCount) state.page = pageCount;
    const page = Math.max(1, state.page);

    if (contactsPageInfo) {
      contactsPageInfo.textContent = `Page ${page} of ${pageCount}`;
    }
    if (contactsPrevPage) contactsPrevPage.disabled = page <= 1;
    if (contactsNextPage) contactsNextPage.disabled = page >= pageCount;
  }

  function renderContacts() {
    const customers = Array.isArray(state.customers) ? state.customers : [];

    if (contactsTierFilter) {
      const priority = ["agent", "retailer", "private", "online", "fkb"];
      const tiers = [...new Set(customers.map((c) => normalizeTier(c?.tier)).filter(Boolean))].sort((a, b) => {
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      contactsTierFilter.innerHTML = `<option value="">All tiers</option>${tiers
        .map((tier) => `<option value="${tier}" ${normalizeTier(state.tier) === tier ? "selected" : ""}>${formatTierLabel(tier)}</option>`)
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
      if (state.tier && normalizeTier(cust.tier) !== normalizeTier(state.tier)) return false;
      if (state.province && String(cust.province || "").toLowerCase() !== state.province.toLowerCase()) return false;
      if (!q) return true;
      return [cust.name, cust.phone, cust.email, cust.companyName].some((v) => String(v || "").toLowerCase().includes(q));
    });

    renderPageControls(filtered.length);
    const page = Math.max(1, state.page || 1);
    const start = (page - 1) * PAGE_SIZE;
    const paged = filtered.slice(start, start + PAGE_SIZE);

    if (contactsMeta) contactsMeta.textContent = `Showing ${paged.length} of ${filtered.length} matching customers (${customers.length} total).`;
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
          paged
            .map(
              (cust) => `
          <div class="dispatchShipmentRow">
            <div class="dispatchShipmentCell">${cust.name || "Unknown"}<br><small>${cust.email || ""}</small></div>
            <div class="dispatchShipmentCell contactsPhone">${cust.phone || "—"}</div>
            <div class="dispatchShipmentCell">${formatTierLabel(cust.tier)}</div>
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
      state.page = 1;
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
        state.page = 1;
        renderContacts();
      }, 150);
    });

    contactsTierFilter?.addEventListener("change", () => {
      state.tier = contactsTierFilter.value || "";
      state.page = 1;
      refreshContacts().catch((err) => {
        appendDebug("Contacts refresh failed: " + String(err));
        if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
      });
    });

    contactsProvinceFilter?.addEventListener("change", () => {
      state.province = contactsProvinceFilter.value || "";
      state.page = 1;
      refreshContacts().catch((err) => {
        appendDebug("Contacts refresh failed: " + String(err));
        if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
      });
    });

    contactsPrevPage?.addEventListener("click", () => {
      state.page = Math.max(1, Number(state.page || 1) - 1);
      renderContacts();
    });

    contactsNextPage?.addEventListener("click", () => {
      state.page = Number(state.page || 1) + 1;
      renderContacts();
    });
  }

  bindEvents();

  return {
    renderContacts,
    refreshContacts
  };
}
