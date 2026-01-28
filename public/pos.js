(() => {
  "use strict";

  const CONFIG = { SHOPIFY: { PROXY_BASE: "/shopify" } };

  const scanInput = document.getElementById("pos-scan");
  const addBtn = document.getElementById("pos-addBtn");
  const itemsBody = document.getElementById("pos-items");
  const totalEl = document.getElementById("pos-total");
  const statusEl = document.getElementById("pos-status");
  const submitBtn = document.getElementById("pos-submit");
  const printBtn = document.getElementById("pos-print");
  const clearBtn = document.getElementById("pos-clear");
  const receiptEl = document.getElementById("pos-receipt");
  const orderStatusEl = document.getElementById("pos-orderStatus");
  const cashierInput = document.getElementById("pos-cashier");

  const items = new Map();

  const money = (value) =>
    value == null || Number.isNaN(Number(value))
      ? "R0.00"
      : `R${Number(value).toFixed(2)}`;

  function setStatus(message, tone = "muted") {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color =
      tone === "err" ? "#fca5a5" : tone === "ok" ? "#86efac" : "#94a3b8";
  }

  function setOrderStatus(message, tone = "muted") {
    if (!orderStatusEl) return;
    orderStatusEl.textContent = message;
    orderStatusEl.style.color =
      tone === "err" ? "#fca5a5" : tone === "ok" ? "#86efac" : "#94a3b8";
  }

  function renderItems() {
    if (!itemsBody) return;
    if (!items.size) {
      itemsBody.innerHTML = `<tr><td colspan="5" class="meta">No items yet.</td></tr>`;
      totalEl.textContent = money(0);
      receiptEl.textContent = "Receipt will appear once items are added.";
      return;
    }

    let total = 0;
    let receiptLines = ["Flippen Lekka POS", "---------------------"];

    itemsBody.innerHTML = Array.from(items.values())
      .map((item) => {
        const lineTotal = (item.price || 0) * item.quantity;
        total += lineTotal;
        receiptLines.push(
          `${item.title || item.sku || "Item"} x${item.quantity} ${money(lineTotal)}`
        );
        return `
          <tr>
            <td>${item.title || item.sku || "Item"}</td>
            <td>${item.sku || "—"}</td>
            <td>
              <button class="qty-btn" data-action="dec" data-key="${item.key}">-</button>
              <button class="qty-btn" data-action="inc" data-key="${item.key}">+</button>
              ${item.quantity}
            </td>
            <td>${money(item.price)}</td>
            <td>${money(lineTotal)}</td>
          </tr>
        `;
      })
      .join("");

    totalEl.textContent = money(total);
    receiptLines.push("---------------------", `TOTAL: ${money(total)}`);
    receiptEl.textContent = receiptLines.join("\n");
  }

  function upsertItem(product) {
    const key = String(product.variantId || product.sku || product.title || "").trim();
    if (!key) return;
    const existing = items.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      items.set(key, {
        key,
        variantId: product.variantId || null,
        sku: product.sku || "",
        title: product.title || product.sku || "Item",
        price: product.price != null ? Number(product.price) : 0,
        quantity: 1
      });
    }
    renderItems();
  }

  async function fetchProductByCode(code) {
    const params = new URLSearchParams({
      q: code,
      productCode: code,
      includePriceTiers: "0",
      limit: "10"
    });
    const url = `${CONFIG.SHOPIFY.PROXY_BASE}/products/search?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Shopify lookup failed (${resp.status})`);
    }
    const data = await resp.json();
    return Array.isArray(data.products) ? data.products[0] : null;
  }

  async function handleScan() {
    const code = (scanInput?.value || "").trim();
    if (!code) return;
    setStatus("Looking up product…");
    try {
      const product = await fetchProductByCode(code);
      if (!product) {
        setStatus(`No product found for ${code}.`, "err");
        return;
      }
      upsertItem(product);
      setStatus(`Added ${product.title || product.sku}.`, "ok");
      scanInput.value = "";
      scanInput.focus();
    } catch (err) {
      console.error(err);
      setStatus("Unable to fetch product.", "err");
    }
  }

  async function submitOrder() {
    if (!items.size) {
      setOrderStatus("Add items before creating an order.", "err");
      return;
    }
    submitBtn.disabled = true;
    setOrderStatus("Creating cash order…");
    try {
      const lineItems = Array.from(items.values()).map((item) => ({
        variantId: item.variantId,
        sku: item.sku,
        title: item.title,
        price: item.price,
        quantity: item.quantity
      }));
      const payload = {
        lineItems,
        note: "POS walk-in cash order",
        cashier: (cashierInput?.value || "").trim()
      };
      const resp = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.message || "Failed to create order");
      }
      setOrderStatus(
        `Cash order created (${data.order?.name || data.order?.orderNumber || "OK"}).`,
        "ok"
      );
      items.clear();
      renderItems();
    } catch (err) {
      console.error(err);
      setOrderStatus(`Error: ${err.message || err}`, "err");
    } finally {
      submitBtn.disabled = false;
    }
  }

  function clearOrder() {
    items.clear();
    renderItems();
    setOrderStatus("Order cleared.");
  }

  if (addBtn) addBtn.addEventListener("click", handleScan);
  if (scanInput) {
    scanInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleScan();
      }
    });
  }

  if (itemsBody) {
    itemsBody.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-action]");
      if (!btn) return;
      const key = btn.dataset.key;
      const item = items.get(key);
      if (!item) return;
      if (btn.dataset.action === "inc") item.quantity += 1;
      if (btn.dataset.action === "dec") item.quantity = Math.max(0, item.quantity - 1);
      if (item.quantity === 0) items.delete(key);
      renderItems();
    });
  }

  if (submitBtn) submitBtn.addEventListener("click", submitOrder);
  if (printBtn) printBtn.addEventListener("click", () => window.print());
  if (clearBtn) clearBtn.addEventListener("click", clearOrder);

  renderItems();
})();
