import { initFlocsView } from "./views/flocs.js";
import { initStockView } from "./views/stock.js";
import { initPriceManagerView } from "./views/price-manager.js";
import { initScanStationNext } from "./views/scan-station-next.js";
import { isHenniesOrderContext } from "./views/customer-specialization.js";

(() => {
  "use strict";

  const CONFIG = {
    PROGRESS_STEP_DELAY_MS: 250,
    DISPATCH_POLL_INTERVAL_MS: 60000,
    DISPATCH_CONTROLLER_FALLBACK_POLL_INTERVAL_MS: 5000,
    DISPATCH_EVENTS_RECONNECT_DELAY_MS: 2000,
    SERVER_STATUS_POLL_INTERVAL_MS: 45000
  };
  const API_BASE = "/api/v1";
  const FLAVOUR_COLORS = {
    "hot & spicy": "#DA291C",
    "original": "#8BAF84",
    "worcester sauce": "#FF8200",
    "red wine & garlic": "#904066",
    "savoury herb": "#A1C935",
    "savoury herbs": "#A1C935",
    "salt & vinegar": "#40B2FF",
    "curry": "#FFC72C",
    "butter": "#FFE66D",
    "sour cream & chives": "#7BC96F",
    "parmesan": "#7E22CE",
    "parmesan cheese": "#7E22CE",
    "chutney": "#7E22CE",
    "cheese": "#C4E36A",
    "cheese & onion": "#C4E36A",
    };

  const FLAVOUR_ABBREVIATIONS = {
    "original": "ORG",
    "hot & spicy": "HOT",
    "worcester sauce": "WOR",
    "red wine & garlic": "RWG",
    "chutney": "CHU",
    "savoury herb": "SH",
    "salt & vinegar": "SV",
    "curry": "CUR",
    "butter": "BUT",
    "sour cream & chives": "SCC",
    "parmesan": "PAR",
    "parmesan cheese": "PAR",
    "cheese & onion": "CHO"
   
  };

  const FLAVOUR_DISPLAY_NAMES = {
    "original": "Original",
    "hot & spicy": "Hot & Spicy",
    "worcester sauce": "Worcester Sauce",
    "red wine & garlic": "Red Wine & Garlic",
    "chutney": "Chutney",
    "savoury herb": "Savoury Herb",
    "salt & vinegar": "Salt & Vinegar",
    "curry": "Curry",
    "butter": "Butter",
    "sour cream & chives": "Sour Cream & Chives",
    "parmesan cheese": "Parmesan Cheese",
    "cheese & onion": "Cheese & Onion"
  };

  const FLAVOUR_ALIASES = {
    "salt and vinegar": "salt & vinegar",
    "salt vinegar": "salt & vinegar",
    "savoury herbs": "savoury herb",
    "parmesan": "parmesan cheese"
  };

  const FLAVOUR_SORT_ORDER = new Map([
    "original",
    "hot & spicy",
    "worcester sauce",
    "red wine & garlic",
    "chutney",
    "savoury herb",
    "salt & vinegar",
    "curry",
    "butter",
    "sour cream & chives",
    "parmesan cheese",
    "cheese & onion"
  ].map((name, index) => [name, index]));

  const flavourKey = (flavour) => String(flavour || "").toLowerCase().trim();
  const flavourColor = (flavour) => {
    const raw = flavourKey(flavour);
    const key = FLAVOUR_ALIASES[raw] || raw;
    if (key === "chutney") return "#7E22CE";
    return FLAVOUR_COLORS[key] || "#22d3ee";
  };
  const flavourAbbrev = (flavour) => {
    const key = flavourKey(flavour);
    if (!key) return "?";
    if (FLAVOUR_ABBREVIATIONS[key]) return FLAVOUR_ABBREVIATIONS[key];
    const fallback = key
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
    return fallback || key.slice(0, 3).toUpperCase();
  };

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
  const multiShipmentBtn = $("multiShipmentBtn");
  const addrSearch = $("addrSearch");
  const addrResults = $("addrResults");
  const placeCodeInput = $("placeCode");
  const serviceSelect = $("serviceOverride");
  const truckBookBtn = $("truckBookBtn");
  const truckStatus = $("truckStatus");
  const truckParcelCount = $("truckParcelCount");
  const dispatchCreateCombined = $("dispatchCreateCombined");
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
  const dispatchSelectionSidebar = $("dispatchSelectionSidebar");
  const dispatchSelectionFloat = $("dispatchSelectionFloat");
  const dispatchSelectionSidebarToggle = $("dispatchSelectionSidebarToggle");
  const dispatchSelectionCount = $("dispatchSelectionCount");
  const dispatchSelectionUnits = $("dispatchSelectionUnits");
  const dispatchSelectionBoxes = $("dispatchSelectionBoxes");
  const dispatchSelectionWeight = $("dispatchSelectionWeight");
  const dispatchSelectionTime = $("dispatchSelectionTime");
  const dispatchSelectionMixes = $("dispatchSelectionMixes");
  const dispatchSelectionOrderCards = $("dispatchSelectionOrderCards");
  const dispatchRecentlyShipped = $("dispatchRecentlyShipped");
  const dispatchSelectionClear = $("dispatchSelectionClear");
  const dispatchPrepareDeliveriesContainer = $("dispatchPrepareDeliveriesContainer");
  const dispatchPrepareDeliveries = $("dispatchPrepareDeliveries");
  const dispatchShipmentsSidebar = $("dispatchShipmentsSidebar");
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
  const dispatchEnvironmentSummary = $("dispatchEnvironmentSummary");
  const dispatchTruckBookedMetric = $("dispatchTruckBookedMetric");
  const dispatchTruckStatusIcon = $("dispatchTruckStatusIcon");
  const dispatchTruckStatusText = $("dispatchTruckStatusText");
  const dispatchTruckParcelCount = $("dispatchTruckParcelCount");
  const dispatchTruckAnnouncement = $("dispatchTruckAnnouncement");
  const dispatchDateTimeSummary = $("dispatchDateTimeSummary");
  const dispatchEnvironmentStatus = $("dispatchEnvironmentStatus");
  const dispatchRemoteStatus = $("dispatchRemoteStatus");
  const dispatchBookingOverlay = $("dispatchBookingOverlay");
  const dispatchOverlayProgressBar = $("dispatchOverlayProgressBar");
  const dispatchOverlayProgressFill = $("dispatchOverlayProgressFill");
  const dispatchOverlayProgressSteps = $("dispatchOverlayProgressSteps");
  const dispatchOverlayProgressLabel = $("dispatchOverlayProgressLabel");
  const dispatchMobileControls = $("dispatchMobileControls");
  const dispatchMobileLaneTabs = $("dispatchMobileLaneTabs");
  const dispatchMobileLaneLabel = $("dispatchMobileLaneLabel");
  const dispatchBoardLayout = dispatchBoard?.closest(".dispatchBoardLayout") || null;

  const navScan = $("navScan");
  const navOps = $("navOps");
  const navDocs = $("navDocs");
  const navFlowcharts = $("navFlowcharts");
  const navFlocs = $("navFlocs");
  const navStock = $("navStock");
  const navPriceManager = $("navPriceManager");
  const navDispatchSettings = $("navDispatchSettings");
  const navLogs = $("navLogs");
  const navFooterAdmin = $("navFooterAdmin");
  const navFooterChangelog = $("navFooterChangelog");
  const navToggle = $("navToggle");
  const viewScan = $("viewScan");
  const viewOps = $("viewOps");
  const viewDocs = $("viewDocs");
  const docsTopics = $("docsTopics");
  const docsContent = $("docsContent");
  const docsSubnav = $("docsSubnav");
  const viewFlowcharts = $("viewFlowcharts");
  const viewFlocs = $("viewFlocs");
  const viewStock = $("viewStock");
  const viewPriceManager = $("viewPriceManager");
  const viewDispatchSettings = $("viewDispatchSettings");
  const viewLogs = $("viewLogs");
  const viewAdmin = $("viewAdmin");
  const viewChangelog = $("viewChangelog");
  const dispatchNotesBar = $("dispatchNotesBar");
  const dispatchNotesInput = $("dispatchNotesInput");
  const dispatchNotesClose = $("dispatchNotesClose");
  const adminLogsPreview = $("adminLogsPreview");
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

  const MAX_ORDER_AGE_HOURS = 180;

  const MODULES = [
    {
      id: "scan",
      title: "Orders",
      description: "Manage orders, scan parcels, and auto-book shipments with live booking progress.",
      type: "route",
      target: "/",
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
      id: "docs",
      title: "Documentation",
      description: "Operator guide, quick start, and endpoint reference.",
      type: "route",
      target: "/docs",
      meta: "Internal module",
      tag: "Guide"
    },
    {
      id: "flowcharts",
      title: "Flowcharts",
      description: "Decision maps for packing and dispatch logic, including hard and soft rules.",
      type: "route",
      target: "/flowcharts",
      meta: "Logic reference",
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
    },
    {
      id: "shipping-matrix",
      title: "Shipping Matrix",
      description: "Simulate South African shipping costs by centre and weight.",
      type: "link",
      target: "/shipping-matrix.html",
      meta: "ParcelPerfect quote matrix",
      tag: "Module"
    },
    {
      id: "custom-order-capture",
      title: "Custom Order Capture",
      description: "Password-protected local custom normal order entry.",
      type: "link",
      target: "/order-capture-custom.html",
      meta: "Secure custom entry",
      tag: "Module"
    },
    {
      id: "customer-accounts",
      title: "Customer Accounts",
      description: "Customer login and self-service profile updates.",
      type: "link",
      target: "/customer-accounts.html",
      meta: "Customer self-service",
      tag: "Module"
    },
    {
      id: "purchase-orders",
      title: "Purchase Orders",
      description: "Quick material order page that creates Shopify draft orders tagged purchase-order.",
      type: "link",
      target: "/purchase-orders.html",
      meta: "Materials ordering",
      tag: "Module"
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
  const combinedShipments = new Map();
  const combinedOrderToGroup = new Map();
  const combinedShipmentDisabled = new Set();
  const printedDeliveryNotes = new Set();
  const dispatchOrderCache = new Map();
  const dispatchShipmentCache = new Map();
  const dispatchPackingState = new Map();
  const dispatchSelectedOrders = new Set();
  const DISPATCH_DELIVERY_SPLIT_THRESHOLD = 8;
  const DISPATCH_MOBILE_BASE_LANE_OPTIONS = [
    { id: "all", label: "All" },
    { id: "shippingAgent", label: "Agent" },
    { id: "shippingA", label: "Ship A" },
    { id: "shippingB", label: "Ship B" },
    { id: "export", label: "Export" },
    { id: "pickup", label: "Pickup" }
  ];
  let dispatchMobileLaneOptions = [...DISPATCH_MOBILE_BASE_LANE_OPTIONS, { id: "delivery", label: "Delivery" }];
  let dispatchMobileLane = "all";
  let dispatchSelectionSidebarOpen = true;
  const dispatchPriorityState = new Map();
  let dispatchOrdersLatest = [];
  let dispatchFulfilledLatest = [];
  let dispatchShipmentsLatest = [];
  let dispatchModalOrderNo = null;
  let dispatchModalShipmentId = null;
  let dispatchKnownOrderNos = new Set();
  let dispatchVoicePrimed = false;
  let dispatchControllerState = null;
  let dispatchLastHandledConfirmAt = null;
  let dispatchLastHandledPrintRequestAt = null;
  let dispatchLastHandledFulfillRequestAt = null;
  let dispatchControllerPollInFlight = false;
  let dispatchEventSource = null;
  let dispatchEventsReconnectTimer = null;
  const DISPATCH_PRIORITY_KEY = "fl_dispatch_priority_v1";
  const DAILY_PARCEL_KEY = "fl_daily_parcel_count_v1";
  const TRUCK_BOOKING_KEY = "fl_truck_booking_v1";
  const VOICE_SETTINGS_KEY = "fl_voice_settings_v1";
  const DISPATCH_SELECTION_SIDEBAR_KEY = "fl_dispatch_selection_sidebar_open_v1";
  let dailyParcelCount = 0;
  let truckBooked = false;
  let truckBookedAt = null;
  let truckBookedBy = null;
  let truckBookingInFlight = false;
  let dispatchRotaryFocusIndex = -1;
  let dispatchRotaryFocusKey = "";
  let dispatchRotarySelectedKey = "";
  let dispatchPackedQtyPromptState = null;
  let dispatchRotaryInputEnabled = true;
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
    "750g worcester sauce spice bag": "WS",
    "red wine & garlic sprinkle": "RG",
    "chutney sprinkle": "CS",
    "flippen lekka savoury herb mix": "SH",
    "salt & vinegar seasoning": "SV",
    "butter popcorn sprinkle": "BUT",
    "sour cream & chives popcorn sprinkle": "SCC",
    "chutney popcorn sprinkle": "CHUT",
    "parmesan popcorn sprinkle": "PAR",
    "cheese & onion popcorn sprinkle": "CHO",
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
  const SHOPIFY_PRINT_TEMPLATE_CONFIG = {
    // Paste template settings for all printable docs here.
    // To add more templates, create another key like:
    // customDoc: { templateId: "order-printer-template-id", multiplier: 1234, slugPrefix: "custom-doc", printerId: 12345678 }
    deliveryNote: {
      templateId: "492a0907560253c5e190",
      multiplier: 2191,
      slugPrefix: "delivery-note",
      printerId: 74467271
    },
    printDocs: {
      templateId: "a731ae235f8ce951ce08",
      multiplier: 2254,
      slugPrefix: "print-docs",
      printerId: 74901099
    },
    taxInvoice: {
      templateId: "a731ae235f8ce951ce08",
      multiplier: 2254,
      slugPrefix: "tax-invoice",
      printerId: 74467271
    },
    parcelStickers: {
      templateId: "a731ae235f8ce951ce08",
      multiplier: 2254,
      slugPrefix: "parcel-stickers",
      printerId: 74901099
    },
    lineItemStickers: {
      templateId: "a731ae235f8ce951ce08",
      multiplier: 2254,
      slugPrefix: "line-item-stickers",
      printerId: 74901099
    }
  };

  const SHIPPING_DOC_OPTIONS = [
    { key: "taxInvoice", label: "Tax invoice" },
    { key: "parcelStickers", label: "Parcel stickers" },
    { key: "lineItemStickers", label: "Line item stickers" }
  ];

  const dbgOn = new URLSearchParams(location.search).has("debug");
  if (dbgOn && debugLog) debugLog.style.display = "block";

  const statusExplain = (msg, tone = "info", opts = {}) => {
    if (statusChip) statusChip.textContent = msg;
    const wantsModal =
      typeof opts.modal === "boolean"
        ? opts.modal
        : tone === "warn" || tone === "err";
    if (wantsModal && msg) {
      showSiteAlert({
        title: opts.title || (tone === "err" ? "Action failed" : tone === "warn" ? "Attention" : "Update"),
        tone,
        message: msg
      });
    }
  };

  function showSiteAlert({ title = "Notice", message = "", tone = "info" } = {}) {
    const existing = document.getElementById("flssSiteAlertModal");
    if (existing) existing.remove();
    const modal = document.createElement("div");
    modal.id = "flssSiteAlertModal";
    modal.className = "dispatchSiteAlertModal";
    modal.innerHTML = `
      <div class="dispatchSiteAlertModal__backdrop" data-action="close-site-alert" aria-hidden="true"></div>
      <div class="dispatchSiteAlertModal__content dispatchSiteAlertModal__content--${tone}" role="dialog" aria-modal="true" aria-labelledby="dispatchSiteAlertTitle">
        <div class="dispatchSiteAlertModal__header">
          <h3 id="dispatchSiteAlertTitle">${title}</h3>
          <button type="button" class="dispatchSiteAlertModal__close" data-action="close-site-alert" aria-label="Close alert">✕</button>
        </div>
        <div class="dispatchSiteAlertModal__body">${message}</div>
        <div class="dispatchSiteAlertModal__actions">
          <button type="button" class="dispatchSiteAlertModal__ok" data-action="close-site-alert">OK</button>
        </div>
      </div>
    `;
    modal.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.action === "close-site-alert") {
        modal.remove();
      }
    });
    document.body.appendChild(modal);
  }

  function showSiteConfirm({
    title = "Confirm action",
    message = "Are you sure you want to continue?",
    tone = "warn",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    confirmStyle = "primary"
  } = {}) {
    return new Promise((resolve) => {
      const existing = document.getElementById("flssSiteConfirmModal");
      if (existing) existing.remove();

      const modal = document.createElement("div");
      modal.id = "flssSiteConfirmModal";
      modal.className = "dispatchSiteAlertModal";
      modal.innerHTML = `
        <div class="dispatchSiteAlertModal__backdrop" data-action="cancel-confirm" aria-hidden="true"></div>
        <div class="dispatchSiteAlertModal__content dispatchSiteAlertModal__content--${tone}" role="dialog" aria-modal="true" aria-labelledby="dispatchSiteConfirmTitle" aria-describedby="dispatchSiteConfirmMessage">
          <div class="dispatchSiteAlertModal__header">
            <h3 id="dispatchSiteConfirmTitle">${title}</h3>
            <button type="button" class="dispatchSiteAlertModal__close" data-action="cancel-confirm" aria-label="Close confirmation">✕</button>
          </div>
          <div class="dispatchSiteAlertModal__body" id="dispatchSiteConfirmMessage">${message}</div>
          <div class="dispatchSiteAlertModal__actions dispatchSiteAlertModal__actions--split">
            <button type="button" class="dispatchSiteAlertModal__secondary" data-action="cancel-confirm">${cancelLabel}</button>
            <button type="button" class="dispatchSiteAlertModal__confirm dispatchSiteAlertModal__confirm--${confirmStyle}" data-action="confirm">${confirmLabel}</button>
          </div>
        </div>
      `;

      const close = (didConfirm) => {
        modal.remove();
        resolve(Boolean(didConfirm));
      };

      const focusables = () => Array.from(
        modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((node) => !node.hasAttribute("disabled"));

      modal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(false);
          return;
        }
        if (event.key === "Tab") {
          const items = focusables();
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      });

      modal.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.dataset.action === "confirm") {
          close(true);
          return;
        }
        if (target.dataset.action === "cancel-confirm") {
          close(false);
        }
      });

      document.body.appendChild(modal);
      const primary = modal.querySelector('[data-action="confirm"]');
      if (primary instanceof HTMLElement) primary.focus();
    });
  }

  const triggerBookedFlash = () => {};

  const appendDebug = (msg) => {
    if (!dbgOn || !debugLog) return;
    debugLog.textContent += `\n${new Date().toLocaleTimeString()} ${msg}`;
    debugLog.scrollTop = debugLog.scrollHeight;
  };

  let sensorIndicatorState = { ok: false, detail: "Waiting for sensor" };
  let remoteIndicatorState = { ok: false, detail: "Remote offline" };
  let lastEnvironmentForHeader = null;

  const SERVICE_LABELS = {
    server: "FL Server",
    shopify: "Shopify API",
    parcelPerfect: "SWE PP API",
    printNode: "Print Node",
    email: "Email Service",
    sensor: "Sensor",
    remote: "Remote"
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

  function mapOrderToDispatchDetails(order) {
    const shipping = order?.shipping_address || {};
    const customer = order?.customer || {};
    const lineItems = normalizeDispatchLineItems(order);

    let totalGrams = 0;
    lineItems.forEach((lineItem) => {
      const gramsPerUnit = Number(lineItem?.grams || 0);
      const qty = Number(lineItem?.quantity || 1);
      if (Number.isFinite(gramsPerUnit) && Number.isFinite(qty)) {
        totalGrams += gramsPerUnit * qty;
      }
    });

    const parcelCountFromMeta =
      typeof order?.parcel_count_from_meta === "number" && order.parcel_count_from_meta > 0
        ? order.parcel_count_from_meta
        : typeof order?.parcel_count === "number" && order.parcel_count > 0
        ? order.parcel_count
        : null;

    return {
      raw: order || null,
      name: order?.customer_name || shipping?.name || order?.name || "",
      phone: shipping?.phone || customer?.phone || order?.phone || "",
      email: order?.email || customer?.email || "",
      address1: order?.shipping_address1 || shipping?.address1 || "",
      address2: order?.shipping_address2 || shipping?.address2 || "",
      city: order?.shipping_city || shipping?.city || "",
      province: order?.shipping_province || shipping?.province || "",
      postal: order?.shipping_postal || shipping?.zip || "",
      suburb: order?.shipping_address2 || shipping?.address2 || "",
      line_items: lineItems,
      totalWeightKg: totalGrams > 0 ? totalGrams / 1000 : CONFIG.BOX_DIM.massKg,
      placeCode:
        order?.customer_place_code != null
          ? order.customer_place_code
          : order?.place_code != null
          ? order.place_code
          : null,
      placeLabel: null,
      parcelCountFromTag:
        typeof order?.parcel_count_from_tag === "number" && order.parcel_count_from_tag > 0
          ? order.parcel_count_from_tag
          : null,
      parcelCountFromMeta,
      manualParcelCount: null
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

  function isCombinedShipmentEnabled(group) {
    return Boolean(group?.id) && !combinedShipmentDisabled.has(group.id);
  }

  function rebuildAutomaticCombinedShipments(orders = []) {
    combinedShipments.clear();
    combinedOrderToGroup.clear();
    const groupedByAddress = new Map();

    (orders || []).forEach((order) => {
      if (laneFromOrder(order) === "pickup") return;
      const orderNo = orderNoFromName(order?.name);
      const signature = addressSignatureFromOrder(order);
      if (!orderNo || !signature) return;
      if (!groupedByAddress.has(signature)) {
        groupedByAddress.set(signature, { signature, address: getDispatchOrderAddress(order), orderNos: [] });
      }
      groupedByAddress.get(signature).orderNos.push(orderNo);
    });

    Array.from(groupedByAddress.values())
      .filter((entry) => entry.orderNos.length > 1)
      .forEach((entry) => {
        const groupId = `combined-auto-${entry.signature}`;
        const group = {
          id: groupId,
          orderNos: entry.orderNos,
          addressSignature: entry.signature,
          address: entry.address,
          color: colorFromGroupId(groupId),
          auto: true
        };
        combinedShipments.set(groupId, group);
        entry.orderNos.forEach((orderNo) => combinedOrderToGroup.set(orderNo, groupId));
      });

    Array.from(combinedShipmentDisabled).forEach((groupId) => {
      if (!combinedShipments.has(groupId)) combinedShipmentDisabled.delete(groupId);
    });
  }

  function getParcelCountForDispatchOrder(order, packingState) {
    const fromMeta =
      typeof order?.parcel_count_from_meta === "number" && order.parcel_count_from_meta > 0
        ? order.parcel_count_from_meta
        : typeof order?.parcel_count === "number" && order.parcel_count > 0
        ? order.parcel_count
        : null;
    return fromMeta || getPackingParcelCount(packingState) || getAutoParcelCountForOrder(order?.line_items || []) || null;
  }

  async function createCombinedShipmentFromSelection(orderNos = Array.from(dispatchSelectedOrders)) {
    const selected = [...new Set((orderNos || []).map((orderNo) => String(orderNo || "").trim()).filter(Boolean))];
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
      const unavailable = "Connections\nStatus unavailable";
      serverStatusBar.dataset.tooltip = unavailable;
      serverStatusBar.title = unavailable;
      serverStatusBar.innerHTML = `<span class="statusPill statusPill--warn"><span class="statusPillDot"></span></span>`;
      return;
    }

    const augmentedServices = { ...(data.services || {}) };
    augmentedServices.sensor = sensorIndicatorState;
    augmentedServices.remote = remoteIndicatorState;

    const serviceRows = Object.entries(augmentedServices).map(([key, service]) => {
      const label = SERVICE_LABELS[key] || key;
      const state = service.ok ? "Online" : "Offline";
      const detail = service.detail ? ` — ${service.detail}` : "";
      return `${label}: ${state}${detail}`;
    });

    const stamp = data.checkedAt ? `Updated ${new Date(data.checkedAt).toLocaleTimeString()}` : "";
    const tooltip = ["Connections", ...serviceRows, stamp].filter(Boolean).join("\n");
    serverStatusBar.dataset.tooltip = tooltip;
    serverStatusBar.title = tooltip;
    serverStatusBar.innerHTML = Object.entries(augmentedServices)
      .map(([, service]) => `<span class="statusPill ${service?.ok ? "statusPill--ok" : "statusPill--warn"}"><span class="statusPillDot"></span></span>`)
      .join("");
  }

  async function refreshServerStatus() {
    if (!serverStatusBar) return;
    try {
      const res = await fetch(`${API_BASE}/statusz`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Status error");
      if (data?.environment) {
        renderEnvironmentHeaderWidget(normalizeEnvironmentForHeader(data.environment));
      }
      renderServerStatusBar(data);
    } catch (err) {
      appendDebug("Status refresh failed: " + String(err));
      renderServerStatusBar(null);
    }
  }

  let dispatchAudioCtx = null;
  let lastUiClickToneAt = 0;
  let lastDispatchRotaryToneAt = 0;

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

  function playUiClickTone() {
    const now = Date.now();
    if (now - lastUiClickToneAt < 45) return;
    lastUiClickToneAt = now;
    playDispatchTone(620, 0.04);
  }

  function playDispatchRotaryMoveTone() {
    const now = Date.now();
    if (now - lastDispatchRotaryToneAt < 70) return;
    lastDispatchRotaryToneAt = now;
    try {
      if (!dispatchAudioCtx) {
        dispatchAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = dispatchAudioCtx;
      const start = ctx.currentTime;
      const sequence = [
        { freq: 1240, duration: 0.016, gain: 0.11, type: "triangle" },
        { freq: 1560, duration: 0.018, gain: 0.08, type: "square" }
      ];
      sequence.forEach((step, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = step.type;
        osc.frequency.value = step.freq;
        gain.gain.value = step.gain;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const stepStart = start + index * 0.013;
        osc.start(stepStart);
        gain.gain.exponentialRampToValueAtTime(0.001, stepStart + step.duration);
        osc.stop(stepStart + step.duration);
      });
    } catch (e) {
      appendDebug("Rotary move tone blocked: " + String(e));
    }
  }

  function playIncomingOrderSwooshCue() {
    try {
      if (!dispatchAudioCtx) {
        dispatchAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = dispatchAudioCtx;
      const now = ctx.currentTime;
      const tones = [
        { freq: 520, duration: 0.08, gain: 0.07, type: "triangle", delay: 0 },
        { freq: 740, duration: 0.1, gain: 0.08, type: "sine", delay: 0.045 },
        { freq: 960, duration: 0.09, gain: 0.06, type: "triangle", delay: 0.09 }
      ];
      tones.forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = now + tone.delay;
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.freq, startAt);
        osc.frequency.exponentialRampToValueAtTime(tone.freq * 1.16, startAt + tone.duration);
        gain.gain.setValueAtTime(tone.gain, startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + tone.duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + tone.duration);
      });
    } catch (e) {
      appendDebug("Incoming swoosh blocked: " + String(e));
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

  function handlePackingParcelProgress(parsed, rawCode) {
    if (!parsed?.orderNo) return;
    const order =
      dispatchOrderCache.get(parsed.orderNo) ||
      dispatchOrdersLatest.find((entry) => String(entry?.name || "").replace("#", "").trim() === parsed.orderNo);
    if (!order) return;
    const state = getPackingState(order);
    if (!state) return;

    if (!state.startTime) state.startTime = new Date().toISOString();
    state.active = true;

    if (!Array.isArray(state.boxes) || !state.boxes.length) {
      addPackingBox(state, { seedPacked: true });
    }

    const targetIndex = Math.max(0, Number(parsed.parcelSeq || 1) - 1);
    while (state.boxes.length <= targetIndex) {
      addPackingBox(state, { seedPacked: true });
    }

    const activeBox = state.boxes[targetIndex];
    if (activeBox) {
      activeBox.parcelCode = String(rawCode || "").trim();
    }

    const remainingItems = state.items.reduce(
      (sum, item) => sum + Math.max(0, (Number(item.quantity) || 0) - (Number(item.packed) || 0)),
      0
    );

    if (remainingItems > 0) {
      const nextIndex = targetIndex + 1;
      while (state.boxes.length <= nextIndex) {
        addPackingBox(state, { seedPacked: true });
      }
      state.activeBoxIndex = nextIndex;
      statusExplain(
        `Parcel ${parsed.parcelSeq} scanned for order ${parsed.orderNo}. ${remainingItems} item(s) still need packing; waiting for the next parcel scan.`,
        "ok",
        { modal: true, title: "Parcel scanned" }
      );
    } else {
      state.activeBoxIndex = targetIndex;
      finalizePacking(state);
      statusExplain(`Parcel ${parsed.parcelSeq} scanned and packing is complete for order ${parsed.orderNo}.`, "ok", {
        modal: true,
        title: "Packing complete"
      });
    }

    savePackingState();
    refreshDispatchViews(parsed.orderNo);
  }

  function loadVoiceSettings() {
    const defaults = {
      enabled: true,
      voiceName: "",
      rate: 1,
      pitch: 1,
      volume: 0.95,
      announceIncomingOrders: true,
      maxLineItems: 4
    };
    try {
      const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaults;
      return {
        ...defaults,
        ...parsed,
        rate: Number(parsed.rate) || defaults.rate,
        pitch: Number(parsed.pitch) || defaults.pitch,
        volume: Number(parsed.volume) || defaults.volume,
        maxLineItems: Math.max(1, Math.min(8, Number(parsed.maxLineItems) || defaults.maxLineItems))
      };
    } catch (_err) {
      return defaults;
    }
  }

  const voiceSettings = loadVoiceSettings();

  function pickBestVoice(voiceName) {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;

    if (voiceName) {
      const exact = voices.find((voice) => voice.name === voiceName);
      if (exact) return exact;
    }

    const preferred = [
      /Google.*(US|UK|English)/i,
      /Microsoft.*(Aria|Jenny|Guy|Natasha|Ryan|Sonia|Ava)/i,
      /Samantha/i,
      /Daniel/i
    ];

    for (const matcher of preferred) {
      const matched = voices.find((voice) => matcher.test(voice.name || ""));
      if (matched) return matched;
    }

    return voices.find((voice) => /en/i.test(voice.lang || "")) || voices[0] || null;
  }

  function speakAnnouncement(message, opts = {}) {
    try {
      if (!voiceSettings.enabled) return;
      if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return;
      const utterance = new SpeechSynthesisUtterance(String(message || ""));
      const chosenVoice = pickBestVoice(opts.voiceName || voiceSettings.voiceName);
      if (chosenVoice) utterance.voice = chosenVoice;
      utterance.rate = Number.isFinite(Number(opts.rate)) ? Number(opts.rate) : voiceSettings.rate;
      utterance.pitch = Number.isFinite(Number(opts.pitch)) ? Number(opts.pitch) : voiceSettings.pitch;
      utterance.volume = Number.isFinite(Number(opts.volume)) ? Number(opts.volume) : voiceSettings.volume;
      if (opts.cancelCurrent !== false) window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      appendDebug("Voice announcement blocked: " + String(e));
    }
  }

  function buildOrderLineItemsAnnouncement(order, maxLineItems = 4) {
    const items = Array.isArray(order?.line_items) ? order.line_items : [];
    if (!items.length) return "";

    function stripDuplicateSizeFromName(name, sizeLabel) {
      const normalizedName = String(name || "")
        .replace(/[()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!normalizedName || !sizeLabel) return normalizedName;
      const escapedSize = String(sizeLabel)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s*/g, "\\s*");
      const withoutDuplicateSize = normalizedName
        .replace(new RegExp(`\\b${escapedSize}\\b`, "ig"), " ")
        .replace(/\s+/g, " ")
        .trim();
      return withoutDuplicateSize || normalizedName;
    }

    const spoken = items.slice(0, maxLineItems).map((item) => {
      const qty = Math.max(1, Number(item?.quantity) || 1);
      const rawName = String(item?.name || item?.title || "item").trim();
      const sizeLabel = getLineItemSize(item);
      const cleanedName = stripDuplicateSizeFromName(rawName, sizeLabel);
      const spokenLabel = sizeLabel ? `${sizeLabel} ${cleanedName}`.trim() : cleanedName;
      return `${qty} × ${spokenLabel}`;
    });
    if (items.length > maxLineItems) spoken.push(`plus ${items.length - maxLineItems} more item${items.length - maxLineItems === 1 ? "" : "s"}`);
    return spoken.join(", ");
  }

  function announceBookingSuccess(orderNo) {
    const suffix = orderNo ? ` for order ${orderNo}` : "";
    speakAnnouncement(`Great news. Booking successful${suffix}.`);
  }

  function announceIncomingOrder() {
    playIncomingOrderSwooshCue();
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
    },
    {
      label: dispatchOverlayProgressLabel,
      fill: dispatchOverlayProgressFill,
      steps: dispatchOverlayProgressSteps,
      bar: dispatchOverlayProgressBar
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

  function setBookingOverlayVisible(isVisible) {
    if (!dispatchBookingOverlay) return;
    dispatchBookingOverlay.hidden = !isVisible;
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

  function renderDateTimeHeaderWidget() {
    if (!dispatchDateTimeSummary) return;
    const now = new Date();
    const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
    const isoDate = now.toLocaleDateString("en-CA");
    const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    dispatchDateTimeSummary.textContent = `${weekday}, ${isoDate} · ${time}`;
  }

  function setStatusClass(el, status) {
    if (!el) return;
    const statuses = ["ok", "stale", "missing", "error", "offline", "connected"];
    statuses.forEach((value) => el.classList.remove(`status-${value}`));
    if (status) el.classList.add(`status-${status}`);
  }

  function renderEnvironmentHeaderWidget(environment) {
    if (!dispatchEnvironmentSummary) return;
    const normalizedEnvironment = normalizeEnvironmentForHeader(environment);
    const hasCurrentReading = Boolean(
      normalizedEnvironment?.current &&
        (Number.isFinite(Number(normalizedEnvironment.current.temperatureC)) ||
          Number.isFinite(Number(normalizedEnvironment.current.humidityPct)))
    );
    const hasCachedReading = Boolean(lastEnvironmentForHeader?.current);
    const useCachedReading = !hasCurrentReading && hasCachedReading;
    const environmentToRender = useCachedReading ? lastEnvironmentForHeader : normalizedEnvironment;

    if (hasCurrentReading) {
      lastEnvironmentForHeader = normalizedEnvironment;
    }

    const current = environmentToRender?.current || null;
    const incomingStatus = String(normalizedEnvironment?.status || "missing").trim() || "missing";
    const status = useCachedReading ? `${incomingStatus} (stale)` : incomingStatus;

    if (current) {
      const temp = Number(current.temperatureC);
      const humidity = Number(current.humidityPct);
      const tempValue = Number.isFinite(temp) ? temp.toFixed(1) : "—";
      const humidityValue = Number.isFinite(humidity) ? String(Math.round(humidity)) : "—";
      dispatchEnvironmentSummary.innerHTML = `
        <span class="flHeaderMetric" aria-label="Temperature">
          <span class="flHeaderMetricLabel">Temp</span>
          <span class="flHeaderMetricValue">${tempValue}<span class="flHeaderMetricUnit">°C</span></span>
        </span>
        <span class="flHeaderMetric" aria-label="Humidity">
          <span class="flHeaderMetricLabel">Humidity</span>
          <span class="flHeaderMetricValue">${humidityValue}<span class="flHeaderMetricUnit">%</span></span>
        </span>
      `;
      if (!("nodeType" in dispatchEnvironmentSummary)) {
        dispatchEnvironmentSummary.textContent = `🌡 ${tempValue}°C · 💧 ${humidityValue}%`;
      }

      const ageText = environmentToRender?.lastUpdatedAt
        ? ` · ${formatDispatchTime(environmentToRender.lastUpdatedAt)}`
        : "";
      dispatchEnvironmentStatus.textContent = `Sensor ${status}${ageText}`;
      sensorIndicatorState = {
        ok: !useCachedReading && (incomingStatus === "ok" || incomingStatus === "connected"),
        detail: dispatchEnvironmentStatus.textContent
      };
    } else {
      dispatchEnvironmentSummary.innerHTML = `
        <span class="flHeaderMetric" aria-label="Temperature unavailable">
          <span class="flHeaderMetricLabel">Temp</span>
          <span class="flHeaderMetricValue">—<span class="flHeaderMetricUnit">°C</span></span>
        </span>
        <span class="flHeaderMetric" aria-label="Humidity unavailable">
          <span class="flHeaderMetricLabel">Humidity</span>
          <span class="flHeaderMetricValue">—<span class="flHeaderMetricUnit">%</span></span>
        </span>
      `;
      if (!("nodeType" in dispatchEnvironmentSummary)) {
        dispatchEnvironmentSummary.textContent = "🌡 —°C · 💧 —%";
      }
      dispatchEnvironmentStatus.textContent = "Waiting for sensor";
      sensorIndicatorState = { ok: false, detail: "Waiting for sensor" };
    }

    setStatusClass(dispatchEnvironmentStatus, incomingStatus);
  }

  function normalizeEnvironmentForHeader(environment) {
    if (!environment || typeof environment !== "object") return null;

    if (environment.current && typeof environment.current === "object") {
      return environment;
    }

    const hasTemp = environment.temperatureC !== null && environment.temperatureC !== "" && Number.isFinite(Number(environment.temperatureC));
    const hasHumidity = environment.humidityPct !== null && environment.humidityPct !== "" && Number.isFinite(Number(environment.humidityPct));

    return {
      current: hasTemp || hasHumidity
        ? {
          temperatureC: environment.temperatureC,
          humidityPct: environment.humidityPct
        }
        : null,
      status: environment.status || "missing",
      lastUpdatedAt: environment.lastUpdated || environment.lastUpdatedAt || null
    };
  }

  function renderRemoteStatusBadge(remote) {
    if (!dispatchRemoteStatus) return;
    const status = String(remote?.status || "offline").trim() || "offline";
    const remoteId = String(remote?.remoteId || "").trim();
    const suffix = remoteId ? ` (${remoteId})` : "";
    dispatchRemoteStatus.textContent = `Remote ${status}${suffix}`;
    setStatusClass(dispatchRemoteStatus, status);
    remoteIndicatorState = { ok: status === "connected" || status === "ok", detail: dispatchRemoteStatus.textContent };
  }


  const HENNIES_EXPECTED_LINES = [
    { key: "bietjie-blaf-200ml", label: "Bietjie Blaf 200ml", matcher: /\bbietjie\s+blaf\b.*\b200\s*ml\b/i },
    { key: "bietjie-blaf-1kg", label: "Bietjie Blaf 1kg", matcher: /\bbietjie\s+blaf\b.*\b1\s*kg\b/i }
  ];

  function dispatchWarn(message) {
    const msg = `⚠️ ${String(message || "").trim()}`;
    appendDebug(msg);
    logDispatchEvent(msg);
    console.warn(msg);
  }

  function lineItemSearchText(item = {}) {
    return [item?.title, item?.name, item?.variant_title, item?.sku]
      .map((value) => String(value || "").toLowerCase().trim())
      .filter(Boolean)
      .join(" ");
  }

  function normalizeDispatchLineItems(order) {
    const rawLineItems = Array.isArray(order?.line_items) ? order.line_items : [];
    if (!Array.isArray(order?.line_items)) {
      dispatchWarn(`Order ${String(order?.name || order?.id || "unknown")} has invalid line items payload.`);
    }
    const lineItems = rawLineItems.filter((item) => item && typeof item === "object");
    if (lineItems.length !== rawLineItems.length) {
      dispatchWarn(`Order ${String(order?.name || order?.id || "unknown")} includes malformed line items that were ignored.`);
    }
    if (!isHenniesOrderContext(order)) return lineItems;

    const matched = new Set();
    const matchingIndices = [];
    lineItems.forEach((item, index) => {
      const haystack = lineItemSearchText(item);
      HENNIES_EXPECTED_LINES.forEach((expected) => {
        if (expected.matcher.test(haystack)) {
          matched.add(expected.key);
          matchingIndices.push(index);
        }
      });
    });

    if (matchingIndices.length && matchingIndices.length !== lineItems.length) {
      dispatchWarn(
        `Hennies rule check: order ${String(order?.name || order?.id || "unknown")} contains a mixed line-item set (${matchingIndices.length}/${lineItems.length} Bietjie Blaf lines matched).`
      );
    }

    const missing = HENNIES_EXPECTED_LINES.filter((expected) => !matched.has(expected.key));
    if (!missing.length) return lineItems;

    dispatchWarn(
      `Hennies rule applied to order ${String(order?.name || order?.id || "unknown")}: missing expected lines (${missing.map((item) => item.label).join(", ")}). Placeholder rows were added with quantity 0 for operator review.`
    );

    const placeholders = missing.map((expected) => ({
      id: null,
      title: expected.label,
      variant_title: "",
      sku: "",
      quantity: 0,
      quantity_remaining: 0,
      fulfillable_quantity: 0,
      __isHenniesPlaceholder: true
    }));

    return [...lineItems, ...placeholders];
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
    const lineItems = normalizeDispatchLineItems(order).map((item, index) => {
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
      const completedAt = prev?.completedAt ? Number(prev.completedAt) : null;
      return { ...item, packed, completedAt: Number.isFinite(completedAt) ? completedAt : null };
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

  function compareDispatchLineItemsForSort(a, b) {
    const aKey = String(a?.title || "").trim().toLowerCase();
    const bKey = String(b?.title || "").trim().toLowerCase();
    const aIndex = lineItemOrderIndex.get(aKey) ?? Number.POSITIVE_INFINITY;
    const bIndex = lineItemOrderIndex.get(bKey) ?? Number.POSITIVE_INFINITY;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(a?.sku || "").localeCompare(String(b?.sku || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function getOrderedPackingItems(order, packingState) {
    if (!order || !packingState) return [];
    const packingByKey = new Map((packingState.items || []).map((item) => [item.key, item]));
    const orderedLineItems = normalizeDispatchLineItems(order)
      .map((lineItem, index) => ({ ...lineItem, __index: index }))
      .sort(compareDispatchLineItemsForSort);

    return orderedLineItems
      .map((lineItem) => {
        const key = makePackingKey(lineItem, lineItem.__index);
        const packedStateItem = packingByKey.get(key);
        if (packedStateItem) return packedStateItem;
        const quantity = Number(lineItem?.quantity) || 0;
        return {
          key,
          index: lineItem.__index,
          title: lineItem?.title || "Item",
          variant: lineItem?.variant_title || "",
          sku: lineItem?.sku || "",
          quantity,
          packed: 0,
          completedAt: null
        };
      })
      .filter((item) => (Number(item?.quantity) || 0) > 0);
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

  function loadDispatchPriorityState() {
    try {
      const raw = localStorage.getItem(DISPATCH_PRIORITY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      Object.entries(parsed).forEach(([orderNo, status]) => {
        if (!orderNo) return;
        if (status === "priority" || status === "medium" || status === "hold") {
          dispatchPriorityState.set(orderNo, status);
        }
      });
    } catch {}
  }

  function saveDispatchPriorityState() {
    try {
      const payload = {};
      dispatchPriorityState.forEach((status, orderNo) => {
        if (status === "priority" || status === "medium" || status === "hold") {
          payload[orderNo] = status;
        }
      });
      localStorage.setItem(DISPATCH_PRIORITY_KEY, JSON.stringify(payload));
    } catch {}
  }

  function setDispatchOrderPriority(orderNo, status) {
    if (!orderNo) return;
    if (status === "priority" || status === "medium" || status === "hold") {
      dispatchPriorityState.set(orderNo, status);
      saveDispatchPriorityState();
      statusExplain(`Order ${orderNo} marked ${status}.`, "ok");
      logDispatchEvent(`Order ${orderNo} priority set to ${status}.`);
      return;
    }
    if (dispatchPriorityState.delete(orderNo)) {
      saveDispatchPriorityState();
      statusExplain(`Order ${orderNo} priority cleared.`, "ok");
      logDispatchEvent(`Order ${orderNo} priority cleared.`);
    }
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

  function removeBookedOrdersFromBoard(orderNos) {
    const target = new Set((orderNos || []).map((orderNo) => String(orderNo)));
    if (!target.size) return;
    dispatchOrdersLatest = dispatchOrdersLatest.filter((order) => {
      const orderNo = String(order.name || "").replace("#", "").trim();
      return !target.has(orderNo);
    });
    target.forEach((orderNo) => dispatchSelectedOrders.delete(orderNo));
    renderDispatchBoard(dispatchOrdersLatest);
    updateDashboardKpis();
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
    if (dispatchTruckParcelCount) dispatchTruckParcelCount.textContent = `- ${dailyParcelCount}`;
    if (dispatchTruckStatusText) dispatchTruckStatusText.textContent = truckBooked ? "Booked" : "Not booked";
    if (dispatchTruckBookedMetric) dispatchTruckBookedMetric.classList.toggle("is-booked", truckBooked);
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
    if (kpiRecentShipments) kpiRecentShipments.textContent = String(dispatchShipmentsLatest.length || 0);
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
      if (dispatchTruckAnnouncement) {
        dispatchTruckAnnouncement.textContent = "";
        dispatchTruckAnnouncement.textContent = "Truck has been booked.";
      }
      speakAnnouncement("Truck has been booked.");
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
    const postal = String(destDetails.postal || "").trim();

    const queries = [];
    const seenQueries = new Set();
    const pushQuery = (value) => {
      const q = String(value || "").trim();
      if (!q) return;
      const key = q.toLowerCase();
      if (seenQueries.has(key)) return;
      seenQueries.add(key);
      queries.push(q);
    };

    // Search by area first (town/city/suburb), then fall back to postal code.
    pushQuery(suburb);
    if (town && town.toLowerCase() !== suburb.toLowerCase()) {
      pushQuery(town);
      if (suburb) pushQuery(`${suburb} ${town}`);
    }

    if (/^\d{4,}$/.test(postal)) {
      pushQuery(postal);
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

  async function fulfillOnShopify(details, waybillNo, selectedLineItems = null) {
    try {
      if (!details?.raw?.id) return false;

      const orderId = details.raw.id;
      const lineItems = Array.isArray(selectedLineItems)
        ? selectedLineItems
        : (details.raw.line_items || [])
            .map((li) => ({ id: li.id, quantity: getRemainingLineItemQty(li) }))
            .filter((li) => Number(li.quantity) > 0);

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
    const bundleOrders = Array.isArray(opts.bundleOrders) && opts.bundleOrders.length ? opts.bundleOrders : getBundleOrders();
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
    const keepOnBoard = !!opts.keepOnBoard;
    const selectedLineItemsByOrder = opts.selectedLineItemsByOrder && typeof opts.selectedLineItemsByOrder === "object"
      ? opts.selectedLineItemsByOrder
      : null;
    const bookingWeightKg = Number(opts.weightKg || 0) > 0 ? Number(opts.weightKg || 0) : null;
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
      totalExpected = overrideCount || getTotalExpectedCount() || totalScanned;
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
    setBookingOverlayVisible(true);
    appendDebug("Booking orders " + bundledOrderNos.join(", ") + " parcels=" + parcelIndexes.join(", "));
    await stepDispatchProgress(0, `Booking ${bundledOrderNos.join(", ")}`);
    logDispatchEvent(`Booking started for orders ${bundledOrderNos.join(", ")}.`);

    const missing = [];
    ["name", "address1", "city", "province", "postal"].forEach((k) => {
      if (!orderDetails[k]) missing.push(k);
    });

    const combinedWeightKg = bundleOrders.reduce((sum, entry) => {
      const value = Number(entry?.details?.totalWeightKg || 0);
      return Number.isFinite(value) && value > 0 ? sum + value : sum;
    }, 0);
    const bundlePlaceCode = bundleOrders.reduce((found, entry) => {
      if (found != null) return found;
      return entry?.details?.placeCode != null ? entry.details.placeCode : null;
    }, null);

    const bookingDetailsBase = {
      ...orderDetails,
      placeCode: bundlePlaceCode != null ? bundlePlaceCode : orderDetails.placeCode
    };

    if (combinedWeightKg > 0) {
      bookingDetailsBase.totalWeightKg = combinedWeightKg;
    }

    const bookingDetails = bookingWeightKg ? { ...bookingDetailsBase, totalWeightKg: bookingWeightKg } : bookingDetailsBase;
    const payload = buildParcelPerfectPayload(bookingDetails, totalExpected);
    if (!payload.details.destplace) missing.push("destplace (place code)");

    if (missing.length) {
      statusExplain("Quote failed", "err");
      setDispatchProgress(0, "Missing data");
      logDispatchEvent(`Booking halted: missing ${missing.join(", ")}.`);
      if (bookingSummary) {
        bookingSummary.textContent = `Cannot request quote — missing: ${missing.join(", ")}\n\nShip To:\n${JSON.stringify(orderDetails, null, 2)}`;
      }
      armedForBooking = false;
      setBookingOverlayVisible(false);
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
      setBookingOverlayVisible(false);
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
      setBookingOverlayVisible(false);
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
      setBookingOverlayVisible(false);
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
    announceBookingSuccess(activeOrderNo);
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
      const selectedLineItems = selectedLineItemsByOrder && Array.isArray(selectedLineItemsByOrder[orderNo])
        ? selectedLineItemsByOrder[orderNo]
        : null;
      const fulfillOk = await fulfillOnShopify(details, waybillNo, selectedLineItems);
      if (!fulfillOk) fulfillFailures += 1;
      if (!keepOnBoard && !selectedLineItems) {
        markBooked(orderNo);
      }
    }
    if (!keepOnBoard) {
      removeBookedOrdersFromBoard(bundledOrderNos);
    }
    if (!fulfillFailures) {
      await stepDispatchProgress(6, `Notified • ${waybillNo}`);
      logDispatchEvent(`Customer notified with tracking ${waybillNo}.`);
    } else {
      setDispatchProgress(6, "Notify failed");
      logDispatchEvent(`Customer notification failed for ${fulfillFailures} orders on ${waybillNo}.`);
    }

    updateDailyParcelCount(totalExpected);
    setBookingOverlayVisible(false);
    if (keepOnBoard) {
      armedForBooking = false;
      await loadDispatchBoard();
      return;
    }
    resetSession();
  }

function resetSession() {
  cancelAutoBookTimer();
  setBookingOverlayVisible(false);

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
      if (isCombinedShipmentEnabled(initialGroup) && initialGroup.orderNos.includes(parsed.orderNo)) {
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
      if (!isCombinedShipmentEnabled(group) || !group.orderNos.includes(activeOrderNo)) {
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
    handlePackingParcelProgress(parsed, code);
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

  async function handleCollectionScan(code) {
    try {
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/collection/fulfill-from-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      if (!res.ok) {
        const text = await res.text();
        statusExplain("Collection scan failed.", "warn");
        logDispatchEvent(`Collection scan failed: ${text}`);
        confirmScanFeedback("warn");
        return;
      }
      const payload = await res.json();
      statusExplain(`Collection fulfilled for order ${payload.orderNo}.`, "ok");
      logDispatchEvent(`Collection fulfilled from code for order ${payload.orderNo}.`);
      confirmScanFeedback("success");
      showSiteAlert({
        title: "Pickup complete",
        tone: "ok",
        message: `Order ${payload.orderNo} has been automatically released for pickup.`
      });
      refreshDispatchData();
    } catch (err) {
      statusExplain("Collection scan failed.", "warn");
      logDispatchEvent(`Collection scan failed: ${String(err)}`);
      confirmScanFeedback("warn");
    }
  }


  async function handleDeliveryScan(code) {
    try {
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/delivery/complete-from-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });

      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      const isJson = contentType.includes("application/json");
      const payload = isJson
        ? await res.json().catch(() => ({}))
        : { message: await res.text().catch(() => "") };

      if (!res.ok) {
        const errorCode = String(payload?.error || "").toUpperCase();
        const errorMessage = String(payload?.message || payload?.body || "").trim();
        const isAlreadyDelivered =
          errorCode === "ORDER_NOT_FOUND" ||
          errorCode === "ALREADY_DELIVERED" ||
          (errorCode === "FULFILL_FAILED" && /already\s+fulfilled|already\s+delivered/i.test(errorMessage));
        const isInvalidCode =
          errorCode === "CODE_EXPIRED" ||
          errorCode === "INVALID_SIGNATURE" ||
          errorCode === "INVALID_CODE_FORMAT" ||
          errorCode === "INVALID_CODE_VERSION" ||
          errorCode === "INVALID_CODE_PAYLOAD" ||
          errorCode === "INVALID_DELIVERY_CODE" ||
          errorCode === "LEGACY_CODE_NOT_SUPPORTED";

        if (isAlreadyDelivered) {
          statusExplain("Delivery already confirmed for this order.", "ok");
          logDispatchEvent(`Delivery already confirmed (${errorCode || res.status}).`);
          return {
            outcome: "already-confirmed",
            orderNo: payload?.orderNo || "",
            message: payload?.message || "This order was already marked as delivered."
          };
        }

        if (isInvalidCode) {
          statusExplain("Delivery code is invalid or expired.", "warn");
          logDispatchEvent(`Delivery code rejected: ${errorCode || res.status} ${errorMessage}`);
          return {
            outcome: "invalid-code",
            orderNo: payload?.orderNo || "",
            message: payload?.message || "The delivery code is invalid or expired."
          };
        }

        statusExplain("Delivery scan failed.", "warn");
        logDispatchEvent(`Delivery scan failed: ${errorCode || res.status} ${errorMessage}`);
        return {
          outcome: "failed",
          orderNo: payload?.orderNo || "",
          message: payload?.message || "Delivery confirmation failed."
        };
      }

      statusExplain(`Delivery completed for order ${payload.orderNo}.`, "ok");
      logDispatchEvent(`Delivery completed from code for order ${payload.orderNo}.`);
      return {
        outcome: "confirmed",
        orderNo: payload?.orderNo || "",
        message: payload?.message || "Delivery confirmed."
      };
    } catch (err) {
      statusExplain("Delivery scan failed.", "warn");
      logDispatchEvent(`Delivery scan failed: ${String(err)}`);
      return {
        outcome: "failed",
        orderNo: "",
        message: "Delivery confirmation failed."
      };
    }
  }


  function laneFromOrder(order) {
    const tags = String(order?.tags || "").toLowerCase();
    if (/(^|[\s,])delivery_pickup([\s,]|$)/.test(tags)) return "pickup";
    if (/(^|[\s,])delivery_deliver([\s,]|$)/.test(tags)) return "delivery";
    if (/(^|[\s,])delivery_ship([\s,]|$)/.test(tags)) return "shipping";

    const shippingTitles = (order?.shipping_lines || [])
      .map((line) => String(line.title || "").toLowerCase())
      .join(" ");
    if (/free\s*shipping/.test(shippingTitles)) return "shipping";
    const combined = `${tags} ${shippingTitles}`.trim();
    if (/(warehouse|pickup|collect|collection|click\s*&\s*collect)/.test(combined)) return "pickup";
    if (/(same\s*day|delivery)/.test(combined)) return "delivery";
    return "shipping";
  }

  function isAgentOrder(order) {
    const tags = String(order?.tags || "").toLowerCase();
    return /(^|[\s,])agent([\s,]|$)/.test(tags);
  }

  function isExportOrder(order) {
    const tags = String(order?.tags || "").toLowerCase();
    return /(^|[\s,])export([\s,]|$)/.test(tags);
  }

  function formatGroupedPackQty(quantity, sizeLabel, order) {
    const qty = Number(quantity) || 0;
    if (!isHenniesOrderContext(order) || qty <= 0) return null;
    const normalizedSize = normalizeSizeToken(sizeLabel);
    const groupedBoxSize = normalizedSize === "200ml"
      ? 96
      : normalizedSize === "1kg"
        ? 20
        : 0;
    if (!groupedBoxSize) return null;
    const boxCount = qty / groupedBoxSize;
    if (!Number.isInteger(boxCount) || boxCount <= 0) return null;
    const displaySize = normalizedSize === "200ml" || normalizedSize === "1kg"
      ? normalizedSize
      : String(sizeLabel || "").trim();
    return `${boxCount} x (${groupedBoxSize} x ${displaySize})`;
  }

  function removeLeadingSizeLabel(label, sizeLabel) {
    const rawLabel = String(label || "").trim();
    const rawSize = String(sizeLabel || "").trim();
    if (!rawLabel || !rawSize) return rawLabel;
    const escapedSize = rawSize.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return rawLabel.replace(new RegExp(`^${escapedSize}\\s*`, "i"), "").trim();
  }

  function formatDispatchQtyLabel(quantity, shortLabel, order, sizeLabel = "") {
    const qty = Number(quantity) || 0;
    if (qty <= 0) {
      return `${qty} × ${shortLabel}`;
    }
    const groupedQty = formatGroupedPackQty(qty, sizeLabel, order);
    if (groupedQty) {
      const remainderLabel = removeLeadingSizeLabel(shortLabel, sizeLabel);
      return remainderLabel ? `${groupedQty} ${remainderLabel}` : groupedQty;
    }
    if (!isExportOrder(order)) {
      return `${qty} × ${shortLabel}`;
    }
    const EXPORT_CARTON_UNITS = 12;
    const cartons = qty / EXPORT_CARTON_UNITS;
    if (!Number.isInteger(cartons) || cartons <= 0) {
      return `${qty} × ${shortLabel}`;
    }
    return `${cartons} × ${EXPORT_CARTON_UNITS} × ${shortLabel}`;
  }

  function getExportCartonSummary(order) {
    if (!isExportOrder(order)) return null;
    const EXPORT_CARTON_UNITS = 12;
    const OUTER_CARTON_CAPACITY = 8;
    const smallCartons = (order?.line_items || []).reduce((sum, item) => {
      const remainingQty = getRemainingLineItemQty(item);
      if (remainingQty <= 0) return sum;
      return sum + remainingQty / EXPORT_CARTON_UNITS;
    }, 0);
    if (smallCartons <= 0) return null;
    const displayCartons = Number.isInteger(smallCartons)
      ? String(smallCartons)
      : smallCartons.toFixed(2).replace(/\.00$/, "");
    return {
      displayCartons,
      outerCartons: Math.ceil(smallCartons / OUTER_CARTON_CAPACITY)
    };
  }

  function getRemainingLineItemQty(item) {
    const remaining = Number(item?.quantity_remaining);
    if (Number.isFinite(remaining)) return Math.max(0, remaining);
    const fulfillable = Number(item?.fulfillable_quantity);
    if (Number.isFinite(fulfillable)) return Math.max(0, fulfillable);
    return Math.max(0, Number(item?.quantity) || 0);
  }

  function getDispatchFlavourColor(flavourGroup) {
    const key = String(flavourGroup || "").trim();
    if (!key || key === "Unknown") return "#334155";
    return flavourColor(key);
  }

  function renderDispatchLineItems(order, packingState) {
    const orderNo = String(order?.name || "").replace("#", "").trim();
    const { fulfilledQtyByLineItemId } = getOrderFulfillmentSummary(order);
    const lineEntries = normalizeDispatchLineItems(order)
      .map((item, index) => ({ ...item, __index: index }))
      .sort(compareDispatchLineItemsForSort)
      .map((li) => {
        const orderedQty = Math.max(0, Number(li?.quantity) || 0);
        const requestedQty = getRemainingLineItemQty(li);
        const lineItemIdKey = li?.id != null ? String(li.id) : null;
        const fulfilledQtyRaw = lineItemIdKey ? Number(fulfilledQtyByLineItemId.get(lineItemIdKey) || 0) : 0;
        const fulfilledQty = Math.max(0, Math.min(orderedQty, fulfilledQtyRaw));
        if (orderedQty <= 0 || requestedQty <= 0 && fulfilledQty <= 0) return null;
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
        const flavourGroup = getLineItemFlavour(li) || baseTitle;
        const lineItemFlavourColor = getDispatchFlavourColor(flavourGroup);
        const itemKey = makePackingKey(li, li.__index);
        const packedItem = getPackingItem(packingState, itemKey);
        const packedCount = Math.max(0, packedItem ? Number(packedItem.packed) || 0 : 0);
        const totalCount = Math.max(requestedQty, packedItem ? Number(packedItem.quantity) || 0 : 0);
        const remaining = Math.max(0, totalCount - packedCount);
        const isComplete = packedCount > 0 && remaining === 0;
        const isPartial = packedCount > 0 && remaining > 0;
        const completedAt = Number(packedItem?.completedAt) || 0;
        const isNewlyComplete = isComplete && completedAt > 0 && Date.now() - completedAt < 1200;
        const fulfillableQty = Number(li?.fulfillable_quantity);
        const inventoryAvailableQty = Number(li?.inventory_available);
        const isShortOrUnavailable =
          (Number.isFinite(fulfillableQty) && fulfillableQty < requestedQty) ||
          (Number.isFinite(inventoryAvailableQty) && inventoryAvailableQty < requestedQty);
        const openQty = Math.max(0, requestedQty - packedCount);
        const openQtyLabel = openQty > 0 ? formatDispatchQtyLabel(openQty, shortLabel, order, sizeLabel) : "";
        const packedQtyLabel = packedCount > 0 ? formatDispatchQtyLabel(packedCount, shortLabel, order, sizeLabel) : "";
        const fulfilledQtyLabel = fulfilledQty > 0 ? formatDispatchQtyLabel(fulfilledQty, shortLabel, order, sizeLabel) : "";
        const qtyLabel = fulfilledQty > 0 && openQtyLabel
          ? `${openQtyLabel} <span class="dispatchLineFulfilledPart">+ ${fulfilledQtyLabel}</span>`
          : openQtyLabel || fulfilledQtyLabel;
        const shouldStrike = fulfilledQty > 0 || isComplete;
        const rightMeta = [
          isShortOrUnavailable
            ? `<span class="dispatchLineMissing" aria-label="Item unavailable or short"><span class="dispatchLineMissingMark">*</span></span>`
            : ""
        ]
          .filter(Boolean)
          .join("");

        const lineClass = `${isComplete ? `is-complete ${isNewlyComplete ? "is-newly-complete" : ""}` : ""} ${isPartial ? "is-partial" : ""} ${shouldStrike ? "is-fulfilled" : ""}`.trim();
        const packedLineClass = `${isComplete ? `is-complete ${isNewlyComplete ? "is-newly-complete" : ""}` : ""} ${packedCount > 0 ? "is-fulfilled" : ""}`.trim();
        const topEntry = openQty > 0
          ? {
              isComplete: false,
              html: `<div class="dispatchLineItem ${lineClass}" data-order-no="${orderNo}" data-item-key="${encodeURIComponent(itemKey)}" style="--dispatch-flavour-color:${lineItemFlavourColor}"><span class="dispatchLineText"><span class="dispatchLineBullet" aria-hidden="true"></span> ${qtyLabel}</span><span class="dispatchLineMeta">${rightMeta}</span></div>`
            }
          : null;
        const packedEntry = packedCount > 0
          ? {
              isComplete: true,
              html: `<div class="dispatchLineItem ${packedLineClass}" data-order-no="${orderNo}" data-item-key="${encodeURIComponent(itemKey)}" style="--dispatch-flavour-color:${lineItemFlavourColor}"><span class="dispatchLineText"><span class="dispatchLineBullet" aria-hidden="true"></span> ${packedQtyLabel}</span><span class="dispatchLineMeta">${rightMeta}</span></div>`
            }
          : null;
        return [topEntry, packedEntry].filter(Boolean);
      })
      .flat()
      .filter(Boolean);

    const unpacked = lineEntries.filter((entry) => !entry.isComplete);
    const packed = lineEntries.filter((entry) => entry.isComplete);

    if (packed.length && unpacked.length) {
      return `
        <div class="dispatchCardSplit">
          <div class="dispatchCardSplitTop">${unpacked.map((entry) => entry.html).join("")}</div>
          <div class="dispatchCardSplitBottom">
            <div class="dispatchCardSplitTitle">Packed:</div>
            ${packed.map((entry) => entry.html).join("")}
          </div>
        </div>
      `;
    }

    return lineEntries.map((entry) => entry.html).join("");
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

  function getLineItemWeightKg(lineItem, quantity) {
    const qty = Math.max(0, Number(quantity) || 0);
    if (!qty) return 0;
    const gramsPerUnit = Number(lineItem?.grams || 0);
    if (Number.isFinite(gramsPerUnit) && gramsPerUnit > 0) {
      return (gramsPerUnit * qty) / 1000;
    }
    return 0;
  }

  function getSelectedFulfillmentWeightKg(order, selectedLineItems) {
    if (!order || !Array.isArray(selectedLineItems) || !selectedLineItems.length) return null;
    const byId = new Map((order.line_items || []).map((li) => [String(li.id), li]));
    let totalKg = 0;
    selectedLineItems.forEach((entry) => {
      const li = byId.get(String(entry?.id));
      totalKg += getLineItemWeightKg(li, entry?.quantity);
    });
    if (totalKg > 0) return Number(totalKg.toFixed(3));
    return null;
  }

  function getShippedItemCount(order) {
    const lineItems = normalizeDispatchLineItems(order);
    return lineItems.reduce((sum, lineItem) => {
      const ordered = Math.max(0, Number(lineItem?.quantity) || 0);
      if (!ordered) return sum;
      const remaining = getRemainingLineItemQty(lineItem);
      return sum + Math.max(0, ordered - remaining);
    }, 0);
  }

  function isCancelledFulfillment(fulfillment) {
    if (!fulfillment || typeof fulfillment !== "object") return false;
    if (fulfillment?.cancelled_at) return true;
    const status = String(fulfillment?.status || "").toLowerCase();
    return status === "cancelled";
  }

  function getOrderFulfillmentSummary(order) {
    const fulfillmentRows = [];
    const fulfilledQtyByLineItemId = new Map();
    const allFulfillments = Array.isArray(order?.fulfillments) ? order.fulfillments : [];
    const fulfillments = allFulfillments.filter((fulfillment) => !isCancelledFulfillment(fulfillment));
    fulfillments.forEach((fulfillment, index) => {
      const lineItems = Array.isArray(fulfillment?.line_items) ? fulfillment.line_items : [];
      let fulfillmentQty = 0;
      lineItems.forEach((lineItem) => {
        const quantity = Math.max(0, Number(lineItem?.quantity) || 0);
        if (!quantity) return;
        const rawId = lineItem?.line_item_id ?? lineItem?.id;
        if (rawId == null) return;
        const key = String(rawId);
        fulfillmentQty += quantity;
        fulfilledQtyByLineItemId.set(key, (fulfilledQtyByLineItemId.get(key) || 0) + quantity);
      });
      const trackingNumbers = Array.isArray(fulfillment?.tracking_numbers)
        ? fulfillment.tracking_numbers.map((tracking) => String(tracking || "").trim()).filter(Boolean)
        : [];
      const fallbackTracking = String(fulfillment?.tracking_number || "").trim();
      if (!trackingNumbers.length && fallbackTracking) trackingNumbers.push(fallbackTracking);
      const fulfillmentLabel = String(fulfillment?.name || `F${index + 1}`).trim();
      fulfillmentRows.push({
        id: fulfillment?.id || `f-${index + 1}`,
        label: fulfillmentLabel || `F${index + 1}`,
        trackingText: trackingNumbers.length ? trackingNumbers.join(", ") : "—",
        quantity: fulfillmentQty
      });
    });

    return {
      fulfilledQtyByLineItemId,
      fulfillmentRows
    };
  }

  function getPackedFulfillmentSelection(order, packingState) {
    const lineItems = normalizeDispatchLineItems(order);
    const selectedLineItems = [];
    let hasRemainingItems = false;
    let allRemainingPacked = true;
    let anyPacked = false;

    lineItems.forEach((lineItem, index) => {
      const remainingQty = getRemainingLineItemQty(lineItem);
      if (remainingQty <= 0 || !lineItem?.id) return;
      hasRemainingItems = true;
      const itemKey = makePackingKey(lineItem, index);
      const packedItem = getPackingItem(packingState, itemKey);
      const packedQty = Math.max(0, Number(packedItem?.packed) || 0);
      const qtyToFulfill = Math.min(remainingQty, packedQty);
      if (qtyToFulfill > 0) {
        anyPacked = true;
        selectedLineItems.push({ id: lineItem.id, quantity: qtyToFulfill });
      }
      if (qtyToFulfill < remainingQty) {
        allRemainingPacked = false;
      }
    });

    return {
      hasRemainingItems,
      allRemainingPacked: hasRemainingItems ? allRemainingPacked : false,
      anyPacked,
      selectedLineItems
    };
  }

  function renderDispatchActions(order, laneId, orderNo, packingState, options = {}) {
    const normalizedLane = normalizeDispatchLaneId(laneId);
    const disabled = orderNo ? "" : "disabled";
    const docsDropdown = `
      <div class="dispatchDocsDropdown">
        <button class="dispatchBoxBtn" type="button" data-action="toggle-docs" data-order-no="${
          orderNo || ""
        }" ${disabled} aria-label="Print documents" title="Print documents">🖨️</button>
        <div class="dispatchDocsMenu">
          ${SHIPPING_DOC_OPTIONS.map(
            (doc) =>
              `<button class="dispatchDocsMenuBtn" type="button" data-action="print-shipping-doc" data-doc-key="${doc.key}" data-order-no="${
                orderNo || ""
              }" ${disabled}>${doc.label}</button>`
          ).join("")}
        </div>
      </div>`;

    if (normalizedLane === "delivery") {
      const tags = String(order?.tags || "").toLowerCase();
      const isPrepared = orderNo ? printedDeliveryNotes.has(orderNo) || /(^|[\s,])delivery_prepared([\s,]|$)/.test(tags) : false;
      const actionType = isPrepared ? "deliver-delivery" : "prepare-delivery";
      const actionLabel = isPrepared ? "🚚" : "Prepare delivery";
      return `
        ${docsDropdown}
        <button class="dispatchFulfillBtn" type="button" data-action="${actionType}" data-order-no="${orderNo || ""}" ${disabled}>${actionLabel}</button>
      `;
    }

    if (normalizedLane === "pickup") {
      const tags = String(order?.tags || "").toLowerCase();
      const notified = /(^|[\s,])(stat:notified|pickup_notified)([\s,]|$)/.test(tags);
      const pickedUpTag = /(^|[\s,])stat:pickedup([\s,]|$)/.test(tags);
      const fulfilled = String(order?.fulfillment_status || "").toLowerCase() === "fulfilled";
      const isComplete = fulfilled || pickedUpTag;
      const actionType = isComplete ? "released" : notified ? "release-pickup" : "notify-ready";
      const iconLabel = isComplete ? "📥" : notified ? "🛍️" : "✉️";
      const iconTitle = isComplete ? "Collected / Picked up" : notified ? "Mark collected" : "Notify customer";
      const pickupDisabled = isComplete ? "disabled" : disabled;
      return `
        ${docsDropdown}
        <button class="dispatchBoxBtn" type="button" data-action="${actionType}" data-order-no="${orderNo || ""}" ${pickupDisabled} aria-label="${iconTitle}" title="${iconTitle}">${iconLabel}</button>
      `;
    }

    const fulfillmentState = getPackedFulfillmentSelection(order, packingState);
    const hasUnfulfilledItems = Boolean(options.hasUnfulfilledItems ?? fulfillmentState.hasRemainingItems);
    const showFulfill = !options.suppressFulfillAction && fulfillmentState.anyPacked;
    const fulfillLabel = hasUnfulfilledItems ? "Fulfill" : "Create fulfillment";
    const fulfillClass = hasUnfulfilledItems ? "dispatchFulfillBtn" : "dispatchFulfillBtn dispatchFulfillBtn--secondary";
    return `
      ${docsDropdown}
      ${
        showFulfill
          ? `<button class="${fulfillClass}" type="button" data-action="fulfill-shipping" data-order-no="${
              orderNo || ""
            }" ${disabled}>${fulfillLabel}</button>`
          : ""
      }
    `;
  }

  function normalizeDispatchLaneId(laneId) {
    if (laneId === "pickup") return "pickup";
    if (String(laneId || "").startsWith("delivery")) return "delivery";
    return "shipping";
  }

  function getMissingSeverity(order, packingState) {
    const lineItems = normalizeDispatchLineItems(order);
    const inventoryShortItems = lineItems.filter((item) => {
      const remaining = Number(item?.quantity_remaining ?? item?.fulfillable_quantity ?? item?.quantity);
      const inventoryAvailable = Number(item?.inventory_available);
      return Number.isFinite(remaining) && remaining > 0 && Number.isFinite(inventoryAvailable) && inventoryAvailable < remaining;
    });
    if (inventoryShortItems.length) {
      const bulkOnly = inventoryShortItems.every((item) => {
        const label = `${item?.title || ""} ${item?.variant_title || ""}`.toLowerCase();
        return /(500g|750g|1kg|bulk\s*pack|bulk)/.test(label);
      });
      return bulkOnly ? "yellow" : "red";
    }

    const stockShortItems = lineItems.filter((item) => {
      const ordered = Number(item?.quantity) || 0;
      const fulfillable = Number(item?.fulfillable_quantity);
      return Number.isFinite(fulfillable) && fulfillable < ordered;
    });
    if (stockShortItems.length) {
      const bulkOnly = stockShortItems.every((item) => {
        const label = `${item?.title || ""} ${item?.variant_title || ""}`.toLowerCase();
        return /(500g|750g|1kg|bulk\s*pack|bulk)/.test(label);
      });
      return bulkOnly ? "yellow" : "red";
    }

    const stateItems = Array.isArray(packingState?.items) ? packingState.items : [];
    const hasStartedPacking =
      stateItems.some((item) => Number(item?.packed) > 0) || Boolean(packingState?.endTime);
    if (!hasStartedPacking) return "green";
    const missingItems = stateItems
      .map((item) => {
        const quantity = Number(item?.quantity) || 0;
        const packed = Number(item?.packed) || 0;
        const remaining = Math.max(0, quantity - packed);
        return { item, remaining };
      })
      .filter((entry) => entry.remaining > 0);
    if (!missingItems.length) return "green";
    const sizeSet = new Set(
      missingItems
        .map(({ item }) => String(item?.variant_title || item?.title || "").trim().toLowerCase())
        .filter(Boolean)
    );
    if (sizeSet.size > 1) return "red";
    const onlyBulkMissing = missingItems.every(({ item }) => {
      const label = `${item?.title || ""} ${item?.variant_title || ""}`.toLowerCase();
      return /(500g|750g|1kg|bulk\s*pack|bulk)/.test(label);
    });
    return onlyBulkMissing ? "yellow" : "red";
  }

  function getPaymentState(order) {
    const financialStatus = String(order?.financial_status || "").trim().toLowerCase();
    const isPaid = ["paid", "partially_paid"].includes(financialStatus);
    if (isPaid) return "green";
    const paymentBeforeDelivery = order?.payment_before_delivery;
    const requiresPrepayment = paymentBeforeDelivery === null ? true : Boolean(paymentBeforeDelivery);
    return requiresPrepayment ? "red" : "yellow";
  }

  function getDispatchDisplayDate(order) {
    const deliveryDateRaw = String(order?.delivery_date || "").trim();
    if (deliveryDateRaw) {
      const parsed = new Date(deliveryDateRaw);
      if (Number.isFinite(parsed.getTime())) return parsed.toLocaleDateString();
      return deliveryDateRaw;
    }
    return order?.created_at ? new Date(order.created_at).toLocaleTimeString() : "";
  }

  function renderDispatchPackingPanel(packingState, orderNo, options = {}) {
    if (!packingState) return "";
    const isActive = packingState.active || options.forceOpen;
    const boxes = Array.isArray(packingState.boxes) ? packingState.boxes : [];
    const sourceOrder = dispatchOrderCache.get(orderNo);
    const orderedPackingItems = getOrderedPackingItems(sourceOrder, packingState);
    const displayPackingItems = orderedPackingItems.length ? orderedPackingItems : packingState.items;
    const itemLabelByKey = new Map(
      displayPackingItems.map((item) => {
        const variantLabel =
          item.variant && item.variant.toLowerCase() !== "default title" ? item.variant : "";
        return [item.key, [item.title, variantLabel].filter(Boolean).join(" · ") || "Item"];
      })
    );
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
            displayPackingItems.length
              ? displayPackingItems
                  .map((item) => {
                    const remaining = Math.max(0, item.quantity - item.packed);
                    const isComplete = remaining === 0;
                    const variantLabel =
                      item.variant && item.variant.toLowerCase() !== "default title"
                        ? item.variant
                        : "";
                    const itemLabel = [item.title, variantLabel].filter(Boolean).join(" · ");
                    const isRotarySelected = dispatchRotarySelectedKey === `${orderNo}:${item.key}`;
                    return `
                      <div class="dispatchPackingRow ${isComplete ? "is-complete" : ""} ${isRotarySelected ? "is-rotary-selected" : ""}" data-item-key="${item.key}">
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
            <button class="dispatchParcelBoxBtn" type="button" data-action="add-box" data-order-no="${orderNo}">Add box</button>
          </div>
          <div class="dispatchBoxList">
            ${
              boxes.length
                ? boxes
                    .map((box, index) => {
                      const packedItems = Object.entries(box.items || {})
                        .map(([itemKey, qty]) => {
                          const normalizedQty = Number(qty) || 0;
                          if (normalizedQty <= 0) return "";
                          return `<li>${itemLabelByKey.get(itemKey) || "Item"} × ${normalizedQty}</li>`;
                        })
                        .filter(Boolean)
                        .join("");
                      return `
                        <div class="dispatchBoxRow">
                          <span class="dispatchBoxLabel">${box.label}${packingState.activeBoxIndex === index ? " (Current)" : ""}</span>
                          <input class="dispatchBoxParcelInput" type="text" placeholder="Parcel no (optional)" data-order-no="${orderNo}" data-box-index="${index}" value="${box.parcelCode || ""}" />
                          <div class="dispatchBoxItems">
                            ${packedItems ? `<ul>${packedItems}</ul>` : "<span>No items packed yet.</span>"}
                          </div>
                        </div>
                      `;
                    })
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

  function normalizeFlavourLabel(label) {
    const cleaned = normalizeLineLabel(label).toLowerCase();
    if (!cleaned) return "";
    const canonical = FLAVOUR_ALIASES[cleaned] || cleaned;
    if (FLAVOUR_DISPLAY_NAMES[canonical]) return FLAVOUR_DISPLAY_NAMES[canonical];
    for (const key of Object.keys(FLAVOUR_DISPLAY_NAMES)) {
      const andVariant = key.replace(/\s*&\s*/g, " and ");
      if (cleaned.includes(key) || cleaned.includes(andVariant)) {
        return FLAVOUR_DISPLAY_NAMES[key];
      }
    }
    return normalizeLineLabel(label);
  }

  function getLineItemFlavour(lineItem) {
    if (!lineItem) return "";
    if (Array.isArray(lineItem.properties)) {
      const prop = lineItem.properties.find((item) =>
        /flavour|flavor/.test(String(item?.name || "").toLowerCase())
      );
      if (prop?.value) return normalizeFlavourLabel(prop.value);
    }
    if (Array.isArray(lineItem.options_with_values)) {
      const option = lineItem.options_with_values.find((item) =>
        /flavour|flavor/.test(String(item?.name || "").toLowerCase())
      );
      if (option?.value) return normalizeFlavourLabel(option.value);
    }
    if (Array.isArray(lineItem.variant_options)) {
      const option = lineItem.variant_options.find((opt) =>
        /flavour|flavor/i.test(String(opt || ""))
      );
      if (option) return normalizeFlavourLabel(option);
    }
    const title = lineItem.title || "";
    const sizeLabel = getLineItemSize(lineItem);
    const cleaned = sizeLabel
      ? normalizeLineLabel(title.replace(new RegExp(sizeLabel, "i"), ""))
      : normalizeLineLabel(title);
    return normalizeFlavourLabel(cleaned);
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
      const qty = getRemainingLineItemQty(item);
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
    const lineItems = normalizeDispatchLineItems(order);
    const items = lineItems
      .map((item) => {
        const size = getLineItemSize(item);
        const curryMix = isCurryMixItem(item);
        const metrics = getSizeMetrics(size);
        return {
          title: item.title || "",
          size,
          curryMix,
          quantity: getRemainingLineItemQty(item),
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
    const boxes = plan.boxes
      .map((box) => {
        const itemsHtml = box.items
          .map(
            (item) => `<div class="dispatchPackingPlanItem"><strong>${item.quantity}×</strong> ${item.label}</div>`
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
            <div class="dispatchPackingPlanBoxTitle"><span class="dispatchPackingPlanBoxIcon" aria-hidden="true">📦</span> ${box.label} <span>${tag}</span></div>
            <div class="dispatchPackingPlanBoxItems">${itemsHtml || '<div class="dispatchPackingPlanItem">No items assigned.</div>'}</div>
            ${meta}
            ${breakdown}
          </div>
        `;
      })
      .join("");
    return `<div class="dispatchPackingPlanGrid">${boxes}</div>`;
  }

  function markDispatchLineItemPacked(orderNo, itemKey) {
    if (!orderNo || !itemKey) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    const state = dispatchPackingState.get(orderNo) || getPackingState(order);
    const item = state ? getPackingItem(state, itemKey) : null;
    if (!item) return;
    const qty = Math.max(0, Number(item.quantity) || 0);
    if (!qty || Number(item.packed) >= qty) return;
    setDispatchLinePackedQuantity(orderNo, itemKey, qty);
  }

  function toggleDispatchLineItemPacked(orderNo, itemKey) {
    if (!orderNo || !itemKey) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    const state = dispatchPackingState.get(orderNo) || getPackingState(order);
    if (!state) return;
    if (!state.startTime) state.startTime = new Date().toISOString();
    state.active = true;
    if (state.endTime) state.endTime = null;
    const item = getPackingItem(state, itemKey);
    if (!item) return;
    const currentPacked = Math.max(0, Number(item.packed) || 0);
    const orderLineItems = Array.isArray(order?.line_items) ? order.line_items : [];
    const orderLineItem = Number.isInteger(item.index) ? orderLineItems[item.index] : null;
    const quantity = orderLineItem ? getRemainingLineItemQty(orderLineItem) : Number(item.quantity) || 0;
    if (quantity <= 0) return;
    item.quantity = quantity;

    if (currentPacked >= quantity) {
      item.packed = 0;
      item.completedAt = null;
    } else if (currentPacked > 0) {
      const delta = Math.max(0, quantity - currentPacked);
      allocatePackedToBox(state, item.key, delta);
      item.packed = quantity;
      item.completedAt = Date.now();
    } else {
      item.packed = quantity;
      item.completedAt = Date.now();
      allocatePackedToBox(state, item.key, quantity);
    }

    if (isPackingComplete(state)) {
      finalizePacking(state);
    } else {
      savePackingState();
    }
    refreshDispatchViews(orderNo);
  }

  function setDispatchLinePackedQuantity(orderNo, itemKey, packedQty) {
    if (!orderNo || !itemKey) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    const state = dispatchPackingState.get(orderNo) || getPackingState(order);
    if (!state) return;
    if (!state.startTime) state.startTime = new Date().toISOString();
    state.active = true;
    if (state.endTime) state.endTime = null;

    const item = getPackingItem(state, itemKey);
    if (!item) return;
    const orderLineItems = Array.isArray(order?.line_items) ? order.line_items : [];
    const orderLineItem = Number.isInteger(item.index) ? orderLineItems[item.index] : null;
    const quantity = orderLineItem ? getRemainingLineItemQty(orderLineItem) : Number(item.quantity) || 0;
    if (quantity <= 0) return;

    const nextPacked = Math.max(0, Math.min(quantity, Number(packedQty) || 0));
    const prevPacked = Math.max(0, Number(item.packed) || 0);
    item.quantity = quantity;
    item.packed = nextPacked;
    item.completedAt = nextPacked >= quantity ? Date.now() : null;

    if (nextPacked > prevPacked) {
      allocatePackedToBox(state, item.key, nextPacked - prevPacked);
    }

    if (isPackingComplete(state)) {
      finalizePacking(state);
    } else {
      savePackingState();
    }
    refreshDispatchViews(orderNo);
  }

  function showDispatchPackedQtyPrompt(orderNo, itemKey, options = {}) {
    if (!orderNo || !itemKey) return;
    const order = dispatchOrderCache.get(orderNo);
    const state = order ? dispatchPackingState.get(orderNo) || getPackingState(order) : null;
    const item = state ? getPackingItem(state, itemKey) : null;
    if (!order || !state || !item) return;
    const orderLineItems = Array.isArray(order?.line_items) ? order.line_items : [];
    const orderLineItem = Number.isInteger(item.index) ? orderLineItems[item.index] : null;
    const maxQty = orderLineItem ? getRemainingLineItemQty(orderLineItem) : Number(item.quantity) || 0;
    if (maxQty <= 0) return;

    const modal = document.createElement("div");
    modal.className = "dispatchPackedQtyModal";
    const baseTitle = item.title || "Line item";
    const variant = String(item.variant || "").trim();
    const name = variant && variant.toLowerCase() !== "default title" ? `${baseTitle} · ${variant}` : baseTitle;
    const shouldResetToZero = Boolean(options?.startFromZero);
    const initialValue = shouldResetToZero
      ? 0
      : Math.max(0, Math.min(maxQty, Number(options?.initialValue ?? item.packed) || 0));
    let value = initialValue;

    modal.innerHTML = `
      <div class="dispatchPackedQtyCard" role="dialog" aria-modal="true" aria-label="Packed quantity">
        <h3>Update packed quantity</h3>
        <p>${name}</p>
        <div class="dispatchPackedQtyControls">
          <button type="button" class="dispatchPackedQtyBtn" data-role="decrease">−</button>
          <strong class="dispatchPackedQtyValue" data-role="value">${value}</strong>
          <button type="button" class="dispatchPackedQtyBtn" data-role="increase">+</button>
        </div>
        <div class="dispatchPackedQtyMax">of ${maxQty}</div>
        <div class="dispatchPackedQtyActions">
          <button type="button" class="dispatchPackedQtyAction dispatchPackedQtyAction--ghost" data-role="cancel">Cancel</button>
          <button type="button" class="dispatchPackedQtyAction dispatchPackedQtyAction--primary" data-role="save">Save</button>
        </div>
      </div>
    `;

    const valueEl = modal.querySelector('[data-role="value"]');
    let autoCommitTimer = null;
    const clearAutoCommitTimer = () => {
      if (autoCommitTimer) {
        window.clearTimeout(autoCommitTimer);
        autoCommitTimer = null;
      }
    };
    const scheduleAutoCommit = () => {
      clearAutoCommitTimer();
      autoCommitTimer = window.setTimeout(() => {
        if (dispatchPackedQtyPromptState?.modal !== modal) return;
        dispatchPackedQtyPromptState.commit(value);
      }, 2000);
    };
    const close = () => {
      clearAutoCommitTimer();
      if (dispatchPackedQtyPromptState?.modal === modal) {
        dispatchPackedQtyPromptState = null;
      }
      modal.remove();
    };
    const setValue = (nextValue) => {
      if (!Number.isFinite(Number(nextValue))) return;
      value = Math.max(0, Math.min(maxQty, Number(nextValue)));
      paint();
      scheduleAutoCommit();
    };
    const paint = () => {
      if (valueEl) valueEl.textContent = String(value);
    };

    dispatchPackedQtyPromptState?.close?.();
    dispatchPackedQtyPromptState = {
      modal,
      orderNo,
      itemKey,
      maxQty,
      close,
      setValue,
      increase: () => setValue(value + 1),
      decrease: () => setValue(value - 1),
      commit: (nextValue) => {
        const committedValue = Number.isFinite(Number(nextValue)) ? Number(nextValue) : value;
        setDispatchLinePackedQuantity(orderNo, itemKey, committedValue);
        close();
      }
    };

    modal.addEventListener("click", (event) => {
      const target = event.target.closest("[data-role]");
      if (!target) {
        if (event.target === modal) close();
        return;
      }
      const role = target.dataset.role;
      if (role === "decrease") {
        dispatchPackedQtyPromptState?.decrease?.();
      } else if (role === "increase") {
        dispatchPackedQtyPromptState?.increase?.();
      } else if (role === "cancel") {
        close();
      } else if (role === "save") {
        dispatchPackedQtyPromptState?.commit?.();
      }
    });

    document.body.appendChild(modal);
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
    let totalWeightKg = 0;
    let totalBoxes = 0;
    let totalUnits = 0;
    let orderCount = 0;
    const sizeTotals = new Map();
    const flavourTotals = new Map();
    const flavourSizeTotals = new Map();

    dispatchSelectedOrders.forEach((orderNo) => {
      const order = dispatchOrderCache.get(orderNo);
      if (!order) return;
      orderCount += 1;
      const packingPlan = buildDispatchPackingPlan(order);
      totalBoxes += packingPlan?.estimatedBoxes || 0;
      totalWeightKg += packingPlan?.totalWeightKg || 0;
      (order.line_items || []).forEach((item) => {
        const qty = Number(item.quantity) || 0;
        totalUnits += qty;
        const size = getLineItemSize(item);
        if (size) sizeTotals.set(size, (sizeTotals.get(size) || 0) + qty);
        const flavour = getLineItemFlavour(item);
        if (flavour) flavourTotals.set(flavour, (flavourTotals.get(flavour) || 0) + qty);
        if (flavour || size) {
          const mixKey = `${flavour || "Unknown"}::${size || "Unspecified"}`;
          const current = flavourSizeTotals.get(mixKey) || {
            flavour: flavour || "Unknown",
            size: size || "Unspecified",
            qty: 0
          };
          current.qty += qty;
          flavourSizeTotals.set(mixKey, current);
        }
      });
    });

    const totalTimeMin = estimatePackingTime({
      totalUnits,
      boxCount: totalBoxes
    });

    const selectedOrders = [...dispatchSelectedOrders]
      .map((orderNo) => {
        const order = dispatchOrderCache.get(orderNo);
        if (!order) return null;
        const plan = buildDispatchPackingPlan(order);
        const destination = [order.shipping_city, order.shipping_province].filter(Boolean).join(", ") || "—";
        return {
          orderNo,
          customer: order.customer_name || order.name || "—",
          destination,
          weightKg: Number(plan?.totalWeightKg || 0),
          parcels: Number(plan?.estimatedBoxes || 0),
          units: Number(plan?.totalUnits || 0)
        };
      })
      .filter(Boolean);

    return {
      totalWeightKg,
      totalBoxes,
      totalUnits,
      orderCount,
      totalTimeMin,
      sizeTotals,
      flavourTotals,
      flavourSizeTotals,
      selectedOrders
    };
  }

  function isMobileDispatchViewport() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function formatDispatchDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return date.toLocaleString();
  }

  function renderDispatchRecentlyShipped(orders) {
    if (!dispatchRecentlyShipped) return;
    const list = Array.isArray(orders) ? orders.slice(0, 12) : [];
    if (!list.length) {
      dispatchRecentlyShipped.innerHTML = '<div class="dispatchRecentEmpty">No recently shipped orders found.</div>';
      return;
    }

    dispatchRecentlyShipped.innerHTML = list
      .map((order) => {
        const orderLabel = order?.name || "Order";
        const customer = order?.customer_name || "Unknown customer";
        const fulfilledAt = formatDispatchDateTime(order?.fulfilled_at);
        const trackingNumbers = Array.isArray(order?.fulfillment?.tracking_numbers)
          ? order.fulfillment.tracking_numbers.filter(Boolean)
          : [];
        const trackingLabel = trackingNumbers.length ? trackingNumbers.join(", ") : "—";
        return `
          <article class="dispatchRecentItem">
            <div class="dispatchRecentItemTop">
              <div class="dispatchRecentItemOrder">${orderLabel}</div>
              <div class="dispatchRecentItemTime">${fulfilledAt}</div>
            </div>
            <div class="dispatchRecentItemCustomer" title="${customer}">${customer}</div>
            <div class="dispatchRecentItemTracking">Tracking: ${trackingLabel}</div>
          </article>
        `;
      })
      .join("");
  }

  function renderDispatchMobileLaneControls() {
    if (!dispatchMobileControls || !dispatchMobileLaneTabs || !dispatchMobileLaneLabel) return;
    const activeOption =
      dispatchMobileLaneOptions.find((option) => option.id === dispatchMobileLane) ||
      dispatchMobileLaneOptions[0];
    dispatchMobileLaneLabel.textContent = activeOption ? `${activeOption.label} lanes` : "All lanes";
    dispatchMobileLaneTabs.innerHTML = dispatchMobileLaneOptions
      .map((option) => {
        const isActive = option.id === dispatchMobileLane;
        return `<button class="btn ${isActive ? "btn-primary" : "btn-alt-secondary"}" type="button" data-mobile-lane="${option.id}" aria-pressed="${
          isActive ? "true" : "false"
        }">${option.label}</button>`;
      })
      .join("");
  }

  function applyDispatchMobileLaneFilter() {
    if (!dispatchBoard) return;
    const isMobile = isMobileDispatchViewport();
    const columns = dispatchBoard.querySelectorAll(".dispatchCol");
    columns.forEach((col) => {
      if (!isMobile || dispatchMobileLane === "all") {
        col.classList.remove("dispatchCol--mobile-hidden");
        return;
      }
      const laneId = col.dataset.laneId;
      if (dispatchMobileLane === "delivery") {
        col.classList.toggle("dispatchCol--mobile-hidden", normalizeDispatchLaneId(laneId) !== "delivery");
        return;
      }
      col.classList.toggle("dispatchCol--mobile-hidden", laneId !== dispatchMobileLane);
    });
    if (dispatchMobileControls) {
      dispatchMobileControls.hidden = !isMobile;
    }
  }

  function loadDispatchSelectionSidebarPreference() {
    const stored = localStorage.getItem(DISPATCH_SELECTION_SIDEBAR_KEY);
    if (stored === "false") {
      dispatchSelectionSidebarOpen = false;
      return;
    }
    dispatchSelectionSidebarOpen = true;
  }

  function setDispatchSelectionSidebarOpen(nextOpen, options = {}) {
    const { persist = true, focusPanel = false, focusToggle = false } = options;
    dispatchSelectionSidebarOpen = Boolean(nextOpen);
    if (persist) {
      localStorage.setItem(DISPATCH_SELECTION_SIDEBAR_KEY, dispatchSelectionSidebarOpen ? "true" : "false");
    }
    if (dispatchSelectionSidebar) {
      dispatchSelectionSidebar.classList.toggle("is-open", dispatchSelectionSidebarOpen);
      dispatchSelectionSidebar.classList.toggle("is-closed", !dispatchSelectionSidebarOpen);
    }
    if (dispatchBoardLayout) {
      dispatchBoardLayout.classList.toggle("dispatchBoardLayout--selection-collapsed", !dispatchSelectionSidebarOpen);
    }
    if (dispatchSelectionSidebarToggle) {
      dispatchSelectionSidebarToggle.setAttribute("aria-expanded", dispatchSelectionSidebarOpen ? "true" : "false");
      dispatchSelectionSidebarToggle.textContent = dispatchSelectionSidebarOpen ? "Hide selected orders" : "Show selected orders";
      dispatchSelectionSidebarToggle.setAttribute(
        "aria-label",
        dispatchSelectionSidebarOpen ? "Collapse selected orders sidebar" : "Expand selected orders sidebar"
      );
    }
    if (dispatchSelectionFloat) {
      dispatchSelectionFloat.hidden = !dispatchSelectionSidebarOpen;
    }
    if (focusPanel && dispatchSelectionSidebarOpen) {
      dispatchSelectionPanel?.focus();
    }
    if (focusToggle) {
      dispatchSelectionSidebarToggle?.focus();
    }
  }

  function toggleDispatchSelectionSidebar(options = {}) {
    setDispatchSelectionSidebarOpen(!dispatchSelectionSidebarOpen, options);
  }

  function updateDispatchSelectionSidebarVisibility(isScanVisible) {
    if (!dispatchSelectionPanel) return;
    const container = dispatchSelectionPanel.parentElement;
    if (!container) return;
    container.hidden = !isScanVisible || !dispatchSelectionSidebarOpen;
  }

  function updateDispatchSelectionSummary() {
    if (!dispatchSelectionPanel) return;
    const totals = aggregateDispatchSelection();
    const showScan = document.querySelector(".flView.flView--active")?.id === "viewScan";
    updateDispatchSelectionSidebarVisibility(showScan);
    dispatchSelectionPanel.classList.toggle("is-hidden", totals.orderCount === 0 || !showScan);
    if (dispatchSelectionCount) {
      dispatchSelectionCount.textContent = String(totals.orderCount || 0);
    }
    if (dispatchSelectionUnits) {
      dispatchSelectionUnits.textContent = String(totals.totalUnits || 0);
    }
    if (dispatchSelectionBoxes) {
      dispatchSelectionBoxes.textContent = String(totals.totalBoxes || 0);
    }
    if (dispatchSelectionWeight) {
      dispatchSelectionWeight.textContent =
        totals.totalWeightKg > 0 ? `${totals.totalWeightKg.toFixed(2)} kg` : "—";
    }
    if (dispatchSelectionTime) {
      dispatchSelectionTime.textContent = formatDispatchDuration(totals.totalTimeMin);
    }
    const selectedDeliveryOrderCount = getSelectedDeliveryOrderNos().length;
    updateMultiShipmentButtonVisibility();
    if (dispatchSelectionOrderCards) {
      dispatchSelectionOrderCards.innerHTML = (totals.selectedOrders || [])
        .map((entry) => `
          <article class="dispatchSelectionOrderCard">
            <div class="dispatchSelectionOrderCardTitle">${entry.orderNo} · ${entry.customer}</div>
            <div class="dispatchSelectionOrderCardValue">${entry.destination}</div>
            <div class="dispatchSelectionOrderCardTitle">${entry.weightKg > 0 ? `${entry.weightKg.toFixed(2)} kg` : "—"} · ${entry.parcels} parcels · ${entry.units} units</div>
          </article>`)
        .join("");
    }
    if (dispatchPrepareDeliveriesContainer) {
      dispatchPrepareDeliveriesContainer.classList.toggle("is-hidden", selectedDeliveryOrderCount === 0);
    }
    if (dispatchSelectionMixes) {
      const entries = [...totals.flavourSizeTotals.values()].sort((a, b) => {
        const aKey = flavourKey(a.flavour);
        const bKey = flavourKey(b.flavour);
        const aOrder = FLAVOUR_SORT_ORDER.has(aKey) ? FLAVOUR_SORT_ORDER.get(aKey) : Number.POSITIVE_INFINITY;
        const bOrder = FLAVOUR_SORT_ORDER.has(bKey) ? FLAVOUR_SORT_ORDER.get(bKey) : Number.POSITIVE_INFINITY;
        if (aOrder !== bOrder) return aOrder - bOrder;
        const flavourCmp = String(a.flavour).localeCompare(String(b.flavour));
        if (flavourCmp !== 0) return flavourCmp;
        return String(a.size).localeCompare(String(b.size));
      });
      if (!entries.length) {
        dispatchSelectionMixes.innerHTML = `<div class="dispatchMixMatrixEmpty">No mix yet</div>`;
      } else {
        const sizeList = [...new Set(entries.map((entry) => String(entry.size || "Unspecified")))].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        );
        const flavourList = [...new Set(entries.map((entry) => String(entry.flavour || "Unknown")))].sort((a, b) => {
          const aOrder = FLAVOUR_SORT_ORDER.has(flavourKey(a)) ? FLAVOUR_SORT_ORDER.get(flavourKey(a)) : Number.POSITIVE_INFINITY;
          const bOrder = FLAVOUR_SORT_ORDER.has(flavourKey(b)) ? FLAVOUR_SORT_ORDER.get(flavourKey(b)) : Number.POSITIVE_INFINITY;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.localeCompare(b);
        });
        const mixMap = new Map(entries.map((entry) => [`${entry.flavour}::${entry.size}`, entry.qty]));
        const header = sizeList.map((size) => `<th scope="col">${size}</th>`).join("");
        const rows = flavourList
          .map((flavour) => {
            const cells = sizeList
              .map((size) => {
                const qty = Number(mixMap.get(`${flavour}::${size}`) || 0);
                return `<td class="${qty === 0 ? "dispatchMixCell--missing" : ""}">${qty === 0 ? "" : qty}</td>`;
              })
              .join("");
            return `<tr><th scope="row" class="dispatchMixMatrixFlavour">${flavour}</th>${cells}</tr>`;
          })
          .join("");
        dispatchSelectionMixes.innerHTML = `<table class="dispatchMixMatrix"><thead><tr><th scope="col">Flavour</th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
      }
    }

  }

  function clearDispatchSelection() {
    dispatchSelectedOrders.clear();
    dispatchBoard?.querySelectorAll(".dispatchCard").forEach((card) => card.classList.remove("is-selected"));
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
    const displayDate = getDispatchDisplayDate(order);
    const lines = renderDispatchLineItems(order, packingState);
    dispatchOrderModalTitle.textContent = title;
    if (dispatchOrderModalMeta) {
      dispatchOrderModalMeta.textContent = `#${(order.name || "").replace("#", "")} · ${city} · ${displayDate}`;
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
        const unsupportedReadyMutation =
          text.includes("fulfillmentOrderMarkReadyForPickup") && text.includes("doesn't exist");
        if (!unsupportedReadyMutation) {
          statusExplain("Ready-for-collection failed.", "warn");
          logDispatchEvent(`Ready-for-collection failed for order ${orderNo}: ${text}`);
          return;
        }
        logDispatchEvent(
          `Ready-for-pickup mutation unavailable for order ${orderNo}; continuing with customer email notification.`
        );
      }
      const notifyRes = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/notify-collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNo,
          orderId: order.id,
          customerName: order.customer_name || "Customer",
          parcelCount: Number(order.parcel_count || 0),
          weightKg: Number(order.total_weight_kg || 0)
        })
      });
      if (!notifyRes.ok) {
        const text = await notifyRes.text();
        statusExplain("Ready marked but notify email failed.", "warn");
        logDispatchEvent(`Notify customer failed for order ${orderNo}: ${text}`);
      } else {
        const notifyPayload = await notifyRes.json().catch(() => ({}));
        const cached = dispatchOrderCache.get(orderNo);
        if (cached) cached.tags = `${cached.tags || ""}, stat:notified, pickup_notified`;
        if (notifyPayload?.fallbackNotifiedAdmin) {
          showSiteAlert({
            title: `Order ${orderNo} ready for pickup`,
            tone: "warn",
            message: "No customer email was found. Admin was notified at admin@flippenlekkaspices.co.za."
          });
        } else {
          showSiteAlert({
            title: `Customer notified for ${orderNo}`,
            tone: "ok",
            message: `Pickup notice sent to ${notifyPayload?.sentTo || "the customer email on record"}.`
          });
        }
      }
      statusExplain(`Order ${orderNo} marked ready for collection.`, "ok");
      logDispatchEvent(`Order ${orderNo} marked ready for collection.`);
      refreshDispatchViews(orderNo);
    } catch (err) {
      statusExplain("Ready-for-collection failed.", "warn");
      logDispatchEvent(`Ready-for-collection failed for order ${orderNo}: ${String(err)}`);
    }
  }

  async function releasePickupOrder(orderNo) {
    if (!orderNo) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    try {
      setDispatchProgress(6, `Releasing ${orderNo} for collection`);
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          trackingNumber: "",
          trackingUrl: "",
          trackingCompany: "Collection",
          message: "Order released to customer for collection."
        })
      });
      if (!res.ok) {
        const text = await res.text();
        statusExplain("Release failed.", "warn");
        logDispatchEvent(`Release failed for order ${orderNo}: ${text}`);
        return;
      }
      const cached = dispatchOrderCache.get(orderNo);
      if (cached) {
        cached.fulfillment_status = "fulfilled";
        cached.tags = `${cached.tags || ""}, stat:pickedup`;
      }
      await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, tag: "stat:pickedup" })
      }).catch(() => null);
      statusExplain(`Order ${orderNo} released to customer.`, "ok");
      logDispatchEvent(`Order ${orderNo} released to customer.`);
      showSiteAlert({
        title: "Order released",
        tone: "ok",
        message: `Order ${orderNo} was released and tagged stat:pickedup.`
      });
      refreshDispatchViews(orderNo);
    } catch (err) {
      statusExplain("Release failed.", "warn");
      logDispatchEvent(`Release failed for order ${orderNo}: ${String(err)}`);
      showSiteAlert({ title: "Release failed", tone: "err", message: `Order ${orderNo} could not be released.` });
    }
  }

  async function markDeliveryReady(orderNo) {
    if (!orderNo) return;
    const order = dispatchOrderCache.get(orderNo);
    if (!order) return;
    try {
      setDispatchProgress(6, `Marking ${orderNo} out for delivery`);
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/fulfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          trackingNumber: "",
          trackingUrl: "",
          trackingCompany: "Delivery",
          message: "Order delivered to customer."
        })
      });
      if (!res.ok) {
        const text = await res.text();
        statusExplain("Delivery mark failed.", "warn");
        logDispatchEvent(`Delivery mark failed for order ${orderNo}: ${text}`);
        return;
      }

      const cached = dispatchOrderCache.get(orderNo);
      if (cached) {
        cached.fulfillment_status = "fulfilled";
        cached.tags = `${cached.tags || ""}, stat:delivered`;
      }
      await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, tag: "stat:delivered" })
      }).catch(() => null);
      statusExplain(`Order ${orderNo} marked out for delivery.`, "ok");
      logDispatchEvent(`Order ${orderNo} marked out for delivery.`);
      refreshDispatchViews(orderNo);
    } catch (err) {
      statusExplain("Delivery mark failed.", "warn");
      logDispatchEvent(`Delivery mark failed for order ${orderNo}: ${String(err)}`);
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
      if (fs && fs !== "unfulfilled" && fs !== "in_progress" && fs !=="partial") return false;
      if (!o.created_at) return true;
      const createdMs = new Date(o.created_at).getTime();
      if (!Number.isFinite(createdMs)) return true;
      return now - createdMs <= maxAgeMs;
    });

    filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const list = filtered;
    rebuildAutomaticCombinedShipments(list);
    if (!list.length) {
      dispatchBoard.innerHTML = `<div class="dispatchBoardEmpty">No open shipping / delivery / collections right now.</div>`;
      dispatchSelectedOrders.clear();
      updateDispatchSelectionSummary();
      return;
    }

    const cols = [
      { id: "shippingAgent", label: "Shipping (Agent)", type: "cards" },
      { id: "shippingA", label: "Shipping", type: "cards" },
      { id: "shippingB", label: "Shipping", type: "cards" },
      { id: "export", label: "Export", type: "cards" },
      { id: "pickup", label: "Pickup / Collection", type: "cards" },
      { id: "delivery", label: "Delivery", type: "cards" }
    ];
    const lanes = {
      delivery: [],
      shippingAgent: [],
      shippingNonAgent: [],
      export: [],
      pickup: []
    };

    list.forEach((o) => {
      if (isExportOrder(o)) {
        lanes.export.push(o);
        return;
      }
      const laneId = laneFromOrder(o);
      if (laneId === "shipping") {
        if (isAgentOrder(o)) {
          lanes.shippingAgent.push(o);
        } else {
          lanes.shippingNonAgent.push(o);
        }
        return;
      }
      (lanes[laneId] || lanes.shippingNonAgent).push(o);
    });

    const shippingLaneCount = 2;
    const shippingChunks = Array.from({ length: shippingLaneCount }, () => []);
    lanes.shippingNonAgent.forEach((order, index) => {
      shippingChunks[index % shippingLaneCount].push(order);
    });
    const [shippingA, shippingB] = shippingChunks;
    const shouldSplitDelivery =
      lanes.export.length === 0 &&
      (lanes.delivery.length > DISPATCH_DELIVERY_SPLIT_THRESHOLD || !dispatchSelectionSidebarOpen);
    const deliveryChunks = Array.from({ length: shouldSplitDelivery ? 2 : 1 }, () => []);
    lanes.delivery.forEach((order, index) => {
      deliveryChunks[index % deliveryChunks.length].push(order);
    });
    const [deliveryA, deliveryB] = deliveryChunks;
    if (shouldSplitDelivery) {
      cols.splice(
        cols.findIndex((col) => col.id === "delivery"),
        1,
        { id: "deliveryA", label: "Delivery", type: "cards" },
        { id: "deliveryB", label: "Delivery 2", type: "cards" }
      );
    }
    dispatchMobileLaneOptions = [
      ...DISPATCH_MOBILE_BASE_LANE_OPTIONS,
      { id: "delivery", label: "Delivery" },
      ...(shouldSplitDelivery
        ? [
            { id: "deliveryA", label: "Delivery" },
            { id: "deliveryB", label: "Delivery 2" }
          ]
        : [])
    ];
    if (dispatchMobileLane !== "all" && !dispatchMobileLaneOptions.some((option) => option.id === dispatchMobileLane)) {
      dispatchMobileLane = "all";
    }

    const cardHTML = (o, laneId) => {
      const title = o.customer_name || o.name || `Order ${o.id}`;
      const city = o.shipping_city || "";
      const postal = o.shipping_postal || "";
      const displayDate = getDispatchDisplayDate(o);
      const orderNo = String(o.name || "").replace("#", "").trim();
      const packingState = getPackingState(o);
      if (orderNo) activeOrders.add(orderNo);
      const { fulfillmentRows, fulfilledQtyByLineItemId } = getOrderFulfillmentSummary(o);
      const lines = renderDispatchLineItems(o, packingState);
      const exportCartonSummary = getExportCartonSummary(o);
      const addr1 = o.shipping_address1 || "";
      const addr2 = o.shipping_address2 || "";
      const addrHtml = `${addr1}${addr2 ? "<br>" + addr2 : ""}<br>${city} ${postal}`;
      const fallbackParcelCount = getAutoParcelCountForOrder(o.line_items);
      const tagParcelCount =
        typeof o.parcel_count_from_tag === "number" && o.parcel_count_from_tag >= 0
          ? o.parcel_count_from_tag
          : null;
      const parcelCountFromMeta =
        typeof o.parcel_count_from_meta === "number" && o.parcel_count_from_meta >= 0
          ? o.parcel_count_from_meta
          : typeof o.parcel_count === "number" && o.parcel_count >= 0
          ? o.parcel_count
          : null;
      const parcelCountValue =
        parcelCountFromMeta != null
          ? parcelCountFromMeta
          : tagParcelCount ?? fallbackParcelCount ?? "";
      const isSelected = orderNo && dispatchSelectedOrders.has(orderNo);
      const combinedGroup = orderNo ? getCombinedGroupForOrder(orderNo) : null;
      const combinedStyle = combinedGroup ? `style="--combined-color:${combinedGroup.color}"` : "";
      const paymentState = getPaymentState(o);
      const shippedItemCount = getShippedItemCount(o);
      const hasUnfulfilledItems = (o.line_items || []).some((item) => {
        const orderedQty = Math.max(0, Number(item?.quantity) || 0);
        const itemId = item?.id != null ? String(item.id) : "";
        const fulfilledQty = itemId ? Number(fulfilledQtyByLineItemId.get(itemId) || 0) : 0;
        return Math.max(0, orderedQty - fulfilledQty) > 0;
      });

      if (orderNo) {
        dispatchOrderCache.set(orderNo, o);
      }

      return `
        <div class="dispatchCard ${isSelected ? "is-selected" : ""} ${combinedGroup ? "is-combined" : ""} dispatchCard--${paymentState}" data-order-no="${orderNo}" ${combinedStyle}>
          <div class="dispatchCardTitle">
            <span class="dispatchCardTitleText">${title}</span>
            <span class="dispatchCardMissingDot dispatchCardMissingDot--${paymentState}" aria-label="${paymentState} payment status"></span>
          </div>
          <div class="dispatchCardMeta">#${(o.name || "").replace("#", "")} · ${city} · ${displayDate}</div>
          ${
            combinedGroup
              ? `<div class="dispatchCardMeta dispatchCardMeta--combined"><span class="dispatchCombinedDot" aria-hidden="true"></span> Combined Shipment${isCombinedShipmentEnabled(combinedGroup) ? "" : " (Unlocked)"} · ${combinedGroup.orderNos.length} orders</div>`
              : ""
          }
          ${
            shippedItemCount > 0
              ? `<div class="dispatchCardMeta dispatchCardMeta--shipment">📦 ${shippedItemCount} item${
                  shippedItemCount === 1 ? "" : "s"
                } already fulfilled/shipped</div>`
              : ""
          }
          ${
            fulfillmentRows.length
              ? `<div class="dispatchCardFulfillments">${fulfillmentRows
                  .map(
                    (entry) => `<div class="dispatchCardFulfillmentMeta">${entry.label} · Tracking: ${entry.trackingText}</div>`
                  )
                  .join("")}</div>`
              : ""
          }
          <div class="dispatchCardParcel">
            <label class="dispatchParcelLabel" for="dispatchParcel-${orderNo}">Boxes</label>
            <button class="dispatchParcelAdjustBtn" type="button" data-action="decrease-box" data-order-no="${orderNo}" aria-label="Decrease box count for order ${orderNo}">−</button>
            <input
              id="dispatchParcel-${orderNo}"
              class="dispatchParcelCountInput"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              data-order-no="${orderNo}"
              data-order-id="${o.id || ""}"
              data-last-value="${parcelCountValue}"
              value="${parcelCountValue}"
              placeholder="--"
            />
            <button class="dispatchParcelAdjustBtn" type="button" data-action="increase-box" data-order-no="${orderNo}" aria-label="Increase box count for order ${orderNo}">+</button>
          </div>
          ${
            exportCartonSummary
              ? `<div class="dispatchCardMeta">Export cartons: ${exportCartonSummary.displayCartons} · Outer cartons required: ${exportCartonSummary.outerCartons}</div>`
              : ""
          }
          <div class="dispatchCardLines">${lines}</div>
          <div class="dispatchCardActions">
            ${renderDispatchActions(o, laneId, orderNo, packingState, {
              hasUnfulfilledItems,
              suppressFulfillAction: Boolean(combinedGroup && isCombinedShipmentEnabled(combinedGroup) && normalizeDispatchLaneId(laneId) === "shipping")
            })}
          </div>
        </div>`;
    };


    function getCombinedGroupFulfillmentMeta(groupOrders = []) {
      const summary = {
        hasRemainingItems: false,
        anyPacked: false
      };
      groupOrders.forEach((order) => {
        if (!order) return;
        const state = getPackingState(order);
        const fulfillmentState = getPackedFulfillmentSelection(order, state);
        if (fulfillmentState.hasRemainingItems) summary.hasRemainingItems = true;
        if (fulfillmentState.anyPacked) summary.anyPacked = true;
      });
      return summary;
    }

    function renderLaneCards(laneOrders, laneId) {
      if (!Array.isArray(laneOrders) || !laneOrders.length) return "";
      const renderedGroups = new Set();
      const chunks = [];

      laneOrders.forEach((order) => {
        const orderNo = orderNoFromName(order?.name);
        const combinedGroup = orderNo ? getCombinedGroupForOrder(orderNo) : null;
        const isShippingLane = normalizeDispatchLaneId(laneId) === "shipping";
        if (!combinedGroup || !isShippingLane) {
          chunks.push(cardHTML(order, laneId));
          return;
        }
        if (renderedGroups.has(combinedGroup.id)) return;
        renderedGroups.add(combinedGroup.id);

        const groupedOrders = laneOrders.filter((entry) => {
          const entryNo = orderNoFromName(entry?.name);
          const entryGroup = entryNo ? getCombinedGroupForOrder(entryNo) : null;
          return entryGroup?.id === combinedGroup.id;
        });
        if (groupedOrders.length < 2) {
          chunks.push(cardHTML(order, laneId));
          return;
        }

        const meta = getCombinedGroupFulfillmentMeta(groupedOrders);
        const combinedEnabled = isCombinedShipmentEnabled(combinedGroup);
        const connectorButton = `
          <div class="dispatchCombinedConnector" style="--combined-color:${combinedGroup.color}">
            <div class="dispatchCombinedConnectorLine" aria-hidden="true"></div>
            <div class="dispatchCombinedConnectorActions">
              ${
                combinedEnabled
                  ? `<button class="dispatchFulfillBtn" type="button" data-action="fulfill-shipping-combined" data-group-id="${combinedGroup.id}" ${meta.anyPacked ? "" : "disabled"}>Fulfill Combined Shipment</button>`
                  : `<span class="dispatchCombinedStateTag">Combined disabled</span>`
              }
              <button class="dispatchBoxBtn dispatchCombinedToggleBtn" type="button" data-action="toggle-combined-shipment" data-group-id="${combinedGroup.id}" aria-label="${combinedEnabled ? "Disable combined shipment" : "Enable combined shipment"}" title="${combinedEnabled ? "Disable combined shipment" : "Enable combined shipment"}">${combinedEnabled ? "🔗" : "🧩"}</button>
            </div>
          </div>`;

        const groupCards = groupedOrders
          .map((groupOrder, index) => `${index === 1 ? connectorButton : ""}${cardHTML(groupOrder, laneId)}`)
          .join("");
        chunks.push(`<div class="dispatchCombinedCluster">${groupCards}</div>`);
      });

      return chunks.join("");
    }

    renderDispatchMobileLaneControls();

    dispatchBoard.innerHTML = cols
      .map((col) => {
        const laneOrders =
          col.id === "shippingA"
            ? shippingA
            : col.id === "shippingB"
            ? shippingB
            : col.id === "export"
            ? lanes.export
            : col.id === "shippingAgent"
            ? lanes.shippingAgent
            : col.id === "deliveryA"
            ? deliveryA || []
            : col.id === "deliveryB"
            ? deliveryB || []
            : lanes[col.id] || [];
        const cards = renderLaneCards(laneOrders, col.id);
        return `
          <div class="dispatchCol" data-lane-id="${col.id}">
            <div class="dispatchColHeader">
              <span>${col.label}</span>
            </div>
            <div class="dispatchColBody">${cards || '<div class="dispatchBoardEmptyCol">No orders in this lane.</div>'}</div>
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
    applyDispatchMobileLaneFilter();
    updateDispatchSelectionSummary();
    syncDispatchRotaryFocus();
  }

  function getDispatchRotaryRows() {
    if (!dispatchBoard) return [];
    return Array.from(dispatchBoard.querySelectorAll(".dispatchPackingRow")).filter((row) => {
      const btn = row.querySelector(".dispatchPackAllBtn");
      return Boolean(btn && !btn.disabled);
    });
  }

  function dispatchRotaryKeyForRow(row) {
    const orderNo = row?.querySelector(".dispatchPackAllBtn")?.dataset?.orderNo || "";
    const itemKey = row?.dataset?.itemKey || "";
    if (!orderNo || !itemKey) return "";
    return `${orderNo}:${itemKey}`;
  }

  function dispatchRotaryKeyForLineItem(lineItem) {
    const orderNo = String(lineItem?.dataset?.orderNo || "").trim();
    const itemKey = decodeURIComponent(String(lineItem?.dataset?.itemKey || "")).trim();
    if (!orderNo || !itemKey) return "";
    return `${orderNo}:${itemKey}`;
  }

  function syncDispatchRotaryFocus({ keepKey = true, scroll = false } = {}) {
    const rows = getDispatchRotaryRows();
    if (!rows.length) {
      dispatchRotaryFocusIndex = -1;
      dispatchRotaryFocusKey = "";
      syncDispatchRotarySelectionUI(dispatchRotarySelectedKey);
      return;
    }

    let index = dispatchRotaryFocusIndex;
    if (keepKey && dispatchRotaryFocusKey) {
      const byKey = rows.findIndex((row) => dispatchRotaryKeyForRow(row) === dispatchRotaryFocusKey);
      if (byKey >= 0) index = byKey;
    }

    if (!Number.isFinite(index) || index < 0 || index >= rows.length) index = 0;

    rows.forEach((row) => row.classList.remove("is-rotary-focus"));
    const activeRow = rows[index];
    activeRow.classList.add("is-rotary-focus");
    dispatchRotaryFocusIndex = index;
    dispatchRotaryFocusKey = dispatchRotaryKeyForRow(activeRow);
    syncDispatchRotarySelectionUI(dispatchRotarySelectedKey);

    if (scroll) {
      activeRow.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }

  function syncDispatchRotarySelectionUI(selectedKey = "") {
    if (!dispatchBoard) return;
    const key = String(selectedKey || "").trim();
    dispatchBoard.querySelectorAll(".dispatchPackingRow").forEach((row) => {
      row.classList.toggle("is-rotary-selected", key && dispatchRotaryKeyForRow(row) === key);
    });
    dispatchBoard.querySelectorAll(".dispatchLineItem").forEach((lineItem) => {
      lineItem.classList.toggle("is-rotary-selected", key && dispatchRotaryKeyForLineItem(lineItem) === key);
    });
  }

  function moveDispatchRotaryFocus(step) {
    const rows = getDispatchRotaryRows();
    if (!rows.length) return;
    const previousKey = dispatchRotaryFocusKey;
    const total = rows.length;
    const safeStep = step > 0 ? 1 : -1;
    let nextIndex = Number.isFinite(dispatchRotaryFocusIndex) ? dispatchRotaryFocusIndex + safeStep : 0;
    if (nextIndex < 0) nextIndex = total - 1;
    if (nextIndex >= total) nextIndex = 0;
    dispatchRotaryFocusIndex = nextIndex;
    dispatchRotaryFocusKey = dispatchRotaryKeyForRow(rows[nextIndex]);
    syncDispatchRotaryFocus({ keepKey: true, scroll: true });
    if (dispatchRotaryFocusKey && dispatchRotaryFocusKey !== previousKey) {
      playDispatchRotaryMoveTone();
    }
  }

  async function activateDispatchRotaryFocus() {
    syncDispatchRotaryFocus({ keepKey: true, scroll: true });
    const rows = getDispatchRotaryRows();
    if (!rows.length) return false;
    const row = rows[dispatchRotaryFocusIndex] || rows[0];
    const btn = row?.querySelector(".dispatchPackAllBtn");
    if (!btn || btn.disabled) return false;
    dispatchRotaryFocusKey = dispatchRotaryKeyForRow(row);
    await handleDispatchAction(btn);
    return true;
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
        if (order) {
          order.parcel_count = data.parcelCount ?? null;
          order.parcel_count_from_meta = data.parcelCount ?? null;
        }
      }
      return true;
    } catch (err) {
      statusExplain("Failed to save parcel count.", "warn");
      appendDebug(`Parcel count update failed: ${String(err)}`);
      return false;
    }
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

  function buildShopifyTemplateInvoiceUrl({ orderName, orderNo, legacyResourceId, templateKey }) {
    const template = SHOPIFY_PRINT_TEMPLATE_CONFIG[templateKey];
    if (!template || !Number.isInteger(Number(template.multiplier))) return "";
    const templateId = String(template.templateId || "492a0907560253c5e190").trim();
    if (!templateId) return "";
    const slug = String(orderName || orderNo)
      .replace(/#/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");
    const slugPrefix = String(template.slugPrefix || templateKey || "template").trim() || "template";
    return (
      `https://flippenlekka.shop/apps/download-pdf/orders/${encodeURIComponent(templateId)}/` +
      `${legacyResourceId * Number(template.multiplier)}/${encodeURIComponent(`${slugPrefix}-${slug}`)}.pdf`
    );
  }

  async function printShopifyTemplate(order, templateKey = "deliveryNote") {
    if (!order) return false;
    const template = SHOPIFY_PRINT_TEMPLATE_CONFIG[templateKey];
    const configuredPrinterId = Number(template?.printerId);
    if (!Number.isInteger(configuredPrinterId) || configuredPrinterId <= 0) {
      appendDebug(`Print template failed for ${String(templateKey)}: missing valid printerId in config`);
      return false;
    }
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

    const orderName = String(orderData?.name || order?.name || "").trim();
    const rawLegacyId =
      orderData?.legacyResourceId ||
      orderData?.legacy_resource_id ||
      orderData?.legacy_resourceId ||
      orderData?.id ||
      "";
    const legacyResourceId = Number(String(rawLegacyId).replace(/\D/g, ""));
    if (!Number.isInteger(legacyResourceId) || legacyResourceId <= 0) {
      appendDebug(`Delivery note print failed for ${orderNo}: missing legacyResourceId`);
      return false;
    }

    const invoiceUrl = buildShopifyTemplateInvoiceUrl({
      orderName,
      orderNo,
      legacyResourceId,
      templateKey
    });
    if (!invoiceUrl) {
      appendDebug(
        `Print template failed for ${orderNo}: missing template config for ${String(templateKey)}`
      );
      return false;
    }
    const templateLabel =
      templateKey === "deliveryNote"
        ? "Delivery note"
        : templateKey === "printDocs"
        ? "Print docs"
        : "Template";
    const payload = {
      printerId: configuredPrinterId,
      title: `${templateLabel} ${orderName || `#${orderNo}`}`,
      invoiceUrl,
      usePdfUri: true,
      source: "Scan Station"
    };

    try {
      const res = await fetch(`${API_BASE}/printnode/print-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        appendDebug(`PrintNode ${templateLabel.toLowerCase()} failed for ${orderNo}: ${text}`);
        return false;
      }
      return true;
    } catch (err) {
      appendDebug(`PrintNode ${templateLabel.toLowerCase()} error for ${orderNo}: ${String(err)}`);
      return false;
    }
  }

  async function printDeliveryNote(order) {
    if (!order) return false;
    const orderNo = String(order.name || "").replace("#", "").trim();

    try {
      const payloadRes = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/delivery-qr-payload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          orderNo,
          confirmUrl: window.location.origin
        })
      });
      if (!payloadRes.ok) {
        const text = await payloadRes.text();
        appendDebug(`Delivery QR payload update failed for ${orderNo}: ${text}`);
      }
    } catch (err) {
      appendDebug(`Delivery QR payload update error for ${orderNo}: ${String(err)}`);
    }

    return printShopifyTemplate(order, "deliveryNote");
  }

  async function printDocs(order) {
    return printShopifyTemplate(order, "printDocs");
  }

  function getDispatchQueueOrderIds() {
    if (dispatchBoard) {
      const laneIdsInTraversalOrder = ["shippingAgent", "shippingA", "shippingB", "export", "pickup", "delivery", "deliveryA", "deliveryB"];
      const visited = new Set();
      const queue = [];
      laneIdsInTraversalOrder.forEach((laneId) => {
        const lane = dispatchBoard.querySelector(`.dispatchCol[data-lane-id="${laneId}"]`);
        if (!lane) return;
        lane.querySelectorAll(".dispatchCard[data-order-no]").forEach((card) => {
          const orderNo = String(card?.dataset?.orderNo || "").trim();
          if (!orderNo || visited.has(orderNo)) return;
          visited.add(orderNo);
          queue.push(orderNo);
        });
      });
      if (queue.length) return queue;
    }
    return (dispatchOrdersLatest || [])
      .map((order) => String(order?.name || "").replace("#", "").trim())
      .filter(Boolean);
  }

  function getDispatchLineItemKeysByOrderId() {
    const map = {};
    (dispatchOrdersLatest || []).forEach((order) => {
      const orderNo = String(order?.name || "").replace("#", "").trim();
      if (!orderNo) return;
      const packingState = getPackingState(order);
      map[orderNo] = Array.isArray(packingState?.items)
        ? getOrderedPackingItems(order, packingState).map((item) => String(item?.key || "").trim()).filter(Boolean)
        : [];
    });
    return map;
  }

  async function syncDispatchControllerState(mode = "dispatch") {
    try {
      const response = await fetch(`${API_BASE}/dispatch/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueOrderIds: getDispatchQueueOrderIds(),
          lineItemKeysByOrderId: getDispatchLineItemKeysByOrderId(),
          mode
        })
      });
      if (!response.ok) return;
      dispatchControllerState = await response.json();
    } catch {
      // best-effort sync only
    }
  }

  async function loadDispatchControllerState() {
    try {
      const response = await fetch(`${API_BASE}/dispatch/state`, { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const state = await response.json();
      dispatchControllerState = state;
      return state;
    } catch {
      return null;
    }
  }

  function applyIncomingDispatchControllerState(state) {
    if (!state || typeof state !== "object") return;
    dispatchControllerState = state;
    if (typeof dispatchRotaryInputEnabled !== "undefined" && !dispatchRotaryInputEnabled) {
      renderEnvironmentHeaderWidget(state.environment || null);
      renderRemoteStatusBadge(state.remote || null);
      syncDispatchSelectionUI();
      updateDashboardKpis();
      return;
    }
    const { selectedOrderChanged, selectedLineItemChanged, selectedOrderId } = applyDispatchControllerState();
    if (selectedOrderChanged) {
      refreshDispatchViews(selectedOrderId);
      syncDispatchRotaryFocus({ keepKey: true });
    } else if (selectedLineItemChanged) {
      syncDispatchRotaryFocus({ keepKey: true });
    }
    renderEnvironmentHeaderWidget(state.environment || null);
    renderRemoteStatusBadge(state.remote || null);
    syncDispatchSelectionUI();
    updateDashboardKpis();
  }

  function applyDispatchControllerState() {
    if (!dispatchControllerState) {
      return { selectedOrderChanged: false, selectedLineItemChanged: false, selectedOrderId: "" };
    }
    const previousSelectedOrderId =
      dispatchSelectedOrders.size === 1 ? String(Array.from(dispatchSelectedOrders)[0] || "").trim() : "";
    const previousRotarySelectedKey = dispatchRotarySelectedKey;
    const selectedOrderId = String(dispatchControllerState.selectedOrderId || "").trim();
    const selectedLineItemKey = String(dispatchControllerState.selectedLineItemKey || "").trim();
    if (!selectedOrderId) {
      dispatchSelectedOrders.clear();
      dispatchRotarySelectedKey = "";
      syncDispatchRotarySelectionUI(dispatchRotarySelectedKey);
      return {
        selectedOrderChanged: previousSelectedOrderId !== "",
        selectedLineItemChanged: previousRotarySelectedKey !== "",
        selectedOrderId: ""
      };
    }

    if (dispatchSelectedOrders.size !== 1 || !dispatchSelectedOrders.has(selectedOrderId)) {
      dispatchSelectedOrders.clear();
      dispatchSelectedOrders.add(selectedOrderId);
    }

    if (selectedLineItemKey) {
      dispatchRotarySelectedKey = `${selectedOrderId}:${selectedLineItemKey}`;
    } else {
      dispatchRotarySelectedKey = "";
    }

    const confirmedAt = dispatchControllerState.lastConfirmedAt;
    const confirmedOrderId = String(dispatchControllerState.lastConfirmedOrderId || "").trim();
    const confirmedLineItemKey = String(dispatchControllerState.lastConfirmedLineItemKey || "").trim();
    if (confirmedAt && confirmedAt !== dispatchLastHandledConfirmAt && confirmedOrderId) {
      dispatchLastHandledConfirmAt = confirmedAt;
      if (confirmedLineItemKey) {
        toggleDispatchLineItemPacked(confirmedOrderId, confirmedLineItemKey);
      } else if (dispatchOrderCache.has(confirmedOrderId)) {
        openDispatchOrderModal(confirmedOrderId);
      }
    }

    const printRequestedAt = dispatchControllerState.lastPrintRequestedAt;
    const printOrderId = String(dispatchControllerState.lastPrintRequestedOrderId || "").trim();
    if (printRequestedAt && printRequestedAt !== dispatchLastHandledPrintRequestAt && printOrderId) {
      dispatchLastHandledPrintRequestAt = printRequestedAt;
      const printAction = dispatchBoard?.querySelector(`[data-action="print-note"][data-order-no="${printOrderId}"]`);
      if (printAction) void handleDispatchAction(printAction);
    }

    const fulfillRequestedAt = dispatchControllerState.lastFulfillRequestedAt;
    const fulfillOrderId = String(dispatchControllerState.lastFulfillRequestedOrderId || "").trim();
    if (fulfillRequestedAt && fulfillRequestedAt !== dispatchLastHandledFulfillRequestAt && fulfillOrderId) {
      dispatchLastHandledFulfillRequestAt = fulfillRequestedAt;
      const fulfillAction = dispatchBoard?.querySelector(`[data-action="fulfill-shipping"][data-order-no="${fulfillOrderId}"]`);
      if (fulfillAction) void handleDispatchAction(fulfillAction);
    }

    const promptState = typeof dispatchPackedQtyPromptState === "undefined" ? null : dispatchPackedQtyPromptState;
    if (promptState) {
      promptState.close();
    }

    const packedQtyCommittedAt = dispatchControllerState.lastPackedQtyCommittedAt;
    const packedQtyCommittedLineItemKey = String(dispatchControllerState.lastPackedQtyCommittedLineItemKey || "").trim();
    if (
      packedQtyCommittedAt &&
      packedQtyCommittedAt !== applyDispatchControllerState.lastHandledPackedQtyCommitAt &&
      selectedOrderId &&
      packedQtyCommittedLineItemKey
    ) {
      applyDispatchControllerState.lastHandledPackedQtyCommitAt = packedQtyCommittedAt;
      const committedQty = Number(dispatchControllerState.lastPackedQtyCommittedQty);
      if (Number.isFinite(committedQty)) {
        const activePromptState = typeof dispatchPackedQtyPromptState === "undefined" ? null : dispatchPackedQtyPromptState;
        if (
          activePromptState &&
          activePromptState.orderNo === selectedOrderId &&
          activePromptState.itemKey === packedQtyCommittedLineItemKey
        ) {
          activePromptState.commit(committedQty);
        } else {
          setDispatchLinePackedQuantity(selectedOrderId, packedQtyCommittedLineItemKey, committedQty);
        }
      }
    }

    return {
      selectedOrderChanged: previousSelectedOrderId !== selectedOrderId,
      selectedLineItemChanged: previousRotarySelectedKey !== dispatchRotarySelectedKey,
      selectedOrderId
    };
  }

  function syncDispatchSelectionUI() {
    if (!dispatchBoard) return;

    dispatchBoard.querySelectorAll(".dispatchCard[data-order-no]").forEach((card) => {
      const orderNo = String(card.dataset.orderNo || "").trim();
      const checked = Boolean(orderNo && dispatchSelectedOrders.has(orderNo));
      card.classList.toggle("is-selected", checked);
    });

    updateDispatchSelectionSummary();
  }

  async function pollDispatchControllerSelection() {
    if (dispatchControllerPollInFlight) return;
    if (document.hidden) return;
    const isDispatchViewActive = document.querySelector(".flView.flView--active")?.id === "viewDispatch";
    if (!isDispatchViewActive) return;

    dispatchControllerPollInFlight = true;
    try {
      const state = await loadDispatchControllerState();
      if (!state) return;
      applyIncomingDispatchControllerState(state);
    } finally {
      dispatchControllerPollInFlight = false;
    }
  }

  function scheduleDispatchEventsReconnect() {
    if (dispatchEventsReconnectTimer) return;
    dispatchEventsReconnectTimer = setTimeout(() => {
      dispatchEventsReconnectTimer = null;
      initDispatchControllerEvents();
    }, Number(CONFIG.DISPATCH_EVENTS_RECONNECT_DELAY_MS) || 2000);
  }

  function initDispatchControllerEvents() {
    if (typeof window.EventSource !== "function") return;
    if (dispatchEventSource) {
      dispatchEventSource.close();
      dispatchEventSource = null;
    }

    const source = new EventSource(`${API_BASE}/dispatch/events`);
    dispatchEventSource = source;

    const handleMessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || "{}"));
        const state = payload?.state || payload;
        applyIncomingDispatchControllerState(state);
      } catch {
        // ignore malformed SSE payloads
      }
    };

    source.addEventListener("ready", handleMessage);
    source.addEventListener("state-change", handleMessage);
    source.addEventListener("environment-update", (event) => {
      try {
        const payload = JSON.parse(String(event.data || "{}"));
        renderEnvironmentHeaderWidget(payload.environment || null);
      } catch {
        // ignore malformed payload
      }
    });
    source.addEventListener("remote-status", (event) => {
      try {
        const payload = JSON.parse(String(event.data || "{}"));
        renderRemoteStatusBadge(payload.remote || null);
      } catch {
        // ignore malformed payload
      }
    });
    source.onmessage = handleMessage;
    source.onerror = () => {
      source.close();
      if (dispatchEventSource === source) {
        dispatchEventSource = null;
      }
      scheduleDispatchEventsReconnect();
    };
  }

  async function refreshDispatchData() {
    try {
      const [ordersRes, fulfilledRes, shipmentsRes] = await Promise.all([
        fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/open`),
        fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/fulfilled/recent`),
        fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/shipments/recent`)
      ]);
      const data = ordersRes.ok ? await ordersRes.json() : { orders: [] };
      const fulfilledData = fulfilledRes.ok ? await fulfilledRes.json() : { orders: [] };
      const shipmentsData = shipmentsRes.ok ? await shipmentsRes.json() : { shipments: [] };
      dispatchOrdersLatest = Array.isArray(data)
        ? data
        : Array.isArray(data?.orders)
        ? data.orders
        : [];
      dispatchFulfilledLatest = Array.isArray(fulfilledData?.orders) ? fulfilledData.orders : [];
      dispatchShipmentsLatest = shipmentsData.shipments || [];

      const incomingOrders = [];
      const nextKnownOrderNos = new Set();
      dispatchOrdersLatest.forEach((order) => {
        const orderNo = String(order?.name || "").replace("#", "").trim();
        if (!orderNo) return;
        nextKnownOrderNos.add(orderNo);
        if (!dispatchKnownOrderNos.has(orderNo)) incomingOrders.push(order);
      });
      dispatchKnownOrderNos = nextKnownOrderNos;
      if (dispatchVoicePrimed) incomingOrders.slice(0, 3).forEach((order) => announceIncomingOrder(order));
      dispatchVoicePrimed = true;

      const isDispatchViewActive = document.querySelector(".flView.flView--active")?.id === "viewDispatch";
      await syncDispatchControllerState(isDispatchViewActive ? "dispatch" : "idle");
      const state = await loadDispatchControllerState();
      renderDispatchBoard(dispatchOrdersLatest);
      renderDispatchRecentlyShipped(dispatchFulfilledLatest);
      applyIncomingDispatchControllerState(state || dispatchControllerState);
      if (dispatchStamp) dispatchStamp.textContent = "Updated " + new Date().toLocaleTimeString();
      renderDateTimeHeaderWidget();
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

  function switchMainView(view) {
    const showScan = view === "scan";
    const showOps = view === "ops";
    const showDocs = view === "docs";
    const showFlowcharts = view === "flowcharts";
    const showFlocs = view === "flocs";
    const showStock = view === "stock";
    const showPriceManager = view === "price-manager";
    const showDispatchSettings = view === "dispatch-settings";
    const showLogs = view === "logs";
    const showAdmin = view === "admin";
    const showChangelog = view === "changelog";

    if (viewScan) {
      viewScan.hidden = !showScan;
      viewScan.classList.toggle("flView--active", showScan);
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
    if (viewDispatchSettings) {
      viewDispatchSettings.hidden = !showDispatchSettings;
      viewDispatchSettings.classList.toggle("flView--active", showDispatchSettings);
    }
    if (viewLogs) {
      viewLogs.hidden = !showLogs;
      viewLogs.classList.toggle("flView--active", showLogs);
    }
    if (viewAdmin) {
      viewAdmin.hidden = !showAdmin;
      viewAdmin.classList.toggle("flView--active", showAdmin);
    }
    if (viewChangelog) {
      viewChangelog.hidden = !showChangelog;
      viewChangelog.classList.toggle("flView--active", showChangelog);
    }

    navScan?.classList.toggle("flNavBtn--active", showScan);
    navOps?.classList.toggle("flNavBtn--active", showOps);
    navDocs?.classList.toggle("flNavBtn--active", showDocs);
    navFlowcharts?.classList.toggle("flNavBtn--active", showFlowcharts);
    navFlocs?.classList.toggle("flNavBtn--active", showFlocs);
    navStock?.classList.toggle("flNavBtn--active", showStock);
    navPriceManager?.classList.toggle("flNavBtn--active", showPriceManager);
    navDispatchSettings?.classList.toggle("flNavBtn--active", showDispatchSettings);
    navLogs?.classList.toggle("flNavBtn--active", showLogs);
    navFooterAdmin?.classList.toggle("flNavBtn--active", showAdmin);
    navFooterChangelog?.classList.toggle("flNavBtn--active", showChangelog);
    navScan?.setAttribute("aria-selected", showScan ? "true" : "false");
    navOps?.setAttribute("aria-selected", showOps ? "true" : "false");
    navDocs?.setAttribute("aria-selected", showDocs ? "true" : "false");
    navFlowcharts?.setAttribute("aria-selected", showFlowcharts ? "true" : "false");
    navFlocs?.setAttribute("aria-selected", showFlocs ? "true" : "false");
    navStock?.setAttribute("aria-selected", showStock ? "true" : "false");
    navPriceManager?.setAttribute("aria-selected", showPriceManager ? "true" : "false");
    navDispatchSettings?.setAttribute("aria-selected", showDispatchSettings ? "true" : "false");
    navLogs?.setAttribute("aria-selected", showLogs ? "true" : "false");
    navFooterAdmin?.setAttribute("aria-selected", showAdmin ? "true" : "false");
    navFooterChangelog?.setAttribute("aria-selected", showChangelog ? "true" : "false");

    if (showScan) {
      statusExplain("Orders view ready.", "info");
      // intentionally avoid forcing scan input focus
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
    } else if (showDispatchSettings) {
      statusExplain("Dispatch settings loaded.", "info");
    } else if (showLogs) {
      statusExplain("Logs view loaded.", "info");
    } else if (showAdmin) {
      statusExplain("Admin workspace loaded.", "info");
    } else if (showChangelog) {
      statusExplain("Changelog opened.", "info");
    } else {
      statusExplain("Viewing orders / ops dashboard", "info");
    }

    updateDispatchSelectionSidebarVisibility(showScan);
  }

  const ROUTE_VIEW_MAP = new Map([
    ["/", "scan"],
    ["/scan", "scan"],
    ["/deliver", "scan"],
    ["/ops", "scan"],
    ["/docs", "docs"],
    ["/flowcharts", "flowcharts"],
    ["/flocs", "flocs"],
    ["/stock", "stock"],
    ["/price-manager", "price-manager"],
    ["/dispatch-settings", "dispatch-settings"],
    ["/logs", "logs"],
    ["/admin", "admin"],
    ["/changelog", "changelog"]
  ]);

  const VIEW_ROUTE_MAP = {
    scan: "/",
    ops: "/",
    docs: "/docs",
    flowcharts: "/flowcharts",
    flocs: "/flocs",
    stock: "/stock",
    "price-manager": "/price-manager",
    "dispatch-settings": "/dispatch-settings",
    logs: "/logs",
    admin: "/admin",
    changelog: "/changelog"
  };

  const docsState = {
    initialized: false,
    loadingTopic: false,
    topics: [],
    activeSlug: null,
    markdownCache: new Map()
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderInlineMarkdown(line) {
    return escapeHtml(line).replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    const html = [];
    let inCode = false;
    let inList = false;

    const closeList = () => {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      if (line.startsWith("```")) {
        closeList();
        if (!inCode) {
          inCode = true;
          html.push("<pre><code>");
        } else {
          inCode = false;
          html.push("</code></pre>");
        }
        continue;
      }

      if (inCode) {
        html.push(`${escapeHtml(rawLine)}\n`);
        continue;
      }

      if (!line) {
        closeList();
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length, 3);
        html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        if (!inList) {
          inList = true;
          html.push("<ul>");
        }
        html.push(`<li>${renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>`);
        continue;
      }

      closeList();
      html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }

    closeList();
    if (inCode) html.push("</code></pre>");
    return html.join("\n");
  }

  function slugFromTitle(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function buildDocsSubnav() {
    if (!docsSubnav || !docsContent) return;
    const headings = Array.from(docsContent.querySelectorAll("h1, h2, h3"));
    if (!headings.length) {
      docsSubnav.innerHTML = '<p class="docsEmpty">No section headings for this document.</p>';
      return;
    }

    docsSubnav.innerHTML = '<h4 class="docsSubnavTitle">On this page</h4>';
    headings.forEach((heading, idx) => {
      const id = `${slugFromTitle(heading.textContent)}-${idx}`;
      heading.id = id;
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = heading.textContent || `Section ${idx + 1}`;
      docsSubnav.appendChild(link);
    });
  }

  function renderDocsTopics() {
    if (!docsTopics) return;
    docsTopics.innerHTML = "";
    docsState.topics.forEach((topic) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "docsTopicBtn";
      if (topic.slug === docsState.activeSlug) btn.classList.add("docsTopicBtn--active");
      btn.dataset.slug = topic.slug;
      btn.innerHTML = `${escapeHtml(topic.title)}<small>${escapeHtml(topic.description || "")}</small>`;
      btn.addEventListener("click", () => loadDocsTopic(topic.slug));
      docsTopics.appendChild(btn);
    });
  }

  async function loadDocsTopic(slug) {
    if (!slug || docsState.loadingTopic || !docsContent) return;
    docsState.loadingTopic = true;
    docsState.activeSlug = slug;
    renderDocsTopics();
    docsContent.innerHTML = '<p class="docsEmpty">Loading document…</p>';

    try {
      let markdown = docsState.markdownCache.get(slug);
      if (!markdown) {
        const res = await fetch(`${API_BASE}/docs/${encodeURIComponent(slug)}`, {
          headers: { Accept: "application/json" }
        });
        if (!res.ok) throw new Error(`Document fetch failed: ${res.status}`);
        const payload = await res.json();
        markdown = String(payload.markdown || "");
        docsState.markdownCache.set(slug, markdown);
      }

      docsContent.innerHTML = markdownToHtml(markdown);
      buildDocsSubnav();
    } catch (error) {
      docsContent.innerHTML = `<p class="docsEmpty">${escapeHtml(error.message || "Unable to load document")}</p>`;
      if (docsSubnav) docsSubnav.innerHTML = '<p class="docsEmpty">Unable to build sub-navigation.</p>';
    } finally {
      docsState.loadingTopic = false;
      renderDocsTopics();
    }
  }

  async function initDocsView() {
    if (docsState.initialized) return;
    docsState.initialized = true;

    if (docsTopics) {
      docsTopics.innerHTML = '<p class="docsEmpty">Loading docs topics…</p>';
    }

    try {
      const res = await fetch(`${API_BASE}/docs`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`Docs index fetch failed: ${res.status}`);
      const payload = await res.json();
      docsState.topics = Array.isArray(payload.topics) ? payload.topics : [];

      if (!docsState.topics.length) {
        if (docsTopics) docsTopics.innerHTML = '<p class="docsEmpty">No docs were found.</p>';
        if (docsContent) docsContent.innerHTML = '<p class="docsEmpty">No docs content available.</p>';
        if (docsSubnav) docsSubnav.innerHTML = '<p class="docsEmpty">No section headings available.</p>';
        return;
      }

      const defaultSlug = docsState.topics[0].slug;
      await loadDocsTopic(defaultSlug);
    } catch (error) {
      if (docsTopics) docsTopics.innerHTML = `<p class="docsEmpty">${escapeHtml(error.message || "Failed to load docs")}</p>`;
      if (docsContent) docsContent.innerHTML = '<p class="docsEmpty">Documentation is currently unavailable.</p>';
      if (docsSubnav) docsSubnav.innerHTML = '<p class="docsEmpty">Sub-navigation unavailable.</p>';
    }
  }

  const viewInitializers = {
    flocs: initFlocsView,
    stock: initStockView,
    docs: initDocsView,
    "price-manager": initPriceManagerView
  };

  function normalizePath(path) {
    if (!path) return "/";
    let cleaned = path.split("?")[0].split("#")[0];
    cleaned = cleaned.replace(/\/index\.html$/, "");
    return cleaned.replace(/\/+$/, "") || "/";
  }

  function viewForPath(path) {
    return ROUTE_VIEW_MAP.get(normalizePath(path)) || "scan";
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

  const setDispatchRotaryInputEnabled = (enabled, { notify = true } = {}) => {
    dispatchRotaryInputEnabled = Boolean(enabled);
    if (notify) {
      statusExplain(
        dispatchRotaryInputEnabled
          ? "Rotary controller enabled."
          : "Rotary controller disabled. Manual order selection stays active.",
        "info"
      );
    }
  };

  setDispatchRotaryInputEnabled(true, { notify: false });

  const ADMIN_UNLOCKED_KEY = "fl_admin_unlocked";
  const applyAdminMenuVisibility = (visible) => {
    if (navFlowcharts) navFlowcharts.hidden = !visible;
    if (navPriceManager) navPriceManager.hidden = !visible;
    if (navDispatchSettings) navDispatchSettings.hidden = !visible;
    if (navLogs) navLogs.hidden = !visible;

    if (!visible) {
      const activeView = document.querySelector(".flView.flView--active")?.id;
      const nonCoreViews = new Set(["viewDocs", "viewFlowcharts", "viewPriceManager", "viewDispatchSettings", "viewLogs"]);
      if (activeView && nonCoreViews.has(activeView)) {
        switchMainView("scan");
      }
    }
  };
  applyAdminMenuVisibility(localStorage.getItem(ADMIN_UNLOCKED_KEY) === "true");

  document.addEventListener("keydown", async (e) => {
    const key = String(e.key || "");
    const activeView = document.querySelector(".flView.flView--active")?.id;
    const target = e.target;
    const targetTag = String(target?.tagName || "").toLowerCase();
    const inEditable =
      targetTag === "input" ||
      targetTag === "textarea" ||
      targetTag === "select" ||
      Boolean(target?.isContentEditable);

    if (activeView === "viewScan" && !inEditable && dispatchRotaryInputEnabled) {
      if (key === "ArrowDown") {
        e.preventDefault();
        moveDispatchRotaryFocus(1);
        return;
      }
      if (key === "ArrowUp") {
        e.preventDefault();
        moveDispatchRotaryFocus(-1);
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        await activateDispatchRotaryFocus();
        return;
      }
    }

    if (e.shiftKey && e.altKey && String(e.key || "").toLowerCase() === "a") {
      const nowVisible = navDispatchSettings?.hidden !== true;
      const next = !nowVisible;
      applyAdminMenuVisibility(next);
      localStorage.setItem(ADMIN_UNLOCKED_KEY, String(next));
      statusExplain(next ? "Admin menu unlocked." : "Admin menu hidden.", "info");
    }
  });

  const DISPATCH_NOTES_KEY = "fl_dispatch_notes";
  const DISPATCH_NOTES_COLLAPSED_KEY = "fl_dispatch_notes_collapsed";
  if (dispatchNotesInput) {
    dispatchNotesInput.value = localStorage.getItem(DISPATCH_NOTES_KEY) || "";
    dispatchNotesInput.addEventListener("input", () => {
      localStorage.setItem(DISPATCH_NOTES_KEY, dispatchNotesInput.value || "");
      if (adminLogsPreview) adminLogsPreview.textContent = dispatchNotesInput.value || "";
    });
  }
  const setDispatchNotesCollapsed = (collapsed) => {
    if (dispatchNotesInput) dispatchNotesInput.hidden = collapsed;
    if (dispatchNotesClose) dispatchNotesClose.textContent = collapsed ? "Open" : "Close";
    localStorage.setItem(DISPATCH_NOTES_COLLAPSED_KEY, String(collapsed));
  };
  if (dispatchNotesBar) {
    setDispatchNotesCollapsed(localStorage.getItem(DISPATCH_NOTES_COLLAPSED_KEY) === "true");
  }
  dispatchNotesClose?.addEventListener("click", () => {
    const collapsed = dispatchNotesInput?.hidden === true;
    setDispatchNotesCollapsed(!collapsed);
  });

  scanInput?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const code = scanInput.value.trim();
      scanInput.value = "";
      if (!code) return;
      if (/^FLSS-PICKUP-/i.test(code)) {
        await handleCollectionScan(code);
        return;
      }
      if (/^\d{3}$/.test(code)) {
        const fallbackOrderNo = String(dispatchModalOrderNo || activeOrderNo || "").replace(/[^0-9A-Za-z]/g, "");
        if (!fallbackOrderNo) {
          statusExplain("Scan order barcode first, then enter the 3-digit PIN.", "warn");
          showSiteAlert({
            title: "PIN needs an order",
            tone: "warn",
            message: "Scan the pickup barcode first (or select/open an order) before entering a 3-digit PIN."
          });
          return;
        }
        await handleCollectionScan(`${fallbackOrderNo}${code}`);
        return;
      }
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
    setBookingOverlayVisible(false);
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

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const clickable = target.closest('button, [role="button"], a, input[type="checkbox"], input[type="radio"], .btn');
    if (!clickable) return;
    playUiClickTone();
  }, { capture: true });

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

  multiShipmentBtn?.addEventListener("click", async () => {
    const selectedDeliveryOrderNos = getSelectedDeliveryOrderNos();
    if (selectedDeliveryOrderNos.length < 2) {
      statusExplain("Select at least 2 delivery orders to create a multi-shipment.", "warn");
      return;
    }
    await createCombinedShipmentFromSelection(selectedDeliveryOrderNos);
  });

  function getSelectedDeliveryOrderNos() {
    return Array.from(dispatchSelectedOrders).filter((orderNo) => {
      const order = dispatchOrderCache.get(orderNo);
      return laneFromOrder(order) === "delivery";
    });
  }

  function updateMultiShipmentButtonVisibility() {
    if (!multiShipmentBtn) return;
    const selectedDeliveryOrderCount = getSelectedDeliveryOrderNos().length;
    const canCreateMultiShipment = selectedDeliveryOrderCount > 1;
    multiShipmentBtn.hidden = !canCreateMultiShipment;
    multiShipmentBtn.disabled = !canCreateMultiShipment;
    multiShipmentBtn.title = canCreateMultiShipment
      ? `Create multi-shipment (${selectedDeliveryOrderCount} delivery orders selected)`
      : "Select at least 2 delivery orders to create a multi-shipment";
  }

  dispatchPrepareDeliveries?.addEventListener("click", async () => {
    const orders = getSelectedDeliveryOrderNos()
      .map((orderNo) => dispatchOrderCache.get(orderNo))
      .filter(Boolean);
    if (!orders.length) {
      statusExplain("Select at least 1 delivery order to prepare.", "warn");
      return;
    }

    let prepared = 0;
    let failed = 0;
    for (const order of orders) {
      const orderNo = orderNoFromName(order.name);
      const docsPrinted = await printDocs(order);
      const notePrinted = await printDeliveryNote(order);
      if (docsPrinted && notePrinted) {
        prepared += 1;
        printedDeliveryNotes.add(orderNo);
      } else {
        failed += 1;
      }
    }

    refreshDispatchViews();
    clearDispatchSelection();

    if (!prepared) {
      statusExplain("Prepare deliveries failed. Some docs did not print.", "warn");
      return;
    }

    if (failed) {
      statusExplain(`Prepared ${prepared} delivery orders (${failed} failed).`, "warn");
      return;
    }

    statusExplain(`Prepared ${prepared} delivery orders.`, "ok");
  });

  truckBookBtn?.addEventListener("click", async () => {
    if (!dailyParcelCount) {
      statusExplain("No parcels counted for today yet.", "warn");
      return;
    }
    if (truckBooked) {
      const confirmReset = await showSiteConfirm({
        title: "Reset truck booking",
        message: "Mark truck collection as not booked?",
        tone: "warn",
        confirmLabel: "Mark not booked",
        cancelLabel: "Keep booked",
        confirmStyle: "danger"
      });
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
    if (actionType === "toggle-docs") return true;
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
    if (actionType === "toggle-combined-shipment") {
      const groupId = action.dataset.groupId;
      const group = groupId ? combinedShipments.get(groupId) : null;
      if (!group?.id) return true;
      if (combinedShipmentDisabled.has(group.id)) {
        combinedShipmentDisabled.delete(group.id);
        statusExplain(`Combined shipment enabled for ${group.orderNos.length} orders.`, "ok");
      } else {
        combinedShipmentDisabled.add(group.id);
        statusExplain(`Combined shipment disabled for ${group.orderNos.length} orders.`, "warn");
      }
      renderDispatchBoard(dispatchOrdersLatest);
      return true;
    }

    if (actionType === "fulfill-shipping-combined") {
      const groupId = action.dataset.groupId;
      const group = groupId ? combinedShipments.get(groupId) : null;
      if (!group?.orderNos?.length || !isCombinedShipmentEnabled(group)) {
        statusExplain("Combined shipment group unavailable.", "warn");
        return true;
      }
      const groupOrders = group.orderNos
        .map((candidate) => ({ orderNo: candidate, order: dispatchOrderCache.get(candidate) }))
        .filter((entry) => entry.order?.id);
      if (groupOrders.length < 2) {
        statusExplain("Combined shipment group unavailable.", "warn");
        return true;
      }
      const anyPacked = groupOrders.some((entry) => getPackedFulfillmentSelection(entry.order, getPackingState(entry.order)).anyPacked);
      if (!anyPacked) {
        statusExplain("Mark at least one packed line item before fulfilling.", "warn");
        return true;
      }
      const bookingParcelCount = groupOrders.reduce((sum, entry) => {
        const state = getPackingState(entry.order);
        return sum + (getParcelCountForDispatchOrder(entry.order, state) || 0);
      }, 0);
      if (!bookingParcelCount) {
        statusExplain("Parcel count is required to book combined shipment.", "warn");
        return true;
      }
      const rootOrderNo = groupOrders[0].orderNo;
      await startOrder(rootOrderNo);
      orderDetails.manualParcelCount = bookingParcelCount;
      groupOrders.slice(1).forEach((entry) => {
        const details = mapOrderToDispatchDetails(entry.order);
        details.manualParcelCount = getParcelCountForDispatchOrder(entry.order, getPackingState(entry.order));
        linkedOrders.set(entry.orderNo, details);
      });
      renderSessionUI();
      const bundleOrders = [{ orderNo: rootOrderNo, details: orderDetails }].concat(
        groupOrders.slice(1).map((entry) => ({ orderNo: entry.orderNo, details: linkedOrders.get(entry.orderNo) }))
      );
      await doBookingNow({
        manual: true,
        parcelCount: bookingParcelCount,
        bundleOrders
      });
      return true;
    }
    if (actionType === "fulfill-shipping") {
      if (!orderNo) return true;
      const proceedFulfill = await showSiteConfirm({
        title: `Fulfill order ${orderNo}`,
        message: `Proceed with fulfillment for order ${orderNo}?`,
        tone: "warn",
        confirmLabel: "Proceed",
        cancelLabel: "Cancel",
        confirmStyle: "primary"
      });
      if (!proceedFulfill) return true;
      const order = dispatchOrderCache.get(orderNo);
      if (!order?.id) {
        statusExplain("Fulfill unavailable for this order.", "warn");
        return true;
      }
      const packingState = getPackingState(order);
      const fulfillmentState = getPackedFulfillmentSelection(order, packingState);
      if (!fulfillmentState.anyPacked || !fulfillmentState.selectedLineItems.length) {
        statusExplain("Mark at least one packed line item before fulfilling.", "warn");
        return true;
      }

      const isSplitFulfillment = !fulfillmentState.allRemainingPacked;
      if (isSplitFulfillment) {
        const proceed = await showSiteConfirm({
          title: "Split fulfillment warning",
          message:
            `Not all line items are marked packed for order ${orderNo}. ` +
            "Continuing will create a split fulfillment for only the packed items.",
          tone: "warn",
          confirmLabel: "Create split fulfillment",
          cancelLabel: "Review packed items",
          confirmStyle: "danger"
        });
        if (!proceed) return true;
      }

      const combinedGroup = getCombinedGroupForOrder(orderNo);
      const groupedOrderNos = isCombinedShipmentEnabled(combinedGroup) && combinedGroup?.orderNos?.length
        ? combinedGroup.orderNos.filter((candidate) => {
            const candidateOrder = dispatchOrderCache.get(candidate);
            return candidateOrder && laneFromOrder(candidateOrder) !== "pickup";
          })
        : [orderNo];
      const targetOrderNos = groupedOrderNos.length ? groupedOrderNos : [orderNo];
      const targetOrders = targetOrderNos
        .map((candidate) => ({ orderNo: candidate, order: dispatchOrderCache.get(candidate) }))
        .filter((entry) => entry.order?.id);
      if (!targetOrders.length) {
        statusExplain("Fulfill unavailable for this order.", "warn");
        return true;
      }

      const bookingParcelCount = targetOrders.reduce((sum, entry) => {
        const state = getPackingState(entry.order);
        return sum + (getParcelCountForDispatchOrder(entry.order, state) || 0);
      }, 0);

      if (!bookingParcelCount) {
        statusExplain(`Parcel count is required to book shipment for ${orderNo}.`, "warn");
        logDispatchEvent(`Booking blocked for ${orderNo}: parcel count missing.`);
        return true;
      }

      const selectedWeightKg = isSplitFulfillment
        ? getSelectedFulfillmentWeightKg(order, fulfillmentState.selectedLineItems)
        : null;

      const rootOrderNo = targetOrders[0].orderNo;
      await startOrder(rootOrderNo);
      orderDetails.manualParcelCount = bookingParcelCount;
      targetOrders.slice(1).forEach((entry) => {
        const details = mapOrderToDispatchDetails(entry.order);
        details.manualParcelCount = getParcelCountForDispatchOrder(entry.order, getPackingState(entry.order));
        linkedOrders.set(entry.orderNo, details);
      });
      renderSessionUI();
      const bundleOrders = [{ orderNo: rootOrderNo, details: orderDetails }].concat(
        targetOrders.slice(1).map((entry) => ({ orderNo: entry.orderNo, details: linkedOrders.get(entry.orderNo) }))
      );
      await doBookingNow({
        manual: true,
        parcelCount: bookingParcelCount,
        keepOnBoard: isSplitFulfillment,
        weightKg: selectedWeightKg,
        bundleOrders,
        selectedLineItemsByOrder: isSplitFulfillment ? { [orderNo]: fulfillmentState.selectedLineItems } : null
      });
      return true;
    }
    if (actionType === "prepare-delivery") {
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("Prepare delivery unavailable.", "warn");
        return true;
      }
      setDispatchProgress(4, `Preparing delivery ${orderNo}`);
      logDispatchEvent(`Preparing delivery docs for order ${orderNo}.`);
      const docsPrinted = await printDocs(order);
      const notePrinted = await printDeliveryNote(order);
      if (!docsPrinted || !notePrinted) {
        statusExplain("Prepare delivery failed. Some docs did not print.", "warn");
        logDispatchEvent(`Prepare delivery failed for order ${orderNo}.`);
        return true;
      }
      printedDeliveryNotes.add(orderNo);
      await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, tag: "delivery_prepared" })
      }).catch(() => null);
      const cached = dispatchOrderCache.get(orderNo);
      if (cached) cached.tags = `${cached.tags || ""}, delivery_prepared`;
      statusExplain(`Delivery prepared for ${orderNo}.`, "ok");
      logDispatchEvent(`Delivery prepared for order ${orderNo}.`);
      refreshDispatchViews(orderNo);
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
    if (actionType === "print-box") {
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("Docs print unavailable.", "warn");
        logDispatchEvent("Docs print failed: order not found.");
        return true;
      }
      setDispatchProgress(4, `Printing docs ${orderNo}`);
      logDispatchEvent(`Printing docs for order ${orderNo}.`);
      const ok = await printDocs(order);
      if (!ok) {
        statusExplain("Docs print failed.", "warn");
        logDispatchEvent("Docs print failed to send to PrintNode.");
        return true;
      }
      statusExplain(`Docs printed for ${orderNo}.`, "ok");
      return true;
    }

    if (actionType === "print-shipping-doc") {
      const docKey = action.dataset.docKey;
      const selectedDoc = SHIPPING_DOC_OPTIONS.find((doc) => doc.key === docKey);
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order || !selectedDoc) {
        statusExplain("Shipping doc print unavailable.", "warn");
        return true;
      }
      setDispatchProgress(4, `Printing ${selectedDoc.label} ${orderNo}`);
      logDispatchEvent(`Printing ${selectedDoc.label} for order ${orderNo}.`);
      const ok = await printShopifyTemplate(order, docKey);
      if (!ok) {
        statusExplain(`${selectedDoc.label} print failed.`, "warn");
        return true;
      }
      statusExplain(`${selectedDoc.label} printed for ${orderNo}.`, "ok");
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
        statusExplain("Delivery note print failed.", "warn");
        logDispatchEvent("Delivery note failed to send to PrintNode.");
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
    if (actionType === "release-pickup") {
      await releasePickupOrder(orderNo);
      return true;
    }
    return false;
  }

  async function saveDispatchParcelInput(input) {
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
  }

  dispatchBoard?.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]");
    if (action) {
      if (action.dataset.action === "increase-box" || action.dataset.action === "decrease-box") {
        const orderNo = action.dataset.orderNo;
        const input = orderNo
          ? dispatchBoard.querySelector(`.dispatchParcelCountInput[data-order-no="${orderNo}"]`)
          : null;
        if (!input) return;
        const current = Number.parseInt(input.value, 10);
        const safeCurrent = Number.isFinite(current) && current >= 0 ? current : 0;
        const next = action.dataset.action === "increase-box" ? safeCurrent + 1 : Math.max(0, safeCurrent - 1);
        input.value = String(next);
        input.focus();
        await saveDispatchParcelInput(input);
        return;
      }
      const handled = await handleDispatchAction(action);
      if (handled) return;
    }
    const shipmentRow = e.target.closest(".dispatchShipmentRow");
    if (shipmentRow && !shipmentRow.classList.contains("dispatchShipmentRow--header")) {
      const shipmentKeyId = shipmentRow.dataset.shipmentKey;
      if (shipmentKeyId) {
        const shipment = dispatchShipmentCache.get(shipmentKeyId);
        if (shipment?.tracking_number) {
          navigator.clipboard?.writeText(String(shipment.tracking_number)).catch(() => null);
          const trackingUrl = shipment.tracking_url || `https://www.swegroup.co.za/?s=${encodeURIComponent(shipment.tracking_number)}`;
          window.open(trackingUrl, "_blank", "noopener,noreferrer");
          return;
        }
        await openDispatchShipmentModal(shipmentKeyId);
        return;
      }
    }
    const lineItem = e.target.closest(".dispatchLineItem");
    if (lineItem) {
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest("label")) return;
      const orderNo = lineItem.dataset.orderNo;
      const itemKey = lineItem.dataset.itemKey ? decodeURIComponent(lineItem.dataset.itemKey) : "";
      toggleDispatchLineItemPacked(orderNo, itemKey);
      return;
    }

    const card = e.target.closest(".dispatchCard");
    if (card && !e.target.closest("button") && !e.target.closest("input") && !e.target.closest("label")) {
      const orderNo = String(card.dataset.orderNo || "").trim();
      if (!orderNo) return;
      const isMultiToggle = e.ctrlKey || e.metaKey;
      if (isMultiToggle) {
        if (dispatchSelectedOrders.has(orderNo)) dispatchSelectedOrders.delete(orderNo);
        else dispatchSelectedOrders.add(orderNo);
      } else {
        dispatchSelectedOrders.clear();
        dispatchSelectedOrders.add(orderNo);
      }
      syncDispatchSelectionUI();
      const input = card.querySelector(".dispatchParcelCountInput");
      if (input) {
        input.focus();
        input.select();
      }
    }
  });

  dispatchBoard?.addEventListener("dblclick", (e) => {
    const card = e.target.closest(".dispatchCard");
    if (!card || e.target.closest("button") || e.target.closest("input") || e.target.closest("label")) {
      return;
    }
    const orderNo = card.dataset.orderNo;
    if (orderNo) openDispatchOrderModal(orderNo);
  });

  loadDispatchSelectionSidebarPreference();
  setDispatchSelectionSidebarOpen(dispatchSelectionSidebarOpen, { persist: false });

  dispatchSelectionSidebarToggle?.addEventListener("click", () => {
    const wasOpen = dispatchSelectionSidebarOpen;
    toggleDispatchSelectionSidebar({ focusPanel: !wasOpen, focusToggle: wasOpen });
    updateDispatchSelectionSummary();
  });

  dispatchSelectionSidebarToggle?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (event.key === "ArrowLeft" && dispatchSelectionSidebarOpen) {
      setDispatchSelectionSidebarOpen(false, { focusToggle: true });
      updateDispatchSelectionSummary();
      return;
    }
    if (event.key === "ArrowRight" && !dispatchSelectionSidebarOpen) {
      setDispatchSelectionSidebarOpen(true, { focusPanel: true });
      updateDispatchSelectionSummary();
    }
  });

  dispatchSelectionClear?.addEventListener("click", () => {
    clearDispatchSelection();
  });

  dispatchMobileLaneTabs?.addEventListener("click", (e) => {
    const button = e.target.closest("button[data-mobile-lane]");
    if (!button) return;
    const lane = button.dataset.mobileLane;
    if (!lane || dispatchMobileLane === lane) return;
    dispatchMobileLane = lane;
    renderDispatchMobileLaneControls();
    applyDispatchMobileLaneFilter();
  });

  window.addEventListener("resize", () => {
    applyDispatchMobileLaneFilter();
  });

  dispatchBoard?.addEventListener("focusout", async (e) => {
    const input = e.target.closest(".dispatchParcelCountInput");
    if (!input) return;
    await saveDispatchParcelInput(input);
  });

  dispatchShipmentsSidebar?.addEventListener("click", async (e) => {
    const priorityButton = e.target.closest('[data-action="set-priority"]');
    if (priorityButton) {
      await handleDispatchAction(priorityButton);
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


  let scanStationNext = null;
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
    loadDispatchPriorityState();
    loadModePreference();
    loadDailyParcelCount();
    loadTruckBooking();
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
    refreshDispatchData();
    initDispatchControllerEvents();
    setInterval(refreshDispatchData, CONFIG.DISPATCH_POLL_INTERVAL_MS);
    setInterval(pollDispatchControllerSelection, CONFIG.DISPATCH_CONTROLLER_FALLBACK_POLL_INTERVAL_MS);
    refreshServerStatus();
    setInterval(refreshServerStatus, CONFIG.SERVER_STATUS_POLL_INTERVAL_MS);
    renderDateTimeHeaderWidget();
    setInterval(renderDateTimeHeaderWidget, 1000);
    renderModuleDashboard();

    const currentPath = normalizePath(window.location.pathname);
    if (currentPath === "/deliver") {
      const params = new URLSearchParams(window.location.search || "");
      const code = params.get("code") || "";
      if (code) {
        const result = await handleDeliveryScan(code);
        if (result?.outcome === "confirmed") {
          document.body.innerHTML = '<div style="font-family:system-ui;padding:24px">✅ Delivery confirmed. Thanks driver — this stop has been completed and you can close this page.</div>';
          setTimeout(() => window.close(), 1200);
          return;
        }
        if (result?.outcome === "already-confirmed") {
          document.body.innerHTML = '<div style="font-family:system-ui;padding:24px">ℹ️ This delivery was already confirmed earlier. No further action is needed — you can close this page.</div>';
          setTimeout(() => window.close(), 1200);
          return;
        }
        if (result?.outcome === "invalid-code") {
          document.body.innerHTML = '<div style="font-family:system-ui;padding:24px">❌ Invalid or expired delivery code. Please rescan the latest QR code or contact dispatch for a new confirmation link.</div>';
          return;
        }
      }
      document.body.innerHTML = '<div style="font-family:system-ui;padding:24px">⚠️ Delivery confirmation could not be completed. Please try again or contact dispatch.</div>';
      return;
    }

    renderRoute(window.location.pathname);
    scanStationNext = initScanStationNext({ scanInput });

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
