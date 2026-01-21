(() => {
  "use strict";

  const CONFIG = {
    COST_ALERT_THRESHOLD: 250.0,
    BOOKING_IDLE_MS: 6000,
    TRUCK_ALERT_THRESHOLD: 25,
    BOX_DIM: { dim1: 40, dim2: 40, dim3: 30, massKg: 5 },
    ORIGIN: {
      origpers: "Flippen Lekka Holdings (Pty) Ltd",
      origperadd1: "7 Papawer Street",
      origperadd2: "Blomtuin, Bellville",
      origperadd3: "Cape Town, Western Cape",
      origperadd4: "ZA",
      origperpcode: "7530",
      origtown: "Cape Town",
      origplace: 4663,
      origpercontact: "Louis",
      origperphone: "0730451885",
      origpercell: "0730451885",
      notifyorigpers: 1,
      origperemail: "admin@flippenlekkaspices.co.za",
      notes: "Louis 0730451885 / Michael 0783556277"
    },
    PP_ENDPOINT: "/pp",
    SHOPIFY: { PROXY_BASE: "/shopify" },
    PROGRESS_STEP_DELAY_MS: 450
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
  const addrSearch = $("addrSearch");
  const addrResults = $("addrResults");
  const placeCodeInput = $("placeCode");
  const serviceSelect = $("serviceOverride");
  const truckBookBtn = $("truckBookBtn");
  const truckStatus = $("truckStatus");
  const truckParcelCount = $("truckParcelCount");

  const dispatchBoard = $("dispatchBoardGrid");
  const dispatchStamp = $("dispatchStamp");
  const dispatchProgressBar = $("dispatchProgressBar");
  const dispatchProgressFill = $("dispatchProgressFill");
  const dispatchProgressSteps = $("dispatchProgressSteps");
  const dispatchProgressLabel = $("dispatchProgressLabel");
  const dispatchLog = $("dispatchLog");
  const scanProgressBar = $("scanProgressBar");
  const scanProgressFill = $("scanProgressFill");
  const scanProgressSteps = $("scanProgressSteps");
  const scanProgressLabel = $("scanProgressLabel");
  const scanDispatchLog = $("scanDispatchLog");

  const navScan = $("navScan");
  const navOps = $("navOps");
  const navDocs = $("navDocs");
  const viewScan = $("viewScan");
  const viewOps = $("viewOps");
  const viewDocs = $("viewDocs");
  const actionFlash = $("actionFlash");
  const emergencyStopBtn = $("emergencyStop");

  const btnBookNow = $("btnBookNow");
  const modeToggle = $("modeToggle");

  const MAX_ORDER_AGE_HOURS = 180;

  let activeOrderNo = null;
  let orderDetails = null;
  let parcelsForOrder = new Set();
  let armedForBooking = false;
  let lastScanAt = null;
  let lastScanCode = null;

  let placeCodeOverride = null;
  let serviceOverride = "RFX";
  let addressBook = [];
  let bookedOrders = new Set();
  let isAutoMode = true;
  const dispatchOrderCache = new Map();
  const dispatchPackingState = new Map();
  let dispatchOrdersLatest = [];
  const DAILY_PARCEL_KEY = "fl_daily_parcel_count_v1";
  const TRUCK_BOOKING_KEY = "fl_truck_booking_v1";
  let dailyParcelCount = 0;
  let truckBooked = false;
  let truckBookedAt = null;
  let truckBookedBy = null;
  let truckBookingInFlight = false;
  const DISPATCH_STEPS = [
    "Start",
    "Quote",
    "Service",
    "Book",
    "Print",
    "Booked",
    "Notify"
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
      label: String(box?.label || `BOX ${index + 1}`),
      items: box?.items && typeof box.items === "object" ? { ...box.items } : {}
    }));
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
        state.boxes.push({ label: "BOX 1", items: {} });
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
      const resp = await fetch("/alerts/book-truck", {
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

  // Only for untagged orders
  if (!activeOrderNo || !orderDetails) return;
  if (isBooked(activeOrderNo)) return;
  if (hasParcelCountTag(orderDetails)) return;

  // Need at least 1 scan
  if (parcelsForOrder.size <= 0) return;

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
    if (parcelsForOrder.size <= 0) return;

    // Use scanned count as the parcel count (avoid prompt)
    orderDetails.manualParcelCount = parcelsForOrder.size;

    renderSessionUI();
    updateBookNowButton();

    statusExplain(`No tag. Auto-booking ${parcelsForOrder.size} parcels...`, "ok");
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
    if (!activeOrderNo || !details || isBooked(activeOrderNo)) return false;
    if (!isAutoMode) return true;
    return !hasParcelCountTag(details);
  }

  function updateBookNowButton() {
    if (!btnBookNow) return;
    const show = shouldShowBookNow(orderDetails);
    btnBookNow.hidden = !show;
    btnBookNow.disabled = !show;

    if (!show) return;
    const scanned = parcelsForOrder.size;
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
    if (parcelsForOrder.size > 0) return Array.from(parcelsForOrder).sort((a, b) => a - b);
    return [];
  }

  function renderSessionUI() {
    if (uiOrderNo) uiOrderNo.textContent = activeOrderNo || "--";

    const expected = getExpectedParcelCount(orderDetails || {});
    const idxs = getParcelIndexesForCurrentOrder(orderDetails || {});
    if (uiParcelCount) uiParcelCount.textContent = String(idxs.length);
    if (uiExpectedCount) uiExpectedCount.textContent = expected ? String(expected) : "--";

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
    if (uiParcelSource) uiParcelSource.textContent = parcelSource;

    const sessionMode = !activeOrderNo
      ? "Waiting"
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
      const missing =
        expected && expected > 0
          ? Array.from({ length: expected }, (_, i) => i + 1).filter((i) => !parcelsForOrder.has(i))
          : [];
      const scannedLine = idxs.length ? `Scanned: ${idxs.length}${expected ? ` / ${expected}` : ""}` : "Scanned: 0";
      const missingLine =
        expected && missing.length ? `Missing: ${missing.length} (${missing.join(", ")})` : expected ? "Missing: 0" : "Missing: --";
      const lastScanLine = lastScanAt ? `Last scan: ${new Date(lastScanAt).toLocaleTimeString()} (${lastScanCode || "n/a"})` : "Last scan: --";
      const listLine = idxs.length ? `Scanned IDs: ${idxs.join(", ")}` : "Scanned IDs: --";
      parcelList.textContent = `${scannedLine}\n${missingLine}\n${lastScanLine}\n${listLine}${tagInfo}${manualInfo}`;
    }

    if (parcelNumbers) {
      if (!activeOrderNo) {
        parcelNumbers.innerHTML = `<div class="parcelNumbersEmpty">Scan an order to show parcel numbers.</div>`;
      } else if (expected && expected > 0) {
        const tiles = Array.from({ length: expected }, (_, i) => {
          const num = i + 1;
          const isScanned = parcelsForOrder.has(num);
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
Email: ${orderDetails.email || ""}`.trim();
    }

    if (expected && parcelsForOrder.size) {
      statusExplain(
        `Scanning ${parcelsForOrder.size}/${expected} parcels`,
        parcelsForOrder.size === expected ? "ok" : "info"
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
        const res = await fetch(`/pp/place?q=${encodeURIComponent(q)}`);
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
      reference: `Order ${activeOrderNo}`
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
    if (!activeOrderNo || !orderDetails || armedForBooking) return;

    if (isBooked(activeOrderNo)) {
      statusExplain(`Order ${activeOrderNo} already booked — blocked.`, "warn");
      logDispatchEvent(`Booking blocked: order ${activeOrderNo} already booked.`);
      return;
    }

    const manual = !!opts.manual;
    const overrideCount = Number(opts.parcelCount || 0);

    let expected = getExpectedParcelCount(orderDetails);

    if (manual) {
      if (!overrideCount || overrideCount < 1) {
        statusExplain("Scan parcels first.", "warn");
        return;
      }
      expected = overrideCount;
      orderDetails.manualParcelCount = expected;
      renderSessionUI();
    } else {
      if (!expected) {
        const n = promptManualParcelCount(activeOrderNo);
        if (!n) {
          statusExplain("Parcel count required (cancelled).", "warn");
          return;
        }
        orderDetails.manualParcelCount = n;
        expected = n;
        renderSessionUI();
      }

      if (parcelsForOrder.size !== expected) {
        statusExplain(`Cannot book — scanned ${parcelsForOrder.size}/${expected}.`, "warn");
        return;
      }
    }

    const parcelIndexes = Array.from({ length: expected }, (_, i) => i + 1);

    armedForBooking = true;
    appendDebug("Booking order " + activeOrderNo + " parcels=" + parcelIndexes.join(", "));
    await stepDispatchProgress(0, `Booking ${activeOrderNo}`);
    logDispatchEvent(`Booking started for order ${activeOrderNo}.`);

    const missing = [];
    ["name", "address1", "city", "province", "postal"].forEach((k) => {
      if (!orderDetails[k]) missing.push(k);
    });

    const payload = buildParcelPerfectPayload(orderDetails, expected);
    if (!payload.details.destplace) missing.push("destplace (place code)");

    if (missing.length) {
      statusExplain("Quote failed", "err");
      setDispatchProgress(0, "Missing data");
      logDispatchEvent(`Booking halted: missing ${missing.join(", ")}.`);
      if (bookingSummary) {
        bookingSummary.textContent = `Cannot request quote — missing: ${missing.join(", ")}\n\nShip To:\n${JSON.stringify(orderDetails, null, 2)}`;
      }
      armedForBooking = false;
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
      return;
    }

    const { quoteno, rates } = extractQuoteFromV28(quoteRes.data || {});
    if (!quoteno) {
      statusExplain("Quote failed", "err");
      setDispatchProgress(1, "Quote failed");
      logDispatchEvent("Quote failed: no quote number returned.");
      if (bookingSummary) bookingSummary.textContent = `No quote number.\n${JSON.stringify(quoteRes.data, null, 2)}`;
      armedForBooking = false;
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
      params: { quoteno, service: pickedService, reference: String(activeOrderNo) }
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
        await fetch("/printnode/print", {
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
          await fetch("/printnode/print", {
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
              Service: ${pickedService} • Parcels: ${expected}
            </div>
          </div>`;
      }
      if (printMount) printMount.innerHTML = "";
    } else {
      await stepDispatchProgress(4, "Printing labels");
      logDispatchEvent("Printing labels locally.");
      const labels = parcelIndexes.map((idx) => renderLabelHTML(waybillNo, pickedService, quoteCost, orderDetails, idx, expected));
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
    if (statusChip) statusChip.textContent = "Booked";
    if (bookingSummary) {
      bookingSummary.textContent = `WAYBILL: ${waybillNo}
Service: ${pickedService}
Parcels: ${expected}
Estimated Cost: ${money(quoteCost)}

${usedPdf ? "Label + waybill generated by ParcelPerfect (PDF)." : "Using local HTML label layout."}

Raw:
${JSON.stringify(cr, null, 2)}`;
    }

    const fulfillOk = await fulfillOnShopify(orderDetails, waybillNo);
    if (fulfillOk) {
      await stepDispatchProgress(6, `Notified • ${waybillNo}`);
      logDispatchEvent(`Customer notified with tracking ${waybillNo}.`);
    } else {
      setDispatchProgress(6, "Notify failed");
      logDispatchEvent(`Customer notification failed for ${waybillNo}.`);
    }

    markBooked(activeOrderNo);
    updateDailyParcelCount(expected);
    resetSession();
  }

function resetSession() {
  cancelAutoBookTimer();

  activeOrderNo = null;
  orderDetails = null;
  parcelsForOrder = new Set();
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
  parcelsForOrder = new Set();
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
    return;
  }

  if (isBooked(parsed.orderNo)) {
    statusExplain(`Order ${parsed.orderNo} already booked — blocked.`, "warn");
    return;
  }

  if (!activeOrderNo) {
    await startOrder(parsed.orderNo);
} else if (parsed.orderNo !== activeOrderNo) {
  cancelAutoBookTimer(); // ADD THIS
  statusExplain(`Different order scanned (${parsed.orderNo}). Press CLEAR to reset.`, "warn");
  return;
}


  parcelsForOrder.add(parsed.parcelSeq);
  lastScanAt = Date.now();
  lastScanCode = code;
  armedForBooking = false;

  const expected = getExpectedParcelCount(orderDetails);

  // TAGGED: auto-book immediately on first scan
  if (isAutoMode && hasParcelCountTag(orderDetails) && expected) {
    cancelAutoBookTimer();

    parcelsForOrder = new Set(Array.from({ length: expected }, (_, i) => i + 1));
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

  function renderDispatchBoard(orders) {
    if (!dispatchBoard) return;

    const now = Date.now();
    const maxAgeMs = MAX_ORDER_AGE_HOURS * 60 * 60 * 1000;
    dispatchOrderCache.clear();
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
      { id: "delivery", label: "Delivery" },
      { id: "shipping", label: "Shipping" },
      { id: "pickup", label: "Pickup" }
    ];
    const lanes = Object.fromEntries(cols.map((col) => [col.id, []]));

    const laneFromOrder = (order) => {
      const tags = String(order.tags || "").toLowerCase();
      const shippingTitles = (order.shipping_lines || [])
        .map((line) => String(line.title || "").toLowerCase())
        .join(" ");
      const combined = `${tags} ${shippingTitles}`.trim();
      if (/(warehouse|collect|collection|click\s*&\s*collect)/.test(combined)) return "pickup";
      if (/(local delivery|same\s*day)/.test(combined)) return "delivery";
      return "shipping";
    };

    list.forEach((o) => {
      const laneId = laneFromOrder(o);
      (lanes[laneId] || lanes.shipping).push(o);
    });

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

    const cardHTML = (o, laneId) => {
      const title = o.customer_name || o.name || `Order ${o.id}`;
      const city = o.shipping_city || "";
      const postal = o.shipping_postal || "";
      const created = o.created_at ? new Date(o.created_at).toLocaleTimeString() : "";
      const orderNo = String(o.name || "").replace("#", "").trim();
      const packingState = getPackingState(o);
      if (orderNo) activeOrders.add(orderNo);
      const lines = (o.line_items || [])
        .map((item, index) => ({ ...item, __index: index }))
        .sort((a, b) => {
          const aKey = String(a.title || "").trim().toLowerCase();
          const bKey = String(b.title || "").trim().toLowerCase();
          const aIndex =
            lineItemOrderIndex.get(aKey) ?? Number.POSITIVE_INFINITY;
          const bIndex =
            lineItemOrderIndex.get(bKey) ?? Number.POSITIVE_INFINITY;
          if (aIndex !== bIndex) return aIndex - bIndex;
          return String(a.sku || "").localeCompare(String(b.sku || ""), undefined, {
            numeric: true,
            sensitivity: "base"
          });
        })
        .slice(0, 6)
        .map((li) => {
          const baseTitle = li.title || "";
          const variantTitle = (li.variant_title || "").trim();
          const hasVariant = variantTitle && variantTitle.toLowerCase() !== "default title";
          const abbrevKey = baseTitle.trim().toLowerCase();
          const abbreviation = lineItemAbbreviations[abbrevKey];
          const sizeLabel = hasVariant ? variantTitle : "";
          const shortLabel = abbreviation === ""
            ? (sizeLabel || baseTitle)
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
      const addr1 = o.shipping_address1 || "";
      const addr2 = o.shipping_address2 || "";
      const addrHtml = `${addr1}${addr2 ? "<br>" + addr2 : ""}<br>${city} ${postal}`;

      if (orderNo) {
        dispatchOrderCache.set(orderNo, o);
      }

      const packBtnLabel = packingState?.active ? "Continue packing" : "Start packing";
      const packBtnDisabled = !orderNo || !(packingState?.items?.length > 0);
      const packingPanel = packingState
        ? `
          <div class="dispatchPackingPanel ${packingState.active ? "is-active" : ""}" data-order-no="${orderNo}">
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
                <input class="dispatchParcelInput" type="text" placeholder="Scan parcel sticker" data-order-no="${orderNo}" />
                <button class="dispatchParcelAddBtn" type="button" data-action="add-parcel" data-order-no="${orderNo}">Add parcel</button>
                <button class="dispatchParcelBoxBtn" type="button" data-action="add-box" data-order-no="${orderNo}">Add box</button>
              </div>
              <div class="dispatchParcelList">
                ${
                  packingState.parcels.length
                    ? packingState.parcels.map((code) => `<span>${code}</span>`).join("")
                    : `<span class="dispatchParcelEmpty">No parcels scanned yet.</span>`
                }
              </div>
              <div class="dispatchPackingControls">
                <span class="dispatchPackingCount">Parcels scanned: ${packingState.parcels.length}</span>
                <button class="dispatchFinishPackingBtn" type="button" data-action="finish-packing" data-order-no="${orderNo}" ${packingState.endTime ? "disabled" : ""}>
                  ${packingState.endTime ? "Packing finished" : "Finish packing"}
                </button>
              </div>
            </div>
          </div>
        `
        : "";

      const actionBtn = laneId === "delivery"
        ? orderNo
          ? `<button class="dispatchNoteBtn" type="button" data-action="print-note" data-order-no="${orderNo}">Print delivery note</button>`
          : `<button class="dispatchNoteBtn" type="button" disabled>Print delivery note</button>`
        : orderNo
        ? `<button class="dispatchBookBtn" type="button" data-order-no="${orderNo}">Book Now</button>`
        : `<button class="dispatchBookBtn" type="button" disabled>Book Now</button>`;

      return `
        <div class="dispatchCard">
          <div class="dispatchCardTitle"><span>${title}</span></div>
          <div class="dispatchCardMeta">#${(o.name || "").replace("#", "")} · ${city} · ${created}</div>
         
          <div class="dispatchCardLines">${lines}</div>
          <div class="dispatchCardActions">
            <button class="dispatchPackBtn" type="button" data-action="start-packing" data-order-no="${orderNo}" ${packBtnDisabled ? "disabled" : ""}>
              ${packBtnLabel}
            </button>
            ${actionBtn}
          </div>
          ${packingPanel}
        </div>`;
    };

    dispatchBoard.innerHTML = cols
      .map((col) => {
        const cards = lanes[col.id]
          .map((order) => cardHTML(order, col.id))
          .join("") || `<div class="dispatchBoardEmptyCol">No ${col.label.toLowerCase()} orders.</div>`;
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
      const res = await fetch(`${CONFIG.SHOPIFY.PROXY_BASE}/orders/open`);
      const data = await res.json();
      dispatchOrdersLatest = data.orders || [];
      renderDispatchBoard(dispatchOrdersLatest);
      if (dispatchStamp) dispatchStamp.textContent = "Updated " + new Date().toLocaleTimeString();
    } catch (e) {
      appendDebug("Dispatch refresh failed: " + String(e));
      if (dispatchBoard) dispatchBoard.innerHTML = `<div class="dispatchBoardEmpty">Error loading orders.</div>`;
      if (dispatchStamp) dispatchStamp.textContent = "Dispatch: error";
    }
  }

  function switchMainView(view) {
    const showScan = view === "scan";
    const showDocs = view === "docs";

    if (viewScan) {
      viewScan.hidden = !showScan;
      viewScan.classList.toggle("flView--active", showScan);
    }
    if (viewOps) {
      viewOps.hidden = showScan || showDocs;
      viewOps.classList.toggle("flView--active", !showScan && !showDocs);
    }
    if (viewDocs) {
      viewDocs.hidden = !showDocs;
      viewDocs.classList.toggle("flView--active", showDocs);
    }

    navScan?.classList.toggle("flNavBtn--active", showScan);
    navOps?.classList.toggle("flNavBtn--active", !showScan && !showDocs);
    navDocs?.classList.toggle("flNavBtn--active", showDocs);
    navScan?.setAttribute("aria-selected", showScan ? "true" : "false");
    navOps?.setAttribute("aria-selected", !showScan && !showDocs ? "true" : "false");
    navDocs?.setAttribute("aria-selected", showDocs ? "true" : "false");

    if (showScan) {
      statusExplain("Ready to scan orders…", "info");
      scanInput?.focus();
    } else if (showDocs) {
      statusExplain("Viewing operator documentation", "info");
    } else {
      statusExplain("Viewing orders / ops dashboard", "info");
    }
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
      if (parcelsForOrder.size <= 0) {
        statusExplain("Scan parcels first.", "warn");
        return;
      }
      await doBookingNow({ manual: true, parcelCount: parcelsForOrder.size });
      return;
    }

    if (hasParcelCountTag(orderDetails)) {
      statusExplain("This order has a parcel_count tag — it auto-books on first scan.", "warn");
      return;
    }

    // Use scanned count as default to avoid prompt if you want:
    if (!getExpectedParcelCount(orderDetails) && parcelsForOrder.size > 0) {
      orderDetails.manualParcelCount = parcelsForOrder.size;
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
    switchMainView("scan");
  });

  navScan?.addEventListener("click", () => switchMainView("scan"));
  navOps?.addEventListener("click", () => switchMainView("ops"));
  navDocs?.addEventListener("click", () => switchMainView("docs"));

  modeToggle?.addEventListener("click", () => {
    isAutoMode = !isAutoMode;
    cancelAutoBookTimer();
    saveModePreference();
    updateModeToggle();
    renderSessionUI();
    statusExplain(isAutoMode ? "Auto mode enabled." : "Manual mode enabled.", "info");
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

  dispatchBoard?.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]");
    if (action) {
      const actionType = action.dataset.action;
      const orderNo = action.dataset.orderNo;
      if (actionType === "start-packing") {
        if (!orderNo) return;
        const order = dispatchOrderCache.get(orderNo);
        if (!order) return;
        const state = getPackingState(order);
        if (!state) return;
        if (!state.startTime) {
          state.startTime = new Date().toISOString();
          logDispatchEvent(`Packing started for order ${orderNo}.`);
        }
        state.active = true;
        savePackingState();
        renderDispatchBoard(dispatchOrdersLatest);
        return;
      }
      if (actionType === "pack-all") {
        if (!orderNo) return;
        const state = dispatchPackingState.get(orderNo);
        if (!state) return;
        if (!state.startTime) state.startTime = new Date().toISOString();
        const itemKey = action.dataset.itemKey;
        const item = getPackingItem(state, itemKey);
        if (!item) return;
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
        renderDispatchBoard(dispatchOrdersLatest);
        return;
      }
      if (actionType === "pack-qty") {
        if (!orderNo) return;
        const state = dispatchPackingState.get(orderNo);
        if (!state) return;
        if (!state.startTime) state.startTime = new Date().toISOString();
        const itemKey = action.dataset.itemKey;
        const item = getPackingItem(state, itemKey);
        if (!item) return;
        const row = action.closest(".dispatchPackingRow");
        const input = row?.querySelector(".dispatchPackingQty");
        const remaining = Math.max(0, item.quantity - item.packed);
        const requested = input ? Number(input.value) : 0;
        const qty = Math.max(0, Math.min(remaining, requested));
        if (!qty) return;
        allocatePackedToBox(state, item.key, qty);
        item.packed += qty;
        if (input) input.value = "";
        if (isPackingComplete(state)) {
          finalizePacking(state);
        } else {
          savePackingState();
        }
        renderDispatchBoard(dispatchOrdersLatest);
        return;
      }
      if (actionType === "add-parcel") {
        if (!orderNo) return;
        const state = dispatchPackingState.get(orderNo);
        if (!state) return;
        if (!state.startTime) state.startTime = new Date().toISOString();
        const card = action.closest(".dispatchCard");
        const input = card?.querySelector(".dispatchParcelInput");
        const code = input?.value?.trim();
        if (!code) return;
        state.parcels.push(code);
        if (input) input.value = "";
        logDispatchEvent(`Parcel sticker scanned for order ${orderNo}: ${code}.`);
        savePackingState();
        renderDispatchBoard(dispatchOrdersLatest);
        return;
      }
      if (actionType === "add-box") {
        if (!orderNo) return;
        const state = dispatchPackingState.get(orderNo);
        if (!state) return;
        if (!state.startTime) state.startTime = new Date().toISOString();
        if (!Array.isArray(state.boxes)) state.boxes = [];
        const label = `BOX ${state.boxes.length + 1}`;
        const box = { label, items: {} };
        if (!state.boxes.length) {
          box.items = snapshotPackedItems(state);
        }
        state.boxes.push(box);
        state.activeBoxIndex = state.boxes.length - 1;
        state.parcels.push(label);
        logDispatchEvent(`Box added for order ${orderNo}: ${label}.`);
        savePackingState();
        renderDispatchBoard(dispatchOrdersLatest);
        return;
      }
      if (actionType === "finish-packing") {
        if (!orderNo) return;
        const state = dispatchPackingState.get(orderNo);
        if (!state) return;
        if (!state.startTime) state.startTime = new Date().toISOString();
        finalizePacking(state);
        renderDispatchBoard(dispatchOrdersLatest);
        return;
      }
    }

    const noteBtn = e.target.closest(".dispatchNoteBtn");
    if (noteBtn) {
      const orderNo = noteBtn.dataset.orderNo;
      const order = orderNo ? dispatchOrderCache.get(orderNo) : null;
      if (!orderNo || !order) {
        statusExplain("Delivery note unavailable.", "warn");
        logDispatchEvent("Delivery note failed: order not found.");
        return;
      }
      setDispatchProgress(4, `Printing note ${orderNo}`);
      logDispatchEvent(`Printing delivery note for order ${orderNo}.`);
      const ok = printDeliveryNote(order);
      if (!ok) {
        statusExplain("Pop-up blocked for delivery note.", "warn");
        logDispatchEvent("Delivery note blocked by popup settings.");
        return;
      }
      statusExplain(`Delivery note printed for ${orderNo}.`, "ok");
      return;
    }

    const btn = e.target.closest(".dispatchBookBtn");
    if (!btn) return;
    const orderNo = btn.dataset.orderNo;
    if (!orderNo) return;

    if (isBooked(orderNo)) {
      statusExplain(`Order ${orderNo} already booked — blocked.`, "warn");
      return;
    }

    const count = promptManualParcelCount(orderNo);
    if (!count) {
      statusExplain("Parcel count required (cancelled).", "warn");
      return;
    }

    await startOrder(orderNo);
    orderDetails.manualParcelCount = count;
    renderSessionUI();
    await doBookingNow({ manual: true, parcelCount: count });
  });

  dispatchBoard?.addEventListener("keydown", (e) => {
    const input = e.target.closest(".dispatchParcelInput");
    if (!input || e.key !== "Enter") return;
    const orderNo = input.dataset.orderNo;
    if (!orderNo) return;
    const state = dispatchPackingState.get(orderNo);
    if (!state) return;
    if (!state.startTime) state.startTime = new Date().toISOString();
    const code = input.value.trim();
    if (!code) return;
    state.parcels.push(code);
    input.value = "";
    logDispatchEvent(`Parcel sticker scanned for order ${orderNo}: ${code}.`);
    savePackingState();
    renderDispatchBoard(dispatchOrdersLatest);
  });

  loadBookedOrders();
  loadPackingState();
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
  setInterval(refreshDispatchData, 30000);
  switchMainView("scan");

  if (location.protocol === "file:") {
    alert("Open via http://localhost/... (not file://). Run a local server.");
  }

  window.__fl = window.__fl || {};
  window.__fl.bookNow = doBookingNow;
})();
