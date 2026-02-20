const PURCHASE_ORDER_ENDPOINTS = [
  "/api/v1/shopify/draft-orders/purchase-order",
  "/api/v1/draft-orders/purchase-order",
  "/api/v1/shopify/purchase-orders"
];

const GROUPS = [
  {
    title: "FL raw spice blends (recipes)",
    items: [
      { sku: "FL-BLEND-MP", title: "Blended Spice / Original Multi Purpose", icon: "🌿" },
      { sku: "FL-BLEND-HOT", title: "Blended Spice / Hot & Spicy", icon: "🔥" },
      { sku: "FL-BLEND-CM", title: "Blended Spice / Curry Mix", icon: "🍛" },
      { sku: "FL-WS-GR", title: "FL Spice / Worcester Sauce", icon: "🟣" },
      { sku: "FL-RG-GR", title: "FL Spice / Red Wine & Garlic", icon: "🍷" },
      { sku: "FL-CS-GR", title: "FL Spice / Chutney", icon: "🥭" }
    ]
  },
  {
    title: "FL containers & finished material",
    items: [
      { sku: "LB-MP-100", title: "Labelled Bottle / Original / 100ml", icon: "🧴" },
      { sku: "LB-MP-200", title: "Labelled Bottle / Original / 200ml", icon: "🧴" },
      { sku: "LT-CM", title: "Labelled Tub / Curry Mix / 250ml", icon: "🪣" },
      { sku: "LT-MP-750", title: "Labelled Tub / Original / 750g", icon: "🪣" },
      { sku: "LT-WS-750", title: "Labelled Tub / Worcester / 750g", icon: "🪣" },
      { sku: "FL-LVB-MP-500", title: "Labelled Vacuum Bag / Original / 500g", icon: "🥣" },
      { sku: "FL-LVB-MP-1K", title: "Labelled Vacuum Bag / Original / 1kg", icon: "🛍️" }
    ]
  },
  {
    title: "Packaging & support",
    items: [
      { sku: "FL-PCAP-O", title: "Printed Flip Lid Caps / Orange", icon: "🟠" },
      { sku: "FL-PCAP-R", title: "Printed Flip Lid Caps / Red", icon: "🔴" },
      { sku: "FL-PCAP-BRN", title: "Printed Flip Lid Caps / Brown", icon: "🟤" },
      { sku: "FL-PCAP-M", title: "Printed Flip Lid Caps / Maroon", icon: "🟥" },
      { sku: "FL-PCAP-P", title: "Printed Flip Lid Caps / Purple", icon: "🟣" },
      { sku: "FL-PCAP-GRN", title: "Printed Flip Lid Caps / Green", icon: "🟢" },
      { sku: "BX-12-200", title: "12 x 200ml BOX", icon: "📦" },
      { sku: "THE-LAB-ST", title: "Thermal Labels / Standard", icon: "🏷️" }
    ]
  }
];

const state = { qtyBySku: new Map() };

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

function filteredGroups() {
  const query = String(els.search?.value || "").trim().toLowerCase();
  if (!query) return GROUPS;
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => `${item.title} ${item.sku}`.toLowerCase().includes(query))
  })).filter((group) => group.items.length);
}

function render() {
  const groups = filteredGroups();
  els.grid.innerHTML = groups.map((group) => `
    <section class="group">
      <h2>${group.title}</h2>
      <div class="items">
        ${group.items.map((item) => {
          const qty = Number(state.qtyBySku.get(item.sku) || 0);
          return `<article class="item">
            <div class="icon" aria-hidden="true">${item.icon}</div>
            <div>
              <div class="name">${item.title}</div>
              <div class="meta">${item.sku}</div>
            </div>
            <input class="qty" type="number" min="0" step="1" value="${qty}" data-sku="${item.sku}" aria-label="Qty for ${item.title}" />
          </article>`;
        }).join("")}
      </div>
    </section>
  `).join("");
}

function selectedLines() {
  const flat = GROUPS.flatMap((group) => group.items);
  return flat
    .map((item) => ({ ...item, quantity: Math.max(0, Math.floor(Number(state.qtyBySku.get(item.sku) || 0)))}))
    .filter((line) => line.quantity > 0)
    .map((line) => ({ sku: line.sku, title: line.title, quantity: line.quantity }));
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

render();
