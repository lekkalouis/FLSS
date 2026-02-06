let mrpInitialized = false;

export function initMrpView() {
  if (mrpInitialized) return;
  mrpInitialized = true;
  "use strict";

  const STORAGE_KEY = "fl_mrp_v1";

  const DEFAULT_STATE = {
    items: [
      { sku: "FL-ORG-200", name: "Original Spice 200ml", type: "product", unit: "unit", stock: 140 },
      { sku: "RM-BASE", name: "Spice base", type: "raw", unit: "kg", stock: 35 },
      { sku: "RM-CHILLI", name: "Chilli flakes", type: "raw", unit: "kg", stock: 12 },
      { sku: "PK-200ML", name: "200ml jar", type: "packaging", unit: "unit", stock: 380 }
    ],
    boms: [
      {
        id: "bom-fl-org-200",
        productSku: "FL-ORG-200",
        components: [
          { sku: "RM-BASE", qty: 0.18 },
          { sku: "RM-CHILLI", qty: 0.02 },
          { sku: "PK-200ML", qty: 1 }
        ]
      }
    ],
    orders: [
      { id: "po-1001", productSku: "FL-ORG-200", qty: 120, dueDate: "", status: "planned" }
    ]
  };

  const summaryItems = document.getElementById("mrp-summaryItems");
  const summaryBoms = document.getElementById("mrp-summaryBoms");
  const summaryOrders = document.getElementById("mrp-summaryOrders");
  const summaryShortages = document.getElementById("mrp-summaryShortages");

  const itemForm = document.getElementById("mrp-itemForm");
  const itemSku = document.getElementById("mrp-itemSku");
  const itemName = document.getElementById("mrp-itemName");
  const itemType = document.getElementById("mrp-itemType");
  const itemUnit = document.getElementById("mrp-itemUnit");
  const itemStock = document.getElementById("mrp-itemStock");

  const bomForm = document.getElementById("mrp-bomForm");
  const bomProduct = document.getElementById("mrp-bomProduct");
  const bomComponents = document.getElementById("mrp-bomComponents");

  const orderForm = document.getElementById("mrp-orderForm");
  const orderProduct = document.getElementById("mrp-orderProduct");
  const orderQty = document.getElementById("mrp-orderQty");
  const orderDue = document.getElementById("mrp-orderDue");
  const orderStatus = document.getElementById("mrp-orderStatus");

  const itemsBody = document.getElementById("mrp-itemsBody");
  const bomsBody = document.getElementById("mrp-bomsBody");
  const ordersBody = document.getElementById("mrp-ordersBody");
  const requirementsBody = document.getElementById("mrp-requirementsBody");

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.items && parsed?.boms && parsed?.orders) {
          return parsed;
        }
      }
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  function setState(next) {
    state = next;
    saveState();
    renderAll();
  }

  function normalizeSku(raw) {
    return String(raw || "").trim().toUpperCase();
  }

  function formatQty(value) {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/\.00$/, "");
  }

  function listProducts() {
    return state.items.filter((item) => item.type === "product");
  }

  function listProductOptions() {
    const products = listProducts();
    if (!products.length) return `<option value="">Add a product first</option>`;
    return products
      .map((item) => `<option value="${item.sku}">${item.sku} · ${item.name}</option>`)
      .join("");
  }

  function renderSummary(requirements) {
    const openOrders = state.orders.filter((order) => order.status !== "done");
    const shortageCount = requirements.filter((item) => item.shortfall > 0).length;
    if (summaryItems) summaryItems.textContent = String(state.items.length);
    if (summaryBoms) summaryBoms.textContent = String(state.boms.length);
    if (summaryOrders) summaryOrders.textContent = String(openOrders.length);
    if (summaryShortages) summaryShortages.textContent = String(shortageCount);
  }

  function renderItems() {
    if (!itemsBody) return;
    itemsBody.innerHTML = state.items
      .map((item) => {
        return `
          <tr>
            <td><strong>${item.sku}</strong></td>
            <td>${item.name}</td>
            <td>${item.type}</td>
            <td>${formatQty(item.stock || 0)}</td>
            <td>
              <input class="mrp-stockInput" type="number" min="0" step="1" data-sku="${item.sku}" />
              <button class="mrp-btn" type="button" data-action="adjust-stock" data-sku="${item.sku}">Set</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderBoms() {
    if (!bomsBody) return;
    bomsBody.innerHTML = state.boms
      .map((bom) => {
        const componentList = bom.components
          .map((component) => `${component.sku} × ${formatQty(component.qty)}`)
          .join(", ");
        return `
          <tr>
            <td><strong>${bom.productSku}</strong></td>
            <td>${componentList || "—"}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderOrders() {
    if (!ordersBody) return;
    ordersBody.innerHTML = state.orders
      .map((order) => {
        const statusClass =
          order.status === "done"
            ? "mrp-pill--done"
            : order.status === "in-progress"
              ? "mrp-pill--progress"
              : "mrp-pill--planned";
        return `
          <tr>
            <td><strong>${order.id}</strong></td>
            <td>${order.productSku}</td>
            <td>${formatQty(order.qty)}</td>
            <td>${order.dueDate || "—"}</td>
            <td>
              <span class="mrp-pill ${statusClass}">
                <select class="mrp-select" data-action="status" data-id="${order.id}">
                  <option value="planned" ${order.status === "planned" ? "selected" : ""}>Planned</option>
                  <option value="in-progress" ${order.status === "in-progress" ? "selected" : ""}>In progress</option>
                  <option value="done" ${order.status === "done" ? "selected" : ""}>Done</option>
                </select>
              </span>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function computeRequirements() {
    const requirementMap = new Map();
    state.orders
      .filter((order) => order.status !== "done")
      .forEach((order) => {
        const bom = state.boms.find((entry) => entry.productSku === order.productSku);
        if (!bom) return;
        bom.components.forEach((component) => {
          const needed = component.qty * order.qty;
          const current = requirementMap.get(component.sku) || 0;
          requirementMap.set(component.sku, current + needed);
        });
      });

    return Array.from(requirementMap.entries()).map(([sku, required]) => {
      const item = state.items.find((entry) => entry.sku === sku);
      const onHand = item?.stock || 0;
      const shortfall = Math.max(0, required - onHand);
      return {
        sku,
        name: item?.name || "Unknown item",
        required,
        onHand,
        shortfall
      };
    });
  }

  function renderRequirements(requirements) {
    if (!requirementsBody) return;
    if (!requirements.length) {
      requirementsBody.innerHTML = `
        <tr>
          <td colspan="4">No open orders or BOM requirements yet.</td>
        </tr>
      `;
      return;
    }
    requirementsBody.innerHTML = requirements
      .map((row) => {
        return `
          <tr>
            <td><strong>${row.sku}</strong><br><span class="mrp-note">${row.name}</span></td>
            <td>${formatQty(row.required)}</td>
            <td>${formatQty(row.onHand)}</td>
            <td class="${row.shortfall > 0 ? "mrp-short" : ""}">${formatQty(row.shortfall)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderSelectors() {
    const productOptions = listProductOptions();
    if (bomProduct) bomProduct.innerHTML = productOptions;
    if (orderProduct) orderProduct.innerHTML = productOptions;
  }

  function renderAll() {
    const requirements = computeRequirements();
    renderSelectors();
    renderSummary(requirements);
    renderItems();
    renderBoms();
    renderOrders();
    renderRequirements(requirements);
  }

  function addItem(event) {
    event.preventDefault();
    const sku = normalizeSku(itemSku?.value);
    const name = String(itemName?.value || "").trim();
    if (!sku || !name) return;
    const type = itemType?.value || "raw";
    const unit = String(itemUnit?.value || "").trim();
    const stockVal = Number(itemStock?.value || 0);
    const stock = Number.isFinite(stockVal) ? Math.max(0, stockVal) : 0;

    const existing = state.items.find((entry) => entry.sku === sku);
    if (existing) {
      existing.name = name;
      existing.type = type;
      existing.unit = unit;
      existing.stock = stock;
    } else {
      state.items.push({ sku, name, type, unit, stock });
    }

    if (itemSku) itemSku.value = "";
    if (itemName) itemName.value = "";
    if (itemUnit) itemUnit.value = "";
    if (itemStock) itemStock.value = "";
    setState({ ...state });
  }

  function parseComponents(raw) {
    return String(raw || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [skuRaw, qtyRaw] = part.split(":").map((value) => value.trim());
        const sku = normalizeSku(skuRaw);
        const qty = Number(qtyRaw || 0);
        if (!sku || !Number.isFinite(qty) || qty <= 0) return null;
        return { sku, qty };
      })
      .filter(Boolean);
  }

  function addBom(event) {
    event.preventDefault();
    const productSku = normalizeSku(bomProduct?.value);
    if (!productSku) return;
    const components = parseComponents(bomComponents?.value);
    if (!components.length) return;

    const existing = state.boms.find((bom) => bom.productSku === productSku);
    if (existing) {
      existing.components = components;
    } else {
      state.boms.push({
        id: `bom-${productSku}-${Date.now()}`,
        productSku,
        components
      });
    }
    if (bomComponents) bomComponents.value = "";
    setState({ ...state });
  }

  function addOrder(event) {
    event.preventDefault();
    const productSku = normalizeSku(orderProduct?.value);
    const qtyVal = Number(orderQty?.value || 0);
    if (!productSku || !Number.isFinite(qtyVal) || qtyVal <= 0) return;
    const dueDate = orderDue?.value || "";
    const status = orderStatus?.value || "planned";

    const nextOrder = {
      id: `PO-${Date.now()}`,
      productSku,
      qty: qtyVal,
      dueDate,
      status
    };

    state.orders.unshift(nextOrder);
    if (orderQty) orderQty.value = "";
    if (orderDue) orderDue.value = "";
    setState({ ...state });
  }

  function handleStockAdjust(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset.action;
    if (action !== "adjust-stock") return;
    const sku = target.dataset.sku;
    const input = itemsBody?.querySelector(`input[data-sku="${sku}"]`);
    if (!(input instanceof HTMLInputElement)) return;
    const val = Number(input.value);
    if (!Number.isFinite(val) || val < 0) return;
    const item = state.items.find((entry) => entry.sku === sku);
    if (!item) return;
    item.stock = val;
    input.value = "";
    setState({ ...state });
  }

  function handleOrderStatus(event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.dataset.action !== "status") return;
    const id = target.dataset.id;
    const order = state.orders.find((entry) => entry.id === id);
    if (!order) return;
    order.status = target.value;
    setState({ ...state });
  }

  itemForm?.addEventListener("submit", addItem);
  bomForm?.addEventListener("submit", addBom);
  orderForm?.addEventListener("submit", addOrder);
  itemsBody?.addEventListener("click", handleStockAdjust);
  ordersBody?.addEventListener("change", handleOrderStatus);

  renderAll();
}
