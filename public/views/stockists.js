const PAGE_SIZE = 20;

export function initStockistsView() {
  const root = document.getElementById("viewStockists");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";

  const els = {
    status: document.getElementById("stockistsStatus"),
    token: document.getElementById("stockistsAdminToken"),
    agentSelect: document.getElementById("stockistsAgentSelect"),
    agentMeta: document.getElementById("stockistsAgentMeta"),
    retailersBody: document.getElementById("stockistsRetailersBody"),
    skuBody: document.getElementById("stockistsSkuBody"),
    retailerName: document.getElementById("stockistsRetailerName"),
    retailerCity: document.getElementById("stockistsRetailerCity"),
    retailerProvince: document.getElementById("stockistsRetailerProvince"),
    retailerAddress: document.getElementById("stockistsRetailerAddress"),
    retailerPhone: document.getElementById("stockistsRetailerPhone"),
    retailerNotes: document.getElementById("stockistsRetailerNotes"),
    bulk: document.getElementById("stockistsBulkText"),
    skuText: document.getElementById("stockistsSkuText"),
    search: document.getElementById("stockistsSearch"),
    directoryMeta: document.getElementById("stockistsDirectoryMeta"),
    agentsDirectoryBody: document.getElementById("stockistsAgentsDirectoryBody"),
    retailersDirectoryBody: document.getElementById("stockistsRetailersDirectoryBody"),
    agentsPager: document.getElementById("stockistsAgentsPager"),
    retailersPager: document.getElementById("stockistsRetailersPager")
  };

  const state = {
    agents: [],
    selectedAgentId: "",
    details: null,
    query: "",
    directoryAgentsPage: 1,
    directoryRetailersPage: 1,
    directoryRetailers: []
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function headers() {
    const token = String(els.token?.value || "").trim();
    const out = { "Content-Type": "application/json" };
    if (token) out.Authorization = `Bearer ${token}`;
    return out;
  }

  function setStatus(msg, bad = false) {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.style.color = bad ? "#b91c1c" : "#334155";
  }

  async function api(path, options = {}) {
    const res = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
    return json;
  }

  function paginate(items, page) {
    const total = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), total);
    const start = (safePage - 1) * PAGE_SIZE;
    return { total, page: safePage, rows: items.slice(start, start + PAGE_SIZE) };
  }

  function renderPager(target, currentPage, totalPages, onPage) {
    if (!target) return;
    target.innerHTML = "";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.textContent = "Prev";
    prev.disabled = currentPage <= 1;
    prev.addEventListener("click", () => onPage(currentPage - 1));

    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = currentPage >= totalPages;
    next.addEventListener("click", () => onPage(currentPage + 1));

    const info = document.createElement("span");
    info.textContent = `Page ${currentPage} of ${totalPages}`;

    target.append(prev, info, next);
  }

  function renderAgents() {
    if (!els.agentSelect) return;
    els.agentSelect.innerHTML = '<option value="">Select an agent…</option>';
    state.agents.forEach((agent) => {
      const opt = document.createElement("option");
      opt.value = agent.id;
      opt.textContent = `${agent.name} (${agent.retailer_count || 0} retailers)`;
      els.agentSelect.appendChild(opt);
    });
    if (state.selectedAgentId) els.agentSelect.value = state.selectedAgentId;
  }

  function renderDetails() {
    const detail = state.details;
    if (!detail) return;

    const { agent, retailers = [], sku_range = [] } = detail;
    if (els.agentMeta) {
      els.agentMeta.innerHTML = `
        <strong>${escapeHtml(agent.name)}</strong> <span class="stockistsPill">${agent.active ? "Active" : "Inactive"}</span><br>
        ${escapeHtml(agent.city)} ${escapeHtml(agent.province)} ${escapeHtml(agent.country)}<br>
        Coverage: ${escapeHtml(agent.coverage_area || "—")} · Phone: ${escapeHtml(agent.phone || "—")} · Email: ${escapeHtml(agent.email || "—")}
      `;
    }

    if (els.retailersBody) {
      els.retailersBody.innerHTML = retailers.length
        ? retailers
            .map(
              (retailer) => `<tr><td>${escapeHtml(retailer.retailer_name)}</td><td>${escapeHtml(retailer.city)}</td><td>${escapeHtml(retailer.province)}</td><td>${escapeHtml(retailer.retailer_phone)}</td></tr>`
            )
            .join("")
        : '<tr><td colspan="4">No retailers yet.</td></tr>';
    }

    if (els.skuBody) {
      els.skuBody.innerHTML = sku_range.length
        ? sku_range
            .map((sku) => `<tr><td>${escapeHtml(sku.sku)}</td><td>${escapeHtml(sku.availability_label)}</td><td>${sku.priority_score || 0}</td></tr>`)
            .join("")
        : '<tr><td colspan="3">No SKU range configured.</td></tr>';
    }

    if (els.skuText) {
      els.skuText.value = sku_range
        .map((sku) => `${sku.sku},${sku.availability_label || "Core Range"},${sku.priority_score || 0}`)
        .join("\n");
    }
  }

  function renderDirectory() {
    const q = state.query.toLowerCase();
    const directoryAgents = state.agents.filter((agent) => {
      if (!q) return true;
      return [agent.name, agent.city, agent.province, agent.coverage_area].join(" ").toLowerCase().includes(q);
    });

    const directoryRetailers = state.directoryRetailers.filter((retailer) => {
      if (!q) return true;
      return [retailer.retailer_name, retailer.agent_name, retailer.city, retailer.province, retailer.retailer_phone]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const pagedAgents = paginate(directoryAgents, state.directoryAgentsPage);
    state.directoryAgentsPage = pagedAgents.page;
    if (els.agentsDirectoryBody) {
      els.agentsDirectoryBody.innerHTML = pagedAgents.rows.length
        ? pagedAgents.rows
            .map(
              (agent) => `<tr>
                <td>${escapeHtml(agent.name)}</td>
                <td>${escapeHtml(agent.coverage_area || `${agent.city || ""} ${agent.province || ""}`.trim() || "—")}</td>
                <td>${agent.retailer_count || 0}</td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="3">No agents found.</td></tr>';
    }
    renderPager(els.agentsPager, pagedAgents.page, pagedAgents.total, (page) => {
      state.directoryAgentsPage = page;
      renderDirectory();
    });

    const pagedRetailers = paginate(directoryRetailers, state.directoryRetailersPage);
    state.directoryRetailersPage = pagedRetailers.page;
    if (els.retailersDirectoryBody) {
      els.retailersDirectoryBody.innerHTML = pagedRetailers.rows.length
        ? pagedRetailers.rows
            .map(
              (retailer) => `<tr>
                <td>${escapeHtml(retailer.retailer_name)}</td>
                <td>${escapeHtml(retailer.agent_name || "—")}</td>
                <td>${escapeHtml([retailer.city, retailer.province].filter(Boolean).join(", ") || "—")}</td>
                <td>${escapeHtml(retailer.retailer_phone || "—")}</td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="4">No retailers found.</td></tr>';
    }
    renderPager(els.retailersPager, pagedRetailers.page, pagedRetailers.total, (page) => {
      state.directoryRetailersPage = page;
      renderDirectory();
    });

    if (els.directoryMeta) {
      els.directoryMeta.textContent = `Showing ${directoryAgents.length} agents and ${directoryRetailers.length} retailers.`;
    }
  }

  async function loadAgents() {
    setStatus("Loading agents…");
    const data = await api("/api/admin/agents");
    state.agents = data.agents || [];
    renderAgents();
    setStatus(`Loaded ${state.agents.length} agents.`);
  }

  async function loadAgentDetail(agentId) {
    if (!agentId) return;
    state.selectedAgentId = agentId;
    setStatus("Loading agent detail…");
    state.details = await api(`/api/admin/agents/${agentId}`);
    renderDetails();
    setStatus("Agent detail loaded.");
  }

  async function loadDirectoryRetailers() {
    const detailResults = await Promise.all(
      state.agents.map(async (agent) => {
        try {
          const detail = await api(`/api/admin/agents/${agent.id}`);
          return (detail?.retailers || []).map((retailer) => ({ ...retailer, agent_name: agent.name }));
        } catch (_err) {
          return [];
        }
      })
    );
    state.directoryRetailers = detailResults.flat();
  }

  async function refreshDirectorySections() {
    if (els.directoryMeta) els.directoryMeta.textContent = "Loading network directory…";
    await loadDirectoryRetailers();
    renderDirectory();
  }

  async function addRetailer() {
    if (!state.selectedAgentId) return;
    await api(`/api/admin/agents/${state.selectedAgentId}/retailers`, {
      method: "POST",
      body: JSON.stringify({
        retailer_name: els.retailerName.value,
        city: els.retailerCity.value,
        province: els.retailerProvince.value,
        address_line1: els.retailerAddress.value,
        retailer_phone: els.retailerPhone.value,
        notes: els.retailerNotes.value
      })
    });
    els.retailerName.value = "";
    setStatus("Retailer saved.");
    await loadAgentDetail(state.selectedAgentId);
    await loadAgents();
    await refreshDirectorySections();
  }

  async function addBulkRetailers() {
    if (!state.selectedAgentId) return;
    await api(`/api/admin/agents/${state.selectedAgentId}/retailers`, {
      method: "POST",
      body: JSON.stringify({ bulk_paste: els.bulk.value })
    });
    els.bulk.value = "";
    setStatus("Bulk retailers saved.");
    await loadAgentDetail(state.selectedAgentId);
    await loadAgents();
    await refreshDirectorySections();
  }

  async function saveSkuRange() {
    if (!state.selectedAgentId) return;
    const sku_range = String(els.skuText.value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [sku, availability_label = "Core Range", priority_score = "0"] = line.split(",").map((x) => x.trim());
        return { sku, availability_label, priority_score: Number(priority_score || 0) };
      })
      .filter((entry) => entry.sku);

    await api(`/api/admin/agents/${state.selectedAgentId}/sku-range`, {
      method: "PUT",
      body: JSON.stringify({ sku_range })
    });
    setStatus("SKU range saved.");
    await loadAgentDetail(state.selectedAgentId);
  }

  document.getElementById("stockistsRefreshBtn")?.addEventListener("click", () => {
    Promise.all([loadAgents(), refreshDirectorySections()]).catch((err) => setStatus(err.message, true));
  });

  document.getElementById("stockistsSyncBtn")?.addEventListener("click", async () => {
    try {
      setStatus("Syncing agents from Shopify…");
      const out = await api("/api/admin/stockists/sync/shopify-agents", { method: "POST", body: "{}" });
      await loadAgents();
      await refreshDirectorySections();
      setStatus(`Sync complete: ${out.synced_count || 0} agents.`);
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  els.agentSelect?.addEventListener("change", (e) => {
    loadAgentDetail(e.target.value).catch((err) => setStatus(err.message, true));
  });

  els.search?.addEventListener("input", () => {
    state.query = String(els.search.value || "").trim();
    state.directoryAgentsPage = 1;
    state.directoryRetailersPage = 1;
    renderDirectory();
  });

  document.getElementById("stockistsAddRetailerBtn")?.addEventListener("click", () => addRetailer().catch((err) => setStatus(err.message, true)));
  document.getElementById("stockistsBulkBtn")?.addEventListener("click", () => addBulkRetailers().catch((err) => setStatus(err.message, true)));
  document.getElementById("stockistsSaveSkuBtn")?.addEventListener("click", () => saveSkuRange().catch((err) => setStatus(err.message, true)));

  Promise.all([loadAgents(), refreshDirectorySections()]).catch((err) => setStatus(err.message, true));
}
