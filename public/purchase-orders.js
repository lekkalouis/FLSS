const PURCHASE_ORDER_ENDPOINTS = [
  "/api/v1/shopify/draft-orders/purchase-order",
  "/api/v1/draft-orders/purchase-order",
  "/api/v1/shopify/purchase-orders"
];

const CATALOG_DATASET_PATH = "/data/purchase-order-catalog.generated.json";

const state = {
  qtyBySku: new Map(),
  groups: []
};

const els = {
  grid: document.getElementById("materialGrid"),
  search: document.getElementById("search"),
  supplier: document.getElementById("supplier"),
  note: document.getElementById("note"),
  submit: document.getElementById("submitBtn"),
  status: document.getElementById("status")
};

function setStatus(message, tone = "") {
  if (!els.status) return;
  els.status.className = `status${tone ? ` ${tone}` : ""}`;
  els.status.textContent = message;
}

function itemIcon(item, group) {
  if (item?.flavourMappingHints?.includes("hot_spicy")) return "🔥";
  if (item?.flavourMappingHints?.includes("curry")) return "🍛";
  if (item?.flavourMappingHints?.includes("worcester")) return "🟣";
  return group.defaultIcon || "📦";
}

function filteredGroups() {
  const query = String(els.search?.value || "").trim().toLowerCase();
  if (!query) return state.groups;
  return state.groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.name} ${item.sku || ""}`.toLowerCase().includes(query))
  })).filter((group) => group.items.length);
}

function render() {
  const groups = filteredGroups();
  els.grid.innerHTML = groups.map((group) => `
    <section class="group">
      <h2>${group.title}</h2>
      <div class="items">
        ${group.items.map((item) => {
          const sku = item.sku || item.name;
          const qty = Number(state.qtyBySku.get(sku) || 0);
          return `<article class="item">
            <div class="icon" aria-hidden="true">${itemIcon(item, group)}</div>
            <div>
              <div class="name">${item.name}</div>
              <div class="meta">${item.sku || "No SKU"} • ${item.unitOfMeasure || "unit"}${item.flavourMappingHints?.length ? ` • ${item.flavourMappingHints.join(", ")}` : ""}</div>
            </div>
            <input class="qty" type="number" min="0" step="1" value="${qty}" data-sku="${sku}" aria-label="Qty for ${item.name}" />
          </article>`;
        }).join("")}
      </div>
    </section>
  `).join("");
}

function selectedLines() {
  const flat = state.groups.flatMap((group) => group.items);
  return flat
    .map((item) => {
      const sku = item.sku || item.name;
      return {
        sku,
        title: item.name,
        quantity: Math.max(0, Math.floor(Number(state.qtyBySku.get(sku) || 0)))
      };
    })
    .filter((line) => line.quantity > 0);
}

async function loadCatalog() {
  setStatus("Loading PO catalog data...");
  try {
    const response = await fetch(CATALOG_DATASET_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load catalog (${response.status}). Run npm run po:catalog:generate.`);
    }
    const dataset = await response.json();
    state.groups = Array.isArray(dataset?.groups) ? dataset.groups : [];
    render();

    if (!state.groups.length) {
      setStatus("No materials are available in the generated PO catalog. Run npm run po:catalog:generate after placing source PDFs in context_content/.", "err");
      return;
    }

    if (dataset?.fallbackMessage) {
      setStatus(dataset.fallbackMessage, "err");
      return;
    }

    setStatus(`Loaded ${state.groups.reduce((sum, group) => sum + (group.items?.length || 0), 0)} materials from generated catalog.`, "ok");
  } catch (error) {
    state.groups = [];
    render();
    setStatus(`Unable to load generated PO catalog. ${error.message} If source PDFs are missing, add context_content/VIP.pdf and context_content/raw_herbs_spices_blends.pdf then rerun npm run po:catalog:generate.`, "err");
  }
}

async function postPurchaseOrder(payload) {
  let lastError = null;
  for (const endpoint of PURCHASE_ORDER_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          lastError = new Error(`Endpoint not found: ${endpoint}`);
          continue;
        }
        throw new Error(body?.message || body?.error || `Request failed (${response.status})`);
      }
      return body;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No purchase-order endpoint is available");
}

async function submitPurchaseOrder() {
  const lines = selectedLines();
  if (!lines.length) {
    setStatus("Add at least one quantity before ordering.", "err");
    return;
  }

  els.submit.disabled = true;
  setStatus("Creating draft purchase order...");
  try {
    const payload = await postPurchaseOrder({
      supplierName: String(els.supplier?.value || "").trim(),
      note: String(els.note?.value || "").trim(),
      lines
    });
    setStatus(`Draft order created: ${payload?.draftOrder?.name || payload?.draftOrder?.id || "OK"}`, "ok");
    if (payload?.draftOrder?.adminUrl) {
      window.open(payload.draftOrder.adminUrl, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    setStatus(String(error?.message || error), "err");
  } finally {
    els.submit.disabled = false;
  }
}

els.grid?.addEventListener("input", (event) => {
  const input = event.target.closest("input[data-sku]");
  if (!input) return;
  const sku = input.dataset.sku;
  const qty = Math.max(0, Math.floor(Number(input.value) || 0));
  state.qtyBySku.set(sku, qty);
});

els.search?.addEventListener("input", render);
els.submit?.addEventListener("click", submitPurchaseOrder);

loadCatalog();
