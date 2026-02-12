import { initFlocsView } from "./views/flocs.js";
import { initStockView } from "./views/stock.js";
import { initPriceManagerView } from "./views/price-manager.js";
import { initTraceabilityView } from "./views/traceability.js";
import { initModuleDashboard } from "./views/dashboard.js";
import { initFeaturePlannerView } from "./views/feature-planner.js";

(() => {
  "use strict";

  // Runtime UI config seeded from defaults and enriched by `/api/v1/config` on boot.
  const CONFIG = {
    PROGRESS_STEP_DELAY_MS: 450
  };
  // Single API root used across all SPA modules.
  const API_BASE = "/api/v1";

  const loadConfig = async () => {
    const res = await fetch(`${API_BASE}/config`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
    const data = await res.json();
    Object.assign(CONFIG, data);
  };

  const $ = (id) => document.getElementById(id);
  const scanInput = $("scanInput");
  const uiOrderNo = $("uiOrderNo");
  const uiParcelCount = $("uiParcelCount");
  const uiExpectedCount = $("uiExpectedCount");
  const uiSessionMode = $("uiSessionMode");
  const uiParcelSource = $("uiParcelSource");
  const uiAutoBook = $("uiAutoBook");
  const uiCountdown = $("uiCountdown");
  const shipToCard = $("shipToCard");
  const uiCustomerName = $("uiCustomerName");
  const uiOrderWeight = $("uiOrderWeight");
  const parcelList = $("parcelList");
  const parcelNumbers = $("parcelNumbers");
  const bookingSummary = $("bookingSummary");
  const statusChip = $("statusChip");
  const stickerPreview = $("stickerPreview");
  const debugLog = $("debugLog");
  const quoteBox = $("quoteBox");
  const printMount = $("printMount");
  const serverStatusBar = $("serverStatusBar");
  const addrSearch = $("addrSearch");
  const addrResults = $("addrResults");
  const placeCodeInput = $("placeCode");
  const serviceSelect = $("serviceOverride");
  const truckBookBtn = $("truckBookBtn");
  const truckStatus = $("truckStatus");
  const truckParcelCount = $("truckParcelCount");
  const dispatchCreateCombined = $("dispatchCreateCombined");
  const dispatchExpandToggle = $("dispatchExpandToggle");
  const uiBundleOrders = $("uiBundleOrders");
  const uiMultiShip = $("uiMultiShip");

  const dispatchBoard = $("dispatchBoardGrid");
  const dispatchStamp = $("dispatchStamp");
  const dispatchProgressBar = $("dispatchProgressBar");
  const dispatchProgressFill = $("dispatchProgressFill");
  const dispatchProgressSteps = $("dispatchProgressSteps");
  const dispatchProgressLabel = $("dispatchProgressLabel");
  const dispatchLog = $("dispatchLog");
  const dispatchSelectionPanel = $("dispatchSelectionPanel");
  const dispatchSelectionCount = $("dispatchSelectionCount");
  const dispatchSelectionUnits = $("dispatchSelectionUnits");
  const dispatchSelectionBoxes = $("dispatchSelectionBoxes");
  const dispatchSelectionBoxesReadonly = $("dispatchSelectionBoxesReadonly");
  const dispatchSelectionWeight = $("dispatchSelectionWeight");
  const dispatchSelectionTime = $("dispatchSelectionTime");
  const dispatchSelectionClear = $("dispatchSelectionClear");
  const dispatchPrintDocs = $("dispatchPrintDocs");
  const dispatchDeliverSelected = $("dispatchDeliverSelected");
  const dispatchMarkDelivered = $("dispatchMarkDelivered");
  const dispatchOrderModal = $("dispatchOrderModal");
  const dispatchOrderModalBody = $("dispatchOrderModalBody");
  const dispatchOrderModalTitle = $("dispatchOrderModalTitle");
  const dispatchOrderModalMeta = $("dispatchOrderModalMeta");
  const dispatchShipmentModal = $("dispatchShipmentModal");
  const dispatchShipmentModalBody = $("dispatchShipmentModalBody");
  const dispatchShipmentModalTitle = $("dispatchShipmentModalTitle");
  const dispatchShipmentModalMeta = $("dispatchShipmentModalMeta");
  const scanProgressBar = $("scanProgressBar");
  const scanProgressFill = $("scanProgressFill");
  const scanProgressSteps = $("scanProgressSteps");
  const scanProgressLabel = $("scanProgressLabel");
  const scanDispatchLog = $("scanDispatchLog");

  const navDashboard = $("navDashboard");
  const navScan = $("navScan");
  const navFulfillmentHistory = $("navFulfillmentHistory");
  const navContacts = $("navContacts");
  const navOps = $("navOps");
  const navDocs = $("navDocs");
  const navFlowcharts = $("navFlowcharts");
  const navFlocs = $("navFlocs");
  const navStock = $("navStock");
  const navPriceManager = $("navPriceManager");
  const navTraceability = $("navTraceability");
  const navFeatureMap = $("navFeatureMap");
  const navIdeas = $("navIdeas");
  const navToggle = $("navToggle");
  const viewDashboard = $("viewDashboard");
  const viewScan = $("viewScan");
  const viewFulfillmentHistory = $("viewFulfillmentHistory");
  const viewContacts = $("viewContacts");
  const viewOps = $("viewOps");
  const viewDocs = $("viewDocs");
  const viewFlowcharts = $("viewFlowcharts");
  const viewFlocs = $("viewFlocs");
  const viewStock = $("viewStock");
  const viewPriceManager = $("viewPriceManager");
  const viewTraceability = $("viewTraceability");
  const viewFeatureMap = $("viewFeatureMap");
  const viewIdeas = $("viewIdeas");
  const screenFlash = $("screenFlash");
  const emergencyStopBtn = $("emergencyStop");

  const btnBookNow = $("btnBookNow");
  const modeToggle = $("modeToggle");
  const moduleGrid = $("moduleGrid");
  const kpiParcels = $("kpiParcels");
  const kpiOpenOrders = $("kpiOpenOrders");
  const kpiRecentShipments = $("kpiRecentShipments");
  const kpiMode = $("kpiMode");
  const kpiTruckStatus = $("kpiTruckStatus");
  const kpiLastScan = $("kpiLastScan");
  const dailyTodoWidget = $("dailyTodoWidget");
  const dailyTodoList = $("dailyTodoList");
  const dailyTodoMeta = $("dailyTodoMeta");
  const dailyTodoClose = $("dailyTodoClose");
  const fulfillmentHistorySearch = $("fulfillmentHistorySearch");
  const fulfillmentHistoryMeta = $("fulfillmentHistoryMeta");
  const fulfillmentHistoryStatusFilter = $("fulfillmentHistoryStatusFilter");
  const fulfillmentHistoryList = $("fulfillmentHistoryList");
  const contactsSearch = $("contactsSearch");
  const contactsTierFilter = $("contactsTierFilter");
  const contactsProvinceFilter = $("contactsProvinceFilter");
  const contactsMeta = $("contactsMeta");
  const contactsList = $("contactsList");

  // Scan-session state (current order, linked orders, and scanned parcels).
  let activeOrderNo = null;
  let orderDetails = null;
  let parcelsByOrder = new Map();
  let armedForBooking = false;
  let lastScanAt = null;
  let lastScanCode = null;

  let placeCodeOverride = null;
  let serviceOverride = "RFX";
  let addressBook = [];
  let bookedOrders = new Set();
  let isAutoMode = true;
  let linkedOrders = new Map();
  const combinedShipments = new Map();
  const combinedOrderToGroup = new Map();
  const printedDeliveryNotes = new Set();
  const dispatchOrderCache = new Map();
  const dispatchShipmentCache = new Map();
  const dispatchPackingState = new Map();
  const dispatchSelectedOrders = new Set();
  let activeDispatchOrderNo = null;
  let dispatchOrdersLatest = [];
  // Lightweight per-view state containers keep modules decoupled without adding a framework.
  const fulfillmentHistoryState = {
    query: "",
    statusFilter: "all",
    streams: {
      shipped: [],
      delivered: [],
      collected: []
    }
  };
  const contactsState = {
    query: "",
    tier: "",
    province: "",
    customers: [],
    loaded: false,
    retryTimer: null
  };
  const SA_PROVINCES = [
    "Eastern Cape",
    "Free State",
    "Gauteng",
    "KwaZulu-Natal",
    "Limpopo",
    "Mpumalanga",
    "North West",
    "Northern Cape",
    "Western Cape"
  ];
  let dispatchModalOrderNo = null;
  let dispatchModalShipmentId = null;
  let fulfillmentHistoryRefreshTimer = null;
  let serverStatusRefreshTimer = null;
  const DAILY_PARCEL_KEY = "fl_daily_parcel_count_v1";
  const TRUCK_BOOKING_KEY = "fl_truck_booking_v1";
  const DAILY_TODO_KEY = "fl_daily_todo_v1";
  let dailyParcelCount = 0;
  let truckBooked = false;
  let truckBookedAt = null;
  let truckBookedBy = null;
  let truckBookingInFlight = false;
  let dailyTodoDismissed = false;
  const DAILY_TODO_SHORTCUT = "Alt+Shift+T";
  // Operations checklist shown on dashboard; persisted per-browser in localStorage.
  const DAILY_TODO_ITEMS = [
    "Stock take",
    "Production planning",
    "Receive stock",
    "Dispatch checks",
    "Warehouse housekeeping"
  ];
  let dailyTodoState = DAILY_TODO_ITEMS.map((label) => ({ label, done: false }));
  // Shared dispatch progress timeline used in scan and board views.
  const DISPATCH_STEPS = [
    "Start",
    "Quote",
    "Service",
    "Book",
    "Print",
    "Booked",
    "Notify"
  ];
  const lineItemAbbreviations = {
    "original multi-purpose spice": "",
    "original multi-purpose spice - tub": "",
    "hot & spicy multi-purpose spice": "H",
    "worcester sauce spice": "WS",
    "worcester sauce spice - tub": "WS",
    "red wine & garlic sprinkle": "RG",
    "chutney sprinkle": "CS",
    "savoury herb mix": "SH",
    "salt & vinegar seasoning": "SV",
    "butter popcorn sprinkle": "BUT",
    "sour cream & chives popcorn sprinkle": "SCC",
    "chutney popcorn sprinkle": "CHUT",
    "parmesan popcorn sprinkle": "PAR",
    "cheese and onion popcorn sprinkle": "CHO",
    "salt & vinegar popcorn sprinkle": "SV",
    "flippen lekka curry mix": "Curry",
    "original multi purpose basting sauce": "Basting"
  };
  const lineItemOrder = Object.keys(lineItemAbbreviations);
  const lineItemOrderIndex = new Map(
    lineItemOrder.map((key, index) => [key, index])
  );
  const OPP_DOCUMENTS = [
    { type: "picklist", label: "OPP pick list" },
    { type: "packing-slip", label: "OPP packing slip" }
  ];

  const dbgOn = new URLSearchParams(location.search).has("debug");
  if (dbgOn && debugLog) debugLog.style.display = "block";

  const statusExplain = (msg, tone = "info") => {
    if (statusChip) statusChip.textContent = msg;
  };
  const triggerBookedFlash = () => {};

  const appendDebug = (msg) => {
    if (!dbgOn || !debugLog) return;
    debugLog.textContent += `\n${new Date().toLocaleTimeString()} ${msg}`;
    debugLog.scrollTop = debugLog.scrollHeight;
  };

  // Human-friendly service names for status chips and diagnostics.
  const SERVICE_LABELS = {
    server: "FL Server",
    shopify: "Shopify API",
    parcelPerfect: "SWE PP API",
    printNode: "Print Node",
    email: "Email Service"
  };

  function getParcelSet(orderNo) {
    if (!orderNo) return new Set();
    if (!parcelsByOrder.has(orderNo)) parcelsByOrder.set(orderNo, new Set());
    return parcelsByOrder.get(orderNo);
  }

  function getActiveParcelSet() {
    return getParcelSet(activeOrderNo);
  }

  function getBundleOrderNos() {
    if (!activeOrderNo) return [];
    return [activeOrderNo, ...linkedOrders.keys()];
  }

  function getBundleOrders() {
    if (!activeOrderNo || !orderDetails) return [];
    const bundle = [{ orderNo: activeOrderNo, details: orderDetails }];
    linkedOrders.forEach((details, orderNo) => {
      bundle.push({ orderNo, details });
    });
    return bundle;
  }

  function getTotalScannedCount() {
    return getBundleOrderNos().reduce((sum, orderNo) => sum + getParcelSet(orderNo).size, 0);
  }

  function getTotalExpectedCount() {
    const bundle = getBundleOrders();
    if (!bundle.length) return null;
    let total = 0;
    for (const { details } of bundle) {
      const expected = getExpectedParcelCount(details);
      if (!expected) return null;
      total += expected;
    }
    return total;
  }

  function normalizeAddressField(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function addressSignature(details) {
    if (!details) return "";
    return [
      normalizeAddressField(details.address1),
      normalizeAddressField(details.address2),
      normalizeAddressField(details.city),
      normalizeAddressField(details.province),
      normalizeAddressField(details.postal)
    ]
      .filter(Boolean)
      .join("|");
  }

  

  function orderNoFromName(name) {
    return String(name || "").replace("#", "").trim();
  }

  function getDispatchOrderAddress(order) {
    if (!order) return null;
    return {
      name: order.customer_name || order.name || "",
      address1: order.shipping_address1 || "",
      address2: order.shipping_address2 || "",
      city: order.shipping_city || "",
      province: order.shipping_province || "",
      postal: order.shipping_postal || ""
    };
  }

  function addressSignatureFromOrder(order) {
    const addr = getDispatchOrderAddress(order);
    if (!addr) return "";
    return [addr.address1, addr.address2, addr.city, addr.province, addr.postal]
      .map(normalizeAddressField)
      .filter(Boolean)
      .join("|");
  }

  function colorFromGroupId(groupId) {
    const palette = ["#22d3ee", "#a78bfa", "#fb7185", "#34d399", "#f59e0b", "#60a5fa"];
    let hash = 0;
    for (const ch of String(groupId || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  function getCombinedGroupForOrder(orderNo) {
    const groupId = combinedOrderToGroup.get(String(orderNo || ""));
    if (!groupId) return null;
    return combinedShipments.get(groupId) || null;
  }

  async function createCombinedShipmentFromSelection() {
    const selected = Array.from(dispatchSelectedOrders);
    if (selected.length < 2) {
      statusExplain("Select at least 2 orders to create a combined shipment.", "warn");
      return;
    }
    const orders = selected
      .map((orderNo) => dispatchOrderCache.get(orderNo))
      .filter(Boolean);
    if (orders.length < 2) {
      statusExplain("Unable to resolve selected orders.", "warn");
      return;
    }

    const addressOptions = [];
    const seen = new Set();
    for (const order of orders) {
      const signature = addressSignatureFromOrder(order);
      if (!signature || seen.has(signature)) continue;
      seen.add(signature);
      const orderNo = orderNoFromName(order.name);
      const addr = getDispatchOrderAddress(order);
      addressOptions.push({ orderNo, signature, address: addr });
    }

    if (!addressOptions.length) {
      statusExplain("Selected orders are missing shipping addresses.", "warn");
      return;
    }

    let chosen = addressOptions[0];
    if (addressOptions.length > 1) {
      const promptText = addressOptions
        .map((opt, idx) => `${idx + 1}. ${opt.orderNo} - ${opt.address.address1}, ${opt.address.city}`)
        .join("\n");
      const raw = window.prompt(`Select shipping address for combined shipment:\n${promptText}\n\nEnter option number:`, "1");
      const idx = Number.parseInt(String(raw || "").trim(), 10);
      if (!Number.isInteger(idx) || idx < 1 || idx > addressOptions.length) {
        statusExplain("Combined shipment cancelled.", "warn");
        return;
      }
      chosen = addressOptions[idx - 1];
    }

    const groupId = `combined-${Date.now()}`;
    const group = {
      id: groupId,
      orderNos: selected,
      addressSignature: chosen.signature,
      address: chosen.address,
      color: colorFromGroupId(groupId)
    };
    combinedShipments.set(groupId, group);
    selected.forEach((orderNo) => combinedOrderToGroup.set(orderNo, groupId));
    renderDispatchBoard(dispatchOrdersLatest);
    statusExplain(`Combined shipment created for ${selected.length} orders.`, "ok");
  }

  function renderServerStatusBar(data) {
    if (!serverStatusBar) return;
    if (!data || !data.services) {
      serverStatusBar.innerHTML = `<span class="statusBarLabel">Connections</span><span class="statusPill statusPill--warn"><span class="statusPillDot"></span>Status unavailable</span>`;
      return;
    }

    const pills = Object.entries(data.services).map(([key, service]) => {
      const label = SERVICE_LABELS[key] || key;
      const cls = service.ok ? "statusPill--ok" : "statusPill--err";
      const detail = service.detail ? ` — ${service.detail}` : "";
      return `<span class="statusPill ${cls}" title="${label}${detail}"><span class="statusPillDot"></span>${label}</span>`;
    });

    const stamp = data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString() : "";
    serverStatusBar.innerHTML = `<span class="statusBarLabel">Connections</span>${pills.join("")}${
      stamp ? `<span class="statusBarLabel">Updated ${stamp}</span>` : ""
    }`;
  }

  async function refreshServerStatus() {
    if (!serverStatusBar) return false;
    try {
      const res = await fetch(`${API_BASE}/statusz`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Status error");
      renderServerStatusBar(data);
      return true;
    } catch (err) {
      appendDebug("Status refresh failed: " + String(err));
      renderServerStatusBar(null);
      return false;
    }
  }

  function scheduleServerStatusRefresh(delayMs = 20000) {
    if (serverStatusRefreshTimer) clearTimeout(serverStatusRefreshTimer);
    serverStatusRefreshTimer = setTimeout(async () => {
      const ok = await refreshServerStatus();
      scheduleServerStatusRefresh(ok ? 20000 : 60000);
    }, delayMs);
  }

  let dispatchAudioCtx = null;

  function playDispatchTone(freq = 740, duration = 0.12) {
    try {
      if (!dispatchAudioCtx) {
        dispatchAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = dispatchAudioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      appendDebug("Audio tone blocked: " + String(e));
    }
  }

  function playFeedbackTone(type = "success") {
    try {
      if (!dispatchAudioCtx) {
        dispatchAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = dispatchAudioCtx;
      const now = ctx.currentTime;
      const tones =
        type === "failure"
          ? [
              { freq: 220, start: 0, duration: 0.18 },
              { freq: 180, start: 0.2, duration: 0.24 }
            ]
          : type === "warn"
          ? [
              { freq: 520, start: 0, duration: 0.16 },
              { freq: 420, start: 0.2, duration: 0.18 }
            ]
          : [
              { freq: 880, start: 0, duration: 0.12 },
              { freq: 660, start: 0.16, duration: 0.16 }
            ];

      tones.forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = tone.freq;
        gain.gain.value = 0.18;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const startAt = now + tone.start;
        osc.start(startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + tone.duration);
        osc.stop(startAt + tone.duration);
      });
    } catch (e) {
      appendDebug("Feedback tone blocked: " + String(e));
    }
  }

  function triggerScreenFlash(type = "success") {
    if (!screenFlash) return;
    screenFlash.classList.remove("screenFlash--success", "screenFlash--failure", "screenFlash--warn");
    void screenFlash.offsetWidth;
    screenFlash.classList.add(
      type === "failure"
        ? "screenFlash--failure"
        : type === "warn"
        ? "screenFlash--warn"
        : "screenFlash--success"
    );
  }

  function confirmScanFeedback(type) {
    playFeedbackTone(type);
    triggerScreenFlash(type);
  }

  function confirmBookingFeedback(type) {
    playFeedbackTone(type);
    triggerScreenFlash(type);
  }

  const dispatchProgressTargets = [
    {
      label: dispatchProgressLabel,
      fill: dispatchProgressFill,
      steps: dispatchProgressSteps,
      bar: dispatchProgressBar
    },
    {
      label: scanProgressLabel,
      fill: scanProgressFill,
      steps: scanProgressSteps,
      bar: scanProgressBar
    }
  ];

  function initDispatchProgress() {
    dispatchProgressTargets.forEach((target) => {
      if (!target.steps) return;
      target.steps.innerHTML = DISPATCH_STEPS.map(
        (step) => `
          <div class="dispatchProgressStep">
            <span class="dispatchProgressDot"></span>
            <span>${step}</span>
          </div>
        `
      ).join("");
    });
  }

  function setDispatchProgress(stepIndex, label = "In progress", options = {}) {
    dispatchProgressTargets.forEach((target) => {
      if (target.label) target.label.textContent = label;
      if (target.fill) {
        const pct = Math.max(0, Math.min(1, stepIndex / (DISPATCH_STEPS.length - 1)));
        target.fill.style.width = `${pct * 100}%`;
      }
      if (target.steps) {
        const nodes = target.steps.querySelectorAll(".dispatchProgressStep");
        nodes.forEach((node, idx) => {
          node.classList.toggle("is-active", idx === stepIndex);
          node.classList.toggle("is-complete", idx < stepIndex);
        });
      }
      if (target.bar) {
        target.bar.classList.remove("is-pulse");
        void target.bar.offsetWidth;
        target.bar.classList.add("is-pulse");
      }
    });
    if (!options.silent) {
      playDispatchTone(700 + stepIndex * 40, 0.12);
    }
  }

  function progressDelay() {
    return new Promise((resolve) => setTimeout(resolve, CONFIG.PROGRESS_STEP_DELAY_MS));
  }

  async function stepDispatchProgress(stepIndex, label, options = {}) {
    setDispatchProgress(stepIndex, label, options);
    await progressDelay();
  }

  function appendDispatchLogEntry(logEl, message) {
    if (!logEl) return;
    const entry = document.createElement("div");
    entry.className = "dispatchLogEntry";
    const ts = document.createElement("span");
    ts.textContent = new Date().toLocaleTimeString();
    const msg = document.createElement("div");
    msg.textContent = message;
    entry.append(ts, msg);
    logEl.prepend(entry);
  }

  function logDispatchEvent(message) {
    appendDispatchLogEntry(dispatchLog, message);
    appendDispatchLogEntry(scanDispatchLog, message);
  }

  function formatDispatchTime(value) {
    if (!value) return "—";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleTimeString();
  }

  function formatDispatchDuration(start, end) {
    if (!start || !end) return "";
    const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
    const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
    const diffMs = Math.max(0, endMs - startMs);
    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  function makePackingKey(item, index) {
    return [
      String(item.title || "").trim(),
      String(item.variant_title || "").trim(),
      String(item.sku || "").trim(),
      index
    ].join("||");
  }

  function getPackingState(order) {
    const orderNo = String(order?.name || "").replace("#", "").trim();
    if (!orderNo) return null;
    const lineItems = (order.line_items || []).map((item, index) => {
      const quantity = Number(item.quantity) || 0;
      return {
        key: makePackingKey(item, index),
        index,
        title: item.title || "Item",
        variant: item.variant_title || "",
        sku: item.sku || "",
        quantity
      };
    });
    const existing = dispatchPackingState.get(orderNo);
    const existingByKey = new Map(
      (existing?.items || []).map((item) => [item.key, item])
    );
    const items = lineItems.map((item) => {
      const prev = existingByKey.get(item.key);
      const packed = prev ? Math.min(prev.packed, item.quantity) : 0;
      return { ...item, packed };
    });
    const state = {
      orderNo,
      active: existing?.active ?? false,
      startTime: existing?.startTime ?? null,
      endTime: existing?.endTime ?? null,
      parcels: existing?.parcels ?? [],
      items,
      boxes: normalizePackingBoxes(existing?.boxes),
      activeBoxIndex: Number.isInteger(existing?.activeBoxIndex)
        ? existing.activeBoxIndex
        : null
    };
    dispatchPackingState.set(orderNo, state);
    return state;
  }

  function getPackingItem(state, itemKey) {
    if (!state) return null;
    return state.items.find((item) => item.key === itemKey) || null;
  }

  function normalizePackingBoxes(boxes) {
    if (!Array.isArray(boxes)) return [];
    return boxes.map((box, index) => ({
      label: String(box?.label || `PARCEL ${index + 1}`),
      items: box?.items && typeof box.items === "object" ? { ...box.items } : {},
      parcelCode: String(box?.parcelCode || "").trim()
    }));
  }

  function addPackingBox(state, { seedPacked = false } = {}) {
    if (!state) return null;
    if (!Array.isArray(state.boxes)) state.boxes = [];
    const label = `PARCEL ${state.boxes.length + 1}`;
    const box = {
      label,
      items: seedPacked ? snapshotPackedItems(state) : {},
      parcelCode: ""
    };
    state.boxes.push(box);
    state.activeBoxIndex = state.boxes.length - 1;
    return box;
  }

  function ensureActiveBox(state) {
    if (!state) return null;
    if (!Array.isArray(state.boxes)) state.boxes = [];
    const activeIndex =
      Number.isInteger(state.activeBoxIndex) &&
      state.activeBoxIndex >= 0 &&
      state.activeBoxIndex < state.boxes.length
        ? state.activeBoxIndex
        : null;
    if (activeIndex == null) {
      if (!state.boxes.length) {
        addPackingBox(state);
      }
      state.activeBoxIndex = 0;
    }
    return state.boxes[state.activeBoxIndex];
  }

  function snapshotPackedItems(state) {
    if (!state) return {};
    return state.items.reduce((acc, item) => {
      const packed = Number(item.packed) || 0;
      if (packed > 0) acc[item.key] = packed;
      return acc;
    }, {});
  }

  function allocatePackedToBox(state, itemKey, qty) {
    if (!state || !itemKey || !qty) return;
    const box = ensureActiveBox(state);
    if (!box) return;
    box.items[itemKey] = (Number(box.items[itemKey]) || 0) + qty;
  }

  function getPackingParcelCount(state) {
    if (!state) return 0;
    const boxes = Array.isArray(state.boxes) ? state.boxes : [];
    if (boxes.length) return boxes.length;
    return Array.isArray(state.parcels) ? state.parcels.length : 0;
  }

  function loadPackingState() {
    try {
      const raw = localStorage.getItem("fl_packing_state_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      Object.entries(parsed).forEach(([orderNo, state]) => {
        if (!state || typeof state !== "object") return;
        const items = Array.isArray(state.items) ? state.items : [];
        const parcels = Array.isArray(state.parcels) ? state.parcels : [];
        const boxes = normalizePackingBoxes(state.boxes);
        const activeBoxIndex = Number.isInteger(state.activeBoxIndex)
          ? state.activeBoxIndex
          : null;
        dispatchPackingState.set(orderNo, {
          orderNo,
          active: Boolean(state.active),
          startTime: state.startTime || null,
          endTime: state.endTime || null,
          parcels,
          items,
          boxes,
          activeBoxIndex
        });
      });
    } catch {}
  }

  function savePackingState() {
    try {
      const payload = {};
      dispatchPackingState.forEach((state, orderNo) => {
        payload[orderNo] = {
          active: Boolean(state.active),
          startTime: state.startTime || null,
          endTime: state.endTime || null,
          parcels: Array.isArray(state.parcels) ? state.parcels : [],
          items: Array.isArray(state.items) ? state.items : [],
          boxes: normalizePackingBoxes(state.boxes),
          activeBoxIndex: Number.isInteger(state.activeBoxIndex)
            ? state.activeBoxIndex
            : null
        };
      });
      localStorage.setItem("fl_packing_state_v1", JSON.stringify(payload));
    } catch {}
  }

  function isPackingComplete(state) {
    if (!state) return false;
    return state.items.every((item) => item.packed >= item.quantity);
  }

  function finalizePacking(state) {
    if (!state || state.endTime) return;
    state.endTime = new Date().toISOString();
    state.active = false;
    const duration = formatDispatchDuration(state.startTime, state.endTime);
    logDispatchEvent(
      `Packing finished for order ${state.orderNo}${duration ? ` (${duration})` : ""}.`
    );
    savePackingState();
  }

  function renderCountdown() {
    if (uiCountdown) uiCountdown.textContent = "--";
  }

  function money(v) {
    return v == null || isNaN(v) ? "-" : `R${Number(v).toFixed(2)}`;
  }
  function loadModePreference() {
    try {
      const stored = localStorage.getItem("fl_mode_v1");
      if (stored === "manual") isAutoMode = false;
    } catch {}
  }

  function saveModePreference() {
    try {
      localStorage.setItem("fl_mode_v1", isAutoMode ? "auto" : "manual");
    } catch {}
  }

  function updateModeToggle() {
    if (!modeToggle) return;
    modeToggle.textContent = isAutoMode ? "MODE: AUTO" : "MODE: MANUAL";
    modeToggle.setAttribute("aria-pressed", isAutoMode ? "true" : "false");
  }

  function loadBookedOrders() {
    try {
      const raw = localStorage.getItem("fl_booked_orders_v1");
      if (raw) bookedOrders = new Set(JSON.parse(raw));
    } catch {}
  }

  function saveBookedOrders() {
    try {
      localStorage.setItem("fl_booked_orders_v1", JSON.stringify([...bookedOrders]));
    } catch {}
  }

  function markBooked(orderNo) {
    bookedOrders.add(String(orderNo));
    saveBookedOrders();
  }

  function isBooked(orderNo) {
    return bookedOrders.has(String(orderNo));
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeDailyTodoState(raw) {
    if (!Array.isArray(raw)) return DAILY_TODO_ITEMS.map((label) => ({ label, done: false }));
    return DAILY_TODO_ITEMS.map((label, index) => {
      const item = raw[index];
      return {
        label,
        done: Boolean(item && item.done)
      };
    });
  }

  function saveDailyTodoState() {
    try {
      localStorage.setItem(
        DAILY_TODO_KEY,
        JSON.stringify({
          date: todayKey(),
          dismissed: dailyTodoDismissed,
          items: dailyTodoState
        })
      );
    } catch {}
  }

  function updateDailyTodoVisibility() {
    if (!dailyTodoWidget) return;
    const completed = dailyTodoState.filter((item) => item.done).length;
    const allDone = completed === dailyTodoState.length;
    const shouldShow = !allDone && !dailyTodoDismissed;
    dailyTodoWidget.hidden = !shouldShow;
    dailyTodoWidget.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  }

  function renderDailyTodo() {
    if (!dailyTodoList || !dailyTodoMeta) return;
    dailyTodoList.innerHTML = "";
    dailyTodoState.forEach((item, index) => {
      const row = document.createElement("label");
      row.className = "todoWidgetItem";
      row.classList.toggle("is-done", item.done);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.done;
      checkbox.dataset.todoIndex = String(index);

      const text = document.createElement("span");
      text.textContent = item.label;

      row.appendChild(checkbox);
      row.appendChild(text);
      dailyTodoList.appendChild(row);
    });
    const completed = dailyTodoState.filter((item) => item.done).length;
    dailyTodoMeta.textContent = `${completed} of ${dailyTodoState.length} complete · Shortcut: ${DAILY_TODO_SHORTCUT}`;
    updateDailyTodoVisibility();
  }

  function loadDailyTodoState() {
    try {
      const stored = JSON.parse(localStorage.getItem(DAILY_TODO_KEY) || "{}");
      if (stored.date === todayKey()) {
        dailyTodoDismissed = Boolean(stored.dismissed);
        dailyTodoState = normalizeDailyTodoState(stored.items);
      } else {
        dailyTodoDismissed = false;
        dailyTodoState = DAILY_TODO_ITEMS.map((label) => ({ label, done: false }));
      }
    } catch {
      dailyTodoDismissed = false;
      dailyTodoState = DAILY_TODO_ITEMS.map((label) => ({ label, done: false }));
    }
    saveDailyTodoState();
    renderDailyTodo();
  }

  function handleDailyTodoToggle(index, done) {
    if (!Number.isInteger(index) || !dailyTodoState[index]) return;
    dailyTodoState[index].done = done;
    dailyTodoDismissed = false;
    saveDailyTodoState();
    renderDailyTodo();
  }

  function closeDailyTodoWidget() {
    dailyTodoDismissed = true;
    saveDailyTodoState();
    updateDailyTodoVisibility();
    statusExplain(`Daily to-do hidden. Press ${DAILY_TODO_SHORTCUT} to reopen.`, "info");
  }

  function toggleDailyTodoWidget() {
    const completed = dailyTodoState.filter((item) => item.done).length;
    if (completed === dailyTodoState.length) return;
    dailyTodoDismissed = !dailyTodoDismissed;
    saveDailyTodoState();
    updateDailyTodoVisibility();
  }

  function loadDailyParcelCount() {
    try {
      const stored = JSON.parse(localStorage.getItem(DAILY_PARCEL_KEY) || "{}");
      if (stored.date !== todayKey()) {
        dailyParcelCount = 0;
      } else {
        dailyParcelCount = Number(stored.count || 0);
      }
    } catch {
      dailyParcelCount = 0;
    }
    saveDailyParcelCount();
    updateDashboardKpis();
  }

  function saveDailyParcelCount() {
    try {
      localStorage.setItem(
        DAILY_PARCEL_KEY,
        JSON.stringify({ date: todayKey(), count: dailyParcelCount })
      );
    } catch {}
  }

  function loadTruckBooking() {
    try {
      const stored = JSON.parse(localStorage.getItem(TRUCK_BOOKING_KEY) || "{}");
      if (stored.date === todayKey()) {
        truckBooked = Boolean(stored.booked);
        truckBookedAt = stored.bookedAt || null;
        truckBookedBy = stored.bookedBy || null;
      } else {
        truckBooked = false;
        truckBookedAt = null;
        truckBookedBy = null;
      }
    } catch {
      truckBooked = false;
      truckBookedAt = null;
      truckBookedBy = null;
    }
    saveTruckBooking();
  }

  function saveTruckBooking() {
    try {
      localStorage.setItem(
        TRUCK_BOOKING_KEY,
        JSON.stringify({
          date: todayKey(),
          booked: truckBooked,
          bookedAt: truckBookedAt,
          bookedBy: truckBookedBy
        })
      );
    } catch {}
  }

  function renderTruckPanel() {
    if (truckParcelCount) truckParcelCount.textContent = String(dailyParcelCount);
    if (!truckStatus || !truckBookBtn) return;
    truckStatus.textContent = truckBooked ? "Booked" : "Not booked";
    truckStatus.classList.toggle("is-booked", truckBooked);
    truckBookBtn.classList.toggle("is-booked", truckBooked);
    truckBookBtn.classList.toggle("is-unbooked", !truckBooked);
    truckBookBtn.setAttribute("aria-pressed", truckBooked ? "true" : "false");
  }

  function updateDashboardKpis() {
    if (kpiParcels) kpiParcels.textContent = String(dailyParcelCount || 0);
    if (kpiOpenOrders) kpiOpenOrders.textContent = String(dispatchOrdersLatest.length || 0);
    if (kpiRecentShipments) {
      kpiRecentShipments.textContent = String(fulfillmentHistoryState.streams.shipped.length || 0);
    }
    if (kpiMode) kpiMode.textContent = isAutoMode ? "Auto" : "Manual";
    if (kpiTruckStatus) kpiTruckStatus.textContent = truckBooked ? "Booked" : "Not booked";
    if (kpiLastScan) {
      kpiLastScan.textContent = lastScanAt
        ? new Date(lastScanAt).toLocaleTimeString()
        : "--";
    }
  }

  function updateTruckBookingState({ booked, bookedBy }) {
    truckBooked = booked;
    truckBookedBy = bookedBy || null;
    truckBookedAt = booked ? new Date().toISOString() : null;
    saveTruckBooking();
    renderTruckPanel();
    updateDashboardKpis();
  }

  async function requestTruckBooking(reason) {
    if (truckBookingInFlight || truckBooked) return;
    try {
      truckBookingInFlight = true;
      statusExplain("Requesting truck collection…", "info");
      const resp = await fetch(`${API_BASE}/alerts/book-truck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelCount: dailyParcelCount, reason })
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }
      updateTruckBookingState({ booked: true, bookedBy: reason });
      statusExplain("Truck collection booked.", "ok");
      logDispatchEvent(`Truck collection booked (${reason}).`);
    } catch (err) {
      statusExplain("Truck booking email failed.", "err");
      appendDebug("Truck booking email error: " + String(err));
    } finally {
      truckBookingInFlight = false;
    }
  }

  function updateDailyParcelCount(delta) {
    dailyParcelCount = Math.max(0, dailyParcelCount + delta);
    saveDailyParcelCount();
    renderTruckPanel();
    updateDashboardKpis();
    if (dailyParcelCount > CONFIG.TRUCK_ALERT_THRESHOLD && !truckBooked) {
      requestTruckBooking("auto");
    }
  }

  function base64PdfToUrl(base64) {
    if (!base64) return null;
    const cleaned = base64.replace(/\s/g, "");
    const byteChars = atob(cleaned);
    const len = byteChars.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  }

  const CODE128_PATTERNS = [
    "11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100","10001100100","11001001000","11001000100","11000100100","10110011100","10011011100","10011001110","10111001100","10011101100","10011100110","11001110010","11001011100","11001001110","11011100100","11001110100","11101101110","11101001100","11100101100","11100100110","11101100100","11100110100","11100110010","11011011000","11011000110","11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000","11000101000","11000100010","10110111000","10110001110","10001101110","10111011000","10111000110","10001110110","11101110110","11010001110","11000101110","11011101000","11011100010","11011101110","11101011000","11101000110","11100010110","11101101000","11101100010","11100011010","11101111010","11001000010","11110001010","10100110000","10100001100","10010110000","10010000110","10000101100","10000100110","10110010000","10110000100","10011010000","10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010","10100111100","10010111100","10010011110","10111100100","10011110100","10011110010","11110100100","11110010100","11110010010","11011011110","11011110110","11110110110","10101111000","10100011110","10001011110","10111101000","10111100010","11110101000","11110100010","10111011110","10111101110","11101011110","11110101110","11010000100","11010010000","11010011100","11000111010","11010111000","1100011101011"
  ];

  function code128BToValues(str) {
    const vals = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 32 || c > 126) throw new Error("Unsupported char " + str[i]);
      vals.push(c - 32);
    }
    return vals;
  }

  function code128Encode(str) {
    const vals = code128BToValues(str);
    const full = [104, ...vals];
    let checksum = 104;
    for (let i = 0; i < vals.length; i++) checksum += vals[i] * (i + 1);
    checksum %= 103;
    full.push(checksum, 106);
    return full;
  }

  function code128Svg(str, h) {
    const vals = code128Encode(str);
    const height = h || 80;
    const moduleWidth = 2;
    const quietModules = 10;

    const barModules = vals.reduce((sum, code) => sum + CODE128_PATTERNS[code].length, 0);
    const totalModules = barModules + quietModules * 2;
    const totalWidth = totalModules * moduleWidth;

    let x = quietModules * moduleWidth;
    const rects = [];

    for (const c of vals) {
      const pattern = CODE128_PATTERNS[c];
      for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === "1") rects.push(`<rect x="${x}" y="0" width="${moduleWidth}" height="${height}" />`);
        x += moduleWidth;
      }
    }

    return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${totalWidth}"
     height="${height}"
     viewBox="0 0 ${totalWidth} ${height}"
     shape-rendering="crispEdges"
     style="background:#fff;display:block;max-width:100%;">
  <rect width="100%" height="100%" fill="#fff" />
  ${rects.join("")}
</svg>`;
  }
let autoBookTimer = null;
let autoBookEndsAt = null;
let autoBookTicker = null;

function cancelAutoBookTimer() {
  if (autoBookTimer) clearTimeout(autoBookTimer);
  autoBookTimer = null;
  autoBookEndsAt = null;
  if (autoBookTicker) {
    clearInterval(autoBookTicker);
    autoBookTicker = null;
  }
}

  function scheduleIdleAutoBook() {
    cancelAutoBookTimer();

    if (!isAutoMode) return;
    if (linkedOrders.size > 0 && getTotalExpectedCount()) return;

  // Only for untagged orders
    if (!activeOrderNo || !orderDetails) return;
    if (isBooked(activeOrderNo)) return;
    if (hasParcelCountTag(orderDetails)) return;
    if (getExpectedParcelCount(orderDetails)) return;

  // Need at least 1 scan
  if (getTotalScannedCount() <= 0) return;

  autoBookEndsAt = Date.now() + CONFIG.BOOKING_IDLE_MS;
  autoBookTicker = setInterval(renderSessionUI, 250);

  autoBookTimer = setTimeout(async () => {
    autoBookTimer = null;
    autoBookEndsAt = null;
    if (autoBookTicker) {
      clearInterval(autoBookTicker);
      autoBookTicker = null;
    }

    // Still valid?
    if (!activeOrderNo || !orderDetails) return;
    if (isBooked(activeOrderNo)) return;
    if (armedForBooking) return;
    if (hasParcelCountTag(orderDetails)) return;
    if (getTotalScannedCount() <= 0) return;

    // Use scanned count as the parcel count (avoid prompt)
    orderDetails.manualParcelCount = getActiveParcelSet().size;

    renderSessionUI();
    updateBookNowButton();

    statusExplain(`No tag. Auto-booking ${getTotalScannedCount()} parcels...`, "ok");
    await doBookingNow(); // will pass scanned==expected because expected becomes manualParcelCount
  }, CONFIG.BOOKING_IDLE_MS);
}

  const ADDR_FALLBACK = [
    {
      label: "Louis (Office)",
      name: "Louis Cabano",
      phone: "0730451885",
      email: "admin@flippenlekkaspices.co.za",
      address1: "37 Papawer Street",
      address2: "Oakdale",
      city: "Cape Town",
      province: "Western Cape",
      postal: "7530",
      placeCode: 4658
    },
    {
      label: "Michael (Warehouse)",
      name: "Michael Collison",
      phone: "0783556277",
      email: "admin@flippenlekkaspices.co.za",
      address1: "7 Papawer Street",
      address2: "Blomtuin, Bellville",
      city: "Cape Town",
      province: "Western Cape",
      postal: "7530",
      placeCode: 4001
    }
  ];

  async function loadAddressBook() {
    try {
      const cached = localStorage.getItem("fl_addr_book_v2");
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr) && arr.length) {
          addressBook = arr;
          return;
        }
      }
    } catch {}

    try {
      const res = await fetch("/addresses.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("addresses.json must be an array");
      addressBook = data;
      localStorage.setItem("fl_addr_book_v2", JSON.stringify(addressBook));
    } catch {
      addressBook = ADDR_FALLBACK;
      try {
        localStorage.setItem("fl_addr_book_v2", JSON.stringify(addressBook));
      } catch {}
    }
  }

  function renderAddrResults(q) {
    if (!addrResults) return;
    const query = (q || "").trim().toLowerCase();
    const rows = addressBook
      .filter((e) => {
        const hay = `${e.label || ""} ${e.name || ""} ${e.address1 || ""} ${e.address2 || ""} ${e.city || ""} ${e.postal || ""}`.toLowerCase();
        return !query || hay.includes(query);
      })
      .slice(0, 100)
      .map((e, idx) =>
        `<div class="addrItem" data-idx="${idx}" role="option" tabindex="0"><strong>${e.label || e.name || "Address"}</strong> — ${e.city || ""} ${e.postal || ""}<br><span class="addrHint" style="color:#cbd5e1">${e.address1}${e.address2 ? ", " + e.address2 : ""}</span>${e.placeCode ? ` <span class='addrHint'>(code:${e.placeCode})</span>` : ""}</div>`
      )
      .join("");
    addrResults.innerHTML =
      rows ||
      `<div class="addrItem" style="opacity:.7;cursor:default">No matches. Type city, postal, or name…</div>`;
  }

  async function initAddressSearch() {
    await loadAddressBook();
    renderAddrResults("");
    addrResults?.addEventListener("click", (e) => {
      const item = e.target.closest(".addrItem");
      if (!item) return;
      const idx = Number(item.dataset.idx);
      const entry = addressBook[idx];
      if (!entry) return;
      setDestinationFromEntry(entry);
    });
    addrSearch?.addEventListener("input", () => renderAddrResults(addrSearch.value));
    placeCodeInput?.addEventListener("input", () => {
      const v = (placeCodeInput.value || "").trim();
      placeCodeOverride = v ? Number(v) || null : null;
    });
    serviceSelect?.addEventListener("change", () => {
      serviceOverride = serviceSelect.value || "AUTO";
    });
  }

  function hasParcelCountTag(details) {
    return !!(details && typeof details.parcelCountFromTag === "number" && details.parcelCountFromTag > 0);
  }

  function shouldShowBookNow(details) {
    if (!activeOrderNo || !details) return false;
    if (getBundleOrderNos().some((orderNo) => isBooked(orderNo))) return false;
    if (!isAutoMode) return true;
    return !hasParcelCountTag(details);
  }

  function updateBookNowButton() {
    if (!btnBookNow) return;
    const show = shouldShowBookNow(orderDetails);
    btnBookNow.hidden = !show;
    btnBookNow.disabled = !show;

    if (!show) return;
    const scanned = getTotalScannedCount();
    btnBookNow.textContent = scanned > 0 ? `BOOK NOW (${scanned} scanned)` : "BOOK NOW";
  }

  function getExpectedParcelCount(details) {
    const fromTag =
      details && typeof details.parcelCountFromTag === "number" && details.parcelCountFromTag > 0
        ? details.parcelCountFromTag
        : null;
    const fromMeta =
      details && typeof details.parcelCountFromMeta === "number" && details.parcelCountFromMeta > 0
        ? details.parcelCountFromMeta
        : null;
    const manual =
      details && typeof details.manualParcelCount === "number" && details.manualParcelCount > 0
        ? details.manualParcelCount
        : null;
    if (!isAutoMode) return fromMeta || manual || null;
    return fromTag || fromMeta || manual || null;
  }

  function getParcelIndexesForCurrentOrder(details) {
    const expected = getExpectedParcelCount(details);
    if (expected) return Array.from({ length: expected }, (_, i) => i + 1);
    const activeSet = getActiveParcelSet();
    if (activeSet.size > 0) return Array.from(activeSet).sort((a, b) => a - b);
    return [];
  }

  function renderSessionUI() {
    const bundleOrderNos = getBundleOrderNos();
    const bundleOrders = getBundleOrders();
    const totalExpected = getTotalExpectedCount();
    const totalScanned = getTotalScannedCount();
    if (uiOrderNo) {
      if (!activeOrderNo) {
        uiOrderNo.textContent = "--";
      } else if (linkedOrders.size) {
        uiOrderNo.textContent = `${activeOrderNo} (+${linkedOrders.size})`;
      } else {
        uiOrderNo.textContent = activeOrderNo;
      }
    }
    if (uiBundleOrders) {
      uiBundleOrders.textContent = bundleOrderNos.length ? bundleOrderNos.join(", ") : "--";
    }
    if (uiMultiShip) {
      uiMultiShip.textContent = linkedOrders.size ? "On" : "Off";
    }

    const expected = getExpectedParcelCount(orderDetails || {});
    const idxs = getParcelIndexesForCurrentOrder(orderDetails || {});
    if (uiParcelCount) uiParcelCount.textContent = String(totalScanned);
    if (uiExpectedCount) uiExpectedCount.textContent = totalExpected ? String(totalExpected) : "--";

    let parcelSource = "--";
    if (!isAutoMode) {
      parcelSource =
        orderDetails && typeof orderDetails.parcelCountFromMeta === "number" && orderDetails.parcelCountFromMeta > 0
          ? `Order meta ${orderDetails.parcelCountFromMeta}`
          : orderDetails && typeof orderDetails.manualParcelCount === "number" && orderDetails.manualParcelCount > 0
          ? `Manual ${orderDetails.manualParcelCount}`
          : idxs.length
          ? "Scanned"
          : "--";
    } else {
      parcelSource = hasParcelCountTag(orderDetails)
        ? `Tag parcel_count_${orderDetails.parcelCountFromTag}`
        : orderDetails && typeof orderDetails.parcelCountFromMeta === "number" && orderDetails.parcelCountFromMeta > 0
        ? `Order meta ${orderDetails.parcelCountFromMeta}`
        : orderDetails && typeof orderDetails.manualParcelCount === "number" && orderDetails.manualParcelCount > 0
        ? `Manual ${orderDetails.manualParcelCount}`
        : idxs.length
        ? "Scanned"
        : "--";
    }
    if (linkedOrders.size) parcelSource = "Bundled orders";
    if (uiParcelSource) uiParcelSource.textContent = parcelSource;

    const sessionMode = !activeOrderNo
      ? "Waiting"
      : linkedOrders.size
      ? "Bundled multi-order shipment"
      : isAutoMode
      ? hasParcelCountTag(orderDetails)
        ? "Tag auto-book"
        : "Manual / idle auto-book"
      : "Manual booking";
    if (uiSessionMode) uiSessionMode.textContent = sessionMode;

    const tagInfo =
      orderDetails && typeof orderDetails.parcelCountFromTag === "number" && orderDetails.parcelCountFromTag > 0
        ? ` (tag: parcel_count_${orderDetails.parcelCountFromTag})`
        : "";

    const manualInfo =
      orderDetails && typeof orderDetails.manualParcelCount === "number" && orderDetails.manualParcelCount > 0
        ? ` (manual: ${orderDetails.manualParcelCount})`
        : "";
    const metaInfo =
      orderDetails && typeof orderDetails.parcelCountFromMeta === "number" && orderDetails.parcelCountFromMeta > 0
        ? ` (meta: ${orderDetails.parcelCountFromMeta})`
        : "";

    if (parcelList) {
      const activeSet = getActiveParcelSet();
      const missing =
        expected && expected > 0
          ? Array.from({ length: expected }, (_, i) => i + 1).filter((i) => !activeSet.has(i))
          : [];
      const scannedLine = totalScanned ? `Scanned total: ${totalScanned}${totalExpected ? ` / ${totalExpected}` : ""}` : "Scanned total: 0";
      const missingLine =
        expected && missing.length ? `Missing (active): ${missing.length} (${missing.join(", ")})` : expected ? "Missing (active): 0" : "Missing (active): --";
      const lastScanLine = lastScanAt ? `Last scan: ${new Date(lastScanAt).toLocaleTimeString()} (${lastScanCode || "n/a"})` : "Last scan: --";
      const listLine = idxs.length ? `Active scanned IDs: ${idxs.join(", ")}` : "Active scanned IDs: --";
      const bundleLine = bundleOrders.length
        ? `Bundled: ${bundleOrders
            .map(({ orderNo, details }) => {
              const expectedCount = getExpectedParcelCount(details);
              const scanned = getParcelSet(orderNo).size;
              return `${orderNo} ${scanned}/${expectedCount || "--"}`;
            })
            .join(" | ")}`
        : "Bundled: --";
      parcelList.textContent = `${scannedLine}\n${missingLine}\n${lastScanLine}\n${listLine}\n${bundleLine}${tagInfo}${metaInfo}${manualInfo}`;
    }

    if (parcelNumbers) {
      if (!activeOrderNo) {
        parcelNumbers.innerHTML = `<div class="parcelNumbersEmpty">Scan an order to show parcel numbers.</div>`;
      } else if (expected && expected > 0) {
        const tiles = Array.from({ length: expected }, (_, i) => {
          const num = i + 1;
          const isScanned = getActiveParcelSet().has(num);
          return `<div class="parcelNumber ${isScanned ? "is-scanned" : ""}">${num}</div>`;
        }).join("");
        parcelNumbers.innerHTML = tiles || `<div class="parcelNumbersEmpty">Waiting for scans.</div>`;
      } else if (idxs.length) {
        const tiles = idxs
          .slice()
          .sort((a, b) => a - b)
          .map((num) => `<div class="parcelNumber is-scanned">${num}</div>`)
          .join("");
        parcelNumbers.innerHTML = tiles || `<div class="parcelNumbersEmpty">Waiting for scans.</div>`;
      } else {
        parcelNumbers.innerHTML = `<div class="parcelNumbersEmpty">Waiting for scans.</div>`;
      }
    }

    if (uiCustomerName) {
      uiCustomerName.textContent = orderDetails?.name ? orderDetails.name : "--";
    }

    if (uiOrderWeight) {
      uiOrderWeight.textContent =
        orderDetails && Number.isFinite(orderDetails.totalWeightKg)
          ? `${orderDetails.totalWeightKg.toFixed(2)} kg`
          : "--";
    }

    if (shipToCard) {
      shipToCard.textContent = !orderDetails
        ? "None yet."
        : `${orderDetails.address1}
${orderDetails.address2 ? orderDetails.address2 + "\n" : ""}${orderDetails.city}
${orderDetails.province} ${orderDetails.postal}`.trim();
    }

    if (totalExpected && totalScanned) {
      statusExplain(
        `Scanning ${totalScanned}/${totalExpected} parcels`,
        totalScanned === totalExpected ? "ok" : "info"
      );
    } else if (activeOrderNo) {
      const tagDriven = isAutoMode && hasParcelCountTag(orderDetails);
      statusExplain(tagDriven ? "Scan parcels until complete." : "Scan parcels, then BOOK NOW.", "info");
    }

    if (uiAutoBook) {
      if (!activeOrderNo) {
        uiAutoBook.textContent = "Idle";
      } else if (!isAutoMode) {
        uiAutoBook.textContent = "Manual mode";
      } else if (linkedOrders.size) {
        uiAutoBook.textContent = getTotalExpectedCount() ? "Combined: immediate once scanned" : "Combined: set parcel counts";
      } else if (hasParcelCountTag(orderDetails)) {
        uiAutoBook.textContent = "Immediate on first scan";
      } else if (autoBookEndsAt) {
        const remainingMs = Math.max(0, autoBookEndsAt - Date.now());
        uiAutoBook.textContent = `Auto-book in ${(remainingMs / 1000).toFixed(1)}s`;
      } else if (idxs.length) {
        uiAutoBook.textContent = "Waiting for scans";
      } else {
        uiAutoBook.textContent = "Idle";
      }
    }

    updateBookNowButton();
  }

  function setDestinationFromEntry(entry) {
    orderDetails = {
      ...(orderDetails || {}),
      name: entry.name,
      phone: entry.phone,
      email: entry.email,
      address1: entry.address1,
      address2: entry.address2 || "",
      city: entry.city,
      province: entry.province,
      postal: entry.postal
    };
    placeCodeOverride = entry.placeCode || null;
    if (placeCodeInput) placeCodeInput.value = placeCodeOverride ? String(placeCodeOverride) : "";
    renderSessionUI();
  }

  function renderLabelHTML(waybillNo, service, cost, destDetails, parcelIdx, parcelCount) {
    const parcelStr = String(parcelIdx).padStart(3, "0");
    const codeParcel = `${waybillNo}0${parcelStr}`;
    const svgTopParcel = code128Svg(codeParcel, 70);
    const svgBig = code128Svg(codeParcel, 90);

    const fromHTML = `Flippen Lekka Holdings (Pty) Ltd
7 Papawer Street, Blomtuin, Bellville
Cape Town, Western Cape, 7530
Louis 0730451885 / Michael 0783556277
admin@flippenlekkaspices.co.za`.replace(/\n/g, "<br>");

    const toHTML = `${destDetails.name}<br>${destDetails.address1}${
      destDetails.address2 ? `<br>${destDetails.address2}` : ""
    }<br>${destDetails.city}, ${destDetails.province} ${destDetails.postal}<br>Tel: ${destDetails.phone || ""}`;

    return `
    <div class="wb100x150" aria-label="Waybill ${waybillNo}, parcel ${parcelIdx} of ${parcelCount}">
      <div class="wbHead">
        <div class="wbMetaRow"><img src="img/download.jpg" style="width:80px; height:80px"></div>
        <div class="wbTopCode" aria-label="Parcel barcode top">
          <div class="wbTopHuman">${codeParcel}</div>
          ${svgBig}
        </div>
      </div>

      <div class="wbBody">
        <div class="wbFrom"><strong>FROM</strong><br>${fromHTML}</div>
        <div class="wbTo"><strong>SHIP&nbsp;TO</strong><br>${toHTML}</div>
      </div>

      <div class="wbFoot">
        <div class="wbTopCode" aria-label="Parcel barcode top">
          <div class="wbTopHuman">${codeParcel}</div>
          ${svgTopParcel}
        </div>
        <div class="podBox">
          <div class="podTitle">Proof of Delivery (POD) &nbsp; | &nbsp; Waybill: <strong>${waybillNo}</strong> </div>
          <div style="border-top:1px dotted #000"></div>
          <div>Receiver name:</div>
          <div style="border-top:1px dotted #000"></div>
          <div>Signature:</div>
          <div style="border-top:1px dotted #000"></div>
          <div>Date: ____/___/2025 &nbsp; | &nbsp; Time: ____:____</div>
        </div>
      </div>
    </div>`;
  }

  function mountLabelToPreviewAndPrint(firstHtml, allHtml) {
    if (stickerPreview) stickerPreview.innerHTML = `<div class="wbPreviewZoom">${firstHtml}</div>`;
    if (printMount) printMount.innerHTML = allHtml;
  }

  async function waitForImages(container) {
    const imgs = [...container.querySelectorAll("img")];
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise((res) => {
              img.onload = img.onerror = () => res();
            })
      )
    );
  }

  async function inlineImages(container) {
    const imgs = [...container.querySelectorAll("img")].filter((img) => img.src && !img.src.startsWith("data:"));
    for (const img of imgs) {
      try {
        const resp = await fetch(img.src, { cache: "force-cache" });
        const blob = await resp.blob();
        const dataURL = await new Promise((r) => {
          const fr = new FileReader();
          fr.onload = () => r(fr.result);
          fr.readAsDataURL(blob);
        });
        img.setAttribute("src", dataURL);
      } catch (e) {
        appendDebug("Inline image failed: " + img.src + " " + e);
      }
    }
  }

  async function ppCall(payload) {
    try {
      appendDebug(`PP CALL → method:${payload.method}, classVal:${payload.classVal}`);
      const res = await fetch(CONFIG.PP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      appendDebug(`PP RESP ← HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 500)}`);
      return { status: res.status, statusText: res.statusText, data };
    } catch (err) {
      appendDebug("PP NETWORK ERROR: " + String(err?.message || err));
      return { status: 0, statusText: String(err?.message || err), data: { error: "NETWORK", detail: String(err) } };
    }
  }

  function resolvePlaceCode(dest) {
    const key = `${(dest.city || "").trim().toLowerCase()}|${(dest.postal || "").trim()}`;
    const table = {
      "cape town|7530": 4001,
      "bellville|7530": 4001,
      "durbanville|7550": 4020,
      "cape town|8001": 3001
    };
    return table[key] || null;
  }

  async function lookupPlaceCodeFromPP(destDetails) {
    const suburb = (destDetails.suburb || destDetails.address2 || "").trim();
    const town = (destDetails.city || "").trim();

    const queries = [];
    if (suburb) queries.push(suburb);
    if (town && town.toLowerCase() !== suburb.toLowerCase()) {
      queries.push(town);
      if (suburb) queries.push(`${suburb} ${town}`);
    }

    if (!queries.length) return null;

    for (const q of queries) {
      try {
        appendDebug("PP getPlace query: " + q);
        const res = await fetch(`${CONFIG.PP_ENDPOINT}/place?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();

        if (data.errorcode && Number(data.errorcode) !== 0) continue;

        const list = Array.isArray(data.results) ? data.results : [];
        const normalized = list.map((p) => {
          const name = (p.name || p.town || p.place || p.pcode || "").toString();
          const town = (p.town || p.name || "").toString();
          const place = p.place ?? p.pcode ?? p.placecode ?? null;
          const ring = p.ring ?? "0";
          return { ...p, name, town, place, ring };
        });
        if (!normalized.length) continue;

        const targetTown = town.toLowerCase();
        const targetSuburb = suburb.toLowerCase();

        let best =
          (targetSuburb &&
            normalized.find((p) => {
              const name = (p.name || "").toLowerCase();
              const t = (p.town || "").toLowerCase();
              return ((name.includes(targetSuburb) || t.includes(targetSuburb)) && String(p.ring) === "0");
            })) ||
          (targetSuburb &&
            normalized.find((p) => {
              const name = (p.name || "").toLowerCase();
              const t = (p.town || "").toLowerCase();
              return name.includes(targetSuburb) || t.includes(targetSuburb);
            })) ||
          (targetTown &&
            normalized.find((p) => (p.town || "").trim().toLowerCase() === targetTown && String(p.ring) === "0")) ||
          (targetTown && normalized.find((p) => (p.town || "").trim().toLowerCase() === targetTown)) ||
          normalized.find((p) => String(p.ring) === "0") ||
          normalized[0];

        if (!best || best.place == null) continue;

        const code = Number(best.place);
        const label = (best.name || "").trim() + (best.town ? " – " + String(best.town).trim() : "");
        return { code, label, raw: best };
      } catch (e) {
        appendDebug("PP getPlace failed: " + String(e));
      }
    }
    return null;
  }

  function buildParcelPerfectPayload(destDetails, parcelCount) {
    const d = CONFIG.ORIGIN;

    let destplace =
      placeCodeOverride != null
        ? placeCodeOverride
        : destDetails && destDetails.placeCode != null
        ? Number(destDetails.placeCode) || destDetails.placeCode
        : resolvePlaceCode(destDetails) || null;

    let perParcelMass = CONFIG.BOX_DIM.massKg;
    if (destDetails && typeof destDetails.totalWeightKg === "number" && destDetails.totalWeightKg > 0 && parcelCount > 0) {
      perParcelMass = Number((destDetails.totalWeightKg / parcelCount).toFixed(2));
      if (perParcelMass <= 0) perParcelMass = CONFIG.BOX_DIM.massKg;
    }

    const details = {
      ...d,
      destpers: destDetails.name,
      destperadd1: destDetails.address1,
      destperadd2: destDetails.address2 || "",
      destperadd3: destDetails.city,
      destperadd4: destDetails.province,
      destperpcode: destDetails.postal,
      desttown: destDetails.city,
      destplace,
      destpercontact: destDetails.name,
      destperphone: destDetails.phone,
      notifydestpers: 1,
      destpercell: destDetails.phone || "0000000000",
      destperemail: destDetails.email,
      reference: buildShipmentReference()
    };

    const contents = Array.from({ length: parcelCount }, (_, i) => ({
      item: i + 1,
      pieces: 1,
      dim1: CONFIG.BOX_DIM.dim1,
      dim2: CONFIG.BOX_DIM.dim2,
      dim3: CONFIG.BOX_DIM.dim3,
      actmass: perParcelMass
    }));

    return { details, contents };
  }

  function buildShipmentReference() {
    const orders = getBundleOrderNos();
    if (!orders.length) return `Order ${activeOrderNo || ""}`.trim();
    return `Order ${orders.join(" + ")}`;
  }

  async function fulfillOnShopify(details, waybillNo) {
    try {
      if (!details?.raw?.id) return false;

      const orderId = details.raw.id;
      const lineItems = (details.raw.line_items || []).map((li) => ({ id: li.id, quantity: li.quantity }));

      const resp = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          lineItems,
          trackingNumber: waybillNo,
          trackingUrl: "",
          trackingCompany: "SWE / ParcelPerfect"
        })
      });

      const text = await resp.text();
      appendDebug("Shopify fulfill => " + resp.status + " " + text.slice(0, 300));
      return resp.ok;
    } catch (e) {
      appendDebug("Shopify fulfill exception: " + String(e));
    }
    return false;
  }

  function promptManualParcelCount(orderNo) {
    const raw = window.prompt(`Enter parcel count for order ${orderNo} (required):`, "");
    if (!raw) return null;
    const n = parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(n) || n <= 0 || n > 999) return null;
    return n;
  }

  function extractQuoteFromV28(shape) {
    const obj = shape || {};
    if (obj.quoteno) return { quoteno: obj.quoteno, rates: obj.rates || [] };
    const res = Array.isArray(obj.results) && obj.results[0] ? obj.results[0] : null;
    const quoteno = (res && res.quoteno) || null;
    const rates = res && Array.isArray(res.rates) ? res.rates : [];
    return { quoteno, rates };
  }

  function pickService(rates) {
    const wanted = serviceOverride === "AUTO" ? ["RFX", "ECO", "RDF"] : [serviceOverride];
    const svcList = (rates || []).map((r) => r.service);
    for (const w of wanted) if (svcList.includes(w)) return w;
    return svcList[0] || "RDF";
  }

  async function doBookingNow(opts = {}) {
    const bundleOrders = getBundleOrders();
    if (!bundleOrders.length || armedForBooking) return;

    const bundledOrderNos = bundleOrders.map((order) => order.orderNo);
    if (bundledOrderNos.some((orderNo) => isBooked(orderNo))) {
      statusExplain("One or more bundled orders already booked — blocked.", "warn");
      logDispatchEvent(`Booking blocked: bundled order already booked (${bundledOrderNos.join(", ")}).`);
      confirmBookingFeedback("failure");
      return;
    }

    const manual = !!opts.manual;
    const overrideCount = Number(opts.parcelCount || 0);
    const totalScanned = getTotalScannedCount();
    let totalExpected = 0;

    if (manual) {
      if (!overrideCount || overrideCount < 1) {
        statusExplain("Scan parcels first.", "warn");
        confirmBookingFeedback("failure");
        return;
      }
      bundleOrders.forEach(({ orderNo, details }) => {
        const scanned = getParcelSet(orderNo).size;
        if (!getExpectedParcelCount(details) && scanned > 0) {
          details.manualParcelCount = scanned;
        }
      });
      totalExpected = getTotalExpectedCount() || totalScanned;
      renderSessionUI();
    } else {
      for (const { orderNo, details } of bundleOrders) {
        let expected = getExpectedParcelCount(details);
        if (!expected) {
          const n = promptManualParcelCount(orderNo);
          if (!n) {
            statusExplain("Parcel count required (cancelled).", "warn");
            confirmBookingFeedback("failure");
            return;
          }
          details.manualParcelCount = n;
          expected = n;
          renderSessionUI();
        }

        const scanned = getParcelSet(orderNo).size;
        if (scanned !== expected) {
          statusExplain(`Cannot book — ${orderNo} scanned ${scanned}/${expected}.`, "warn");
          confirmBookingFeedback("failure");
          return;
        }
        totalExpected += expected;
      }
    }

    const parcelIndexes = Array.from({ length: totalExpected }, (_, i) => i + 1);

    armedForBooking = true;
    appendDebug("Booking orders " + bundledOrderNos.join(", ") + " parcels=" + parcelIndexes.join(", "));
    await stepDispatchProgress(0, `Booking ${bundledOrderNos.join(", ")}`);
    logDispatchEvent(`Booking started for orders ${bundledOrderNos.join(", ")}.`);

    const missing = [];
    ["name", "address1", "city", "province", "postal"].forEach((k) => {
      if (!orderDetails[k]) missing.push(k);
    });

    const payload = buildParcelPerfectPayload(orderDetails, totalExpected);
    if (!payload.details.destplace) missing.push("destplace (place code)");

    if (missing.length) {
      statusExplain("Quote failed", "err");
      setDispatchProgress(0, "Missing data");
      logDispatchEvent(`Booking halted: missing ${missing.join(", ")}.`);
      if (bookingSummary) {
        bookingSummary.textContent = `Cannot request quote — missing: ${missing.join(", ")}\n\nShip To:\n${JSON.stringify(orderDetails, null, 2)}`;
      }
      armedForBooking = false;
      confirmBookingFeedback("failure");
      return;
    }

    await stepDispatchProgress(1, "Requesting quote");
    logDispatchEvent("Requesting SWE quote.");
    const quoteRes = await ppCall({ method: "requestQuote", classVal: "Quote", params: payload });
    if (!quoteRes || quoteRes.status !== 200) {
      statusExplain("Quote failed", "err");
      setDispatchProgress(1, "Quote failed");
      logDispatchEvent(`Quote failed (HTTP ${quoteRes?.status || "?"}).`);
      if (bookingSummary) {
        bookingSummary.textContent = `Quote error (HTTP ${quoteRes?.status}): ${quoteRes?.statusText}\n\n${JSON.stringify(quoteRes?.data, null, 2)}`;
      }
      if (quoteBox) quoteBox.textContent = "No quote — check place code / proxy / token.";
      armedForBooking = false;
      confirmBookingFeedback("failure");
      return;
    }

    const { quoteno, rates } = extractQuoteFromV28(quoteRes.data || {});
    if (!quoteno) {
      statusExplain("Quote failed", "err");
      setDispatchProgress(1, "Quote failed");
      logDispatchEvent("Quote failed: no quote number returned.");
      if (bookingSummary) bookingSummary.textContent = `No quote number.\n${JSON.stringify(quoteRes.data, null, 2)}`;
      armedForBooking = false;
      confirmBookingFeedback("failure");
      return;
    }

    const pickedService = pickService(rates);
    const chosenRate = rates?.find((r) => r.service === pickedService) || rates?.[0] || null;
    const quoteCost = chosenRate ? Number(chosenRate.total ?? chosenRate.subtotal ?? chosenRate.charge ?? 0) : null;
    logDispatchEvent(`Quote ${quoteno} received for ${pickedService}.`);

    if (quoteBox && rates?.length) {
      const fmt = (v) => (isNaN(Number(v)) ? "-" : `R${Number(v).toFixed(2)}`);
      const lines = rates
        .map((r) => `${r.service}: ${fmt(r.total ?? r.subtotal ?? r.charge)} ${r.name ? `(${r.name})` : ""}`)
        .join("\n");
      quoteBox.textContent = `Selected: ${pickedService} • Est: ${fmt(quoteCost)}${quoteCost > CONFIG.COST_ALERT_THRESHOLD ? "  ⚠ high" : ""}\nOptions:\n${lines}`;
    }

    await stepDispatchProgress(2, "Confirming service");
    logDispatchEvent(`Updating service to ${pickedService}.`);
    await ppCall({
      method: "updateService",
      classVal: "Quote",
      params: { quoteno, service: pickedService, reference: buildShipmentReference() }
    });

    await stepDispatchProgress(3, "Booking collection");
    logDispatchEvent("Booking collection & requesting labels.");
    const collRes = await ppCall({
      method: "quoteToCollection",
      classVal: "Collection",
      params: { quoteno, starttime: "12:00", endtime: "15:00", printLabels: 1, printWaybill: 0 }
    });

    if (!collRes || collRes.status !== 200) {
      statusExplain("Booking failed", "err");
      setDispatchProgress(3, "Booking failed");
      logDispatchEvent(`Booking failed (HTTP ${collRes?.status || "?"}).`);
      if (bookingSummary) bookingSummary.textContent = `Booking error: HTTP ${collRes?.status} ${collRes?.statusText}\n${JSON.stringify(collRes?.data, null, 2)}`;
      armedForBooking = false;
      confirmBookingFeedback("failure");
      return;
    }

    const cr = collRes.data || {};
    const maybe = cr.results?.[0] || cr;
    const waybillNo = String(maybe.waybill || maybe.waybillno || maybe.waybillNo || maybe.trackingNo || "WB-TEST-12345");
    appendDebug("Waybill = " + waybillNo);

    const labelsBase64 = maybe.labelsBase64 || maybe.labelBase64 || maybe.labels_pdf || null;
    const waybillBase64 = maybe.waybillBase64 || maybe.waybillPdfBase64 || maybe.waybill_pdf || null;

    let usedPdf = false;

    if (labelsBase64) {
      usedPdf = true;
      await stepDispatchProgress(4, "Printing labels");
      logDispatchEvent("Printing labels via PrintNode.");

      try {
        await fetch(`${API_BASE}/printnode/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64: labelsBase64, title: `Labels ${waybillNo}` })
        });
      } catch (e) {
        appendDebug("PrintNode label error: " + String(e));
        logDispatchEvent("PrintNode label error.");
      }

      if (waybillBase64) {
        await stepDispatchProgress(4, "Printing waybill");
        logDispatchEvent("Printing waybill via PrintNode.");
        try {
          await fetch(`${API_BASE}/printnode/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pdfBase64: waybillBase64, title: `Waybill ${waybillNo}` })
          });
        } catch (e) {
          appendDebug("PrintNode waybill error: " + String(e));
          logDispatchEvent("PrintNode waybill error.");
        }
      }

      if (stickerPreview) {
        stickerPreview.innerHTML = `
          <div class="wbPreviewPdf">
            <div style="font-weight:600;margin-bottom:0.25rem;">Labels sent to PrintNode</div>
            <div style="font-size:0.8rem;color:#64748b;">
              Waybill: <strong>${waybillNo}</strong><br>
              Service: ${pickedService} • Parcels: ${totalExpected}
            </div>
          </div>`;
      }
      if (printMount) printMount.innerHTML = "";
    } else {
      await stepDispatchProgress(4, "Printing labels");
      logDispatchEvent("Printing labels locally.");
      const labels = parcelIndexes.map((idx) =>
        renderLabelHTML(waybillNo, pickedService, quoteCost, orderDetails, idx, totalExpected)
      );
      mountLabelToPreviewAndPrint(labels[0], labels.join("\n"));

      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await inlineImages(printMount);
      await waitForImages(printMount);

      if (labels.length) window.print();
    }

    statusExplain("Booked", "ok");
    await stepDispatchProgress(5, "Booked");
    logDispatchEvent(`Booking complete. Waybill ${waybillNo}.`);
    triggerBookedFlash();
    confirmBookingFeedback("success");
    if (statusChip) statusChip.textContent = "Booked";
    if (bookingSummary) {
      bookingSummary.textContent = `WAYBILL: ${waybillNo}
Orders: ${bundledOrderNos.join(", ")}
Service: ${pickedService}
Parcels: ${totalExpected}
Estimated Cost: ${money(quoteCost)}

${usedPdf ? "Label + waybill generated by ParcelPerfect (PDF)." : "Using local HTML label layout."}

Raw:
${JSON.stringify(cr, null, 2)}`;
    }

    let fulfillFailures = 0;
    for (const { orderNo, details } of bundleOrders) {
      const fulfillOk = await fulfillOnShopify(details, waybillNo);
      if (!fulfillOk) fulfillFailures += 1;
      markBooked(orderNo);
    }
    if (!fulfillFailures) {
      await stepDispatchProgress(6, `Notified • ${waybillNo}`);
      logDispatchEvent(`Customer notified with tracking ${waybillNo}.`);
    } else {
      setDispatchProgress(6, "Notify failed");
      logDispatchEvent(`Customer notification failed for ${fulfillFailures} orders on ${waybillNo}.`);
    }

    updateDailyParcelCount(totalExpected);
    resetSession();
  }

function resetSession() {
  cancelAutoBookTimer();

  activeOrderNo = null;
  orderDetails = null;
  parcelsByOrder = new Map();
  linkedOrders = new Map();
  armedForBooking = false;
  lastScanAt = null;
  lastScanCode = null;

  placeCodeOverride = null;
  if (placeCodeInput) placeCodeInput.value = "";

  renderSessionUI();
  renderCountdown();
  updateBookNowButton();
}


  function parseScan(code) {
    if (!code || code.length < 9) return null;
    const orderNo = code.slice(0, code.length - 3);
    const seq = parseInt(code.slice(-3), 10);
    if (Number.isNaN(seq)) return null;
    return { orderNo, parcelSeq: seq };
  }

async function startOrder(orderNo) {
  cancelAutoBookTimer();

  activeOrderNo = orderNo;
  parcelsByOrder = new Map();
  parcelsByOrder.set(orderNo, new Set());
  linkedOrders = new Map();
  armedForBooking = false;
  lastScanAt = null;
  lastScanCode = null;

  placeCodeOverride = null;
  if (placeCodeInput) placeCodeInput.value = "";

  orderDetails = await fetchShopifyOrder(activeOrderNo);

  if (orderDetails && orderDetails.placeCode != null) {
    placeCodeOverride = Number(orderDetails.placeCode) || orderDetails.placeCode;
    if (placeCodeInput) placeCodeInput.value = String(placeCodeOverride);
  }

  appendDebug("Started new order " + activeOrderNo);
  renderSessionUI();
  renderCountdown();
  updateBookNowButton();
}

  async function handleScan(code) {
    const parsed = parseScan(code);
    if (!parsed) {
      appendDebug("Bad scan: " + code);
      statusExplain("Bad scan", "warn");
      confirmScanFeedback("failure");
      return;
    }

    if (isBooked(parsed.orderNo)) {
      statusExplain(`Order ${parsed.orderNo} already booked — blocked.`, "warn");
      confirmScanFeedback("failure");
      return;
    }

    const crossOrderScan = activeOrderNo && parsed.orderNo !== activeOrderNo;

    if (!activeOrderNo) {
      await startOrder(parsed.orderNo);
      const initialGroup = getCombinedGroupForOrder(parsed.orderNo);
      if (initialGroup && initialGroup.orderNos.includes(parsed.orderNo)) {
        for (const orderNo of initialGroup.orderNos) {
          if (orderNo === parsed.orderNo) continue;
          const details = await fetchShopifyOrder(orderNo);
          if (!details) continue;
          if (initialGroup.address) {
            details.address1 = initialGroup.address.address1;
            details.address2 = initialGroup.address.address2;
            details.city = initialGroup.address.city;
            details.province = initialGroup.address.province;
            details.postal = initialGroup.address.postal;
          }
          linkedOrders.set(orderNo, details);
        }
      }
    } else if (parsed.orderNo !== activeOrderNo && !linkedOrders.has(parsed.orderNo)) {
      cancelAutoBookTimer();
      const group = getCombinedGroupForOrder(parsed.orderNo);
      if (!group || !group.orderNos.includes(activeOrderNo)) {
        statusExplain(`Different order scanned (${parsed.orderNo}). Create Combined Shipment first.`, "warn");
        confirmScanFeedback("warn");
        return;
      }

      for (const orderNo of group.orderNos) {
        if (orderNo === activeOrderNo) continue;
        const details = await fetchShopifyOrder(orderNo);
        if (!details) continue;
        if (group.address) {
          details.address1 = group.address.address1;
          details.address2 = group.address.address2;
          details.city = group.address.city;
          details.province = group.address.province;
          details.postal = group.address.postal;
        }
        linkedOrders.set(orderNo, details);
      }
      statusExplain(`Bundled ${group.orderNos.length} combined orders.`, "ok");
    }

    const parcelSet = getParcelSet(parsed.orderNo);
    parcelSet.add(parsed.parcelSeq);
    lastScanAt = Date.now();
    lastScanCode = code;
    armedForBooking = false;
    updateDashboardKpis();

    confirmScanFeedback(crossOrderScan ? "warn" : "success");

    const expected = getExpectedParcelCount(orderDetails);

    // TAGGED: auto-book immediately on first scan (single order only)
    if (isAutoMode && hasParcelCountTag(orderDetails) && expected && !linkedOrders.size) {
      cancelAutoBookTimer();

      parcelsByOrder.set(activeOrderNo, new Set(Array.from({ length: expected }, (_, i) => i + 1)));
      renderSessionUI();
      updateBookNowButton();

      statusExplain(`Tag detected (parcel_count_${expected}). Auto-booking...`, "ok");
      await doBookingNow();
      return;
    }

    const totalScanned = getTotalScannedCount();
    const groupedExpected = getTotalExpectedCount();
    if (isAutoMode && linkedOrders.size > 0 && groupedExpected) {
      cancelAutoBookTimer();
      renderSessionUI();
      updateBookNowButton();
      statusExplain(`Combined shipment ready (${groupedExpected} parcels). Booking now...`, "ok");
      await doBookingNow({ manual: true, parcelCount: groupedExpected });
      return;
    }
    if (
      isAutoMode &&
      expected &&
      totalScanned >= expected &&
      !linkedOrders.size
    ) {
      cancelAutoBookTimer();
      renderSessionUI();
      updateBookNowButton();
      statusExplain(`All ${expected} parcels scanned. Booking now...`, "ok");
      await doBookingNow();
      return;
    }

    // UNTAGGED: schedule auto-book 6s after last scan
    renderSessionUI();
    updateBookNowButton();
    scheduleIdleAutoBook();
}



  async function fetchShopifyOrder(orderNo) {
    try {
      const url = `${CONFIG.SHOPIFY.PROXY_BASE}/orders/by-name/${encodeURIComponent(orderNo)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const o = data.order || data || {};
      const placeCodeFromMeta = data.customerPlaceCode || null;
      const parcelCountFromMeta =
        typeof data.parcelCountMeta === "number" && data.parcelCountMeta > 0
          ? data.parcelCountMeta
          : null;

      const shipping = o.shipping_address || {};
      const customer = o.customer || {};
      const lineItems = o.line_items || [];

      let parcelCountFromTag = null;
      if (typeof o.tags === "string" && o.tags.trim()) {
        const parts = o.tags.split(",").map((t) => t.trim().toLowerCase());
        for (const t of parts) {
          const m = t.match(/^parcel_count_(\d+)$/);
          if (m) { parcelCountFromTag = parseInt(m[1], 10); break; }
        }
      }

      let totalGrams = 0;
      for (const li of lineItems) {
        const gramsPerUnit = Number(li.grams || 0);
        const qty = Number(li.quantity || 1);
        totalGrams += gramsPerUnit * qty;
      }
      const totalWeightKg = totalGrams / 1000;

      const name =
        shipping.name ||
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
        o.name ||
        String(orderNo);

      const autoParcelCount = getAutoParcelCountForOrder(lineItems);
      const normalized = {
        raw: o,
        name,
        phone: shipping.phone || customer.phone || "",
        email: o.email || "",
        address1: shipping.address1 || "",
        address2: shipping.address2 || "",
        city: shipping.city || "",
        province: shipping.province || "",
        postal: shipping.zip || "",
        suburb: shipping.address2 || "",
        line_items: lineItems,
        totalWeightKg,
        placeCode: placeCodeFromMeta,
        placeLabel: null,
        parcelCountFromTag,
        parcelCountFromMeta,
        manualParcelCount:
          parcelCountFromMeta == null && autoParcelCount != null ? autoParcelCount : null
      };

      if (!placeCodeFromMeta) {
        const lookedUp = await lookupPlaceCodeFromPP(normalized);
        if (lookedUp?.code != null) {
          normalized.placeCode = lookedUp.code;
          normalized.placeLabel = lookedUp.label;
        }
      }

      return normalized;
    } catch (e) {
      appendDebug("Shopify fetch failed: " + String(e));
      return {
        raw: null,
        name: "Unknown",
        phone: "",
        email: "",
        address1: "",
        address2: "",
        city: "",
        province: "",
        postal: "",
        suburb: "",
        line_items: [],
        totalWeightKg: CONFIG.BOX_DIM.massKg,
        placeCode: null,
        placeLabel: null,
        parcelCountFromTag: null,
        parcelCountFromMeta: null,
        manualParcelCount: null
      };
    }
  }

  function laneFromOrder(order) {
    const assignedLane = String(order?.assigned_lane || "").trim().toLowerCase();
    if (assignedLane === "delivery" || assignedLane === "pickup" || assignedLane === "shipping") {
      return assignedLane;
    }
    if (assignedLane === "unassigned") {
      return "unassigned";
    }

    const tags = String(order?.tags || "").toLowerCase();
    const urgentFlag = Boolean(order?.urgent || order?.is_urgent || order?.rush_order);
    const slaHours = Number(order?.sla_hours ?? order?.slaHours ?? order?.sla_target_hours);
    const financialStatus = String(order?.financial_status || "").toLowerCase();
    const fulfillmentStatus = String(order?.fulfillment_status || "").toLowerCase();
    const shippingTitles = (order?.shipping_lines || [])
      .map((line) => String(line.title || "").toLowerCase())
      .join(" ");
    const combined = `${tags} ${shippingTitles}`.trim();

    const unpaidStatuses = new Set(["pending", "authorized", "partially_paid", "unpaid"]);
    const isUnpaid = unpaidStatuses.has(financialStatus);
    if (isUnpaid) return "shipping_awaiting_payment";

    const isPriorityTag = /(priority|urgent|rush)/.test(tags);
    const isPrioritySla = Number.isFinite(slaHours) && slaHours > 0 && slaHours <= 24;
    if (isPriorityTag || urgentFlag || isPrioritySla) return "shipping_priority";

    if (/(warehouse|collect|collection|click\s*&\s*collect)/.test(combined)) return "pickup";
    if (/(same\s*day|delivery)/.test(combined)) return "delivery_local";

    const isPaid = financialStatus === "paid";
    const isUnfulfilled = !fulfillmentStatus || fulfillmentStatus === "unfulfilled";
    if (isPaid && isUnfulfilled) return "shipping_medium";

    return "shipping_medium";
  }

  function renderDispatchLineItems(order, packingState) {
    return (order.line_items || [])
      .map((item, index) => ({ ...item, __index: index }))
      .sort((a, b) => {
        const aKey = String(a.title || "").trim().toLowerCase();
        const bKey = String(b.title || "").trim().toLowerCase();
        const aIndex = lineItemOrderIndex.get(aKey) ?? Number.POSITIVE_INFINITY;
        const bIndex = lineItemOrderIndex.get(bKey) ?? Number.POSITIVE_INFINITY;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return String(a.sku || "").localeCompare(String(b.sku || ""), undefined, {
          numeric: true,
          sensitivity: "base"
        });
      })
      .map((li) => {
        const baseTitle = li.title || "";
        const variantTitle = (li.variant_title || "").trim();
        const hasVariant = variantTitle && variantTitle.toLowerCase() !== "default title";
        const abbrevKey = baseTitle.trim().toLowerCase();
        const abbreviation = lineItemAbbreviations[abbrevKey];
        const sizeLabel = hasVariant ? variantTitle : "";
        const shortLabel =
          abbreviation === ""
            ? sizeLabel || baseTitle
            : [sizeLabel, abbreviation || baseTitle].filter(Boolean).join(" ");
        const itemKey = makePackingKey(li, li.__index);
        const packedItem = getPackingItem(packingState, itemKey);
        const packedCount = packedItem ? Number(packedItem.packed) || 0 : 0;
        const totalCount = packedItem ? Number(packedItem.quantity) || 0 : Number(li.quantity) || 0;
        const remaining = Math.max(0, totalCount - packedCount);
        const isComplete = packedCount > 0 && remaining === 0;
        const isPartial = packedCount > 0 && remaining > 0;
        const remainderTag = isPartial
          ? ` <span class="dispatchLineRemainder">(${remaining})</span>`
          : "";
        return `<span class="dispatchLineItem ${isComplete ? "is-complete" : ""} ${isPartial ? "is-partial" : ""}">• ${li.quantity} × ${shortLabel}${remainderTag}</span>`;
      })
      .join("<br>");
  }

  function renderOppDocButtons(orderNo) {
    if (!orderNo) {
      return OPP_DOCUMENTS.map(
        (doc) =>
          `<button class="dispatchOppBtn" type="button" disabled>${doc.label}</button>`
      ).join("");
    }
    return OPP_DOCUMENTS.map(
      (doc) =>
        `<button class="dispatchOppBtn" type="button" data-action="print-opp" data-doc-type="${doc.type}" data-order-no="${orderNo}">${doc.label}</button>`
    ).join("");
  }

  function getOppDocLabel(docType) {
    return OPP_DOCUMENTS.find((doc) => doc.type === docType)?.label || "OPP document";
  }

  function renderDispatchActions(order, laneId, orderNo) {
    const normalizedLane = laneId === "delivery_local" || laneId === "pickup" ? laneId : "shipping";
    const disabled = orderNo ? "" : "disabled";
    if (normalizedLane === "delivery_local") {
      const printed = orderNo && printedDeliveryNotes.has(orderNo);
      return `
        <button class="dispatchFulfillBtn" type="button" data-action="print-note" data-order-no="${orderNo || ""}" ${disabled}>Print delivery note</button>
        <button class="dispatchFulfillBtn" type="button" data-action="deliver-delivery" data-order-no="${orderNo || ""}" ${!printed ? "disabled" : ""}>Deliver</button>
      `;
    }
    const label = normalizedLane === "pickup" ? "Ready for collection" : "Fulfil";
    const actionType = normalizedLane === "pickup" ? "ready-collection" : "fulfill-shipping";
    return `<button class="dispatchFulfillBtn" type="button" data-action="${actionType}" data-order-no="${orderNo || ""}" ${disabled}>${label}</button>`;
  }

  function renderDispatchPackingPanel(packingState, orderNo, options = {}) {
    if (!packingState) return "";
    const isActive = packingState.active || options.forceOpen;
    const boxes = Array.isArray(packingState.boxes) ? packingState.boxes : [];
    const parcelCount = getPackingParcelCount(packingState);
    return `
      <div class="dispatchPackingPanel ${isActive ? "is-active" : ""}" data-order-no="${orderNo}">
        <div class="dispatchPackingHeader">
          <div class="dispatchPackingTitle">Packing</div>
          <div class="dispatchPackingTimes">
            <span>Start: ${formatDispatchTime(packingState.startTime)}</span>
            <span>Finish: ${formatDispatchTime(packingState.endTime)}</span>
          </div>
        </div>
        <div class="dispatchPackingList">
          ${
            packingState.items.length
              ? packingState.items
                  .map((item) => {
                    const remaining = Math.max(0, item.quantity - item.packed);
                    const isComplete = remaining === 0;
                    const variantLabel =
                      item.variant && item.variant.toLowerCase() !== "default title"
                        ? item.variant
                        : "";
                    const itemLabel = [item.title, variantLabel].filter(Boolean).join(" · ");
                    return `
                      <div class="dispatchPackingRow ${isComplete ? "is-complete" : ""}" data-item-key="${item.key}">
                        <div class="dispatchPackingInfo">
                          <div class="dispatchPackingItem">${itemLabel}</div>
                          <div class="dispatchPackingMeta">Packed ${item.packed} / ${item.quantity} · Remaining ${remaining}</div>
                        </div>
                        <div class="dispatchPackingActions">
                          <input class="dispatchPackingQty" type="number" min="1" max="${remaining}" placeholder="Qty" data-item-key="${item.key}" ${isComplete ? "disabled" : ""}/>
                          <button class="dispatchPackQtyBtn" type="button" data-action="pack-qty" data-order-no="${orderNo}" data-item-key="${item.key}" ${isComplete ? "disabled" : ""}>Pack qty</button>
                          <button class="dispatchPackAllBtn" type="button" data-action="pack-all" data-order-no="${orderNo}" data-item-key="${item.key}" ${isComplete ? "disabled" : ""}>Pack all</button>
                        </div>
                      </div>
                    `;
                  })
                  .join("")
              : `<div class="dispatchPackingEmpty">No line items available.</div>`
          }
        </div>
        <div class="dispatchPackingFooter">
          <div class="dispatchParcelScan">
            <button class="dispatchParcelBoxBtn" type="button" data-action="add-box" data-order-no="${orderNo}">Add parcel</button>
          </div>
          <div class="dispatchBoxList">
            ${
              boxes.length
                ? boxes
                    .map(
                      (box, index) => `
                        <div class="dispatchBoxRow">
                          <span class="dispatchBoxLabel">${box.label}</span>
                          <input class="dispatchBoxParcelInput" type="text" placeholder="Parcel no (optional)" data-order-no="${orderNo}" data-box-index="${index}" value="${box.parcelCode || ""}" />
                        </div>
                      `
                    )
                    .join("")
                : `<span class="dispatchBoxEmpty">No parcels added yet.</span>`
            }
          </div>
          <div class="dispatchPackingControls">
            <span class="dispatchPackingCount">Parcels packed: ${parcelCount}</span>
            <button class="dispatchFinishPackingBtn" type="button" data-action="finish-packing" data-order-no="${orderNo}" ${packingState.endTime ? "disabled" : ""}>
              ${packingState.endTime ? "Packing finished" : "Finish packing"}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function estimatePackingTime({ totalUnits, boxCount }) {
    const units = Number(totalUnits) || 0;
    const boxes = Number(boxCount) || 0;
    if (units <= 0 && boxes <= 0) return null;
    if (units > 0 && units <= 24) return 5;
    if (units > 0 && units <= 96) return 8;
    const effectiveBoxes = boxes || Math.max(1, Math.ceil(units / 24));
    const perBoxMin = effectiveBoxes <= 2 ? 6 : effectiveBoxes <= 4 ? 8 : 10;
    return effectiveBoxes * perBoxMin;
  }

  function extractSizeLabel(text) {
    if (!text) return "";
    const match = String(text).match(/(\d+(?:\.\d+)?)\s*(kg|g|ml)\b/i);
    if (!match) return "";
    const value = Number(match[1]);
    if (!value) return "";
    const unit = match[2].toLowerCase();
    if (unit === "kg") return `${value}${unit}`;
    return `${Math.round(value)}${unit}`;
  }

  function getLineItemSize(lineItem) {
    if (!lineItem) return "";
    const candidates = [];
    if (lineItem.variant_title && lineItem.variant_title !== "Default Title") {
      candidates.push(lineItem.variant_title);
    }
    if (Array.isArray(lineItem.variant_options)) {
      candidates.push(...lineItem.variant_options);
    }
    if (Array.isArray(lineItem.options_with_values)) {
      candidates.push(...lineItem.options_with_values.map((opt) => opt?.value));
    }
    if (Array.isArray(lineItem.properties)) {
      lineItem.properties.forEach((prop) => {
        if (prop?.name && String(prop.name).toLowerCase().includes("size")) {
          candidates.push(prop.value);
        }
      });
    }
    for (const candidate of candidates) {
      const size = extractSizeLabel(candidate);
      if (size) return size;
    }
    return "";
  }

  function normalizeLineLabel(label) {
    return String(label || "")
      .replace(/\s*[-–|·]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getLineItemFlavour(lineItem) {
    if (!lineItem) return "";
    if (Array.isArray(lineItem.properties)) {
      const prop = lineItem.properties.find((item) =>
        /flavour|flavor/.test(String(item?.name || "").toLowerCase())
      );
      if (prop?.value) return normalizeLineLabel(prop.value);
    }
    if (Array.isArray(lineItem.options_with_values)) {
      const option = lineItem.options_with_values.find((item) =>
        /flavour|flavor/.test(String(item?.name || "").toLowerCase())
      );
      if (option?.value) return normalizeLineLabel(option.value);
    }
    if (Array.isArray(lineItem.variant_options)) {
      const option = lineItem.variant_options.find((opt) =>
        /flavour|flavor/i.test(String(opt || ""))
      );
      if (option) return normalizeLineLabel(option);
    }
    const title = lineItem.title || "";
    const sizeLabel = getLineItemSize(lineItem);
    const cleaned = sizeLabel
      ? normalizeLineLabel(title.replace(new RegExp(sizeLabel, "i"), ""))
      : normalizeLineLabel(title);
    return cleaned;
  }

  function isCurryMixItem(lineItem) {
    return /curry mix/i.test(String(lineItem?.title || ""));
  }

  const BOX_MAX_SPACES = 96;
  const BOX_MAX_WEIGHT_KG = 21;
  const CURRY_BOX_MAX = 50;
  const SIZE_METRICS = {
    "200ml": { spaces: 1, weight: 0.2 },
    "250ml": { spaces: 1.6, weight: 0.2 },
    "375ml": { spaces: 2, weight: 0.45 },
    "500g": { spaces: 2.5, weight: 0.5 },
    "1kg": { spaces: 4.7, weight: 1 }
  };

  function sizeLabelToWeightKgRaw(sizeLabel) {
    if (!sizeLabel) return 0;
    const match = String(sizeLabel).match(/(\d+(?:\.\d+)?)\s*(kg|g|ml)\b/i);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!value) return 0;
    const unit = match[2].toLowerCase();
    if (unit === "kg") return value;
    return value / 1000;
  }

  function getSizeMetrics(sizeLabel) {
    if (!sizeLabel) return { spaces: 0, weight: 0 };
    const normalized = String(sizeLabel).replace(/\s+/g, "").toLowerCase();
    if (normalized.includes("gift")) return { spaces: 0, weight: 0 };
    if (SIZE_METRICS[normalized]) return SIZE_METRICS[normalized];
    return { spaces: 1, weight: sizeLabelToWeightKgRaw(sizeLabel) };
  }

  function sizeLabelToWeightKg(sizeLabel) {
    return getSizeMetrics(sizeLabel).weight;
  }

  const SMALL_ORDER_MAX_UNITS = 50;
  const SMALL_ORDER_EXCLUDED_SIZES = new Set(["500g", "750g", "1kg"]);

  function normalizeSizeToken(sizeLabel) {
    return String(sizeLabel || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function isSingleBoxSmallOrder(lineItems) {
    const items = Array.isArray(lineItems) ? lineItems : [];
    let totalUnits = 0;
    let hasExcludedSize = false;

    items.forEach((item) => {
      const qty = Number(item?.quantity) || 0;
      totalUnits += qty;
      const sizeLabel = normalizeSizeToken(getLineItemSize(item));
      if (SMALL_ORDER_EXCLUDED_SIZES.has(sizeLabel)) {
        hasExcludedSize = true;
      }
    });

    return totalUnits > 0 && totalUnits < SMALL_ORDER_MAX_UNITS && !hasExcludedSize;
  }

  function getAutoParcelCountForOrder(lineItems) {
    return isSingleBoxSmallOrder(lineItems) ? 1 : null;
  }

  function buildDispatchPackingPlan(order) {
    const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
    const items = lineItems
      .map((item) => {
        const size = getLineItemSize(item);
        const curryMix = isCurryMixItem(item);
        const metrics = getSizeMetrics(size);
        return {
          title: item.title || "",
          size,
          curryMix,
          quantity: Number(item.quantity) || 0,
          spaces: metrics.spaces,
          weight: metrics.weight
        };
      })
      .filter((item) => item.quantity > 0);

    const sizeCounts = new Map();
    let totalWeightKg = 0;
    let totalUnits = 0;

    items.forEach((item) => {
      const key = item.size || "Unspecified";
      sizeCounts.set(key, (sizeCounts.get(key) || 0) + item.quantity);
      totalWeightKg += sizeLabelToWeightKg(item.size) * item.quantity;
      totalUnits += item.quantity;
    });

    const boxes = [];
    let boxIndex = 1;

    function createBox(itemsInBox, curryMixOnly) {
      const sizeCounts = new Map();
      let spacesUsed = 0;
      let weightUsed = 0;
      itemsInBox.forEach((entry) => {
        const label = entry.size || "Unspecified";
        sizeCounts.set(label, (sizeCounts.get(label) || 0) + entry.quantity);
        spacesUsed += entry.quantity * entry.spaces;
        weightUsed += entry.quantity * entry.weight;
      });
      const sizeLabels = Array.from(sizeCounts.keys());
      const sizeLabel = sizeLabels.length === 1 ? sizeLabels[0] : "Mixed";
      return {
        label: `Box ${boxIndex}`,
        size: sizeLabel,
        curryMix: curryMixOnly,
        spacesUsed,
        weightUsed,
        sizeBreakdown: Array.from(sizeCounts.entries()).map(([size, quantity]) => ({
          size,
          quantity
        })),
        items: itemsInBox.map((entry) => ({
          label: entry.title,
          quantity: entry.quantity,
          size: entry.size,
          curryMix: entry.curryMix
        }))
      };
    }

    if (isSingleBoxSmallOrder(lineItems)) {
      const curryMixOnly = items.length > 0 && items.every((entry) => entry.curryMix);
      boxes.push(createBox(items, curryMixOnly));
      return {
        boxes,
        sizeCounts,
        totalWeightKg,
        estimatedBoxes: boxes.length,
        totalUnits
      };
    }

    const curryMixItems = [];
    const otherItems = [];
    items.forEach((item) => {
      if (item.curryMix && item.size === "250ml") {
        curryMixItems.push({ ...item });
      } else {
        otherItems.push({ ...item });
      }
    });

    let curryTotal = curryMixItems.reduce((sum, item) => sum + item.quantity, 0);
    let curryRemaining = curryMixItems.map((item) => ({ ...item }));

    while (curryTotal >= CURRY_BOX_MAX) {
      let boxQtyRemaining = CURRY_BOX_MAX;
      const boxItems = [];
      const nextRemaining = [];
      curryRemaining.forEach((item) => {
        if (boxQtyRemaining <= 0) {
          nextRemaining.push(item);
          return;
        }
        const packQty = Math.min(item.quantity, boxQtyRemaining);
        if (packQty > 0) {
          boxItems.push({ ...item, quantity: packQty });
          boxQtyRemaining -= packQty;
          curryTotal -= packQty;
        }
        const leftoverQty = item.quantity - packQty;
        if (leftoverQty > 0) {
          nextRemaining.push({ ...item, quantity: leftoverQty });
        }
      });
      boxes.push(createBox(boxItems, true));
      boxIndex += 1;
      curryRemaining = nextRemaining;
    }

    const remainingItems = [...otherItems, ...curryRemaining];
    let itemsToPack = remainingItems.map((item) => ({ ...item }));
    while (itemsToPack.length) {
      let boxSpaces = 0;
      let boxWeight = 0;
      let packedAny = false;
      const boxItems = [];
      const nextRemaining = [];

      itemsToPack.forEach((item) => {
        let qtyLeft = item.quantity;
        const spaceLeft = BOX_MAX_SPACES - boxSpaces;
        const weightLeft = BOX_MAX_WEIGHT_KG - boxWeight;
        const fitBySpace = item.spaces > 0 ? Math.floor(spaceLeft / item.spaces) : qtyLeft;
        const fitByWeight = item.weight > 0 ? Math.floor(weightLeft / item.weight) : qtyLeft;
        let fitQty = Math.min(fitBySpace, fitByWeight, qtyLeft);
        if (fitQty > 0) {
          packedAny = true;
          boxItems.push({ ...item, quantity: fitQty });
          boxSpaces += fitQty * item.spaces;
          boxWeight += fitQty * item.weight;
          qtyLeft -= fitQty;
        }
        if (qtyLeft > 0) {
          nextRemaining.push({ ...item, quantity: qtyLeft });
        }
      });

      if (!packedAny) break;
      const curryMixOnly = boxItems.length > 0 && boxItems.every((entry) => entry.curryMix);
      boxes.push(createBox(boxItems, curryMixOnly));
      boxIndex += 1;
      itemsToPack = nextRemaining;
    }

    return {
      boxes,
      sizeCounts,
      totalWeightKg,
      estimatedBoxes: boxes.length,
      totalUnits
    };
  }

  function renderDispatchPackingPlan(plan) {
    if (!plan || !plan.boxes.length) {
      return `<div class="dispatchPackingPlanEmpty">No packing plan available.</div>`;
    }
    return plan.boxes
      .map((box) => {
        const itemsHtml = box.items
          .map(
            (item) =>
              `<div class="dispatchPackingPlanItem"><span>${item.label}</span><span>${item.quantity}</span></div>`
          )
          .join("");
        const tag = `${box.curryMix ? "Curry Mix" : "Standard"} · ${box.size}`;
        const meta =
          box.spacesUsed || box.weightUsed
            ? `<div class="dispatchPackingPlanBoxMeta">Spaces: ${box.spacesUsed.toFixed(
                1
              )} · Weight: ${box.weightUsed.toFixed(2)} kg</div>`
            : "";
        const sizeBreakdown = Array.isArray(box.sizeBreakdown)
          ? box.sizeBreakdown
              .map((entry) => `<div>${entry.quantity} × ${entry.size}</div>`)
              .join("")
          : "";
        const breakdown = sizeBreakdown
          ? `<div class="dispatchPackingPlanBoxBreakdown"><div><strong>Sizes</strong></div>${sizeBreakdown}</div>`
          : "";
        return `
          <div class="dispatchPackingPlanBox">
            <div class="dispatchPackingPlanBoxTitle">${box.label} <span>${tag}</span></div>
            <div class="dispatchPackingPlanBoxItems">${itemsHtml}</div>
            ${meta}
            ${breakdown}
          </div>
        `;
      })
      .join("");
  }

  function renderDispatchPackingSummary(plan) {
    if (!plan) return "";
    const sizeRows = Array.from(plan.sizeCounts.entries())
      .map(([size, qty]) => `<div class="dispatchPackingSummaryRow">${size}: ${qty}</div>`)
      .join("");
    return `
      <div class="dispatchPackingSummary">
        <div class="dispatchPackingSummaryTitle">Packing summary</div>
        <div class="dispatchPackingSummaryBody">
          <div class="dispatchPackingSummaryGroup">
            <div class="dispatchPackingSummaryLabel">Totals by size</div>
            ${sizeRows || `<div class="dispatchPackingSummaryRow">No sizes detected.</div>`}
          </div>
          <div class="dispatchPackingSummaryGroup">
            ${renderDispatchPackingPlanStats(plan)}
          </div>
        </div>
      </div>
    `;
  }

  function formatDispatchDuration(minutes) {
    if (!Number.isFinite(minutes) || minutes <= 0) return "—";
    const rounded = Math.round(minutes);
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (hours) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function renderDispatchPackingPlanStats(plan) {
    if (!plan) return "";
    const weightLabel = plan.totalWeightKg ? `${plan.totalWeightKg.toFixed(2)} kg` : "—";
    const estimatedTime = estimatePackingTime({
      totalUnits: plan.totalUnits,
      boxCount: plan.estimatedBoxes
    });
    const timeLabel = formatDispatchDuration(estimatedTime);
    return `
      <div>Total weight: <strong>${weightLabel}</strong></div>
      <div>Estimated boxes: <strong>${plan.estimatedBoxes}</strong></div>
      <div>Estimated time: <strong>${timeLabel}</strong></div>
    `;
  }

  function aggregateDispatchSelection() {
    const units = new Map();
    let totalWeightKg = 0;
    let totalBoxes = 0;
    let totalUnits = 0;
    let orderCount = 0;

    dispatchSelectedOrders.forEach((orderNo) => {
      const order = dispatchOrderCache.get(orderNo);
      if (!order) return;
      orderCount += 1;
      const packingPlan = buildDispatchPackingPlan(order);
      totalBoxes += packingPlan?.estimatedBoxes || 0;
      totalWeightKg += packingPlan?.totalWeightKg || 0;
      (order.line_items || []).forEach((item) => {
        const qty = Number(item.quantity) || 0;
        if (!qty) return;
        totalUnits += qty;
        const size = getLineItemSize(item) || "Unspecified";
        const flavour = getLineItemFlavour(item) || "Unspecified";
        const key = `${size}||${flavour}`;
        const existing = units.get(key) || { size, flavour, quantity: 0 };
        existing.quantity += qty;
        units.set(key, existing);
      });
    });

    const totalTimeMin = estimatePackingTime({
      totalUnits,
      boxCount: totalBoxes
    });

    return { units, totalWeightKg, totalBoxes, totalUnits, orderCount, totalTimeMin };
  }

  function updateDispatchSelectionSummary() {
    if (!dispatchSelectionPanel) return;
    const totals = aggregateDispatchSelection();
    dispatchSelectionPanel.classList.toggle("is-hidden", totals.orderCount === 0);
    if (dispatchSelectionCount) {
      dispatchSelectionCount.textContent = String(totals.orderCount || 0);
    }
    if (dispatchSelectionBoxes) {
      dispatchSelectionBoxes.textContent = String(totals.totalBoxes || 0);
    }
    if (dispatchSelectionBoxesReadonly) {
      dispatchSelectionBoxesReadonly.textContent = String(totals.totalBoxes || 0);
    }
    if (dispatchSelectionWeight) {
      dispatchSelectionWeight.textContent =
        totals.totalWeightKg > 0 ? `${totals.totalWeightKg.toFixed(2)} kg` : "—";
    }
    if (dispatchSelectionTime) {
      dispatchSelectionTime.textContent = formatDispatchDuration(totals.totalTimeMin);
    }

    if (dispatchSelectionUnits) {
      if (!totals.orderCount || totals.units.size === 0) {
        dispatchSelectionUnits.innerHTML = `<div class="dispatchSelectionRow">Select orders to see totals.</div>`;
        return;
      }
      const rows = Array.from(totals.units.values())
        .sort((a, b) => {
          if (a.size === b.size) return a.flavour.localeCompare(b.flavour);
          return a.size.localeCompare(b.size);
        })
        .map(
          (entry) =>
            `<div class="dispatchSelectionRow"><span>${entry.size} · ${entry.flavour}</span><span>${entry.quantity}</span></div>`
        )
        .join("");
      dispatchSelectionUnits.innerHTML = rows;
    }
  }

  function clearDispatchSelection() {
    dispatchSelectedOrders.clear();
    dispatchBoard?.querySelectorAll(".dispatchCardSelectInput").forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.closest(".dispatchCard")?.classList.remove("is-selected");
    });
    updateDispatchSelectionSummary();
  }

  function openDispatchOrderModal(orderNo) {
    if (!dispatchOrderModal || !dispatchOrderModalBody || !dispatchOrderModalTitle) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    const packingState = getPackingState(order);
    const laneId = laneFromOrder(order);
    const title = order.customer_name || order.name || `Order ${order.id}`;
    const city = order.shipping_city || "";
    const created = order.created_at ? new Date(order.created_at).toLocaleTimeString() : "";
    const lines = renderDispatchLineItems(order, packingState);
    dispatchOrderModalTitle.textContent = title;
    if (dispatchOrderModalMeta) {
      dispatchOrderModalMeta.textContent = `#${(order.name || "").replace("#", "")} · ${city} · ${created}`;
    }
    const packingPlan = buildDispatchPackingPlan(order);
    const packingPlanMarkup = renderDispatchPackingPlan(packingPlan);
    const packingSummaryMarkup = renderDispatchPackingSummary(packingPlan);
    dispatchOrderModalBody.innerHTML = `
      <div class="dispatchCardLines">${lines || "No line items listed."}</div>
      <div class="dispatchCardActions">
        ${renderDispatchActions(order, laneId, orderNo, packingState)}
      </div>
      <div class="dispatchPackingPlanCard">
        <div class="dispatchPackingPlanHeader">
          <div class="dispatchPackingPlanTitle">Packing plan</div>
          <button class="dispatchPackingPlanPrint" type="button" data-action="print-packing-plan" data-order-no="${orderNo}" title="Print packing plan">🧾</button>
        </div>
        <div class="dispatchPackingPlanBody">${packingPlanMarkup}</div>
      </div>
      ${packingSummaryMarkup}
      ${renderDispatchPackingPanel(packingState, orderNo, { forceOpen: true })}
    `;
    dispatchOrderModal.classList.add("is-open");
    dispatchOrderModal.setAttribute("aria-hidden", "false");
    dispatchModalOrderNo = orderNo;
  }

  function closeDispatchOrderModal() {
    if (!dispatchOrderModal || !dispatchOrderModalBody) return;
    dispatchOrderModal.classList.remove("is-open");
    dispatchOrderModal.setAttribute("aria-hidden", "true");
    dispatchOrderModalBody.innerHTML = "";
    dispatchModalOrderNo = null;
  }

  async function fetchShipmentEvents(shipment) {
    if (!shipment?.order_id || !shipment?.fulfillment_id) return [];
    try {
      const url = `${CONFIG.SHOPIFY.PROXY_BASE}/fulfillment-events?orderId=${shipment.order_id}&fulfillmentId=${shipment.fulfillment_id}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.events) ? data.events : [];
    } catch (err) {
      appendDebug("Shipment events fetch failed: " + String(err));
      return [];
    }
  }

  async function openDispatchShipmentModal(shipmentKeyId) {
    if (
      !dispatchShipmentModal ||
      !dispatchShipmentModalBody ||
      !dispatchShipmentModalTitle
    )
      return;
    const shipment = dispatchShipmentCache.get(shipmentKeyId);
    if (!shipment) return;
    const title = shipment.customer_name || shipment.order_name || "Shipment";
    dispatchShipmentModalTitle.textContent = title;
    if (dispatchShipmentModalMeta) {
      const orderNo = String(shipment.order_name || "").replace("#", "");
      dispatchShipmentModalMeta.textContent = `#${orderNo} · ${
        shipment.tracking_company || "Carrier"
      }`;
    }
    dispatchShipmentModalBody.innerHTML = `
      <div class="dispatchShipmentInfo">
        <div><strong>Tracking #:</strong> ${shipment.tracking_number || "—"}</div>
        <div><strong>Status:</strong> ${formatShipmentStatus(shipment.shipment_status)}</div>
        <div><strong>Tracking URL:</strong> ${
          shipment.tracking_url
            ? `<a href="${shipment.tracking_url}" target="_blank" rel="noreferrer">Open tracking</a>`
            : "—"
        }</div>
      </div>
      <div class="dispatchShipmentEvents">
        <div class="dispatchShipmentEventsTitle">Tracking events</div>
        <div class="dispatchShipmentEventsBody">Loading tracking events…</div>
      </div>
    `;

    dispatchShipmentModal.classList.add("is-open");
    dispatchShipmentModal.setAttribute("aria-hidden", "false");
    dispatchModalShipmentId = shipmentKeyId;

    const events = await fetchShipmentEvents(shipment);
    const eventsBody = dispatchShipmentModalBody.querySelector(".dispatchShipmentEventsBody");
    if (!eventsBody) return;
    if (!events.length) {
      eventsBody.innerHTML = `<div class="dispatchShipmentEventEmpty">No tracking events available.</div>`;
      return;
    }
    eventsBody.innerHTML = events
      .map((event) => {
        const status = formatShipmentStatus(event.status || "");
        const when = event.happened_at || event.created_at;
        const time = when ? new Date(when).toLocaleString() : "";
        const location = [event.city, event.province, event.country]
          .filter(Boolean)
          .join(", ");
        return `
          <div class="dispatchShipmentEvent">
            <div class="dispatchShipmentEventTitle">${status}</div>
            <div class="dispatchShipmentEventMeta">${[time, location].filter(Boolean).join(" · ")}</div>
            <div class="dispatchShipmentEventMessage">${event.message || "Update received."}</div>
          </div>
        `;
      })
      .join("");
  }

  function closeDispatchShipmentModal() {
    if (!dispatchShipmentModal || !dispatchShipmentModalBody) return;
    dispatchShipmentModal.classList.remove("is-open");
    dispatchShipmentModal.setAttribute("aria-hidden", "true");
    dispatchShipmentModalBody.innerHTML = "";
    dispatchModalShipmentId = null;
  }

  async function notifyPickupReady(orderNo) {
    if (!orderNo) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    try {
      setDispatchProgress(6, `Marking ${orderNo} ready for collection`);
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/ready-for-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNo,
          orderId: order.id
        })
      });
      if (!res.ok) {
        const text = await res.text();
        statusExplain("Ready-for-collection failed.", "warn");
        logDispatchEvent(`Ready-for-collection failed for order ${orderNo}: ${text}`);
        return;
      }
      statusExplain(`Order ${orderNo} marked ready for collection.`, "ok");
      logDispatchEvent(`Order ${orderNo} marked ready for collection.`);
    } catch (err) {
      statusExplain("Ready-for-collection failed.", "warn");
      logDispatchEvent(`Ready-for-collection failed for order ${orderNo}: ${String(err)}`);
    }
  }

  async function markDeliveryReady(orderNo) {
    if (!orderNo) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    try {
      setDispatchProgress(6, `Marking ${orderNo} ready for delivery`);
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          trackingNumber: "",
          trackingUrl: "",
          trackingCompany: "Local delivery",
          message: "Ready for delivery."
        })
      });
      if (!res.ok) {
        const text = await res.text();
        statusExplain("Ready-for-delivery failed.", "warn");
        logDispatchEvent(`Ready-for-delivery failed for order ${orderNo}: ${text}`);
        return;
      }
      statusExplain(`Order ${orderNo} marked ready for delivery.`, "ok");
      logDispatchEvent(`Order ${orderNo} marked ready for delivery.`);
    } catch (err) {
      statusExplain("Ready-for-delivery failed.", "warn");
      logDispatchEvent(`Ready-for-delivery failed for order ${orderNo}: ${String(err)}`);
    }
  }

  function refreshDispatchViews(orderNo) {
    renderDispatchBoard(dispatchOrdersLatest);
    const modalOrder = orderNo || dispatchModalOrderNo;
    if (dispatchOrderModal?.classList.contains("is-open")) {
      if (!modalOrder || !dispatchOrderCache.get(modalOrder)) {
        closeDispatchOrderModal();
        return;
      }
      openDispatchOrderModal(modalOrder);
    }
    const modalShipment = dispatchModalShipmentId;
    if (dispatchShipmentModal?.classList.contains("is-open")) {
      if (!modalShipment || !dispatchShipmentCache.get(modalShipment)) {
        closeDispatchShipmentModal();
        return;
      }
      openDispatchShipmentModal(modalShipment);
    }
  }

  function formatShipmentStatus(status) {
    if (!status) return "Shipped";
    return String(status)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function shipmentKey(shipment) {
    const base = `${shipment.order_id || "order"}-${shipment.fulfillment_id || "fulfillment"}`;
    const tracking = shipment.tracking_number ? `-${shipment.tracking_number}` : "";
    return `${base}${tracking}`;
  }

  function renderShipmentList(shipments, emptyLabel = "No recent shipments found.") {
    const rows = shipments
      .map((shipment) => {
        const key = shipmentKey(shipment);
        dispatchShipmentCache.set(key, shipment);
        const name = shipment.customer_name || shipment.order_name || "Unknown";
        const tracking = shipment.tracking_number || "—";
        const status = formatShipmentStatus(shipment.shipment_status);
        const trackingUrl = shipment.tracking_url || "";
        return `
          <div class="dispatchShipmentRow" data-shipment-key="${key}">
            <div class="dispatchShipmentCell dispatchShipmentCell--name">${name}</div>
            <div class="dispatchShipmentCell dispatchShipmentCell--tracking">${tracking}</div>
            <div class="dispatchShipmentCell dispatchShipmentCell--status">${status}</div>
            <div class="dispatchShipmentCell dispatchShipmentCell--actions">
              <button class="dispatchShipmentActionBtn" type="button" data-action="view-shipment" data-shipment-key="${key}">Details</button>
              ${trackingUrl ? `<a class="dispatchShipmentActionBtn dispatchShipmentActionBtn--link" href="${trackingUrl}" target="_blank" rel="noopener noreferrer">Track</a>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="dispatchShipmentTable">
        <div class="dispatchShipmentRow dispatchShipmentRow--header">
          <div class="dispatchShipmentCell dispatchShipmentCell--name">Customer</div>
          <div class="dispatchShipmentCell dispatchShipmentCell--tracking">Tracking #</div>
          <div class="dispatchShipmentCell dispatchShipmentCell--status">Latest event</div>
          <div class="dispatchShipmentCell dispatchShipmentCell--actions">Actions</div>
        </div>
        ${rows || `<div class="dispatchShipmentEmpty">${emptyLabel}</div>`}
      </div>
    `;
  }

  function renderContacts() {
    if (contactsTierFilter) {
      const tiers = [...new Set(contactsState.customers.map((c) => String(c.tier || "").trim()).filter(Boolean))].sort();
      contactsTierFilter.innerHTML = `<option value="">All tiers</option>${tiers.map((tier) => `<option value="${tier}" ${contactsState.tier === tier ? "selected" : ""}>${tier}</option>`).join("")}`;
    }
    if (contactsProvinceFilter) {
      contactsProvinceFilter.innerHTML = `<option value="">All provinces</option>${SA_PROVINCES.map((province) => `<option value="${province}" ${contactsState.province === province ? "selected" : ""}>${province}</option>`).join("")}`;
    }

    const q = contactsState.query.toLowerCase();
    const filtered = contactsState.customers.filter((cust) => {
      if (contactsState.tier && String(cust.tier || "").toLowerCase() !== contactsState.tier.toLowerCase()) return false;
      if (contactsState.province && String(cust.province || "").toLowerCase() !== contactsState.province.toLowerCase()) return false;
      if (!q) return true;
      return [cust.name, cust.phone, cust.email, cust.companyName].some((v) => String(v || "").toLowerCase().includes(q));
    });

    if (contactsMeta) contactsMeta.textContent = `Showing ${filtered.length} of ${contactsState.customers.length} customers.`;
    if (!contactsList) return;
    contactsList.innerHTML = `
      <div class="dispatchShipmentTable">
        <div class="dispatchShipmentRow dispatchShipmentRow--header">
          <div class="dispatchShipmentCell">Customer</div>
          <div class="dispatchShipmentCell">Contact number</div>
          <div class="dispatchShipmentCell">Tier</div>
          <div class="dispatchShipmentCell">Province</div>
        </div>
        ${filtered.map((cust) => `
          <div class="dispatchShipmentRow">
            <div class="dispatchShipmentCell">${cust.name || "Unknown"}<br><small>${cust.email || ""}</small></div>
            <div class="dispatchShipmentCell contactsPhone">${cust.phone || "—"}</div>
            <div class="dispatchShipmentCell">${cust.tier || "—"}</div>
            <div class="dispatchShipmentCell">${cust.province || "—"}</div>
          </div>
        `).join("") || `<div class="dispatchShipmentEmpty">No customers found.</div>`}
      </div>
    `;
  }

  async function refreshContacts() {
    if (contactsState.retryTimer) {
      clearTimeout(contactsState.retryTimer);
      contactsState.retryTimer = null;
    }
    if (contactsMeta) contactsMeta.textContent = "Loading contacts…";
    try {
      const params = new URLSearchParams();
      if (contactsState.tier) params.set("tier", contactsState.tier);
      if (contactsState.province) params.set("province", contactsState.province);
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/customers${suffix}`);
      if (!res.ok) throw new Error(`Contacts request failed (${res.status})`);
      const data = await res.json();
      if (!Array.isArray(data.customers)) {
        throw new Error("Contacts response missing customers array");
      }
      contactsState.customers = data.customers;
      contactsState.loaded = true;
      renderContacts();
      if (contactsMeta && !contactsState.customers.length) {
        contactsMeta.textContent = "No customer contacts were returned from Shopify.";
      }
    } catch (err) {
      contactsState.loaded = false;
      if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
      contactsState.retryTimer = setTimeout(() => {
        refreshContacts().catch((refreshErr) => {
          appendDebug("Contacts retry failed: " + String(refreshErr));
        });
      }, 30000);
      throw err;
    }
  }

  function renderFulfillmentHistory() {
    const streamEntries = Object.entries(fulfillmentHistoryState.streams || {});
    const allShipments = streamEntries
      .flatMap(([stream, shipments]) =>
        (Array.isArray(shipments) ? shipments : []).map((shipment) => ({
          ...shipment,
          stream
        }))
      )
      .sort((a, b) => new Date(b.shipped_at || 0).getTime() - new Date(a.shipped_at || 0).getTime());

    const visibleShipments =
      fulfillmentHistoryState.statusFilter === "all"
        ? allShipments
        : allShipments.filter((shipment) => shipment.stream === fulfillmentHistoryState.statusFilter);

    if (fulfillmentHistoryList) {
      fulfillmentHistoryList.innerHTML = renderShipmentList(
        visibleShipments,
        "No fulfillment history found for the selected filters."
      );
    }

    if (fulfillmentHistoryMeta) {
      const q = fulfillmentHistoryState.query ? ` for “${fulfillmentHistoryState.query}”` : "";
      const status =
        fulfillmentHistoryState.statusFilter === "all"
          ? "all statuses"
          : `${fulfillmentHistoryState.statusFilter}`;
      fulfillmentHistoryMeta.textContent = `Showing ${visibleShipments.length} shipments (${status})${q}.`;
    }
  }

  async function refreshFulfillmentHistory() {
    const params = new URLSearchParams();
    if (fulfillmentHistoryState.query) params.set("q", fulfillmentHistoryState.query);
    const querySuffix = params.toString() ? `?${params.toString()}` : "";

    if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "Loading history…";

    const bundleRes = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfillment-history-bundle${querySuffix}`);
    if (bundleRes.ok) {
      const bundleData = await bundleRes.json();
      fulfillmentHistoryState.streams.shipped = bundleData?.streams?.shipped || [];
      fulfillmentHistoryState.streams.delivered = bundleData?.streams?.delivered || [];
      fulfillmentHistoryState.streams.collected = bundleData?.streams?.collected || [];
      renderFulfillmentHistory();
      updateDashboardKpis();
      return true;
    }

    if (bundleRes.status === 429) {
      if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History rate-limited. Retrying shortly…";
      return false;
    }

    const legacySuffix = params.toString() ? `&${params.toString()}` : "";
    const [shippedRes, deliveredRes, collectedRes] = await Promise.all([
      fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfillment-history?stream=shipped${legacySuffix}`),
      fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfillment-history?stream=delivered${legacySuffix}`),
      fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfillment-history?stream=collected${legacySuffix}`)
    ]);

    if ([shippedRes, deliveredRes, collectedRes].some((res) => res.status === 429)) {
      if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History rate-limited. Retrying shortly…";
      return false;
    }

    if (![shippedRes, deliveredRes, collectedRes].some((res) => res.ok)) {
      throw new Error("All fulfillment history endpoints failed");
    }

    const shippedData = shippedRes.ok ? await shippedRes.json() : { shipments: [] };
    const deliveredData = deliveredRes.ok ? await deliveredRes.json() : { shipments: [] };
    const collectedData = collectedRes.ok ? await collectedRes.json() : { shipments: [] };

    fulfillmentHistoryState.streams.shipped = shippedData.shipments || [];
    fulfillmentHistoryState.streams.delivered = deliveredData.shipments || [];
    fulfillmentHistoryState.streams.collected = collectedData.shipments || [];

    renderFulfillmentHistory();
    updateDashboardKpis();
    return true;
  }

  function scheduleFulfillmentHistoryRefresh(delayMs = 30000) {
    if (fulfillmentHistoryRefreshTimer) clearTimeout(fulfillmentHistoryRefreshTimer);
    fulfillmentHistoryRefreshTimer = setTimeout(async () => {
      try {
        const ok = await refreshFulfillmentHistory();
        scheduleFulfillmentHistoryRefresh(ok ? 30000 : 60000);
      } catch (err) {
        appendDebug("Fulfillment history refresh failed: " + String(err));
        if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History unavailable.";
        scheduleFulfillmentHistoryRefresh(60000);
      }
    }, delayMs);
  }

  function renderDispatchBoard(orders) {
    if (!dispatchBoard) return;

    dispatchOrderCache.clear();
    const activeOrders = new Set();

    const list = Array.isArray(orders) ? [...orders] : [];
    list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    if (!list.length) {
      dispatchBoard.innerHTML = `<div class="dispatchBoardEmpty">No open dispatch orders right now.</div>`;
      dispatchSelectedOrders.clear();
      updateDispatchSelectionSummary();
      return;
    }

    const cols = [
      { id: "shipping_priority", label: "Shipping · Priority", type: "cards" },
      { id: "shipping_medium", label: "Shipping · Standard", type: "cards" },
      { id: "shipping_awaiting_payment", label: "Shipping · Awaiting payment", type: "cards" },
      { id: "pickup", label: "Pickup / Collection", type: "cards" },
      { id: "delivery_local", label: "Delivery", type: "cards" }
    ];
    const lanes = {
      shipping_priority: [],
      shipping_medium: [],
      shipping_awaiting_payment: [],
      pickup: [],
      delivery_local: []
    };

    list.forEach((o) => {
      const laneId = laneFromOrder(o);
      (lanes[laneId] || lanes.shipping_medium).push(o);
    });

    const cardHTML = (o, laneId) => {
      const title = o.customer_name || o.name || `Order ${o.id}`;
      const city = o.shipping_city || "";
      const postal = o.shipping_postal || "";
      const created = o.created_at ? new Date(o.created_at).toLocaleTimeString() : "";
      const orderNo = String(o.name || "").replace("#", "").trim();
      const packingState = getPackingState(o);
      if (orderNo) activeOrders.add(orderNo);
      const lines = renderDispatchLineItems(o, packingState);
      const addr1 = o.shipping_address1 || "";
      const addr2 = o.shipping_address2 || "";
      const addrHtml = `${addr1}${addr2 ? "<br>" + addr2 : ""}<br>${city} ${postal}`;
      const fallbackParcelCount = getAutoParcelCountForOrder(o.line_items);
      const actualParcelCountValue =
        typeof o.parcel_count === "number" && o.parcel_count >= 0 ? o.parcel_count : "";
      const estimatedParcelCountValue =
        typeof o.estimated_parcels === "number" && o.estimated_parcels >= 0
          ? o.estimated_parcels
          : fallbackParcelCount ?? "";
      const parcelCountPlaceholder =
        actualParcelCountValue === "" && estimatedParcelCountValue !== ""
          ? `Est: ${estimatedParcelCountValue}`
          : "--";
      const isSelected = orderNo && dispatchSelectedOrders.has(orderNo);
      const combinedGroup = orderNo ? getCombinedGroupForOrder(orderNo) : null;
      const combinedStyle = combinedGroup ? `style="--combined-color:${combinedGroup.color}"` : "";

      if (orderNo) {
        dispatchOrderCache.set(orderNo, o);
      }

      return `
        <div class="dispatchCard ${isSelected ? "is-selected" : ""} ${combinedGroup ? "is-combined" : ""}" data-order-no="${orderNo}" ${combinedStyle}>
          <div class="dispatchCardTitle">
            <span class="dispatchCardTitleText">${title}</span>
            ${
              orderNo
                ? `<label class="dispatchCardSelect"><input class="dispatchCardSelectInput" type="checkbox" data-order-no="${orderNo}" ${
                    isSelected ? "checked" : ""
                  } aria-label="Select order ${orderNo}"/>Select</label>`
                : ""
            }
          </div>
          <div class="dispatchCardMeta">#${(o.name || "").replace("#", "")} · ${city} · ${created}</div>
          ${String(o.assigned_lane || "").trim().toLowerCase() === "unassigned" ? '<div class="dispatchCardMeta" style="color:#b91c1c;font-weight:700;">⚠️ Lane unresolved (UNASSIGNED)</div>' : ""}
          <div class="dispatchCardParcel">
            <label for="dispatchParcel-${orderNo}">Parcels</label>
            <input
              id="dispatchParcel-${orderNo}"
              class="dispatchParcelCountInput"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              data-order-no="${orderNo}"
              data-order-id="${o.id || ""}"
              data-last-value="${actualParcelCountValue}"
              data-estimated-value="${estimatedParcelCountValue}"
              value="${actualParcelCountValue}"
              placeholder="${parcelCountPlaceholder}"
            />
          </div>
          <div class="dispatchCardLines">${lines}</div>
          <div class="dispatchCardActions">
            ${renderDispatchActions(o, laneId, orderNo, packingState)}
          </div>
        </div>`;
    };

    dispatchBoard.innerHTML = cols
      .map((col) => {
        const laneOrders = lanes[col.id] || [];
        const cards =
          laneOrders.map((order) => cardHTML(order, col.id)).join("") ||
          `<div class="dispatchBoardEmptyCol">No ${col.label.toLowerCase()} orders.</div>`;
        return `
          <div class="dispatchCol">
            <div class="dispatchColHeader">
              <span>${col.label}</span>
              <label class="dispatchLaneSelectAll"><input type="checkbox" class="dispatchLaneSelectAllInput" data-lane-id="${col.id}"/>All</label>
            </div>
            <div class="dispatchColBody">${cards}</div>
          </div>`;
      })
      .join("");

    let pruned = false;
    dispatchPackingState.forEach((_, key) => {
      if (!activeOrders.has(key)) {
        dispatchPackingState.delete(key);
        pruned = true;
      }
    });
    if (pruned) savePackingState();
    let selectionPruned = false;
    dispatchSelectedOrders.forEach((orderNo) => {
      if (!activeOrders.has(orderNo)) {
        dispatchSelectedOrders.delete(orderNo);
        selectionPruned = true;
      }
    });
    if (activeDispatchOrderNo && !activeOrders.has(activeDispatchOrderNo)) {
      activeDispatchOrderNo = null;
    }
    setActiveDispatchCard(activeDispatchOrderNo);
    updateDispatchSelectionSummary();
  }

  async function updateDispatchParcelCount({ orderId, orderNo, value }) {
    if (!orderId) return false;
    try {
      const payload = { orderId };
      if (value === "" || value === null || typeof value === "undefined") {
        payload.parcelCount = null;
      } else {
        payload.parcelCount = value;
      }
      const resp = await fetch(`${API_BASE}/shopify/orders/parcel-count`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (orderNo) {
        const order = dispatchOrderCache.get(orderNo);
        if (order) order.parcel_count = data.parcelCount ?? null;
      }
      return true;
    } catch (err) {
      statusExplain("Failed to save parcel count.", "warn");
      appendDebug(`Parcel count update failed: ${String(err)}`);
      return false;
    }
  }

  function getDispatchParcelCountInputValue(orderNo) {
    if (!orderNo) return null;
    const input = dispatchBoard?.querySelector(`.dispatchParcelCountInput[data-order-no="${orderNo}"]`);
    if (!input) return null;
    const raw = String(input.value || "").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function printOppDocument(order, docType) {
    const normalizedType =
      docType === "picklist" ? "picklist" : docType === "packing-slip" ? "packing-slip" : null;
    if (!order || !normalizedType) return false;
    const orderNo = String(order.name || "").replace("#", "").trim();
    const title = order.customer_name || order.name || `Order ${order.id}`;
    const packingState = dispatchPackingState.get(orderNo) || getPackingState(order);
    const parcelCount = getPackingParcelCount(packingState);
    const created = order.created_at ? new Date(order.created_at).toLocaleString() : "";
    const addressLines = [
      order.shipping_address1,
      order.shipping_address2,
      [order.shipping_city, order.shipping_postal].filter(Boolean).join(" ")
    ]
      .filter(Boolean)
      .join("<br>");
    const packedByIndex = new Map(
      (packingState?.items || []).map((item) => [item.index, item.packed || 0])
    );
    const rows = (order.line_items || [])
      .map((li, index) => {
        const variantTitle = (li.variant_title || "").trim();
        const itemLabel = [li.title, variantTitle && variantTitle !== "Default Title" ? variantTitle : ""]
          .filter(Boolean)
          .join(" · ");
        const packedCount = packedByIndex.get(index) || 0;
        const docCell =
          normalizedType === "picklist"
            ? `<td class="oppCell oppCell--blank"></td>`
            : `<td>${packedCount}</td>`;
        return `<tr><td>${itemLabel || ""}</td><td>${li.sku || ""}</td><td>${li.quantity}</td>${docCell}</tr>`;
      })
      .join("");

    const docTitle =
      normalizedType === "picklist" ? "OPP Pick List" : "OPP Packing Slip";
    const extraColumnHeader = normalizedType === "picklist" ? "Picked" : "Packed";
    const doc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${docTitle} ${orderNo}</title>
        <style>
          body{ font-family:Arial, sans-serif; padding:24px; color:#0f172a; }
          h1{ font-size:18px; margin-bottom:8px; }
          .meta{ font-size:12px; color:#475569; margin-bottom:12px; }
          .summary{ font-size:12px; color:#0f172a; margin-bottom:16px; }
          table{ width:100%; border-collapse:collapse; font-size:12px; }
          th,td{ border:1px solid #cbd5f5; padding:6px; text-align:left; }
          th{ background:#e2e8f0; }
          .addr{ margin-top:10px; font-size:12px; }
          .oppCell--blank{ background:#fff; }
        </style>
      </head>
      <body>
        <h1>${docTitle} • Order ${orderNo}</h1>
        <div class="meta">${title}${created ? ` · ${created}` : ""}</div>
        <div class="summary">Parcels: ${parcelCount || 0}</div>
        <div class="addr"><strong>Deliver to:</strong><br>${addressLines || "No address on file"}</div>
        <table>
          <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>${extraColumnHeader}</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='4'>No line items.</td></tr>"}</tbody>
        </table>
      </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return false;
    win.document.open();
    win.document.write(doc);
    win.document.close();
    win.focus();
    win.print();
    return true;
  }

  function printPackingPlan(orderNo) {
    if (!orderNo) return false;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return false;
    const title = order.customer_name || order.name || `Order ${order.id}`;
    const packingPlan = buildDispatchPackingPlan(order);
    const planMarkup = renderDispatchPackingPlan(packingPlan);
    const summaryMarkup = renderDispatchPackingSummary(packingPlan);
    const doc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Packing plan ${orderNo}</title>
        <style>
          body{ font-family:Arial, sans-serif; padding:24px; color:#0f172a; }
          h1{ font-size:18px; margin-bottom:6px; }
          .meta{ font-size:12px; color:#475569; margin-bottom:16px; }
          .dispatchPackingPlanBox{ border:1px solid #e2e8f0; padding:10px 12px; margin-bottom:12px; }
          .dispatchPackingPlanBoxTitle{ font-size:12px; font-weight:700; margin-bottom:6px; display:flex; justify-content:space-between; }
          .dispatchPackingPlanItem{ display:flex; justify-content:space-between; font-size:12px; padding:2px 0; }
          .dispatchPackingPlanBoxMeta{ font-size:11px; color:#475569; margin-top:6px; }
          .dispatchPackingPlanBoxBreakdown{ font-size:11px; margin-top:6px; }
          .dispatchPackingSummary{ margin-top:16px; font-size:12px; }
          .dispatchPackingSummaryTitle{ font-weight:700; margin-bottom:6px; }
          .dispatchPackingSummaryRow{ margin-bottom:4px; }
        </style>
      </head>
      <body>
        <h1>Packing plan • Order ${orderNo}</h1>
        <div class="meta">${title}</div>
        <div class="dispatchPackingPlanBody">${planMarkup}</div>
        ${summaryMarkup}
      </body>
      </html>
    `;
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return false;
    win.document.open();
    win.document.write(doc);
    win.document.close();
    win.focus();
    win.print();
    return true;
  }

  async function printDeliveryNote(order) {
    if (!order) return false;
    const orderNo = String(order.name || "").replace("#", "").trim();
    let orderData = order;

    try {
      const res = await fetch(
        `${CONFIG.SHOPIFY.PROXY_BASE}/orders/by-name/${encodeURIComponent(orderNo)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.order) orderData = data.order;
      }
    } catch (err) {
      appendDebug(`Delivery note fetch failed for ${orderNo}: ${String(err)}`);
    }

    const billing = orderData.billing_address || {};
    const shipping = orderData.shipping_address || {};
    const customer = orderData.customer || {};
    const noteRaw = String(orderData.note || "");
    const noteLines = noteRaw.split("\n");

    let poValue = "";
    let invoiceDateFromNote = "";
    noteLines.forEach((line) => {
      const clean = line.trim();
      if (clean.includes("PO:")) {
        poValue = clean.split("PO:").pop().trim();
      }
      if (clean.includes("Invoice Date:")) {
        const rawAfter = clean.split("Invoice Date:").pop().trim();
        invoiceDateFromNote = rawAfter.slice(0, 10);
      }
    });

    const invoiceDateMf =
      orderData?.metafields?.custom?.invoice_date?.value ||
      orderData?.metafields?.custom?.invoice_date ||
      orderData?.metafields?.finance?.invoice_date?.value ||
      orderData?.metafields?.finance?.invoice_date ||
      "";

    const invoiceDateRaw = invoiceDateMf || invoiceDateFromNote || orderData.created_at || "";

    const normalizeDateParts = (value) => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
      }
      const str = String(value).trim();
      if (!str) return null;

      const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
      }

      if (str.includes("/")) {
        const parts = str.split("/").map((part) => part.trim());
        if (parts.length === 3) {
          const [p0, p1, p2] = parts;
          if (p0.length === 4) {
            return { y: Number(p0), m: Number(p1), d: Number(p2) };
          }
          if (p2.length === 4) {
            return { y: Number(p2), m: Number(p1), d: Number(p0) };
          }
        }
      }

      const parsed = new Date(str);
      if (!Number.isNaN(parsed.getTime())) {
        return { y: parsed.getFullYear(), m: parsed.getMonth() + 1, d: parsed.getDate() };
      }
      return null;
    };

    const formatDate = (value) => {
      const parts = normalizeDateParts(value);
      if (!parts) return "";
      const day = String(parts.d).padStart(2, "0");
      const month = String(parts.m).padStart(2, "0");
      return `${day}/${month}/${parts.y}`;
    };

    const invoiceDateFinal = formatDate(invoiceDateRaw);

    const billingName =
      (billing.company && billing.company.trim()) || billing.name || orderData.customer_name || "";
    const shippingName =
      (shipping.company && shipping.company.trim()) || shipping.name || orderData.customer_name || "";

    const billingPhone =
      billing.phone ||
      customer?.default_address?.phone ||
      customer.phone ||
      orderData.phone ||
      "";
    const shippingPhone = shipping.phone || orderData.shipping_phone || "";

    const noteAttributes = Array.isArray(orderData.note_attributes)
      ? orderData.note_attributes
      : [];
    const shippingEmail =
      noteAttributes.find((attr) => attr?.name === "Shipping Email")?.value ||
      orderData.email ||
      "";

    const lineItems = Array.isArray(orderData.line_items) ? [...orderData.line_items] : [];
    lineItems.sort((a, b) => String(a.sku || "").localeCompare(String(b.sku || "")));

    const shopName = CONFIG?.SHOP_NAME || "Flippen Lekka Holdings (Pty) Ltd";
    const shopDomain = CONFIG?.SHOP_DOMAIN || "flippenlekkaspices.co.za";

    const lineRows = lineItems
      .map((line) => {
        return `
          <tr>
            <td>${line.sku || ""}</td>
            <td>${line.title || ""}</td>
            <td style="text-align:center;">${line.quantity || ""}</td>
          </tr>
        `;
      })
      .join("");

    const doc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Delivery Note ${orderNo}</title>
        <style>
          body{ font-family: Arial, sans-serif; font-size: 9pt; color:#000; }
          .card{ border:1px solid #ddd; border-radius:6px; padding:10px; }
          .card h3{ margin:0 0 6px 0; font-size:11pt; letter-spacing:.2px; }
          .kv{ margin:2px 0; font-size:9pt; }
          .kv .k{ color:#555; min-width:80px; display:inline-block; }
          .namebig{ font-size:11pt; font-weight:700; margin-bottom:4px; }
          .muted{ color:#666; }
          h2{ margin:2px 0 0 0; font-size:13pt; font-weight:700; }
          .small{ font-size:8pt !important; }
          .tight td{ padding:2px 4px; }
          .headerTbl{ width:100%; }
          .hdrL{ width:70%; vertical-align:top; text-align:left; }
          .hdrR{ width:30%; vertical-align:top; text-align:right; }
          .addrTbl{ width:100%; margin-top:12px; }
          .addrTbl td{ vertical-align:top; width:50%; }
          .section{ font-size:14px; font-weight:700; text-transform:uppercase; }
          .items{ font-size:11px; width:100%; border-collapse:collapse; margin-top:14px; }
          .items th, .items td{ border:1px solid #000; padding:3px; }
          .items th{ background:#f2f2f2; }
          .sigTbl{ width:100%; margin-top:24px; }
          .sigTbl td{ padding:12px 0; }
          .note{ font-size:8pt; margin-top:8px; }
        </style>
      </head>
      <body>
        <table class="headerTbl">
          <tr>
            <td class="hdrL">
              <h2>${shopName}</h2>
              <div class="logo-wrapper" style="float:left;">
                <a href="https://${shopDomain}" target="_blank">
                  <img class="logo" alt="Logo"
                       src="/img/logo.png"
                       style="max-width:40%;height:auto;margin-right:10px;">
                </a>
              </div>
              <div class="small" style="width:100%">
                7 Papawer Street, Blomtuin, Bellville<br>
                Cape Town, Western Cape, 7530<br>
                Co. Reg No: 2015/091655/07<br>
                VAT Reg No: 4150279885<br>
                Phone: 071 371 0499 | 078 355 6277<br>
                Email: admin@flippenlekkaspices.co.za
              </div>
            </td>
            <td class="hdrR">
              <h2 style="font-size:18px">DELIVERY NOTE</h2>
              <table class="tight small" style="margin-left:auto;">
                <tr>
                  <td class="section">Date:</td>
                  <td>${invoiceDateFinal || ""}</td>
                </tr>
                <tr>
                  <td class="section">Delivery&nbsp;No:</td>
                  <td>${orderData.name || ""}</td>
                </tr>
                ${poValue ? `<tr><td class="section">PO&nbsp;Number:</td><td>${poValue}</td></tr>` : ""}
              </table>
            </td>
          </tr>
        </table>

        <table class="addrTbl small">
          <tr>
            <td>
              <div class="card">
                <h3>Invoice to</h3>
                <div class="namebig">${billingName || ""}</div>
                ${billing.address1 ? `<div class="kv"><span class="k">Address:</span> ${billing.address1}</div>` : ""}
                ${billing.address2 ? `<div class="kv"><span class="k"></span>${billing.address2}</div>` : ""}
                ${
                  billing.city || billing.province
                    ? `<div class="kv"><span class="k"></span>${billing.city || ""}${
                        billing.province ? `, ${billing.province}` : ""
                      }</div>`
                    : ""
                }
                ${billing.zip ? `<div class="kv"><span class="k"></span>${billing.zip}</div>` : ""}
                ${billing.country ? `<div class="kv"><span class="k"></span>${billing.country}</div>` : ""}
                ${billingPhone ? `<div class="kv"><span class="k">Phone:</span> ${billingPhone}</div>` : ""}
                ${orderData.email ? `<div class="kv"><span class="k">Email:</span> ${orderData.email}</div>` : ""}
                ${
                  customer?.note && customer.note.includes("VAT ID:")
                    ? `<div class="kv"><span class="k">VAT Nr:</span> ${
                        customer.note.split("VAT ID:").pop().trim()
                      }</div>`
                    : ""
                }
              </div>
            </td>
            <td>
              <div class="card">
                <h3>Deliver to</h3>
                <div class="namebig">${shippingName || ""}</div>
                ${shipping.address1 ? `<div class="kv"><span class="k">Address:</span> ${shipping.address1}</div>` : ""}
                ${shipping.address2 ? `<div class="kv"><span class="k"></span>${shipping.address2}</div>` : ""}
                ${
                  shipping.city || shipping.province
                    ? `<div class="kv"><span class="k"></span>${shipping.city || ""}${
                        shipping.province ? `, ${shipping.province}` : ""
                      }</div>`
                    : ""
                }
                ${shipping.zip ? `<div class="kv"><span class="k"></span>${shipping.zip}</div>` : ""}
                ${shipping.country ? `<div class="kv"><span class="k"></span>${shipping.country}</div>` : ""}
                ${shippingPhone ? `<div class="kv"><span class="k">Phone:</span> ${shippingPhone}</div>` : ""}
                ${shippingEmail ? `<div class="kv"><span class="k">Email:</span> ${shippingEmail}</div>` : ""}
              </div>
            </td>
          </tr>
        </table>

        <table class="items">
          <thead>
            <tr>
              <th style="width:14%;">Code</th>
              <th>Description</th>
              <th style="width:8%; text-align:center;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${lineRows || "<tr><td colspan='3'>No line items.</td></tr>"}
          </tbody>
        </table>

        <table class="sigTbl small">
          <tr>
            <td>Received by: ___________________</td>
            <td>Receiver signature: ___________________</td>
            <td>Date: ___________________</td>
          </tr>
        </table>

        <div class="note" style="text-align:center; margin-top:8px;">
          Please check your goods before signing. Goods remain vested in Flippen Lekka Holdings (Pty) Ltd until paid in full.
        </div>
      </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return false;
    win.document.open();
    win.document.write(doc);
    win.document.close();
    win.focus();
    win.print();
    return true;
  }

  async function refreshDispatchData() {
    try {
      const ordersRes = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/open`);
      const data = ordersRes.ok ? await ordersRes.json() : { orders: [] };
      dispatchOrdersLatest = data.orders || [];
      renderDispatchBoard(dispatchOrdersLatest);
      updateDashboardKpis();
      if (dispatchStamp) dispatchStamp.textContent = "Updated " + new Date().toLocaleTimeString();
    } catch (e) {
      appendDebug("Dispatch refresh failed: " + String(e));
      if (dispatchBoard) dispatchBoard.innerHTML = `<div class="dispatchBoardEmpty">Error loading orders.</div>`;
      if (dispatchStamp) dispatchStamp.textContent = "Dispatch: error";
    }
  }

  // Centralized SPA view switch so nav states, URL, and section visibility remain consistent.
  function switchMainView(view) {
    const showDashboard = view === "dashboard";
    const showScan = view === "scan";
    const showFulfillmentHistory = view === "fulfillment-history";
    const showContacts = view === "contacts";
    const showOps = view === "ops";
    const showDocs = view === "docs";
    const showFlowcharts = view === "flowcharts";
    const showFlocs = view === "flocs";
    const showStock = view === "stock";
    const showPriceManager = view === "price-manager";
    const showTraceability = view === "traceability";
    const showFeatureMap = view === "feature-map";
    const showIdeas = view === "ideas";

    if (viewDashboard) {
      viewDashboard.hidden = !showDashboard;
      viewDashboard.classList.toggle("flView--active", showDashboard);
    }
    if (viewScan) {
      viewScan.hidden = !showScan;
      viewScan.classList.toggle("flView--active", showScan);
    }
    if (viewFulfillmentHistory) {
      viewFulfillmentHistory.hidden = !showFulfillmentHistory;
      viewFulfillmentHistory.classList.toggle("flView--active", showFulfillmentHistory);
    }
    if (viewContacts) {
      viewContacts.hidden = !showContacts;
      viewContacts.classList.toggle("flView--active", showContacts);
    }
    if (viewOps) {
      viewOps.hidden = !showOps;
      viewOps.classList.toggle("flView--active", showOps);
    }
    if (viewDocs) {
      viewDocs.hidden = !showDocs;
      viewDocs.classList.toggle("flView--active", showDocs);
    }
    if (viewFlowcharts) {
      viewFlowcharts.hidden = !showFlowcharts;
      viewFlowcharts.classList.toggle("flView--active", showFlowcharts);
    }
    if (viewFlocs) {
      viewFlocs.hidden = !showFlocs;
      viewFlocs.classList.toggle("flView--active", showFlocs);
    }
    if (viewStock) {
      viewStock.hidden = !showStock;
      viewStock.classList.toggle("flView--active", showStock);
    }
    if (viewPriceManager) {
      viewPriceManager.hidden = !showPriceManager;
      viewPriceManager.classList.toggle("flView--active", showPriceManager);
    }
    if (viewTraceability) {
      viewTraceability.hidden = !showTraceability;
      viewTraceability.classList.toggle("flView--active", showTraceability);
    }
    if (viewFeatureMap) {
      viewFeatureMap.hidden = !showFeatureMap;
      viewFeatureMap.classList.toggle("flView--active", showFeatureMap);
    }
    if (viewIdeas) {
      viewIdeas.hidden = !showIdeas;
      viewIdeas.classList.toggle("flView--active", showIdeas);
    }

    navDashboard?.classList.toggle("flNavBtn--active", showDashboard);
    navScan?.classList.toggle("flNavBtn--active", showScan);
    navFulfillmentHistory?.classList.toggle("flNavBtn--active", showFulfillmentHistory);
    navContacts?.classList.toggle("flNavBtn--active", showContacts);
    navOps?.classList.toggle("flNavBtn--active", showOps);
    navDocs?.classList.toggle("flNavBtn--active", showDocs);
    navFlowcharts?.classList.toggle("flNavBtn--active", showFlowcharts);
    navFlocs?.classList.toggle("flNavBtn--active", showFlocs);
    navStock?.classList.toggle("flNavBtn--active", showStock);
    navPriceManager?.classList.toggle("flNavBtn--active", showPriceManager);
    navTraceability?.classList.toggle("flNavBtn--active", showTraceability);
    navFeatureMap?.classList.toggle("flNavBtn--active", showFeatureMap);
    navIdeas?.classList.toggle("flNavBtn--active", showIdeas);
    navDashboard?.setAttribute("aria-selected", showDashboard ? "true" : "false");
    navScan?.setAttribute("aria-selected", showScan ? "true" : "false");
    navFulfillmentHistory?.setAttribute("aria-selected", showFulfillmentHistory ? "true" : "false");
    navContacts?.setAttribute("aria-selected", showContacts ? "true" : "false");
    navOps?.setAttribute("aria-selected", showOps ? "true" : "false");
    navDocs?.setAttribute("aria-selected", showDocs ? "true" : "false");
    navFlowcharts?.setAttribute("aria-selected", showFlowcharts ? "true" : "false");
    navFlocs?.setAttribute("aria-selected", showFlocs ? "true" : "false");
    navStock?.setAttribute("aria-selected", showStock ? "true" : "false");
    navPriceManager?.setAttribute("aria-selected", showPriceManager ? "true" : "false");
    navTraceability?.setAttribute("aria-selected", showTraceability ? "true" : "false");
    navFeatureMap?.setAttribute("aria-selected", showFeatureMap ? "true" : "false");
    navIdeas?.setAttribute("aria-selected", showIdeas ? "true" : "false");

    if (showDashboard) {
      statusExplain("Dashboard ready — choose a module to launch.", "info");
    } else if (showScan) {
      statusExplain("Ready to scan orders…", "info");
      scanInput?.focus();
    } else if (showFulfillmentHistory) {
      statusExplain("Viewing fulfillment history.", "info");
    } else if (showContacts) {
      statusExplain("Viewing customer contacts.", "info");
      if (!contactsState.loaded || !contactsState.customers.length) refreshContacts().catch((err) => {
        appendDebug("Contacts refresh failed: " + String(err));
        if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
      });
    } else if (showDocs) {
      statusExplain("Viewing operator documentation", "info");
    } else if (showFlocs) {
      statusExplain("Order capture ready.", "info");
    } else if (showFlowcharts) {
      statusExplain("Flowchart logic reference loaded.", "info");
    } else if (showStock) {
      statusExplain("Stock take ready.", "info");
    } else if (showPriceManager) {
      statusExplain("Price manager ready.", "info");
    } else if (showTraceability) {
      statusExplain("Traceability tools ready.", "info");
    } else if (showFeatureMap) {
      statusExplain("Feature map ready.", "info");
    } else if (showIdeas) {
      statusExplain("Ideas board ready.", "info");
    } else {
      statusExplain("Viewing orders / ops dashboard", "info");
    }
  }

  const ROUTE_VIEW_MAP = new Map([
    ["/", "dashboard"],
    ["/dashboard", "dashboard"],
    ["/scan", "scan"],
    ["/fulfillment-history", "fulfillment-history"],
    ["/contacts", "contacts"],
    ["/ops", "scan"],
    ["/docs", "docs"],
    ["/flowcharts", "flowcharts"],
    ["/flocs", "flocs"],
    ["/stock", "stock"],
    ["/price-manager", "price-manager"],
    ["/traceability", "traceability"],
    ["/feature-map", "feature-map"],
    ["/ideas", "ideas"]
  ]);

  const VIEW_ROUTE_MAP = {
    dashboard: "/",
    scan: "/scan",
    "fulfillment-history": "/fulfillment-history",
    contacts: "/contacts",
    ops: "/scan",
    docs: "/docs",
    flowcharts: "/flowcharts",
    flocs: "/flocs",
    stock: "/stock",
    "price-manager": "/price-manager",
    traceability: "/traceability",
    "feature-map": "/feature-map",
    ideas: "/ideas"
  };

  const viewInitializers = {
    flocs: initFlocsView,
    stock: initStockView,
    "price-manager": initPriceManagerView,
    traceability: initTraceabilityView,
    "feature-map": initFeaturePlannerView,
    ideas: initFeaturePlannerView
  };

  function normalizePath(path) {
    if (!path) return "/";
    let cleaned = path.split("?")[0].split("#")[0];
    cleaned = cleaned.replace(/\/index\.html$/, "");
    return cleaned.replace(/\/+$/, "") || "/";
  }

  function viewForPath(path) {
    return ROUTE_VIEW_MAP.get(normalizePath(path)) || "dashboard";
  }

  function routeForView(view) {
    return VIEW_ROUTE_MAP[view] || "/";
  }

  function initViewIfNeeded(view) {
    const init = viewInitializers[view];
    if (init) init();
  }

  function renderRoute(path) {
    const view = viewForPath(path);
    switchMainView(view);
    initViewIfNeeded(view);
  }

  // Router entrypoint used by nav buttons and deep links.
  function navigateTo(path, { replace = false } = {}) {
    const next = normalizePath(path);
    if (replace) {
      window.history.replaceState({}, "", next);
    } else {
      window.history.pushState({}, "", next);
    }
    renderRoute(next);
  }

  const NAV_COLLAPSE_KEY = "fl_nav_collapsed";

  function setNavCollapsed(collapsed) {
    document.body.classList.toggle("flNavCollapsed", collapsed);
    navToggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  if (navToggle) {
    const stored = localStorage.getItem(NAV_COLLAPSE_KEY);
    if (stored === "true") {
      setNavCollapsed(true);
    }
    navToggle.addEventListener("click", () => {
      const next = !document.body.classList.contains("flNavCollapsed");
      setNavCollapsed(next);
      localStorage.setItem(NAV_COLLAPSE_KEY, String(next));
    });
  }

  let dispatchExpanded = false;

  function setDispatchExpanded(expanded) {
    dispatchExpanded = expanded;
    viewScan?.classList.toggle("dispatchExpanded", dispatchExpanded);
    if (dispatchExpandToggle) {
      dispatchExpandToggle.setAttribute("aria-expanded", dispatchExpanded ? "true" : "false");
      dispatchExpandToggle.textContent = dispatchExpanded ? "Collapse" : "Expand";
    }
  }

  function setActiveDispatchCard(orderNo, { scrollIntoViewIfNeeded = false } = {}) {
    activeDispatchOrderNo = orderNo || null;
    if (!dispatchBoard) return;
    let activeCard = null;
    dispatchBoard.querySelectorAll(".dispatchCard").forEach((card) => {
      const isActive = !!orderNo && card.dataset.orderNo === orderNo;
      card.classList.toggle("is-active-card", isActive);
      if (isActive) activeCard = card;
    });
    if (!scrollIntoViewIfNeeded || !activeCard) return;
    const rect = activeCard.getBoundingClientRect();
    const viewportHeight =
      window.innerHeight || document.documentElement?.clientHeight || rect.height || 0;
    const isVisible = rect.top >= 0 && rect.bottom <= viewportHeight;
    if (!isVisible) {
      activeCard.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function afterDomUpdate() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  if (dispatchExpandToggle) {
    setDispatchExpanded(false);
    dispatchExpandToggle.addEventListener("click", () => {
      setDispatchExpanded(!dispatchExpanded);
    });
  }

  scanInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const code = scanInput.value.trim();
      scanInput.value = "";
      if (!code) return;
      await handleScan(code);
    }
  });

  btnBookNow?.addEventListener("click", async () => {
    cancelAutoBookTimer();

    if (!activeOrderNo || !orderDetails) {
      statusExplain("Scan an order first.", "warn");
      return;
    }
    if (isBooked(activeOrderNo)) {
      statusExplain(`Order ${activeOrderNo} already booked — blocked.`, "warn");
      return;
    }

    if (!isAutoMode) {
      if (getTotalScannedCount() <= 0) {
        statusExplain("Scan parcels first.", "warn");
        return;
      }
      await doBookingNow({ manual: true, parcelCount: getTotalScannedCount() });
      return;
    }

    if (hasParcelCountTag(orderDetails)) {
      statusExplain("This order has a parcel_count tag — it auto-books on first scan.", "warn");
      return;
    }

    // Use scanned count as default to avoid prompt if you want:
    if (!getExpectedParcelCount(orderDetails) && getActiveParcelSet().size > 0) {
      orderDetails.manualParcelCount = getActiveParcelSet().size;
    }

    await doBookingNow();
  });


  emergencyStopBtn?.addEventListener("click", () => {
    statusExplain("EMERGENCY STOP – session cleared", "err");
    resetSession();
    if (stickerPreview) stickerPreview.innerHTML = "";
    if (printMount) printMount.innerHTML = "";
    if (quoteBox) quoteBox.textContent = "No quote yet.";
    if (bookingSummary) bookingSummary.textContent = "";
    if (scanInput) scanInput.value = "";
    if (dbgOn && debugLog) debugLog.textContent = "";
    navigateTo("/scan", { replace: true });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const routeEl = target.closest("[data-route]");
    if (!routeEl) return;
    const route = routeEl.getAttribute("data-route") || routeEl.getAttribute("href");
    if (!route) return;
    event.preventDefault();
    navigateTo(route);
  });

  modeToggle?.addEventListener("click", () => {
    isAutoMode = !isAutoMode;
    cancelAutoBookTimer();
    saveModePreference();
    updateModeToggle();
    updateDashboardKpis();
    renderSessionUI();
    statusExplain(isAutoMode ? "Auto mode enabled." : "Manual mode enabled.", "info");
  });


  
  dispatchCreateCombined?.addEventListener("click", async () => {
    await createCombinedShipmentFromSelection();
  });

  dispatchPrintDocs?.addEventListener("click", async () => {
    const orders = Array.from(dispatchSelectedOrders)
      .map((orderNo) => dispatchOrderCache.get(orderNo))
      .filter(Boolean);
    for (const order of orders) {
      const orderNo = orderNoFromName(order.name);
      const ok = await printDeliveryNote(order);
      if (ok) printedDeliveryNotes.add(orderNo);
    }
    refreshDispatchViews();
    statusExplain(`Printed delivery docs for ${orders.length} orders.`, "ok");
  });

  dispatchDeliverSelected?.addEventListener("click", async () => {
    const selected = Array.from(dispatchSelectedOrders).filter((orderNo) => {
      const order = dispatchOrderCache.get(orderNo);
      return laneFromOrder(order) === "delivery_local";
    });
    for (const orderNo of selected) {
      await markDeliveryReady(orderNo);
    }
  });

  dispatchMarkDelivered?.addEventListener("click", async () => {
    const selected = Array.from(dispatchSelectedOrders).filter((orderNo) => {
      const order = dispatchOrderCache.get(orderNo);
      return laneFromOrder(order) === "delivery_local";
    });
    for (const orderNo of selected) {
      await markDeliveryReady(orderNo);
    }
    statusExplain(`Marked ${selected.length} selected delivery orders as delivered.`, "ok");
  });

  truckBookBtn?.addEventListener("click", async () => {
    if (!dailyParcelCount) {
      statusExplain("No parcels counted for today yet.", "warn");
      return;
    }
    if (truckBooked) {
      const confirmReset = window.confirm("Mark truck collection as not booked?");
      if (!confirmReset) return;
      updateTruckBookingState({ booked: false, bookedBy: "manual" });
      statusExplain("Truck marked as not booked.", "warn");
      return;
    }
    await requestTruckBooking("manual");
  });

  async function handleDispatchAction(action) {
    const actionType = action.dataset.action;
    const orderNo = action.dataset.orderNo;
    if (!actionType) return false;
    if (actionType === "close-modal") {
      closeDispatchOrderModal();
      return true;
    }
    if (actionType === "start-packing") {
      if (!orderNo) return true;
      const order = dispatchOrderCache.get(orderNo);
      if (!order) return true;
      const state = getPackingState(order);
      if (!state) return true;
      const hadBoxes = Array.isArray(state.boxes) && state.boxes.length > 0;
      if (!state.startTime) {
        state.startTime = new Date().toISOString();
        logDispatchEvent(`Packing started for order ${orderNo}.`);
      }
      if (!hadBoxes) {
        addPackingBox(state, { seedPacked: true });
        logDispatchEvent(`Parcel 1 opened for order ${orderNo}.`);
      }
      state.active = true;
      savePackingState();
      refreshDispatchViews(orderNo);
      return true;
    }
    if (actionType === "pack-all") {
      if (!orderNo) return true;
      const state = dispatchPackingState.get(orderNo);
      if (!state) return true;
      if (!state.startTime) state.startTime = new Date().toISOString();
      const itemKey = action.dataset.itemKey;
      const item = getPackingItem(state, itemKey);
      if (!item) return true;
      const remaining = Math.max(0, item.quantity - item.packed);
      if (remaining > 0) {
        allocatePackedToBox(state, item.key, remaining);
        item.packed = item.quantity;
      }
      if (isPackingComplete(state)) {
        finalizePacking(state);
      } else {
        savePackingState();
      }
      refreshDispatchViews(orderNo);
      return true;
    }
    if (actionType === "pack-qty") {
      if (!orderNo) return true;
      const state = dispatchPackingState.get(orderNo);
      if (!state) return true;
      if (!state.startTime) state.startTime = new Date().toISOString();
      const itemKey = action.dataset.itemKey;
      const item = getPackingItem(state, itemKey);
      if (!item) return true;
      const row = action.closest(".dispatchPackingRow");
      const input = row?.querySelector(".dispatchPackingQty");
      const remaining = Math.max(0, item.quantity - item.packed);
      const requested = input ? Number(input.value) : 0;
      const qty = Math.max(0, Math.min(remaining, requested));
      if (!qty) return true;
      allocatePackedToBox(state, item.key, qty);
      item.packed += qty;
      if (input) input.value = "";
      if (isPackingComplete(state)) {
        finalizePacking(state);
      } else {
        savePackingState();
      }
      refreshDispatchViews(orderNo);
      return true;
    }
    if (actionType === "add-box") {
      if (!orderNo) return true;
      const state = dispatchPackingState.get(orderNo);
      if (!state) return true;
      if (!state.startTime) state.startTime = new Date().toISOString();
      const seedPacked = !Array.isArray(state.boxes) || !state.boxes.length;
      const box = addPackingBox(state, { seedPacked });
      logDispatchEvent(`Parcel added for order ${orderNo}: ${box?.label || ""}`.trim());
      savePackingState();
      refreshDispatchViews(orderNo);
      return true;
    }
    if (actionType === "finish-packing") {
      if (!orderNo) return true;
      const state = dispatchPackingState.get(orderNo);
      if (!state) return true;
      if (!state.startTime) state.startTime = new Date().toISOString();
      finalizePacking(state);
      refreshDispatchViews(orderNo);
      return true;
    }
    if (actionType === "run-flow") {
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("Flow trigger unavailable.", "warn");
        logDispatchEvent("Flow trigger failed: order not found.");
        return true;
      }
      try {
        setDispatchProgress(2, `Triggering flow for ${orderNo}`);
        const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/run-flow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            orderNo,
            flowTag: CONFIG.FLOW_TRIGGER_TAG
          })
        });
        if (!res.ok) {
          const text = await res.text();
          statusExplain("Flow trigger failed.", "warn");
          logDispatchEvent(`Flow trigger failed for order ${orderNo}: ${text}`);
          return true;
        }
        statusExplain(`Flow triggered for ${orderNo}.`, "ok");
        logDispatchEvent(`Flow triggered for order ${orderNo}.`);
      } catch (err) {
        statusExplain("Flow trigger failed.", "warn");
        logDispatchEvent(`Flow trigger failed for order ${orderNo}: ${String(err)}`);
      }
      return true;
    }
    if (actionType === "fulfill-shipping") {
      if (!orderNo) return true;
      if (isBooked(orderNo)) {
        statusExplain(`Order ${orderNo} already booked — blocked.`, "warn");
        return true;
      }
      const order = dispatchOrderCache.get(orderNo);
      const parcelCountFromInput = getDispatchParcelCountInputValue(orderNo);
      const presetCount =
        parcelCountFromInput ||
        (typeof order?.parcel_count === "number" && order.parcel_count > 0
          ? order.parcel_count
          : typeof order?.estimated_parcels === "number" && order.estimated_parcels > 0
          ? order.estimated_parcels
          : getAutoParcelCountForOrder(order?.line_items));
      setDispatchExpanded(true);
      setActiveDispatchCard(orderNo, { scrollIntoViewIfNeeded: true });
      await afterDomUpdate();
      await startOrder(orderNo);
      let parcelCount = getExpectedParcelCount(orderDetails);
      if (!parcelCount && presetCount) {
        parcelCount = presetCount;
      }
      if (!parcelCount) {
        const count = promptManualParcelCount(orderNo);
        if (!count) {
          statusExplain("Parcel count required (cancelled).", "warn");
          return true;
        }
        parcelCount = count;
      }
      orderDetails.manualParcelCount = parcelCount;
      renderSessionUI();
      navigateTo("/scan", { replace: true });
      await afterDomUpdate();
      scanInput?.focus();
      statusExplain(`Booking order ${orderNo} (${parcelCount} parcels).`, "info");
      await doBookingNow({ manual: true, parcelCount });
      return true;
    }
    if (actionType === "deliver-delivery") {
      if (!orderNo) return true;
      await markDeliveryReady(orderNo);
      return true;
    }
    if (actionType === "ready-collection") {
      await notifyPickupReady(orderNo);
      return true;
    }
    if (actionType === "print-opp") {
      const docType = action.dataset.docType;
      const docLabel = getOppDocLabel(docType);
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("OPP document unavailable.", "warn");
        logDispatchEvent("OPP document failed: order not found.");
        return true;
      }
      setDispatchProgress(4, `Printing ${docLabel} for ${orderNo}`);
      logDispatchEvent(`Printing ${docLabel} for order ${orderNo}.`);
      const ok = printOppDocument(order, docType);
      if (!ok) {
        statusExplain("Pop-up blocked for OPP document.", "warn");
        logDispatchEvent("OPP document blocked by popup settings.");
        return true;
      }
      statusExplain(`${docLabel} printed for ${orderNo}.`, "ok");
      return true;
    }
    if (actionType === "print-packing-plan") {
      if (!orderNo) return true;
      setDispatchProgress(4, `Printing packing plan for ${orderNo}`);
      logDispatchEvent(`Printing packing plan for order ${orderNo}.`);
      const ok = printPackingPlan(orderNo);
      if (!ok) {
        statusExplain("Pop-up blocked for packing plan.", "warn");
        logDispatchEvent("Packing plan blocked by popup settings.");
        return true;
      }
      statusExplain(`Packing plan printed for ${orderNo}.`, "ok");
      return true;
    }
    if (actionType === "print-note") {
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("Delivery note unavailable.", "warn");
        logDispatchEvent("Delivery note failed: order not found.");
        return true;
      }
      setDispatchProgress(4, `Printing note ${orderNo}`);
      logDispatchEvent(`Printing delivery note for order ${orderNo}.`);
      const ok = await printDeliveryNote(order);
      if (!ok) {
        statusExplain("Pop-up blocked for delivery note.", "warn");
        logDispatchEvent("Delivery note blocked by popup settings.");
        return true;
      }
      statusExplain(`Delivery note printed for ${orderNo}.`, "ok");
      printedDeliveryNotes.add(orderNo);
      refreshDispatchViews(orderNo);
      return true;
    }
    if (actionType === "book-now") {
      if (!orderNo) return true;
      if (isBooked(orderNo)) {
        statusExplain(`Order ${orderNo} already booked — blocked.`, "warn");
        return true;
      }
      const order = dispatchOrderCache.get(orderNo);
      const presetCount =
        getDispatchParcelCountInputValue(orderNo) ||
        (typeof order?.parcel_count === "number" && order.parcel_count > 0
          ? order.parcel_count
          : typeof order?.estimated_parcels === "number" && order.estimated_parcels > 0
          ? order.estimated_parcels
          : getAutoParcelCountForOrder(order?.line_items));
      const count = presetCount || promptManualParcelCount(orderNo);
      if (!count) {
        statusExplain("Parcel count required (cancelled).", "warn");
        return true;
      }
      await startOrder(orderNo);
      orderDetails.manualParcelCount = count;
      renderSessionUI();
      await doBookingNow({ manual: true, parcelCount: count });
      return true;
    }
    if (actionType === "notify-ready") {
      await notifyPickupReady(orderNo);
      return true;
    }
    return false;
  }

  dispatchBoard?.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]");
    if (action) {
      const handled = await handleDispatchAction(action);
      if (handled) return;
    }
    const card = e.target.closest(".dispatchCard");
    if (card && !e.target.closest("button") && !e.target.closest("input")) {
      const orderNo = card.dataset.orderNo;
      if (orderNo) openDispatchOrderModal(orderNo);
    }
  });

  dispatchBoard?.addEventListener("change", (e) => {
    const checkbox = e.target.closest(".dispatchCardSelectInput");
    if (!checkbox) return;
    const orderNo = checkbox.dataset.orderNo;
    if (!orderNo) return;
    if (checkbox.checked) {
      dispatchSelectedOrders.add(orderNo);
    } else {
      dispatchSelectedOrders.delete(orderNo);
    }
    const card = checkbox.closest(".dispatchCard");
    if (card) {
      card.classList.toggle("is-selected", checkbox.checked);
    }
    updateDispatchSelectionSummary();
  });

  

  dispatchBoard?.addEventListener("change", (e) => {
    const laneSelect = e.target.closest(".dispatchLaneSelectAllInput");
    if (!laneSelect) return;
    const laneId = laneSelect.dataset.laneId;
    const lane = laneSelect.closest(".dispatchCol");
    if (!lane || !laneId) return;
    lane.querySelectorAll(".dispatchCardSelectInput").forEach((checkbox) => {
      checkbox.checked = laneSelect.checked;
      const orderNo = checkbox.dataset.orderNo;
      if (!orderNo) return;
      if (laneSelect.checked) dispatchSelectedOrders.add(orderNo);
      else dispatchSelectedOrders.delete(orderNo);
      checkbox.closest(".dispatchCard")?.classList.toggle("is-selected", laneSelect.checked);
    });
    updateDispatchSelectionSummary();
  });

  dispatchSelectionClear?.addEventListener("click", () => {
    clearDispatchSelection();
  });

  dispatchBoard?.addEventListener("focusout", async (e) => {
    const input = e.target.closest(".dispatchParcelCountInput");
    if (!input) return;
    const orderId = input.dataset.orderId;
    const orderNo = input.dataset.orderNo;
    const raw = input.value.trim();
    const lastValue = input.dataset.lastValue ?? "";

    if (raw === lastValue) return;

    if (raw === "") {
      const ok = await updateDispatchParcelCount({ orderId, orderNo, value: "" });
      if (ok) input.dataset.lastValue = "";
      return;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      statusExplain("Parcel count must be a non-negative number.", "warn");
      input.value = lastValue;
      return;
    }

    const ok = await updateDispatchParcelCount({ orderId, orderNo, value: parsed });
    if (ok) input.dataset.lastValue = String(parsed);
  });

  viewFulfillmentHistory?.addEventListener("click", async (e) => {
    if (e.target.closest("a.dispatchShipmentActionBtn--link")) return;
    const actionBtn = e.target.closest("[data-action=\"view-shipment\"]");
    if (actionBtn?.dataset?.shipmentKey) {
      await openDispatchShipmentModal(actionBtn.dataset.shipmentKey);
      return;
    }
    const shipmentRow = e.target.closest(".dispatchShipmentRow");
    if (shipmentRow && !shipmentRow.classList.contains("dispatchShipmentRow--header")) {
      const shipmentKeyId = shipmentRow.dataset.shipmentKey;
      if (shipmentKeyId) {
        await openDispatchShipmentModal(shipmentKeyId);
      }
    }
  });

  let fulfillmentSearchTimer = null;
  let contactsSearchTimer = null;
  fulfillmentHistorySearch?.addEventListener("input", () => {
    if (fulfillmentSearchTimer) clearTimeout(fulfillmentSearchTimer);
    fulfillmentSearchTimer = setTimeout(() => {
      fulfillmentHistoryState.query = fulfillmentHistorySearch.value.trim();
      refreshFulfillmentHistory().catch((err) => {
        appendDebug("Fulfillment history refresh failed: " + String(err));
        if (fulfillmentHistoryMeta) fulfillmentHistoryMeta.textContent = "History unavailable.";
      });
    }, 250);
  });

  fulfillmentHistoryStatusFilter?.addEventListener("change", () => {
    fulfillmentHistoryState.statusFilter = fulfillmentHistoryStatusFilter.value || "all";
    renderFulfillmentHistory();
  });

  contactsSearch?.addEventListener("input", () => {
    if (contactsSearchTimer) clearTimeout(contactsSearchTimer);
    contactsSearchTimer = setTimeout(() => {
      contactsState.query = contactsSearch.value.trim();
      renderContacts();
    }, 150);
  });

  contactsTierFilter?.addEventListener("change", () => {
    contactsState.tier = contactsTierFilter.value || "";
    refreshContacts().catch((err) => {
      appendDebug("Contacts refresh failed: " + String(err));
      if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
    });
  });

  contactsProvinceFilter?.addEventListener("change", () => {
    contactsState.province = contactsProvinceFilter.value || "";
    refreshContacts().catch((err) => {
      appendDebug("Contacts refresh failed: " + String(err));
      if (contactsMeta) contactsMeta.textContent = "Contacts unavailable. Retrying in 30s…";
    });
  });

  dispatchOrderModal?.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]");
    if (action) {
      await handleDispatchAction(action);
    }
  });

  dispatchShipmentModal?.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]");
    if (action?.dataset?.action === "close-modal") {
      closeDispatchShipmentModal();
    }
  });

  const slotEgg = $("slotEgg");
  const slotReels = Array.from(document.querySelectorAll("[data-slot-reel]"));
  const slotSpinBtn = $("slotSpinBtn");
  const slotResult = $("slotResult");
  const slotCloseButtons = Array.from(document.querySelectorAll("[data-slot-close]"));
  const slotSpices = [
    { name: "Chilli", icon: "🌶️" },
    { name: "Garlic", icon: "🧄" },
    { name: "Paprika", icon: "🫑" },
    { name: "Cumin", icon: "🌿" },
    { name: "Pepper", icon: "🧂" },
    { name: "Turmeric", icon: "🟨" },
    { name: "Coriander", icon: "🌱" },
    { name: "Ginger", icon: "🫚" },
    { name: "Smoked Salt", icon: "🧂" }
  ];
  let slotSpinning = false;
  let slotSecretBuffer = "";
  const slotSecret = "SPICE";

  const formatSpice = (spice) => `${spice.icon} ${spice.name}`;

  const openSlotEgg = () => {
    if (!slotEgg || !slotResult) return;
    slotEgg.hidden = false;
    slotEgg.setAttribute("aria-hidden", "false");
    slotSecretBuffer = "";
    slotResult.textContent = "Match all three for a “house blend” win.";
  };

  const closeSlotEgg = () => {
    if (!slotEgg) return;
    slotEgg.hidden = true;
    slotEgg.setAttribute("aria-hidden", "true");
  };

  const spinSlots = () => {
    if (!slotSpinBtn || !slotResult || slotSpinning || slotReels.length === 0) return;
    slotSpinning = true;
    slotSpinBtn.disabled = true;
    let ticks = 0;
    let lastPicks = [];
    slotResult.textContent = "Spinning the spice rack…";

    const interval = setInterval(() => {
      lastPicks = slotReels.map((reel) => {
        const pick = slotSpices[Math.floor(Math.random() * slotSpices.length)];
        reel.textContent = formatSpice(pick);
        return pick;
      });
      ticks += 1;
      if (ticks >= 8) {
        clearInterval(interval);
        const [first, second, third] = lastPicks;
        if (first?.name === second?.name && second?.name === third?.name) {
          slotResult.textContent = `Jackpot! House blend: ${first.name}.`;
        } else {
          slotResult.textContent = `Blend of the day: ${lastPicks.map((pick) => pick.name).join(" · ")}.`;
        }
        slotSpinning = false;
        slotSpinBtn.disabled = false;
      }
    }, 120);
  };

  slotSpinBtn?.addEventListener("click", spinSlots);
  slotCloseButtons.forEach((btn) => btn.addEventListener("click", closeSlotEgg));

  dispatchOrderModal?.addEventListener("change", (e) => {
    const input = e.target.closest(".dispatchBoxParcelInput");
    if (!input) return;
    const orderNo = input.dataset.orderNo;
    const boxIndex = Number(input.dataset.boxIndex);
    if (!orderNo || !Number.isInteger(boxIndex)) return;
    const state = dispatchPackingState.get(orderNo);
    if (!state || !Array.isArray(state.boxes) || !state.boxes[boxIndex]) return;
    state.boxes[boxIndex].parcelCode = input.value.trim();
    savePackingState();
  });

  dailyTodoList?.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "checkbox") return;
    const todoIndex = Number(target.dataset.todoIndex);
    if (!Number.isInteger(todoIndex)) return;
    handleDailyTodoToggle(todoIndex, target.checked);
  });

  dailyTodoClose?.addEventListener("click", () => {
    closeDailyTodoWidget();
  });

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      toggleDailyTodoWidget();
      return;
    }
    if (e.key === "Escape") {
      closeDispatchOrderModal();
      closeDispatchShipmentModal();
      closeSlotEgg();
      return;
    }
    if (slotEgg && !slotEgg.hidden) return;
    if (e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName))) {
      return;
    }
    if (e.key.length !== 1) return;
    slotSecretBuffer = `${slotSecretBuffer}${e.key.toUpperCase()}`.slice(-slotSecret.length);
    if (slotSecretBuffer === slotSecret) {
      openSlotEgg();
    }
  });

  const boot = async () => {
    try {
      await loadConfig();
    } catch (err) {
      console.error(err);
      alert("Unable to load configuration from the server. Please refresh or contact support.");
      return;
    }

    loadBookedOrders();
    loadPackingState();
    loadModePreference();
    loadDailyParcelCount();
    loadTruckBooking();
    loadDailyTodoState();
    updateModeToggle();
    renderSessionUI();
    renderCountdown();
    renderTruckPanel();
    if (dailyParcelCount > CONFIG.TRUCK_ALERT_THRESHOLD && !truckBooked) {
      requestTruckBooking("auto");
    }
    initDispatchProgress();
    setDispatchProgress(0, "Idle", { silent: true });
    initAddressSearch();
    scheduleFulfillmentHistoryRefresh(0);
    refreshDispatchData();
    setInterval(refreshDispatchData, 30000);
    scheduleServerStatusRefresh(0);
    initModuleDashboard({ moduleGrid, navigateTo, routeForView });
    renderRoute(window.location.pathname);

    window.addEventListener("popstate", () => {
      renderRoute(window.location.pathname);
    });

    if (location.protocol === "file:") {
      alert("Open via http://localhost/... (not file://). Run a local server.");
    }

    window.__fl = window.__fl || {};
    window.__fl.bookNow = doBookingNow;
  };

  boot();
})();
