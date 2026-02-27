const SCAN_SESSION_KEY = "flScanStation.session.v1";
const SCAN_PREFERENCES_KEY = "flScanStation.preferences.v1";
const SCAN_EVENT_LOG_KEY = "flScanStation.eventLog.v1";

const DEFAULT_PREFERENCES = {
  commandPrefix: ":",
  quickActionsEnabled: true,
  suggestionWindow: 8,
  maxSessionEvents: 300,
  duplicateWindowMs: 90_000,
  allowPartialBarcodeSearch: true,
  idleTimeoutMs: 5 * 60 * 1000,
  toastDurationMs: 2200,
  scannerSound: "none",
  autoFocusInput: true,
  includeManualNotesInExports: true,
  hotkeysEnabled: true
};

const DEFAULT_STATE = {
  activeOrderId: "",
  activeShipmentId: "",
  activeRoute: "",
  mode: "dispatch",
  stagedBarcodes: [],
  scanCountsByBarcode: {},
  scanCountsByOrderId: {},
  scanCountsByShipmentId: {},
  duplicateBarcodes: {},
  notesByBarcode: {},
  annotations: [],
  pendingActions: [],
  activeFilters: {
    status: "all",
    flaggedOnly: false,
    searchTerm: ""
  },
  timestamps: {
    startedAt: 0,
    lastScanAt: 0,
    lastActionAt: 0,
    idleSince: 0
  },
  ui: {
    inspectorOpen: false,
    paletteOpen: false,
    timelineCollapsed: false,
    compactMode: false,
    pinToTop: true
  }
};

const dedupeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const clamp = (value, min, max) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
};

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const now = () => Date.now();

const readText = (id, fallback = "—") => {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const text = dedupeText(el.textContent || "");
  return text || fallback;
};

const readActiveOrderSnapshot = () => ({
  orderNo: readText("uiOrderNo"),
  customer: readText("uiCustomerName"),
  weight: readText("uiOrderWeight"),
  parcelCount: readText("uiParcelCount"),
  expectedCount: readText("uiExpectedCount")
});

const createEmitter = () => {
  const listeners = new Map();

  const on = (eventName, cb) => {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set());
    }
    listeners.get(eventName).add(cb);
    return () => off(eventName, cb);
  };

  const off = (eventName, cb) => {
    const bucket = listeners.get(eventName);
    if (!bucket) return;
    bucket.delete(cb);
    if (bucket.size === 0) {
      listeners.delete(eventName);
    }
  };

  const emit = (eventName, payload) => {
    const bucket = listeners.get(eventName);
    if (!bucket) return;
    for (const cb of bucket) {
      cb(payload);
    }
  };

  return { on, off, emit };
};

const storage = {
  loadPreferences() {
    if (typeof localStorage === "undefined") return { ...DEFAULT_PREFERENCES };
    const raw = localStorage.getItem(SCAN_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = safeJsonParse(raw, {});
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      suggestionWindow: clamp(parsed.suggestionWindow, 3, 25),
      maxSessionEvents: clamp(parsed.maxSessionEvents, 30, 5000),
      duplicateWindowMs: clamp(parsed.duplicateWindowMs, 1500, 20 * 60 * 1000),
      idleTimeoutMs: clamp(parsed.idleTimeoutMs, 30_000, 60 * 60 * 1000),
      toastDurationMs: clamp(parsed.toastDurationMs, 500, 12_000)
    };
  },

  savePreferences(preferences) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SCAN_PREFERENCES_KEY, JSON.stringify(preferences));
  },

  loadState() {
    if (typeof localStorage === "undefined") {
      return { ...DEFAULT_STATE, timestamps: { ...DEFAULT_STATE.timestamps, startedAt: now() } };
    }
    const raw = localStorage.getItem(SCAN_SESSION_KEY);
    if (!raw) {
      return { ...DEFAULT_STATE, timestamps: { ...DEFAULT_STATE.timestamps, startedAt: now() } };
    }
    const parsed = safeJsonParse(raw, {});
    return {
      ...DEFAULT_STATE,
      ...parsed,
      activeFilters: {
        ...DEFAULT_STATE.activeFilters,
        ...(parsed.activeFilters || {})
      },
      timestamps: {
        ...DEFAULT_STATE.timestamps,
        ...(parsed.timestamps || {})
      },
      ui: {
        ...DEFAULT_STATE.ui,
        ...(parsed.ui || {})
      }
    };
  },

  saveState(state) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SCAN_SESSION_KEY, JSON.stringify(state));
  },

  loadEventLog() {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(SCAN_EVENT_LOG_KEY);
    return raw ? safeJsonParse(raw, []) : [];
  },

  saveEventLog(events) {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SCAN_EVENT_LOG_KEY, JSON.stringify(events));
  }
};

