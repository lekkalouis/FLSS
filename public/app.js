import { initFlocsView } from "./views/flocs.js";
import { initStockView } from "./views/stock.js";
import { initPriceManagerView } from "./views/price-manager.js";

(() => {
  "use strict";

  const CONFIG = {
    PROGRESS_STEP_DELAY_MS: 450
  };
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
  const multiShipToggle = $("multiShipToggle");
  const uiBundleOrders = $("uiBundleOrders");
  const uiMultiShip = $("uiMultiShip");

  const dispatchBoard = $("dispatchBoardGrid");
  const dispatchStamp = $("dispatchStamp");
  const dispatchProgressBar = $("dispatchProgressBar");
  const dispatchProgressFill = $("dispatchProgressFill");
  const dispatchProgressSteps = $("dispatchProgressSteps");
  const dispatchProgressLabel = $("dispatchProgressLabel");
  const dispatchLog = $("dispatchLog");
  const dispatchTodoForm = $("dispatchTodoForm");
  const dispatchTodoInput = $("dispatchTodoInput");
  const dispatchTodoList = $("dispatchTodoList");
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
  const navOps = $("navOps");
  const navInvoices = $("navInvoices");
  const navDocs = $("navDocs");
  const navFlocs = $("navFlocs");
  const navStock = $("navStock");
  const navPriceManager = $("navPriceManager");
  const navToggle = $("navToggle");
  const viewDashboard = $("viewDashboard");
  const viewScan = $("viewScan");
  const viewOps = $("viewOps");
  const viewInvoices = $("viewInvoices");
  const viewDocs = $("viewDocs");
  const viewFlocs = $("viewFlocs");
  const viewStock = $("viewStock");
  const viewPriceManager = $("viewPriceManager");
  const actionFlash = $("actionFlash");
  const screenFlash = $("screenFlash");
  const emergencyStopBtn = $("emergencyStop");

  const btnBookNow = $("btnBookNow");
  const modeToggle = $("modeToggle");
  const moduleGrid = $("moduleGrid");
  const invoiceTemplateInput = $("invoiceTemplate");
  const invoiceTemplateSave = $("invoiceTemplateSave");
  const invoiceFilterOrder = $("invoiceFilterOrder");
  const invoiceFilterCustomer = $("invoiceFilterCustomer");
  const invoiceFilterFrom = $("invoiceFilterFrom");
  const invoiceFilterTo = $("invoiceFilterTo");
  const invoiceRefresh = $("invoiceRefresh");
  const invoiceTableBody = $("invoiceTableBody");
  const invoiceSyncStatus = $("invoiceSyncStatus");

  const MAX_ORDER_AGE_HOURS = 180;

  const MODULES = [
    {
      id: "scan",
      title: "Scan Station",
      description: "Scan parcels and auto-book shipments with live booking progress.",
      type: "route",
      target: "/scan",
      meta: "Internal module",
      tag: "Core"
    },
    {
      id: "dispatch",
      title: "Dispatch Board",
      description: "Review open orders, track packing, and prioritize dispatch.",
      type: "route",
      target: "/ops",
      meta: "Internal module",
      tag: "Core"
    },
    {
      id: "invoices",
      title: "Order Invoices",
      description: "List orders, filter quickly, and send invoice actions.",
      type: "route",
      target: "/invoices",
      meta: "Internal module",
      tag: "Module"
    },
    {
      id: "docs",
      title: "Documentation",
      description: "Operator guide, quick start, and endpoint reference.",
      type: "route",
      target: "/docs",
      meta: "Internal module",
      tag: "Guide"
    },
    {
      id: "flocs",
      title: "Order Capture",
      description: "Create and manage incoming orders for Shopify.",
      type: "route",
      target: "/flocs",
      meta: "Capture module",
      tag: "Module"
    },
    {
      id: "stock",
      title: "Stock Take",
      description: "Run inventory counts and stock adjustments.",
      type: "route",
      target: "/stock",
      meta: "Inventory module",
      tag: "Module"
    },
    {
      id: "price-manager",
      title: "Price Manager",
      description: "Update tier pricing and sync to Shopify metafields.",
      type: "route",
      target: "/price-manager",
      meta: "Pricing module",
      tag: "Module"
    }
  ];

  const FACTORY_AREAS = [
    {
      id: "dispatch",
      title: "Dispatch Command Stack",
      badge: "Priority",
      description: "Orchestrate outbound bookings, dock readiness, and carrier status.",
      tools: [
        {
          title: "Dispatch Board",
          description: "Track outbound orders and live packing status.",
          type: "view",
          target: "ops"
        },
        {
          title: "Carrier Booking",
          description: "Scan and book parcels with SLA tracking.",
          type: "view",
          target: "scan"
        }
      ]
    },
    {
      id: "packing",
      title: "Packing Command Stack",
      badge: "In Flow",
      description: "Keep carton builds, label prints, and QA signoff aligned.",
      tools: [
        {
          title: "Packing Wave",
          description: "View packing tasks and prioritization cues.",
          type: "view",
          target: "ops"
        },
        {
          title: "Label Print Queue",
          description: "Print labels directly from the scan station.",
          type: "view",
          target: "scan"
        },
        {
          title: "Carton QA Checklist",
          description: "Reference packing QA steps and escalation paths.",
          type: "view",
          target: "docs"
        }
      ]
    },
    {
      id: "finished",
      title: "Finished Goods Command Stack",
      badge: "Ready",
      description: "Coordinate pallet staging, final checks, and pickup windows.",
      tools: [
        {
          title: "Finished Goods Staging",
          description: "Review packed inventory and staging confirmation.",
          type: "route",
          target: "/stock"
        },
        {
          title: "Dispatch Priority",
          description: "Align dispatch sequencing with carrier ETAs.",
          type: "view",
          target: "ops"
        },
        {
          title: "Outbound Drilldown",
          description: "Explore shipment analytics and pickup readiness.",
          type: "view",
          target: "docs"
        }
      ]
    },
    {
      id: "warehouse",
      title: "Warehouse Command Stack",
      badge: "Inventory",
      description: "Track storage slots, replenishment tasks, and inbound capture.",
      tools: [
        {
          title: "Stock Take",
          description: "Run live inventory counts and adjustments.",
          type: "route",
          target: "/stock"
        },
        {
          title: "Inbound Capture",
          description: "Capture new inbound orders and intake checks.",
          type: "route",
          target: "/flocs"
        },
        {
          title: "Storage SOP",
          description: "Open the storage layout and replenishment guide.",
          type: "view",
          target: "docs"
        }
      ]
    }
  ];

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
  let multiShipEnabled = false;
  const dispatchOrderCache = new Map();
  const dispatchShipmentCache = new Map();
  const dispatchPackingState = new Map();
  let dispatchOrdersLatest = [];
  let dispatchShipmentsLatest = [];
  let dispatchModalOrderNo = null;
  let dispatchModalShipmentId = null;
  const DAILY_PARCEL_KEY = "fl_daily_parcel_count_v1";
  const TRUCK_BOOKING_KEY = "fl_truck_booking_v1";
  const INVOICE_TEMPLATE_KEY = "fl_invoice_template_v1";
  const DISPATCH_TODO_KEY = "fl_dispatch_todo_v1";
  let dailyParcelCount = 0;
  let truckBooked = false;
  let truckBookedAt = null;
  let truckBookedBy = null;
  let truckBookingInFlight = false;
  let dispatchTodos = [];
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
    if (!actionFlash) return;
    actionFlash.textContent = msg;

    actionFlash.classList.remove(
      "actionFlash--info",
      "actionFlash--ok",
      "actionFlash--warn",
      "actionFlash--err",
      "actionFlash--booked"
    );

    const cls =
      tone === "ok"
        ? "actionFlash--ok"
        : tone === "warn"
        ? "actionFlash--warn"
        : tone === "err"
        ? "actionFlash--err"
        : "actionFlash--info";

    actionFlash.classList.add(cls);

    actionFlash.style.opacity = "1";
    clearTimeout(actionFlash._fadeTimer);
    actionFlash._fadeTimer = setTimeout(() => {
      actionFlash.style.opacity = "0.4";
    }, 2000);
  };

  let invoiceOrders = [];

  function loadInvoiceTemplate() {
    const saved = localStorage.getItem(INVOICE_TEMPLATE_KEY);
    if (invoiceTemplateInput && saved) {
      invoiceTemplateInput.value = saved;
    }
  }

  function getInvoiceTemplate() {
    return invoiceTemplateInput ? invoiceTemplateInput.value.trim() : "";
  }

  function saveInvoiceTemplate() {
    if (!invoiceTemplateInput) return;
    const template = getInvoiceTemplate();
    if (template) {
      localStorage.setItem(INVOICE_TEMPLATE_KEY, template);
      statusExplain("Invoice template saved.", "ok");
    } else {
      localStorage.removeItem(INVOICE_TEMPLATE_KEY);
      statusExplain("Invoice template cleared.", "warn");
    }
  }

  function buildInvoiceUrl(order) {
    const template = getInvoiceTemplate();
    if (!template) return "";
    const orderName = String(order?.name || "");
    const orderNumber = order?.order_number ?? orderName.replace(/^#/, "");
    const replacements = {
      "{order_name}": orderName,
      "{order_number}": orderNumber,
      "{order_id}": order?.id ?? "",
      "{customer_email}": order?.email ?? ""
    };
    let url = template;
    Object.entries(replacements).forEach(([token, value]) => {
      url = url.split(token).join(encodeURIComponent(String(value)));
    });
    return url;
  }

  function formatInvoiceDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  }

  function filterInvoiceOrders() {
    const orderQuery = String(invoiceFilterOrder?.value || "").trim().toLowerCase();
    const customerQuery = String(invoiceFilterCustomer?.value || "").trim().toLowerCase();
    const fromValue = invoiceFilterFrom?.value ? new Date(invoiceFilterFrom.value) : null;
    const toValue = invoiceFilterTo?.value ? new Date(invoiceFilterTo.value) : null;
    const fromTime = fromValue ? fromValue.getTime() : null;
    const toTime = toValue ? new Date(toValue.getTime() + 24 * 60 * 60 * 1000 - 1).getTime() : null;

    return invoiceOrders.filter((order) => {
      const name = String(order?.name || "").toLowerCase();
      const orderNumber = String(order?.order_number || "").toLowerCase();
      const customerName = String(order?.customer_name || "").toLowerCase();
      const createdAt = order?.created_at ? new Date(order.created_at).getTime() : null;

      if (orderQuery && !name.includes(orderQuery) && !orderNumber.includes(orderQuery)) {
        return false;
      }
      if (customerQuery && !customerName.includes(customerQuery)) {
        return false;
      }
      if (fromTime && (!createdAt || createdAt < fromTime)) {
        return false;
      }
      if (toTime && (!createdAt || createdAt > toTime)) {
        return false;
      }
      return true;
    });
  }

  function renderInvoiceTable() {
    if (!invoiceTableBody) return;
    const filtered = filterInvoiceOrders();
    if (!filtered.length) {
      const emptyMessage = invoiceOrders.length
        ? "No orders match these filters."
        : "Load orders to get started.";
      invoiceTableBody.innerHTML = `<tr><td colspan="4" class="invoiceEmpty">${emptyMessage}</td></tr>`;
      return;
    }

    const rows = filtered.map((order) => {
      const invoiceUrl = buildInvoiceUrl(order);
      const safeUrl = invoiceUrl || "";
      const downloadUrl = safeUrl || "#";
      const orderLabel = order?.name || "—";
      const customerLabel = order?.customer_name || "—";
      const dateLabel = formatInvoiceDate(order?.created_at);
      const disabledAttr = safeUrl ? "" : "disabled";
      const whatsappText = encodeURIComponent(
        `Invoice for ${orderLabel}: ${safeUrl || "Set invoice template first."}`
      );
      const whatsappUrl = safeUrl ? `https://wa.me/?text=${whatsappText}` : "#";

      return `
        <tr>
          <td>${orderLabel}</td>
          <td>${customerLabel}</td>
          <td>${dateLabel}</td>
          <td>
            <div class="invoiceActions">
              <a class="btn" href="${downloadUrl}" target="_blank" rel="noopener" ${safeUrl ? "" : "aria-disabled=\"true\""}>Download</a>
              <a class="btn" href="${whatsappUrl}" target="_blank" rel="noopener" ${safeUrl ? "" : "aria-disabled=\"true\""}>WhatsApp</a>
              <button class="btn" type="button" data-invoice-action="print" data-invoice-url="${safeUrl}" data-order-name="${orderLabel}" ${disabledAttr}>Print</button>
            </div>
          </td>
        </tr>
      `;
    });

    invoiceTableBody.innerHTML = rows.join("");
  }

  async function refreshInvoiceOrders() {
    if (!invoiceSyncStatus) return;
    invoiceSyncStatus.textContent = "Loading orders…";
    try {
      const from = invoiceFilterFrom?.value ? new Date(`${invoiceFilterFrom.value}T00:00:00`) : null;
      const to = invoiceFilterTo?.value ? new Date(`${invoiceFilterTo.value}T23:59:59.999`) : null;
      const params = new URLSearchParams({ limit: "200" });
      if (from) params.set("from", from.toISOString());
      if (to) params.set("to", to.toISOString());
      const resp = await fetch(`${API_BASE}/shopify/orders/list?${params.toString()}`);
      if (!resp.ok) {
        throw new Error(`Order list failed (${resp.status})`);
      }
      const data = await resp.json();
      invoiceOrders = Array.isArray(data.orders) ? data.orders : [];
      invoiceSyncStatus.textContent = `Loaded ${invoiceOrders.length} orders`;
      renderInvoiceTable();
    } catch (err) {
      console.error("Invoice order load error:", err);
      invoiceSyncStatus.textContent = "Failed to load orders";
      statusExplain("Invoice list failed to load.", "err");
      if (invoiceTableBody) {
        invoiceTableBody.innerHTML =
          '<tr><td colspan="4" class="invoiceEmpty">Unable to load orders. Check Shopify connection.</td></tr>';
      }
    }
  }

  const triggerBookedFlash = () => {
    if (!actionFlash) return;
    actionFlash.classList.remove("actionFlash--booked");
    void actionFlash.offsetWidth;
    actionFlash.classList.add("actionFlash--booked");
  };

  const appendDebug = (msg) => {
    if (!dbgOn || !debugLog) return;
    debugLog.textContent += `\n${new Date().toLocaleTimeString()} ${msg}`;
    debugLog.scrollTop = debugLog.scrollHeight;
  };

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
    if (!serverStatusBar) return;
    try {
      const res = await fetch(`${API_BASE}/statusz`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Status error");
      renderServerStatusBar(data);
    } catch (err) {
      appendDebug("Status refresh failed: " + String(err));
      renderServerStatusBar(null);
    }
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

  function saveDispatchTodos() {
    localStorage.setItem(DISPATCH_TODO_KEY, JSON.stringify(dispatchTodos));
  }

  function renderDispatchTodos() {
    if (!dispatchTodoList) return;
    dispatchTodoList.innerHTML = "";
    if (!dispatchTodos.length) {
      const empty = document.createElement("div");
      empty.className = "dispatchTodoEmpty";
      empty.textContent = "No dispatch notes yet.";
      dispatchTodoList.appendChild(empty);
      return;
    }
    dispatchTodos.forEach((todo) => {
      const item = document.createElement("div");
      item.className = `dispatchTodoItem${todo.completed ? " is-complete" : ""}`;
      item.dataset.todoId = todo.id;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = todo.completed;
      checkbox.setAttribute("aria-label", `Mark ${todo.text} as complete`);
      const text = document.createElement("span");
      text.textContent = todo.text;
      item.append(checkbox, text);
      dispatchTodoList.appendChild(item);
    });
  }

  function loadDispatchTodos() {
    if (!dispatchTodoList) return;
    try {
      const stored = JSON.parse(localStorage.getItem(DISPATCH_TODO_KEY) || "[]");
      dispatchTodos = Array.isArray(stored) ? stored : [];
    } catch (error) {
      dispatchTodos = [];
    }
    renderDispatchTodos();
  }

  function initDispatchTodos() {
    if (!dispatchTodoForm || !dispatchTodoInput || !dispatchTodoList) return;
    loadDispatchTodos();
    dispatchTodoForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = dispatchTodoInput.value.trim();
      if (!text) return;
      dispatchTodos.unshift({
        id: `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text,
        completed: false
      });
      dispatchTodoInput.value = "";
      saveDispatchTodos();
      renderDispatchTodos();
    });
    dispatchTodoList.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      const item = target.closest(".dispatchTodoItem");
      if (!item) return;
      const todo = dispatchTodos.find((entry) => entry.id === item.dataset.todoId);
      if (!todo) return;
      const wasComplete = todo.completed;
      todo.completed = target.checked;
      if (!wasComplete && todo.completed) {
        triggerScreenFlash("success");
      }
      saveDispatchTodos();
      renderDispatchTodos();
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

  function updateMultiShipToggle() {
    if (!multiShipToggle) return;
    multiShipToggle.textContent = `Multi-shipment override: ${multiShipEnabled ? "On" : "Off"}`;
    multiShipToggle.classList.toggle("is-active", multiShipEnabled);
    multiShipToggle.setAttribute("aria-pressed", multiShipEnabled ? "true" : "false");
    if (uiMultiShip) uiMultiShip.textContent = multiShipEnabled ? "On" : "Off";
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

  function updateTruckBookingState({ booked, bookedBy }) {
    truckBooked = booked;
    truckBookedBy = bookedBy || null;
    truckBookedAt = booked ? new Date().toISOString() : null;
    saveTruckBooking();
    renderTruckPanel();
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
  if (multiShipEnabled && linkedOrders.size > 0) return;

  // Only for untagged orders
  if (!activeOrderNo || !orderDetails) return;
  if (isBooked(activeOrderNo)) return;
  if (hasParcelCountTag(orderDetails)) return;

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
    const manual =
      details && typeof details.manualParcelCount === "number" && details.manualParcelCount > 0
        ? details.manualParcelCount
        : null;
    if (!isAutoMode) return manual || null;
    return fromTag || manual || null;
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
      uiMultiShip.textContent = multiShipEnabled ? "On" : "Off";
    }

    const expected = getExpectedParcelCount(orderDetails || {});
    const idxs = getParcelIndexesForCurrentOrder(orderDetails || {});
    if (uiParcelCount) uiParcelCount.textContent = String(totalScanned);
    if (uiExpectedCount) uiExpectedCount.textContent = totalExpected ? String(totalExpected) : "--";

    let parcelSource = "--";
    if (!isAutoMode) {
      parcelSource =
        orderDetails && typeof orderDetails.manualParcelCount === "number" && orderDetails.manualParcelCount > 0
          ? `Manual ${orderDetails.manualParcelCount}`
          : idxs.length
          ? "Scanned"
          : "--";
    } else {
      parcelSource = hasParcelCountTag(orderDetails)
        ? `Tag parcel_count_${orderDetails.parcelCountFromTag}`
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
      parcelList.textContent = `${scannedLine}\n${missingLine}\n${lastScanLine}\n${listLine}\n${bundleLine}${tagInfo}${manualInfo}`;
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

    if (shipToCard) {
      shipToCard.textContent = !orderDetails
        ? "None yet."
        : `${orderDetails.name}
${orderDetails.address1}
${orderDetails.address2 ? orderDetails.address2 + "\n" : ""}${orderDetails.city}
${orderDetails.province} ${orderDetails.postal}
Tel: ${orderDetails.phone || ""}
Email: ${orderDetails.email || ""}${
  linkedOrders.size ? `\nBundled orders: ${getBundleOrderNos().join(", ")}` : ""
}`.trim();
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
      } else if (multiShipEnabled && linkedOrders.size) {
        uiAutoBook.textContent = "Multi-order: auto-book paused";
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
    } else if (parsed.orderNo !== activeOrderNo && !linkedOrders.has(parsed.orderNo)) {
      cancelAutoBookTimer();
      if (!multiShipEnabled) {
        statusExplain(
          `Different order scanned (${parsed.orderNo}). Enable multi-shipment to bundle.`,
          "warn"
        );
        confirmScanFeedback("warn");
        return;
      }

      const candidate = await fetchShopifyOrder(parsed.orderNo);
      if (!candidate) {
        statusExplain(`Order ${parsed.orderNo} not found.`, "warn");
        confirmScanFeedback("warn");
        return;
      }

      const baseSignature = addressSignature(orderDetails);
      const candidateSignature = addressSignature(candidate);
      if (!baseSignature || baseSignature !== candidateSignature) {
        statusExplain(`Different order ${parsed.orderNo} has a different address.`, "warn");
        confirmScanFeedback("warn");
        return;
      }

      linkedOrders.set(parsed.orderNo, candidate);
      statusExplain(`Bundling order ${parsed.orderNo} (same address).`, "ok");
    }

    const parcelSet = getParcelSet(parsed.orderNo);
    parcelSet.add(parsed.parcelSeq);
    lastScanAt = Date.now();
    lastScanCode = code;
    armedForBooking = false;

    confirmScanFeedback(crossOrderScan ? "warn" : "success");

    const expected = getExpectedParcelCount(orderDetails);

    // TAGGED: auto-book immediately on first scan (single order only)
    if (isAutoMode && hasParcelCountTag(orderDetails) && expected && !multiShipEnabled && !linkedOrders.size) {
      cancelAutoBookTimer();

      parcelsByOrder.set(activeOrderNo, new Set(Array.from({ length: expected }, (_, i) => i + 1)));
      renderSessionUI();
      updateBookNowButton();

      statusExplain(`Tag detected (parcel_count_${expected}). Auto-booking...`, "ok");
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
        manualParcelCount: null
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
        manualParcelCount: null
      };
    }
  }

  function laneFromOrder(order) {
    const tags = String(order?.tags || "").toLowerCase();
    const shippingTitles = (order?.shipping_lines || [])
      .map((line) => String(line.title || "").toLowerCase())
      .join(" ");
    const combined = `${tags} ${shippingTitles}`.trim();
    if (/(warehouse|collect|collection|click\s*&\s*collect)/.test(combined)) return "pickup";
    if (/(local delivery|same\s*day)/.test(combined)) return "delivery";
    return "shipping";
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
    const normalizedLane = laneId === "delivery" || laneId === "pickup" ? laneId : "shipping";
    const label = normalizedLane === "pickup" ? "Ready for collection" : "Fulfil";
    const actionType =
      normalizedLane === "delivery"
        ? "fulfill-delivery"
        : normalizedLane === "pickup"
        ? "ready-collection"
        : "fulfill-shipping";
    const disabled = orderNo ? "" : "disabled";
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
    dispatchOrderModalBody.innerHTML = `
      <div class="dispatchCardLines">${lines || "No line items listed."}</div>
      <div class="dispatchCardActions">
        ${renderDispatchActions(order, laneId, orderNo, packingState)}
      </div>
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

  function renderShipmentList(shipments) {
    const rows = shipments
      .map((shipment) => {
        const key = shipmentKey(shipment);
        dispatchShipmentCache.set(key, shipment);
        const name = shipment.customer_name || shipment.order_name || "Unknown";
        const tracking = shipment.tracking_number || "—";
        const status = formatShipmentStatus(shipment.shipment_status);
        return `
          <div class="dispatchShipmentRow" data-shipment-key="${key}">
            <div class="dispatchShipmentCell dispatchShipmentCell--name">${name}</div>
            <div class="dispatchShipmentCell dispatchShipmentCell--tracking">${tracking}</div>
            <div class="dispatchShipmentCell dispatchShipmentCell--status">${status}</div>
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
        </div>
        ${rows || `<div class="dispatchShipmentEmpty">No recent shipments awaiting delivery.</div>`}
      </div>
    `;
  }

  function renderDispatchBoard(orders) {
    if (!dispatchBoard) return;

    const now = Date.now();
    const maxAgeMs = MAX_ORDER_AGE_HOURS * 60 * 60 * 1000;
    dispatchOrderCache.clear();
    dispatchShipmentCache.clear();
    const activeOrders = new Set();

    const filtered = (orders || []).filter((o) => {
      const fs = (o.fulfillment_status || "").toLowerCase();
      if (fs && fs !== "unfulfilled" && fs !== "in_progress") return false;
      if (!o.created_at) return true;
      const createdMs = new Date(o.created_at).getTime();
      if (!Number.isFinite(createdMs)) return true;
      return now - createdMs <= maxAgeMs;
    });

    filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const list = filtered.slice(0, 60);

    if (!list.length) {
      dispatchBoard.innerHTML = `<div class="dispatchBoardEmpty">No open shipping / delivery / collections right now.</div>`;
      return;
    }

    const cols = [
      { id: "delivery", label: "Delivery", type: "cards" },
      { id: "shippingA", label: "Shipping", type: "cards" },
      { id: "shippingB", label: "Shipping", type: "cards" },
      { id: "pickup", label: "Pickup / Collection", type: "cards" },
      { id: "shipments", label: "Recently shipped", type: "shipments" }
    ];
    const lanes = {
      delivery: [],
      shipping: [],
      pickup: []
    };

    list.forEach((o) => {
      const laneId = laneFromOrder(o);
      (lanes[laneId] || lanes.shipping).push(o);
    });

    const shippingSplitIndex = Math.ceil(lanes.shipping.length / 2);
    const shippingA = lanes.shipping.slice(0, shippingSplitIndex);
    const shippingB = lanes.shipping.slice(shippingSplitIndex);

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

      if (orderNo) {
        dispatchOrderCache.set(orderNo, o);
      }

      return `
        <div class="dispatchCard" data-order-no="${orderNo}">
          <div class="dispatchCardTitle"><span>${title}</span></div>
          <div class="dispatchCardMeta">#${(o.name || "").replace("#", "")} · ${city} · ${created}</div>
         
          <div class="dispatchCardLines">${lines}</div>
          <div class="dispatchCardActions">
            ${renderDispatchActions(o, laneId, orderNo, packingState)}
          </div>
        </div>`;
    };

    dispatchBoard.innerHTML = cols
      .map((col) => {
        if (col.type === "shipments") {
          const shipments = Array.isArray(dispatchShipmentsLatest) ? dispatchShipmentsLatest : [];
          const listHTML = renderShipmentList(shipments);
          return `
            <div class="dispatchCol dispatchCol--shipments">
              <div class="dispatchColHeader">${col.label}</div>
              <div class="dispatchColBody dispatchColBody--shipments">${listHTML}</div>
            </div>`;
        }
        const laneOrders =
          col.id === "shippingA"
            ? shippingA
            : col.id === "shippingB"
            ? shippingB
            : lanes[col.id] || [];
        const cards =
          laneOrders.map((order) => cardHTML(order, col.id)).join("") ||
          `<div class="dispatchBoardEmptyCol">No ${col.label.toLowerCase()} orders.</div>`;
        return `
          <div class="dispatchCol">
            <div class="dispatchColHeader">${col.label}</div>
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

  function printDeliveryNote(order) {
    if (!order) return false;
    const orderNo = String(order.name || "").replace("#", "").trim();
    const title = order.customer_name || order.name || `Order ${order.id}`;
    const addressLines = [
      order.shipping_address1,
      order.shipping_address2,
      [order.shipping_city, order.shipping_postal].filter(Boolean).join(" ")
    ]
      .filter(Boolean)
      .join("<br>");
    const lineItems = (order.line_items || [])
      .map((li) => `<tr><td>${li.title || ""}</td><td>${li.sku || ""}</td><td>${li.quantity}</td></tr>`)
      .join("");
    const doc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Delivery Note ${orderNo}</title>
        <style>
          body{ font-family:Arial, sans-serif; padding:24px; color:#0f172a; }
          h1{ font-size:18px; margin-bottom:8px; }
          .meta{ font-size:12px; color:#475569; margin-bottom:16px; }
          table{ width:100%; border-collapse:collapse; font-size:12px; }
          th,td{ border:1px solid #cbd5f5; padding:6px; text-align:left; }
          th{ background:#e2e8f0; }
          .addr{ margin-top:12px; font-size:12px; }
        </style>
      </head>
      <body>
        <h1>Delivery Note • Order ${orderNo}</h1>
        <div class="meta">${title}</div>
        <div class="addr"><strong>Deliver to:</strong><br>${addressLines || "No address on file"}</div>
        <table>
          <thead><tr><th>Item</th><th>SKU</th><th>Qty</th></tr></thead>
          <tbody>${lineItems || "<tr><td colspan='3'>No line items.</td></tr>"}</tbody>
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

  async function refreshDispatchData() {
    try {
      const [ordersRes, shipmentsRes] = await Promise.all([
        fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/open`),
        fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/shipments/recent`)
      ]);
      const data = ordersRes.ok ? await ordersRes.json() : { orders: [] };
      const shipmentsData = shipmentsRes.ok ? await shipmentsRes.json() : { shipments: [] };
      dispatchOrdersLatest = data.orders || [];
      dispatchShipmentsLatest = shipmentsData.shipments || [];
      renderDispatchBoard(dispatchOrdersLatest);
      if (dispatchStamp) dispatchStamp.textContent = "Updated " + new Date().toLocaleTimeString();
    } catch (e) {
      appendDebug("Dispatch refresh failed: " + String(e));
      if (dispatchBoard) dispatchBoard.innerHTML = `<div class="dispatchBoardEmpty">Error loading orders.</div>`;
      if (dispatchStamp) dispatchStamp.textContent = "Dispatch: error";
    }
  }

  function renderModuleDashboard() {
    if (!moduleGrid) return;
    moduleGrid.innerHTML = "";

    MODULES.forEach((module) => {
      const card = document.createElement("article");
      card.className = "moduleCard";
      card.dataset.moduleId = module.id;

      const header = document.createElement("div");
      header.className = "moduleCardHeader";

      const title = document.createElement("h3");
      title.className = "moduleCardTitle";
      title.textContent = module.title;

      const tag = document.createElement("span");
      tag.className = "moduleCardTag";
      tag.textContent = module.tag || "Module";

      header.appendChild(title);
      header.appendChild(tag);

      const desc = document.createElement("p");
      desc.className = "moduleCardDesc";
      desc.textContent = module.description || "";

      const actions = document.createElement("div");
      actions.className = "moduleCardActions";

      const meta = document.createElement("span");
      meta.className = "moduleMeta";
      meta.textContent = module.meta || module.target || "Module";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "moduleOpenBtn";
      button.textContent = "Open module";
      button.dataset.moduleId = module.id;

      actions.appendChild(meta);
      actions.appendChild(button);

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(actions);

      moduleGrid.appendChild(card);
    });
  }

  function renderFactoryView(activeId = "dispatch") {
    if (!factoryMap || !factoryTools) return;
    const targetArea = FACTORY_AREAS.find((area) => area.id === activeId) || FACTORY_AREAS[0];

    factoryMap.querySelectorAll(".factoryArea").forEach((areaButton) => {
      const isActive = areaButton instanceof HTMLElement && areaButton.dataset.dept === targetArea.id;
      areaButton.classList.toggle("factoryArea--active", isActive);
    });

    if (factoryDetailTitle) factoryDetailTitle.textContent = targetArea.title;
    if (factoryDetailBadge) factoryDetailBadge.textContent = targetArea.badge;
    if (factoryDetailDesc) factoryDetailDesc.textContent = targetArea.description;

    factoryTools.innerHTML = "";
    targetArea.tools.forEach((tool) => {
      const toolCard = document.createElement("article");
      toolCard.className = "factoryTool";

      const toolTitle = document.createElement("h4");
      toolTitle.className = "factoryToolTitle";
      toolTitle.textContent = tool.title;

      const toolDesc = document.createElement("p");
      toolDesc.className = "factoryToolDesc";
      toolDesc.textContent = tool.description;

      const toolButton = document.createElement("button");
      toolButton.type = "button";
      toolButton.className = "factoryToolBtn";
      toolButton.textContent = "Open tool";
      toolButton.dataset.toolType = tool.type;
      toolButton.dataset.toolTarget = tool.target;

      toolCard.appendChild(toolTitle);
      toolCard.appendChild(toolDesc);
      toolCard.appendChild(toolButton);
      factoryTools.appendChild(toolCard);
    });
  }

  function openFactoryTool(type, target) {
    if (!type || !target) return;
    if (type === "view") {
      navigateTo(routeForView(target));
      return;
    }
    if (type === "route") {
      navigateTo(target);
      return;
    }
    if (type === "link") {
      window.location.href = target;
    }
  }

  function openModuleById(moduleId) {
    const module = MODULES.find((entry) => entry.id === moduleId);
    if (!module) return;

    if (module.type === "view") {
      navigateTo(routeForView(module.target));
      return;
    }

    if (module.type === "route" && module.target) {
      navigateTo(module.target);
      return;
    }

    if (module.type === "link" && module.target) {
      window.location.href = module.target;
    }
  }

  moduleGrid?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("[data-module-id]");
    if (!button) return;
    const moduleId = button.dataset.moduleId;
    if (!moduleId) return;
    openModuleById(moduleId);
  });

  factoryMap?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const area = target.closest("[data-dept]");
    if (!area) return;
    const deptId = area.dataset.dept;
    if (!deptId) return;
    renderFactoryView(deptId);
  });

  factoryTools?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest(".factoryToolBtn");
    if (!button) return;
    openFactoryTool(button.dataset.toolType, button.dataset.toolTarget);
  });

  function switchMainView(view) {
    const showDashboard = view === "dashboard";
    const showScan = view === "scan";
    const showOps = view === "ops";
    const showInvoices = view === "invoices";
    const showDocs = view === "docs";
    const showFlocs = view === "flocs";
    const showStock = view === "stock";
    const showPriceManager = view === "price-manager";

    if (viewDashboard) {
      viewDashboard.hidden = !showDashboard;
      viewDashboard.classList.toggle("flView--active", showDashboard);
    }
    if (viewScan) {
      viewScan.hidden = !showScan;
      viewScan.classList.toggle("flView--active", showScan);
    }
    if (viewOps) {
      viewOps.hidden = !showOps;
      viewOps.classList.toggle("flView--active", showOps);
    }
    if (viewInvoices) {
      viewInvoices.hidden = !showInvoices;
      viewInvoices.classList.toggle("flView--active", showInvoices);
    }
    if (viewDocs) {
      viewDocs.hidden = !showDocs;
      viewDocs.classList.toggle("flView--active", showDocs);
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

    navDashboard?.classList.toggle("flNavBtn--active", showDashboard);
    navScan?.classList.toggle("flNavBtn--active", showScan);
    navOps?.classList.toggle("flNavBtn--active", showOps);
    navInvoices?.classList.toggle("flNavBtn--active", showInvoices);
    navDocs?.classList.toggle("flNavBtn--active", showDocs);
    navFlocs?.classList.toggle("flNavBtn--active", showFlocs);
    navStock?.classList.toggle("flNavBtn--active", showStock);
    navPriceManager?.classList.toggle("flNavBtn--active", showPriceManager);
    navDashboard?.setAttribute("aria-selected", showDashboard ? "true" : "false");
    navScan?.setAttribute("aria-selected", showScan ? "true" : "false");
    navOps?.setAttribute("aria-selected", showOps ? "true" : "false");
    navInvoices?.setAttribute("aria-selected", showInvoices ? "true" : "false");
    navDocs?.setAttribute("aria-selected", showDocs ? "true" : "false");
    navFlocs?.setAttribute("aria-selected", showFlocs ? "true" : "false");
    navStock?.setAttribute("aria-selected", showStock ? "true" : "false");
    navPriceManager?.setAttribute("aria-selected", showPriceManager ? "true" : "false");

    if (showDashboard) {
      statusExplain("Dashboard ready — choose a module to launch.", "info");
    } else if (showScan) {
      statusExplain("Ready to scan orders…", "info");
      scanInput?.focus();
    } else if (showInvoices) {
      statusExplain("Invoice list ready.", "info");
      if (!invoiceOrders.length) {
        refreshInvoiceOrders();
      }
    } else if (showDocs) {
      statusExplain("Viewing operator documentation", "info");
    } else if (showFlocs) {
      statusExplain("Order capture ready.", "info");
    } else if (showStock) {
      statusExplain("Stock take ready.", "info");
    } else if (showPriceManager) {
      statusExplain("Price manager ready.", "info");
    } else {
      statusExplain("Viewing orders / ops dashboard", "info");
    }
  }

  const ROUTE_VIEW_MAP = new Map([
    ["/", "dashboard"],
    ["/dashboard", "dashboard"],
    ["/scan", "scan"],
    ["/ops", "ops"],
    ["/invoices", "invoices"],
    ["/docs", "docs"],
    ["/flocs", "flocs"],
    ["/stock", "stock"],
    ["/price-manager", "price-manager"]
  ]);

  const VIEW_ROUTE_MAP = {
    dashboard: "/",
    scan: "/scan",
    ops: "/ops",
    invoices: "/invoices",
    docs: "/docs",
    flocs: "/flocs",
    stock: "/stock",
    "price-manager": "/price-manager"
  };

  const viewInitializers = {
    flocs: initFlocsView,
    stock: initStockView,
    "price-manager": initPriceManagerView
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

  invoiceTemplateSave?.addEventListener("click", () => {
    saveInvoiceTemplate();
    renderInvoiceTable();
  });

  invoiceTemplateInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveInvoiceTemplate();
      renderInvoiceTable();
    }
  });

  [invoiceFilterOrder, invoiceFilterCustomer, invoiceFilterFrom, invoiceFilterTo].forEach(
    (input) => {
      input?.addEventListener("input", renderInvoiceTable);
      input?.addEventListener("change", renderInvoiceTable);
    }
  );

  invoiceRefresh?.addEventListener("click", () => {
    refreshInvoiceOrders();
  });

  invoiceTableBody?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-invoice-action]");
    if (!button) return;
    const action = button.dataset.invoiceAction;
    const invoiceUrl = button.dataset.invoiceUrl || "";
    const orderName = button.dataset.orderName || "Invoice";
    if (action === "print") {
      if (!invoiceUrl) {
        statusExplain("Set the invoice template first.", "warn");
        return;
      }
      try {
        statusExplain(`Printing ${orderName}…`, "info");
        const resp = await fetch(`${API_BASE}/printnode/print-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceUrl, title: `Invoice ${orderName}` })
        });
        if (!resp.ok) {
          throw new Error(`Print failed (${resp.status})`);
        }
        statusExplain(`Sent ${orderName} to PrintNode.`, "ok");
      } catch (err) {
        console.error("Print invoice error:", err);
        statusExplain(`Print failed for ${orderName}.`, "err");
      }
    }
  });

  modeToggle?.addEventListener("click", () => {
    isAutoMode = !isAutoMode;
    cancelAutoBookTimer();
    saveModePreference();
    updateModeToggle();
    renderSessionUI();
    statusExplain(isAutoMode ? "Auto mode enabled." : "Manual mode enabled.", "info");
  });

  multiShipToggle?.addEventListener("click", () => {
    multiShipEnabled = !multiShipEnabled;
    cancelAutoBookTimer();
    if (!multiShipEnabled && linkedOrders.size) {
      const activeSet = new Set(getActiveParcelSet());
      linkedOrders = new Map();
      parcelsByOrder = new Map();
      if (activeOrderNo) parcelsByOrder.set(activeOrderNo, activeSet);
    }
    updateMultiShipToggle();
    renderSessionUI();
    statusExplain(
      multiShipEnabled
        ? "Multi-shipment override enabled. Only same-address orders will bundle."
        : "Multi-shipment override disabled.",
      "info"
    );
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
      await startOrder(orderNo);
      navigateTo("/scan", { replace: true });
      statusExplain(`Scan station ready for ${orderNo}.`, "info");
      return true;
    }
    if (actionType === "fulfill-delivery") {
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("Delivery note unavailable.", "warn");
        logDispatchEvent("Delivery fulfil failed: order not found.");
        return true;
      }
      setDispatchProgress(4, `Printing note ${orderNo}`);
      logDispatchEvent(`Printing delivery note for order ${orderNo}.`);
      const ok = printDeliveryNote(order);
      if (!ok) {
        statusExplain("Pop-up blocked for delivery note.", "warn");
        logDispatchEvent("Delivery note blocked by popup settings.");
      }
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
    if (actionType === "print-note") {
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("Delivery note unavailable.", "warn");
        logDispatchEvent("Delivery note failed: order not found.");
        return true;
      }
      setDispatchProgress(4, `Printing note ${orderNo}`);
      logDispatchEvent(`Printing delivery note for order ${orderNo}.`);
      const ok = printDeliveryNote(order);
      if (!ok) {
        statusExplain("Pop-up blocked for delivery note.", "warn");
        logDispatchEvent("Delivery note blocked by popup settings.");
        return true;
      }
      statusExplain(`Delivery note printed for ${orderNo}.`, "ok");
      return true;
    }
    if (actionType === "book-now") {
      if (!orderNo) return true;
      if (isBooked(orderNo)) {
        statusExplain(`Order ${orderNo} already booked — blocked.`, "warn");
        return true;
      }
      const count = promptManualParcelCount(orderNo);
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
    const shipmentRow = e.target.closest(".dispatchShipmentRow");
    if (shipmentRow && !shipmentRow.classList.contains("dispatchShipmentRow--header")) {
      const shipmentKeyId = shipmentRow.dataset.shipmentKey;
      if (shipmentKeyId) {
        await openDispatchShipmentModal(shipmentKeyId);
        return;
      }
    }
    const card = e.target.closest(".dispatchCard");
    if (card && !e.target.closest("button") && !e.target.closest("input")) {
      const orderNo = card.dataset.orderNo;
      if (orderNo) openDispatchOrderModal(orderNo);
    }
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

  document.addEventListener("keydown", (e) => {
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
    updateModeToggle();
    updateMultiShipToggle();
    renderSessionUI();
    renderCountdown();
    renderTruckPanel();
    if (dailyParcelCount > CONFIG.TRUCK_ALERT_THRESHOLD && !truckBooked) {
      requestTruckBooking("auto");
    }
    initDispatchProgress();
    setDispatchProgress(0, "Idle", { silent: true });
    initDispatchTodos();
    initAddressSearch();
    refreshDispatchData();
    setInterval(refreshDispatchData, 30000);
    refreshServerStatus();
    setInterval(refreshServerStatus, 20000);
    renderFactoryView();
    renderModuleDashboard();
    loadInvoiceTemplate();
    renderInvoiceTable();
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
