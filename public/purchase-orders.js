const API = "/api/v1/shopify/draft-orders/purchase-order";

const GROUPS = [
  {
    title: "Spices & Herbs",
    items: [
      { sku: "RM-BASE-ORIG", title: "Original base blend", icon: "🌶️" },
      { sku: "RM-BASE-HOT", title: "Hot & spicy base blend", icon: "🔥" },
      { sku: "RM-CURRY", title: "Curry blend", icon: "🍛" },
      { sku: "RM-RED-PEPPER", title: "Red pepper mix", icon: "🫑" }
    ]
  },
  {
    title: "Bottles & Tubs",
    items: [
      { sku: "RM-PACK-200", title: "200ml shaker packs", icon: "🧴" },
      { sku: "RM-PACK-500", title: "500g pouches", icon: "🥣" },
      { sku: "RM-TUB-750", title: "750g tubs", icon: "🪣" },
      { sku: "RM-BAG-1KG", title: "1kg bags", icon: "🛍️" }
    ]
  },
  {
    title: "Labels & Packaging",
    items: [
      { sku: "RM-LABEL", title: "Product labels", icon: "🏷️" },
      { sku: "RM-CAPS", title: "Caps / closures", icon: "⭕" },
      { sku: "RM-BOX-12", title: "12 x 200ml box", icon: "📦" },
      { sku: "RM-WRAP", title: "Packaging paper", icon: "🧻" }
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

async function submitPurchaseOrder() {
  const lines = selectedLines();
  if (!lines.length) {
    setStatus("Add at least one quantity before ordering.", "err");
    return;
  }

  els.submit.disabled = true;
  setStatus("Creating draft purchase order...");
  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierName: String(els.supplier?.value || "").trim(),
        note: String(els.note?.value || "").trim(),
        lines
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload?.message || payload?.error || "Failed to create draft order", "err");
      return;
    }
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