const scanParsers = {
  normalizeBarcode(input) {
    const raw = dedupeText(input);
    if (!raw) return "";
    const digits = raw.replace(/[^0-9A-Za-z\-]/g, "");
    return digits.toUpperCase();
  },

  parseCommand(input, commandPrefix = DEFAULT_PREFERENCES.commandPrefix) {
    const normalized = dedupeText(input);
    if (!normalized.startsWith(commandPrefix)) return null;
    const payload = normalized.slice(commandPrefix.length).trim();
    if (!payload) return { action: "help", args: [] };
    const [actionRaw, ...args] = payload.split(/\s+/);
    return {
      action: String(actionRaw || "").toLowerCase(),
      args
    };
  },

  inferEntityType(code) {
    if (!code) return "unknown";
    if (/^ORD\d+$/i.test(code)) return "order";
    if (/^SHP\d+$/i.test(code)) return "shipment";
    if (/^RT\d+$/i.test(code)) return "route";
    if (/^[0-9]{10,18}$/.test(code)) return "parcel";
    if (/^[A-Z]{2}[0-9]{8,}$/.test(code)) return "tracking";
    return "barcode";
  }
};

const metricUtils = {
  incrementCounter(map, key, amount = 1) {
    if (!key) return map;
    const next = { ...map };
    next[key] = Number(next[key] || 0) + amount;
    return next;
  },

  topEntries(map, limit = 10) {
    return Object.entries(map || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }));
  },

  rates(events, windowMs = 5 * 60 * 1000) {
    const threshold = now() - windowMs;
    const recent = events.filter((entry) => entry.at >= threshold && entry.type === "scan");
    const scansPerMin = recent.length / Math.max(windowMs / 60000, 1);
    return {
      scansPerMin: Number(scansPerMin.toFixed(2)),
      scansInWindow: recent.length,
      windowMs
    };
  }
};

const createToastHost = (opts = {}) => {
  const durationMs = opts.durationMs || DEFAULT_PREFERENCES.toastDurationMs;
  let host = document.getElementById("scanStationToastHost");

  if (!host) {
    host = document.createElement("div");
    host.id = "scanStationToastHost";
    host.style.position = "fixed";
    host.style.right = "1rem";
    host.style.bottom = "1rem";
    host.style.zIndex = "9999";
    host.style.display = "grid";
    host.style.gap = "0.5rem";
    host.style.maxWidth = "380px";
    document.body.appendChild(host);
  }

  const show = (message, kind = "info") => {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.padding = "0.75rem 0.9rem";
    toast.style.borderRadius = "0.7rem";
    toast.style.fontSize = "0.86rem";
    toast.style.border = "1px solid rgba(148,163,184,.3)";
    toast.style.background = "#0f172a";
    toast.style.color = "#f8fafc";
    toast.style.boxShadow = "0 12px 28px rgba(2,6,23,.28)";

    if (kind === "warn") {
      toast.style.borderColor = "rgba(250,204,21,.6)";
      toast.style.background = "#422006";
    } else if (kind === "error") {
      toast.style.borderColor = "rgba(248,113,113,.7)";
      toast.style.background = "#450a0a";
    } else if (kind === "success") {
      toast.style.borderColor = "rgba(74,222,128,.7)";
      toast.style.background = "#052e16";
    }

    host.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      setTimeout(() => toast.remove(), 220);
    }, durationMs);
  };

  return { show };
};

