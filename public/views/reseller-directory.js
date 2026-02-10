const API_BASE = "/api/v1";
let initialized = false;
let leafletReady;
let map;
let markersLayer;
let circlesLayer;
let heatLayer;
let lastEntries = [];

function ensureLeaflet() {
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);

    if (!document.querySelector('link[data-leaflet="true"]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      css.dataset.leaflet = "true";
      document.head.appendChild(css);
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = async () => {
      if (!window.L) return reject(new Error("Leaflet failed to load"));
      if (!window.L.heatLayer) {
        await new Promise((heatResolve, heatReject) => {
          const heat = document.createElement("script");
          heat.src = "https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js";
          heat.async = true;
          heat.onload = heatResolve;
          heat.onerror = heatReject;
          document.head.appendChild(heat);
        });
      }
      resolve(window.L);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return leafletReady;
}

function badge(type) {
  const cls = type === "agent" ? "agent" : "retailer";
  return `<span class="resellerBadge ${cls}">${type}</span>`;
}

function renderList(entries) {
  const list = document.getElementById("resellerList");
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = '<p class="resellerEmpty">No matching entries.</p>';
    return;
  }

  list.innerHTML = entries
    .map((entry) => {
      const topVariants = (entry.variants || [])
        .slice(0, 4)
        .map((v) => `${v.sku || "(no sku)"} × ${v.quantity}`)
        .join(", ");
      const locality = [entry.address?.city, entry.address?.province].filter(Boolean).join(", ");
      return `
        <article class="resellerItem" data-id="${entry.id}">
          <strong>${entry.name || "Unnamed"}</strong>${badge(entry.type)}<br/>
          <small>${locality || "No address"}</small><br/>
          <small>${entry.coordinates ? `${entry.coordinates.lat.toFixed(3)}, ${entry.coordinates.lng.toFixed(3)}` : "No coordinates"}</small>
          <div><small><strong>Variants:</strong> ${topVariants || "No order history found yet"}</small></div>
        </article>
      `;
    })
    .join("");
}

function renderKpis(summary = {}) {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value ?? 0);
  };
  set("resellerTotal", summary.total || 0);
  set("resellerRetailers", summary.retailers || 0);
  set("resellerAgents", summary.agents || 0);
  set("resellerMapped", summary.withCoordinates || 0);
}

function applyMap(entries) {
  if (!map || !window.L) return;

  markersLayer.clearLayers();
  circlesLayer.clearLayers();
  if (heatLayer) heatLayer.remove();

  const plotted = entries.filter((entry) => entry.coordinates);

  const points = plotted.map((entry) => [
    entry.coordinates.lat,
    entry.coordinates.lng,
    entry.type === "agent" ? 0.65 : 1
  ]);

  if (points.length && window.L.heatLayer) {
    heatLayer = window.L.heatLayer(points, {
      radius: 24,
      blur: 18,
      maxZoom: 9,
      gradient: { 0.2: "#a5b4fc", 0.45: "#6366f1", 0.75: "#f97316", 1: "#dc2626" }
    }).addTo(map);
  }

  plotted.forEach((entry) => {
    const { lat, lng } = entry.coordinates;
    const color = entry.type === "agent" ? "#f59e0b" : "#2563eb";
    const marker = window.L.circleMarker([lat, lng], {
      radius: entry.type === "agent" ? 7 : 6,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.75
    });
    const variants = (entry.variants || [])
      .slice(0, 6)
      .map((v) => `<li>${v.sku || "(no sku)"} — ${v.title || "Variant"} × ${v.quantity}</li>`)
      .join("");
    marker.bindPopup(`
      <strong>${entry.name || "Unnamed"}</strong><br/>
      <em>${entry.type}</em><br/>
      ${(entry.address?.city || "")}${entry.address?.province ? `, ${entry.address.province}` : ""}<br/>
      ${entry.type === "agent" ? `Service radius: ${entry.radius_km || 30} km<br/>` : ""}
      <strong>Variants sold:</strong>
      <ul style="padding-left:1rem;margin:.3rem 0;max-height:140px;overflow:auto;">${variants || "<li>No variants yet</li>"}</ul>
    `);
    marker.addTo(markersLayer);

    if (entry.type === "agent") {
      window.L.circle([lat, lng], {
        radius: Number(entry.radius_km || 30) * 1000,
        color: "#f59e0b",
        fillColor: "#fbbf24",
        fillOpacity: 0.12,
        weight: 1.2
      }).addTo(circlesLayer);
    }
  });

  if (plotted.length) {
    const bounds = window.L.featureGroup([markersLayer]).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.18));
  }
}

function getFilters() {
  return {
    type: document.getElementById("resellerTypeFilter")?.value || "all",
    query: (document.getElementById("resellerSearch")?.value || "").trim().toLowerCase(),
    mappedOnly: Boolean(document.getElementById("resellerMappedOnly")?.checked)
  };
}

function applyFilters(entries) {
  const { type, query, mappedOnly } = getFilters();
  return entries.filter((entry) => {
    if (type !== "all" && entry.type !== type) return false;
    if (mappedOnly && !entry.coordinates) return false;
    if (!query) return true;
    const haystack = [
      entry.name,
      entry.email,
      entry.phone,
      entry.address?.city,
      entry.address?.province,
      ...(entry.variants || []).map((v) => `${v.sku} ${v.title}`)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function rerender() {
  const filtered = applyFilters(lastEntries);
  renderList(filtered);
  applyMap(filtered);
}

async function loadDirectory() {
  const status = document.getElementById("resellerStatus");
  if (status) status.textContent = "Loading reseller data...";

  const response = await fetch(`${API_BASE}/shopify/reseller-directory`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Directory fetch failed (${response.status})`);

  const payload = await response.json();
  lastEntries = Array.isArray(payload.entries) ? payload.entries : [];
  renderKpis(payload.summary || {});
  rerender();

  if (status) {
    status.textContent = `Updated ${new Date(payload.generatedAt || Date.now()).toLocaleString()} · ${lastEntries.length} entries`;
  }
}

export async function initResellerDirectoryView() {
  if (initialized) return;
  initialized = true;

  const mount = document.getElementById("resellerMap");
  if (!mount) return;

  await ensureLeaflet();
  map = window.L.map(mount, { zoomControl: true }).setView([-29, 24], 5);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  markersLayer = window.L.layerGroup().addTo(map);
  circlesLayer = window.L.layerGroup().addTo(map);

  const filterElements = ["resellerTypeFilter", "resellerSearch", "resellerMappedOnly"];
  filterElements.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const eventName = id === "resellerSearch" ? "input" : "change";
    el.addEventListener(eventName, rerender);
  });

  document.getElementById("resellerRefreshBtn")?.addEventListener("click", () => {
    loadDirectory().catch((err) => {
      const status = document.getElementById("resellerStatus");
      if (status) status.textContent = `Failed to load: ${err.message}`;
    });
  });

  await loadDirectory();
}
