const searchInput = document.getElementById("searchInput");
const collectionInput = document.getElementById("collectionInput");
const limitInput = document.getElementById("limitInput");
const searchBtn = document.getElementById("searchBtn");
const collectionBtn = document.getElementById("collectionBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");
const errorLine = document.getElementById("errorLine");
const countBadge = document.getElementById("countBadge");
const summaryText = document.getElementById("summaryText");
const catalogueGrid = document.getElementById("catalogueGrid");
const emptyState = document.getElementById("emptyState");

const formatter = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR"
});

function setStatus(state, message) {
  statusBadge.textContent = state;
  statusText.textContent = message;
}

function setError(message) {
  if (!message) {
    errorLine.hidden = true;
    errorLine.textContent = "";
    return;
  }
  errorLine.hidden = false;
  errorLine.textContent = message;
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  collectionBtn.disabled = isLoading;
}

function formatPrice(price) {
  if (price == null || Number.isNaN(price)) return "Price unavailable";
  return formatter.format(Number(price));
}

function renderProducts(items) {
  catalogueGrid.innerHTML = "";
  if (!items.length) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = item.title || "Untitled product";

    const price = document.createElement("div");
    price.className = "price";
    price.textContent = formatPrice(item.price);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `
      <div><strong>SKU:</strong> ${item.sku || "—"}</div>
      <div><strong>Variant ID:</strong> ${item.variantId || "—"}</div>
      <div><strong>Weight:</strong> ${item.weightKg != null ? `${item.weightKg.toFixed(2)} kg` : "—"}</div>
    `;

    card.appendChild(title);
    card.appendChild(price);
    card.appendChild(meta);

    if (item.priceTiers) {
      const tiers = document.createElement("ul");
      tiers.className = "tiers";
      Object.entries(item.priceTiers).forEach(([tier, value]) => {
        const li = document.createElement("li");
        li.textContent = `${tier}: ${formatPrice(value)}`;
        tiers.appendChild(li);
      });
      card.appendChild(tiers);
    }

    fragment.appendChild(card);
  });
  catalogueGrid.appendChild(fragment);
}

function updateSummary(items, mode) {
  countBadge.textContent = `${items.length} items`;
  if (!items.length) {
    summaryText.textContent = "No products matched your request.";
    return;
  }
  summaryText.textContent = mode ? `Showing ${mode} results.` : "Showing latest results.";
}

async function loadProducts({ mode, query, limit }) {
  setLoading(true);
  setError("");
  setStatus("Loading", "Fetching products from Shopify...");

  try {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    let url = "";

    if (mode === "collection") {
      params.set("handle", query);
      url = `/shopify/products/collection?${params.toString()}`;
    } else {
      params.set("q", query);
      url = `/shopify/products/search?${params.toString()}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || "Shopify request failed");
    }

    const data = await resp.json();
    const items = Array.isArray(data.products) ? data.products : [];

    renderProducts(items);
    updateSummary(items, mode === "collection" ? `collection “${query}”` : `search “${query}”`);
    setStatus("Loaded", "Catalogue updated.");
  } catch (err) {
    renderProducts([]);
    updateSummary([], null);
    setStatus("Error", "Unable to load products.");
    setError(`Load failed: ${err.message}`);
  } finally {
    setLoading(false);
  }
}

function parseLimit() {
  const value = Number(limitInput.value);
  if (!Number.isFinite(value)) return 20;
  return Math.min(Math.max(value, 1), 50);
}

searchBtn.addEventListener("click", () => {
  const query = searchInput.value.trim();
  if (!query) {
    setError("Enter a search term to load products.");
    return;
  }
  loadProducts({ mode: "search", query, limit: parseLimit() });
});

collectionBtn.addEventListener("click", () => {
  const query = collectionInput.value.trim();
  if (!query) {
    setError("Enter a collection handle to load products.");
    return;
  }
  loadProducts({ mode: "collection", query, limit: parseLimit() });
});

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  collectionInput.value = "";
  setError("");
  setStatus("Idle", "Enter a search query or collection handle to load products.");
  updateSummary([], null);
  renderProducts([]);
});

const params = new URLSearchParams(window.location.search);
const initialSearch = params.get("q");
const initialCollection = params.get("collection");
if (initialSearch) {
  searchInput.value = initialSearch;
  loadProducts({ mode: "search", query: initialSearch, limit: parseLimit() });
} else if (initialCollection) {
  collectionInput.value = initialCollection;
  loadProducts({ mode: "collection", query: initialCollection, limit: parseLimit() });
}