const createCommandRegistry = (ctx) => {
  const registry = new Map();

  const register = (name, def) => {
    registry.set(name, {
      description: def.description || "",
      usage: def.usage || `:${name}`,
      run: def.run || (() => ({ ok: false, message: "Not implemented" }))
    });
  };

  register("help", {
    description: "Show available scan station commands",
    usage: ":help",
    run: () => {
      const lines = ["Commands:", "Open inspector: press F2 or run :inspector"];
      for (const [name, def] of registry.entries()) {
        lines.push(`• ${def.usage} — ${def.description}`);
      }
      return { ok: true, message: lines.join("\n") };
    }
  });

  register("mode", {
    description: "Set scan mode (dispatch, receive, audit)",
    usage: ":mode dispatch",
    run: ({ args }) => {
      const nextMode = String(args[0] || "").toLowerCase();
      if (!["dispatch", "receive", "audit"].includes(nextMode)) {
        return { ok: false, message: "Mode must be dispatch, receive, or audit." };
      }
      ctx.setState((prev) => ({ ...prev, mode: nextMode }));
      return { ok: true, message: `Mode set to ${nextMode}.` };
    }
  });

  register("order", {
    description: "Set active order identifier",
    usage: ":order ORD1234",
    run: ({ args }) => {
      const orderId = dedupeText(args[0] || "").toUpperCase();
      if (!orderId) return { ok: false, message: "Provide an order id." };
      ctx.setState((prev) => ({ ...prev, activeOrderId: orderId }));
      return { ok: true, message: `Active order ${orderId}.` };
    }
  });

  register("shipment", {
    description: "Set active shipment identifier",
    usage: ":shipment SHP1205",
    run: ({ args }) => {
      const shipmentId = dedupeText(args[0] || "").toUpperCase();
      if (!shipmentId) return { ok: false, message: "Provide a shipment id." };
      ctx.setState((prev) => ({ ...prev, activeShipmentId: shipmentId }));
      return { ok: true, message: `Active shipment ${shipmentId}.` };
    }
  });

  register("note", {
    description: "Attach a note to the most recent barcode",
    usage: ":note Damaged parcel edge",
    run: ({ args }) => {
      const note = dedupeText(args.join(" "));
      const last = ctx.getState().stagedBarcodes.at(-1);
      if (!last) return { ok: false, message: "No scanned barcode available for annotation." };
      if (!note) return { ok: false, message: "Add note text." };
      ctx.setState((prev) => ({
        ...prev,
        notesByBarcode: {
          ...prev.notesByBarcode,
          [last.value]: [...(prev.notesByBarcode[last.value] || []), note]
        },
        annotations: [...prev.annotations, { at: now(), barcode: last.value, note }]
      }));
      return { ok: true, message: `Attached note to ${last.value}.` };
    }
  });

  register("clear", {
    description: "Clear current staged barcodes",
    usage: ":clear",
    run: () => {
      const count = ctx.getState().stagedBarcodes.length;
      ctx.setState((prev) => ({
        ...prev,
        stagedBarcodes: [],
        duplicateBarcodes: {},
        timestamps: {
          ...prev.timestamps,
          lastActionAt: now()
        }
      }));
      return { ok: true, message: `Cleared ${count} staged barcode(s).` };
    }
  });

  register("export", {
    description: "Export session summary as JSON",
    usage: ":export",
    run: () => {
      const payload = ctx.buildExportPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const anchor = document.createElement("a");
      const url = URL.createObjectURL(blob);
      anchor.href = url;
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.download = `scan-session-${stamp}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { ok: true, message: "Session export downloaded." };
    }
  });

  register("inspector", {
    description: "Open scan inspector panel",
    usage: ":inspector",
    run: () => {
      ctx.toggleInspector(true);
      return { ok: true, message: "Scan inspector opened." };
    }
  });

  const run = (command) => {
    const entry = registry.get(command.action);
    if (!entry) {
      return { ok: false, message: `Unknown command: ${command.action}. Try :help` };
    }
    return entry.run({ args: command.args, state: ctx.getState() });
  };

  const list = () =>
    [...registry.entries()].map(([name, value]) => ({
      name,
      description: value.description,
      usage: value.usage
    }));

  return { register, run, list };
};

const createInspector = (ctx) => {
  let container = null;

  const ensure = () => {
    if (container) return container;
    container = document.createElement("aside");
    container.id = "scanStationInspector";
    container.style.position = "fixed";
    container.style.top = "1rem";
    container.style.right = "1rem";
    container.style.width = "340px";
    container.style.maxHeight = "calc(100vh - 2rem)";
    container.style.overflow = "auto";
    container.style.background = "rgba(15,23,42,.94)";
    container.style.border = "1px solid rgba(148,163,184,.24)";
    container.style.borderRadius = "0.9rem";
    container.style.padding = "0.9rem";
    container.style.color = "#e2e8f0";
    container.style.boxShadow = "0 18px 40px rgba(2,6,23,.4)";
    container.hidden = true;
    document.body.appendChild(container);
    return container;
  };

  const formatTime = (stamp) => {
    if (!stamp) return "—";
    const delta = now() - stamp;
    if (delta < 1000) return "just now";
    if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    return `${Math.floor(delta / 3_600_000)}h ago`;
  };

  const render = () => {
    const el = ensure();
    const state = ctx.getState();
    const metrics = ctx.computeMetrics();
    const recent = state.stagedBarcodes.slice(-8).reverse();
    const activeOrder = readActiveOrderSnapshot();

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;">
        <strong style="font-size:.95rem;">Scan inspector</strong>
        <button type="button" data-action="close" style="background:none;border:0;color:#93c5fd;cursor:pointer;">Close</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.75rem;">
        <div style="padding:.55rem;border:1px solid rgba(148,163,184,.25);border-radius:.55rem;">
          <div style="font-size:.72rem;color:#94a3b8;">Session scans</div>
          <div style="font-size:1.1rem;font-weight:700;">${metrics.sessionScans}</div>
        </div>
        <div style="padding:.55rem;border:1px solid rgba(148,163,184,.25);border-radius:.55rem;">
          <div style="font-size:.72rem;color:#94a3b8;">Scans / min</div>
          <div style="font-size:1.1rem;font-weight:700;">${metrics.rates.scansPerMin}</div>
        </div>
      </div>
      <div style="font-size:.8rem;margin-bottom:.7rem;color:#cbd5e1;">
        Mode <strong>${state.mode}</strong> · Active order <strong>${activeOrder.orderNo !== "—" ? activeOrder.orderNo : (state.activeOrderId || "—")}</strong>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.45rem;margin-bottom:.75rem;">
        <div style="padding:.5rem;border:1px solid rgba(148,163,184,.25);border-radius:.55rem;">
          <div style="font-size:.72rem;color:#94a3b8;">Customer</div>
          <div style="font-size:.82rem;font-weight:600;">${activeOrder.customer}</div>
        </div>
        <div style="padding:.5rem;border:1px solid rgba(148,163,184,.25);border-radius:.55rem;">
          <div style="font-size:.72rem;color:#94a3b8;">Order weight</div>
          <div style="font-size:.82rem;font-weight:600;">${activeOrder.weight}</div>
        </div>
        <div style="padding:.5rem;border:1px solid rgba(148,163,184,.25);border-radius:.55rem;">
          <div style="font-size:.72rem;color:#94a3b8;">Parcels scanned</div>
          <div style="font-size:.82rem;font-weight:600;">${activeOrder.parcelCount}</div>
        </div>
        <div style="padding:.5rem;border:1px solid rgba(148,163,184,.25);border-radius:.55rem;">
          <div style="font-size:.72rem;color:#94a3b8;">Expected parcels</div>
          <div style="font-size:.82rem;font-weight:600;">${activeOrder.expectedCount}</div>
        </div>
      </div>
      <div style="margin-bottom:.7rem;">
        <div style="font-size:.75rem;color:#94a3b8;margin-bottom:.45rem;">Top barcodes</div>
        ${metrics.topBarcodes.length === 0 ? "<div style='font-size:.8rem;color:#64748b;'>No scans yet.</div>" : metrics.topBarcodes.map((entry) => `<div style='font-size:.8rem;display:flex;justify-content:space-between;'><span>${entry.key}</span><strong>${entry.count}</strong></div>`).join("")}
      </div>
      <div style="margin-bottom:.7rem;">
        <div style="font-size:.75rem;color:#94a3b8;margin-bottom:.45rem;">Recent</div>
        ${recent.length === 0 ? "<div style='font-size:.8rem;color:#64748b;'>No recent scans.</div>" : recent.map((entry) => `<div style='font-size:.8rem;display:grid;grid-template-columns:1fr auto;gap:.55rem;'><span>${entry.value}</span><span style='color:#93c5fd;'>${formatTime(entry.at)}</span></div>`).join("")}
      </div>
      <div style="font-size:.74rem;color:#94a3b8;">Idle: ${formatTime(state.timestamps.lastScanAt)}</div>
    `;

    const closeBtn = el.querySelector("[data-action='close']");
    closeBtn?.addEventListener("click", () => ctx.toggleInspector(false));
  };

  const setVisible = (visible) => {
    const el = ensure();
    el.hidden = !visible;
    if (visible) render();
  };

  return { render, setVisible };
};

const createIdleWatcher = (ctx) => {
  let interval = null;

  const tick = () => {
    const state = ctx.getState();
    const timeoutMs = ctx.getPreferences().idleTimeoutMs;
    if (!state.timestamps.lastScanAt) return;
    const idleMs = now() - state.timestamps.lastScanAt;
    if (idleMs < timeoutMs) return;
    if (state.timestamps.idleSince) return;

    ctx.setState((prev) => ({
      ...prev,
      timestamps: {
        ...prev.timestamps,
        idleSince: now()
      }
    }));

    ctx.toast("Scan station idle. Scanner focus was restored.", "warn");
    ctx.focusInput();
  };

  const start = () => {
    if (interval) return;
    interval = setInterval(tick, 1200);
  };

  const stop = () => {
    if (!interval) return;
    clearInterval(interval);
    interval = null;
  };

  return { start, stop };
};

const mountInspectorLauncher = (ctx, scanInput) => {
  const parent = scanInput.parentElement;
  if (!parent) return null;
  if (parent.querySelector('[data-scan-inspector-launcher="1"]')) return null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.scanInspectorLauncher = "1";
  btn.textContent = "Inspector";
  btn.title = "Open scan inspector (F2)";
  btn.style.marginTop = "0.45rem";
  btn.style.width = "100%";
  btn.style.padding = "0.45rem 0.6rem";
  btn.style.borderRadius = "0.55rem";
  btn.style.border = "1px solid rgba(148,163,184,.45)";
  btn.style.background = "rgba(15,23,42,.85)";
  btn.style.color = "#e2e8f0";
  btn.style.cursor = "pointer";
  btn.addEventListener("click", () => ctx.toggleInspector(true));
  parent.appendChild(btn);
  return btn;
};

const createHotkeys = (ctx) => {
  const onKeydown = (event) => {
    if (!ctx.getPreferences().hotkeysEnabled) return;
    const target = event.target;
    const editable = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

    if (event.key === "F2") {
      event.preventDefault();
      ctx.toggleInspector();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      ctx.togglePalette();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      ctx.runCommand({ action: "clear", args: [] });
      return;
    }

    if (editable) return;

    if (event.key === "/") {
      event.preventDefault();
      ctx.focusInput();
    }
  };

  const mount = () => document.addEventListener("keydown", onKeydown);
  const unmount = () => document.removeEventListener("keydown", onKeydown);

  return { mount, unmount };
};

export const initScanStationNext = (options = {}) => {
  const scanInput = options.scanInput || document.getElementById("scanInput");
  if (!scanInput) {
    return {
      destroy() {},
      ingestScan() {},
      runCommand() {},
      getState: () => ({ ...DEFAULT_STATE })
    };
  }

  const emitter = createEmitter();
  let preferences = storage.loadPreferences();
  let state = storage.loadState();
  let eventLog = storage.loadEventLog();

  const toastHost = createToastHost({ durationMs: preferences.toastDurationMs });

  const notify = (message, kind = "info") => {
    toastHost.show(message, kind);
    emitter.emit("toast", { message, kind, at: now() });
  };

  const getState = () => state;
  const getPreferences = () => preferences;

  const persistState = () => {
    storage.saveState(state);
  };

  const persistEvents = () => {
    const max = clamp(preferences.maxSessionEvents, 50, 5000);
    if (eventLog.length > max) {
      eventLog = eventLog.slice(-max);
    }
    storage.saveEventLog(eventLog);
  };

  const setState = (updater) => {
    state = typeof updater === "function" ? updater(state) : updater;
    persistState();
    emitter.emit("state:changed", state);
  };

  const pushEvent = (event) => {
    eventLog.push({ ...event, at: event.at || now() });
    persistEvents();
    emitter.emit("event:added", event);
  };

  const computeMetrics = () => {
    const sessionScans = state.stagedBarcodes.length;
    const topBarcodes = metricUtils.topEntries(state.scanCountsByBarcode, 8);
    const rates = metricUtils.rates(eventLog, 3 * 60 * 1000);
    return {
      sessionScans,
      topBarcodes,
      rates
    };
  };

  const buildExportPayload = () => ({
    exportedAt: new Date().toISOString(),
    state,
    metrics: computeMetrics(),
    eventLog: [...eventLog]
  });

  const focusInput = () => {
    if (!preferences.autoFocusInput) return;
    scanInput.focus({ preventScroll: true });
    scanInput.select();
  };

  const markAction = () => {
    setState((prev) => ({
      ...prev,
      timestamps: {
        ...prev.timestamps,
        lastActionAt: now(),
        idleSince: 0
      }
    }));
  };

  const context = {
    getState,
    setState,
    getPreferences,
    computeMetrics,
    buildExportPayload,
    focusInput,
    toast: notify,
    toggleInspector: (force) => {
      const next = typeof force === "boolean" ? force : !state.ui.inspectorOpen;
      setState((prev) => ({ ...prev, ui: { ...prev.ui, inspectorOpen: next } }));
      inspector.setVisible(next);
      if (next) {
        inspector.render();
      }
    },
    togglePalette: (force) => {
      const next = typeof force === "boolean" ? force : !state.ui.paletteOpen;
      setState((prev) => ({ ...prev, ui: { ...prev.ui, paletteOpen: next } }));
      notify(next ? "Command palette opened" : "Command palette closed", "info");
    }
  };

  const commands = createCommandRegistry({
    ...context,
    runCommand: (command) => commands.run(command)
  });

  const runCommand = (command) => {
    const result = commands.run(command);
    if (result.ok) {
      notify(result.message, "success");
      pushEvent({ type: "command", command: command.action, args: command.args, ok: true });
    } else {
      notify(result.message, "error");
      pushEvent({ type: "command", command: command.action, args: command.args, ok: false });
    }
    markAction();
    return result;
  };

  const inspector = createInspector({
    ...context,
    runCommand
  });

  const hotkeys = createHotkeys({
    ...context,
    runCommand
  });

  const idleWatcher = createIdleWatcher({
    ...context,
    runCommand
  });

  const isDuplicateScan = (barcode) => {
    const previousAt = state.duplicateBarcodes[barcode] || 0;
    const duplicate = now() - previousAt <= preferences.duplicateWindowMs;
    setState((prev) => ({
      ...prev,
      duplicateBarcodes: {
        ...prev.duplicateBarcodes,
        [barcode]: now()
      }
    }));
    return duplicate;
  };

  const attachScanRecord = (barcode) => {
    const type = scanParsers.inferEntityType(barcode);
    const duplicate = isDuplicateScan(barcode);
    const record = {
      value: barcode,
      type,
      duplicate,
      at: now(),
      mode: state.mode,
      orderId: state.activeOrderId,
      shipmentId: state.activeShipmentId
    };

    setState((prev) => ({
      ...prev,
      stagedBarcodes: [...prev.stagedBarcodes, record].slice(-500),
      scanCountsByBarcode: metricUtils.incrementCounter(prev.scanCountsByBarcode, barcode),
      scanCountsByOrderId: metricUtils.incrementCounter(prev.scanCountsByOrderId, prev.activeOrderId || "unassigned"),
      scanCountsByShipmentId: metricUtils.incrementCounter(prev.scanCountsByShipmentId, prev.activeShipmentId || "unassigned"),
      timestamps: {
        ...prev.timestamps,
        lastScanAt: now(),
        lastActionAt: now(),
        idleSince: 0,
        startedAt: prev.timestamps.startedAt || now()
      }
    }));

    pushEvent({ type: "scan", barcode, duplicate, mode: state.mode, entityType: type });

    if (duplicate) {
      notify(`Duplicate scan detected: ${barcode}`, "warn");
    } else {
      notify(`Scanned ${barcode}`, "success");
    }

    emitter.emit("scan:ingested", record);
  };

  const ingestScan = (rawValue) => {
    const normalized = scanParsers.normalizeBarcode(rawValue);
    if (!normalized) return { ok: false, message: "Empty scan" };

    const command = scanParsers.parseCommand(normalized, preferences.commandPrefix);
    if (command) {
      return runCommand(command);
    }

    attachScanRecord(normalized);
    return { ok: true, message: `Scanned ${normalized}` };
  };

  const onScanInputKeydown = (event) => {
    if (event.key !== "Enter") return;
    const raw = scanInput.value;
    const command = scanParsers.parseCommand(raw, preferences.commandPrefix);
    if (!command) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    scanInput.value = "";
    runCommand(command);
  };

  const onWindowBlur = () => {
    if (!preferences.autoFocusInput) return;
    setTimeout(() => focusInput(), 30);
  };

  const onStateChange = () => {
    if (state.ui.inspectorOpen) {
      inspector.render();
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState !== "visible") return;
    focusInput();
  };

  scanInput.addEventListener("keydown", onScanInputKeydown);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  hotkeys.mount();
  idleWatcher.start();
  const inspectorLauncher = mountInspectorLauncher(context, scanInput);

  const unsubscribe = emitter.on("state:changed", onStateChange);

  notify("Scan station enhancements ready. Press F2 for inspector.", "success");

  const destroy = () => {
    unsubscribe();
    hotkeys.unmount();
    idleWatcher.stop();
    scanInput.removeEventListener("keydown", onScanInputKeydown);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    inspectorLauncher?.remove();
  };

  return {
    destroy,
    ingestScan,
    runCommand,
    getState,
    getPreferences,
    setPreferences(next) {
      preferences = {
        ...preferences,
        ...next,
        suggestionWindow: clamp(next?.suggestionWindow ?? preferences.suggestionWindow, 3, 25),
        maxSessionEvents: clamp(next?.maxSessionEvents ?? preferences.maxSessionEvents, 30, 5000)
      };
      storage.savePreferences(preferences);
      notify("Scan station preferences updated.", "info");
      pushEvent({ type: "preferences", payload: preferences });
    },
    getMetrics: computeMetrics,
    getCommandList: commands.list,
    exportSession() {
      const payload = buildExportPayload();
      const text = JSON.stringify(payload, null, 2);
      return text;
    }
  };
};
