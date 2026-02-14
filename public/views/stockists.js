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
    skuText: document.getElementById("stockistsSkuText")
  };

  const state = { agents: [], selectedAgentId: "", details: null };

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

  function renderAgents() {
    if (!els.agentSelect) return;
    els.agentSelect.innerHTML = '<option value="">Select an agent…</option>';
    state.agents.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.name} (${a.retailer_count || 0} retailers)`;
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
        <strong>${agent.name}</strong> <span class="stockistsPill">${agent.active ? "Active" : "Inactive"}</span><br>
        ${agent.city || ""} ${agent.province || ""} ${agent.country || ""}<br>
        Coverage: ${agent.coverage_area || "—"} · Phone: ${agent.phone || "—"} · Email: ${agent.email || "—"}
      `;
    }

    if (els.retailersBody) {
      els.retailersBody.innerHTML = retailers.length
        ? retailers
            .map(
              (r) => `<tr><td>${r.retailer_name}</td><td>${r.city || ""}</td><td>${r.province || ""}</td><td>${r.retailer_phone || ""}</td></tr>`
            )
            .join("")
        : '<tr><td colspan="4">No retailers yet.</td></tr>';
    }

    if (els.skuBody) {
      els.skuBody.innerHTML = sku_range.length
        ? sku_range
            .map((s) => `<tr><td>${s.sku}</td><td>${s.availability_label}</td><td>${s.priority_score || 0}</td></tr>`)
            .join("")
        : '<tr><td colspan="3">No SKU range configured.</td></tr>';
    }

    if (els.skuText) {
      els.skuText.value = sku_range
        .map((s) => `${s.sku},${s.availability_label || "Core Range"},${s.priority_score || 0}`)
        .join("\n");
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
      .filter((x) => x.sku);

    await api(`/api/admin/agents/${state.selectedAgentId}/sku-range`, {
      method: "PUT",
      body: JSON.stringify({ sku_range })
    });
    setStatus("SKU range saved.");
    await loadAgentDetail(state.selectedAgentId);
  }

  document.getElementById("stockistsRefreshBtn")?.addEventListener("click", () => {
    loadAgents().catch((err) => setStatus(err.message, true));
  });
  document.getElementById("stockistsSyncBtn")?.addEventListener("click", async () => {
    try {
      setStatus("Syncing agents from Shopify…");
      const out = await api("/api/admin/stockists/sync/shopify-agents", { method: "POST", body: "{}" });
      await loadAgents();
      setStatus(`Sync complete: ${out.synced_count || 0} agents.`);
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  els.agentSelect?.addEventListener("change", (e) => {
    const value = e.target.value;
    loadAgentDetail(value).catch((err) => setStatus(err.message, true));
  });
  document.getElementById("stockistsAddRetailerBtn")?.addEventListener("click", () => addRetailer().catch((err) => setStatus(err.message, true)));
  document.getElementById("stockistsBulkBtn")?.addEventListener("click", () => addBulkRetailers().catch((err) => setStatus(err.message, true)));
  document.getElementById("stockistsSaveSkuBtn")?.addEventListener("click", () => saveSkuRange().catch((err) => setStatus(err.message, true)));

  loadAgents().catch((err) => setStatus(err.message, true));
}
