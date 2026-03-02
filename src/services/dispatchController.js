import { EventEmitter } from "node:events";

const dispatchState = {
  queueOrderIds: [],
  lineItemKeysByOrderId: {},
  selectedOrderId: null,
  selectedLineItemKey: null,
  mode: "dispatch",
  lastConfirmedAt: null,
  lastConfirmedOrderId: null,
  lastConfirmedLineItemKey: null,
  lastPrintRequestedAt: null,
  lastPrintRequestedOrderId: null,
  lastFulfillRequestedAt: null,
  lastFulfillRequestedOrderId: null,
  quantityPromptOpen: false,
  quantityPromptTargetLineItemKey: null,
  quantityPromptQty: null,
  packedQtyByLineItemKey: {},
  lastPackedQtyCommittedAt: null,
  lastPackedQtyCommittedEventId: 0,
  lastPackedQtyCommittedLineItemKey: null,
  lastPackedQtyCommittedQty: null,
  environment: {
    current: null,
    status: "missing",
    lastUpdatedAt: null,
    issues: []
  },
  remote: {
    remoteId: null,
    lastSeenAt: null,
    firmwareVersion: null,
    batteryPct: null,
    signalRssi: null,
    profile: null,
    status: "offline"
  }
};

const dispatchEvents = new EventEmitter();

function cloneEnvironment() {
  return {
    current: dispatchState.environment.current ? { ...dispatchState.environment.current } : null,
    status: dispatchState.environment.status,
    lastUpdatedAt: dispatchState.environment.lastUpdatedAt,
    issues: [...(dispatchState.environment.issues || [])]
  };
}

function cloneRemote() {
  return {
    remoteId: dispatchState.remote.remoteId,
    lastSeenAt: dispatchState.remote.lastSeenAt,
    firmwareVersion: dispatchState.remote.firmwareVersion,
    batteryPct: dispatchState.remote.batteryPct,
    signalRssi: dispatchState.remote.signalRssi,
    profile: dispatchState.remote.profile,
    status: dispatchState.remote.status
  };
}

function hasStateChanged(previousState, nextState) {
  if (!previousState || !nextState) return true;
  if (previousState.selectedOrderId !== nextState.selectedOrderId) return true;
  if (previousState.mode !== nextState.mode) return true;
  if (previousState.lastConfirmedAt !== nextState.lastConfirmedAt) return true;
  if (previousState.lastConfirmedOrderId !== nextState.lastConfirmedOrderId) return true;
  if (previousState.lastConfirmedLineItemKey !== nextState.lastConfirmedLineItemKey) return true;
  if (previousState.selectedLineItemKey !== nextState.selectedLineItemKey) return true;
  if (previousState.lastPrintRequestedAt !== nextState.lastPrintRequestedAt) return true;
  if (previousState.lastPrintRequestedOrderId !== nextState.lastPrintRequestedOrderId) return true;
  if (previousState.lastFulfillRequestedAt !== nextState.lastFulfillRequestedAt) return true;
  if (previousState.lastFulfillRequestedOrderId !== nextState.lastFulfillRequestedOrderId) return true;
  if (previousState.quantityPromptOpen !== nextState.quantityPromptOpen) return true;
  if (previousState.quantityPromptTargetLineItemKey !== nextState.quantityPromptTargetLineItemKey) return true;
  if (previousState.quantityPromptQty !== nextState.quantityPromptQty) return true;
  if (previousState.lastPackedQtyCommittedAt !== nextState.lastPackedQtyCommittedAt) return true;
  if (previousState.lastPackedQtyCommittedEventId !== nextState.lastPackedQtyCommittedEventId) return true;
  if (previousState.lastPackedQtyCommittedLineItemKey !== nextState.lastPackedQtyCommittedLineItemKey) return true;
  if (previousState.lastPackedQtyCommittedQty !== nextState.lastPackedQtyCommittedQty) return true;
  if (JSON.stringify(previousState.packedQtyByLineItemKey) !== JSON.stringify(nextState.packedQtyByLineItemKey)) return true;
  if (previousState.queueOrderIds.length !== nextState.queueOrderIds.length) return true;
  if (JSON.stringify(previousState.lineItemKeysByOrderId) !== JSON.stringify(nextState.lineItemKeysByOrderId)) return true;
  if (JSON.stringify(previousState.environment) !== JSON.stringify(nextState.environment)) return true;
  if (JSON.stringify(previousState.remote) !== JSON.stringify(nextState.remote)) return true;
  return previousState.queueOrderIds.some((orderId, index) => orderId !== nextState.queueOrderIds[index]);
}

function emitStateChange(action, previousState, nextState, metadata = {}) {
  if (!hasStateChanged(previousState, nextState)) return;
  dispatchEvents.emit("state-change", {
    action,
    state: nextState,
    metadata,
    changedAt: new Date().toISOString()
  });
}

function emitCustomEvent(eventName, payload) {
  dispatchEvents.emit("custom", {
    event: eventName,
    payload,
    changedAt: new Date().toISOString()
  });
}

function normalizeOrderIds(orderIds = []) {
  if (!Array.isArray(orderIds)) return [];
  const seen = new Set();
  return orderIds
    .map((id) => String(id || "").trim())
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function normalizeLineItemKeysByOrderId(lineItemKeysByOrderId = {}) {
  if (!lineItemKeysByOrderId || typeof lineItemKeysByOrderId !== "object") return {};
  const normalized = {};
  Object.entries(lineItemKeysByOrderId).forEach(([orderId, keys]) => {
    const cleanOrderId = String(orderId || "").trim();
    if (!cleanOrderId) return;
    const seen = new Set();
    normalized[cleanOrderId] = Array.isArray(keys)
      ? keys
          .map((key) => String(key || "").trim())
          .filter((key) => {
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
      : [];
  });
  return normalized;
}

function getLineItemKeysForOrder(orderId) {
  const cleanOrderId = String(orderId || "").trim();
  if (!cleanOrderId) return [];
  return dispatchState.lineItemKeysByOrderId[cleanOrderId] || [];
}

function getSelectedIndex() {
  if (!dispatchState.selectedOrderId) return -1;
  return dispatchState.queueOrderIds.indexOf(dispatchState.selectedOrderId);
}

function selectIndex(index) {
  if (!dispatchState.queueOrderIds.length) {
    dispatchState.selectedOrderId = null;
    return null;
  }
  const normalizedIndex = ((index % dispatchState.queueOrderIds.length) + dispatchState.queueOrderIds.length) % dispatchState.queueOrderIds.length;
  dispatchState.selectedOrderId = dispatchState.queueOrderIds[normalizedIndex];
  const lineItemKeys = getLineItemKeysForOrder(dispatchState.selectedOrderId);
  dispatchState.selectedLineItemKey = lineItemKeys[0] || null;
  return dispatchState.selectedOrderId;
}

function ensureSelection() {
  if (!dispatchState.queueOrderIds.length) {
    dispatchState.selectedOrderId = null;
    return;
  }
  const currentIndex = getSelectedIndex();
  if (currentIndex === -1) {
    dispatchState.selectedOrderId = dispatchState.queueOrderIds[0];
  }
  const lineItemKeys = getLineItemKeysForOrder(dispatchState.selectedOrderId);
  if (!lineItemKeys.length) {
    dispatchState.selectedLineItemKey = null;
  } else if (!lineItemKeys.includes(dispatchState.selectedLineItemKey)) {
    dispatchState.selectedLineItemKey = lineItemKeys[0];
  }
}

function normalizePackedQty(qty) {
  if (qty === null || qty === undefined || qty === "") return null;
  const parsed = Number(qty);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const err = new Error("qty must be a non-negative number.");
    err.code = "INVALID_REMOTE_PAYLOAD";
    throw err;
  }
  return Math.trunc(parsed);
}

function resolvePromptTargetLineItemKey(lineItemKey) {
  const explicitLineItemKey = String(lineItemKey || "").trim();
  if (explicitLineItemKey) return explicitLineItemKey;
  return dispatchState.selectedLineItemKey;
}

export function getState() {
  return {
    selectedOrderId: dispatchState.selectedOrderId,
    selectedLineItemKey: dispatchState.selectedLineItemKey,
    queueOrderIds: [...dispatchState.queueOrderIds],
    lineItemKeysByOrderId: { ...dispatchState.lineItemKeysByOrderId },
    mode: dispatchState.mode,
    lastConfirmedAt: dispatchState.lastConfirmedAt,
    lastConfirmedOrderId: dispatchState.lastConfirmedOrderId,
    lastConfirmedLineItemKey: dispatchState.lastConfirmedLineItemKey,
    lastPrintRequestedAt: dispatchState.lastPrintRequestedAt,
    lastPrintRequestedOrderId: dispatchState.lastPrintRequestedOrderId,
    lastFulfillRequestedAt: dispatchState.lastFulfillRequestedAt,
    lastFulfillRequestedOrderId: dispatchState.lastFulfillRequestedOrderId,
    quantityPromptOpen: dispatchState.quantityPromptOpen,
    quantityPromptTargetLineItemKey: dispatchState.quantityPromptTargetLineItemKey,
    quantityPromptQty: dispatchState.quantityPromptQty,
    packedQtyByLineItemKey: { ...dispatchState.packedQtyByLineItemKey },
    lastPackedQtyCommittedAt: dispatchState.lastPackedQtyCommittedAt,
    lastPackedQtyCommittedEventId: dispatchState.lastPackedQtyCommittedEventId,
    lastPackedQtyCommittedLineItemKey: dispatchState.lastPackedQtyCommittedLineItemKey,
    lastPackedQtyCommittedQty: dispatchState.lastPackedQtyCommittedQty,
    environment: cloneEnvironment(),
    remote: cloneRemote()
  };
}

export function syncState({ queueOrderIds, lineItemKeysByOrderId, mode } = {}) {
  const previousState = getState();
  if (queueOrderIds !== undefined) {
    dispatchState.queueOrderIds = normalizeOrderIds(queueOrderIds);
  }
  if (lineItemKeysByOrderId !== undefined) {
    dispatchState.lineItemKeysByOrderId = normalizeLineItemKeysByOrderId(lineItemKeysByOrderId);
  }
  if (queueOrderIds !== undefined || lineItemKeysByOrderId !== undefined) {
    ensureSelection();
  }
  if (typeof mode === "string" && mode.trim()) {
    dispatchState.mode = mode.trim();
  }
  const nextState = getState();
  emitStateChange("syncState", previousState, nextState);
  return nextState;
}

export function next() {
  const previousState = getState();
  if (!dispatchState.queueOrderIds.length) return getState();
  ensureSelection();
  const lineItemKeys = getLineItemKeysForOrder(dispatchState.selectedOrderId);
  if (lineItemKeys.length) {
    const currentLineIndex = lineItemKeys.indexOf(dispatchState.selectedLineItemKey);
    if (currentLineIndex >= 0 && currentLineIndex < lineItemKeys.length - 1) {
      dispatchState.selectedLineItemKey = lineItemKeys[currentLineIndex + 1];
    } else {
      const index = getSelectedIndex();
      selectIndex(index === -1 ? 0 : index + 1);
    }
  } else {
    const index = getSelectedIndex();
    selectIndex(index === -1 ? 0 : index + 1);
  }
  const nextState = getState();
  emitStateChange("next", previousState, nextState);
  return nextState;
}

export function prev() {
  const previousState = getState();
  if (!dispatchState.queueOrderIds.length) return getState();
  ensureSelection();
  const lineItemKeys = getLineItemKeysForOrder(dispatchState.selectedOrderId);
  if (lineItemKeys.length) {
    const currentLineIndex = lineItemKeys.indexOf(dispatchState.selectedLineItemKey);
    if (currentLineIndex > 0) {
      dispatchState.selectedLineItemKey = lineItemKeys[currentLineIndex - 1];
    } else {
      const index = getSelectedIndex();
      const selectedOrderId = selectIndex(index === -1 ? 0 : index - 1);
      const previousOrderLineItems = getLineItemKeysForOrder(selectedOrderId);
      dispatchState.selectedLineItemKey = previousOrderLineItems[previousOrderLineItems.length - 1] || null;
    }
  } else {
    const index = getSelectedIndex();
    const selectedOrderId = selectIndex(index === -1 ? 0 : index - 1);
    const previousOrderLineItems = getLineItemKeysForOrder(selectedOrderId);
    dispatchState.selectedLineItemKey = previousOrderLineItems[previousOrderLineItems.length - 1] || null;
  }
  const nextState = getState();
  emitStateChange("prev", previousState, nextState);
  return nextState;
}

export function confirm() {
  const previousState = getState();
  ensureSelection();
  if (!dispatchState.selectedOrderId) {
    const err = new Error("No selected order to confirm.");
    err.code = "NO_SELECTED_ORDER";
    throw err;
  }

  dispatchState.lastConfirmedOrderId = dispatchState.selectedOrderId;
  dispatchState.lastConfirmedLineItemKey = dispatchState.selectedLineItemKey;
  dispatchState.lastConfirmedAt = new Date().toISOString();
  const nextState = getState();
  emitStateChange("confirm", previousState, nextState);
  return nextState;
}

function ensureSelectedOrderForRequest(action) {
  ensureSelection();
  if (!dispatchState.selectedOrderId) {
    const err = new Error(`No selected order to ${action}.`);
    err.code = "NO_SELECTED_ORDER";
    throw err;
  }
}

export function requestPrint() {
  const previousState = getState();
  ensureSelectedOrderForRequest("print");
  dispatchState.lastPrintRequestedOrderId = dispatchState.selectedOrderId;
  dispatchState.lastPrintRequestedAt = new Date().toISOString();
  const nextState = getState();
  emitStateChange("requestPrint", previousState, nextState);
  return nextState;
}

export function requestFulfill() {
  const previousState = getState();
  ensureSelectedOrderForRequest("fulfill");
  dispatchState.lastFulfillRequestedOrderId = dispatchState.selectedOrderId;
  dispatchState.lastFulfillRequestedAt = new Date().toISOString();
  const nextState = getState();
  emitStateChange("requestFulfill", previousState, nextState);
  return nextState;
}

export function confirmHold({ lineItemKey, qty } = {}) {
  const previousState = getState();
  ensureSelectedOrderForRequest("confirm hold");
  const targetLineItemKey = resolvePromptTargetLineItemKey(lineItemKey);
  if (!targetLineItemKey) {
    const err = new Error("No selected line item to confirm hold.");
    err.code = "NO_SELECTED_LINE_ITEM";
    throw err;
  }

  let nextQty = normalizePackedQty(qty);
  if (nextQty == null) {
    nextQty = dispatchState.packedQtyByLineItemKey[targetLineItemKey] ?? 0;
  }

  dispatchState.quantityPromptOpen = true;
  dispatchState.quantityPromptTargetLineItemKey = targetLineItemKey;
  dispatchState.quantityPromptQty = nextQty;

  const nextState = getState();
  emitStateChange("confirmHold", previousState, nextState, { targetLineItemKey });
  return nextState;
}

export function adjustPackedQty({ delta = 0, lineItemKey } = {}) {
  const previousState = getState();
  const parsedDelta = Number(delta);
  if (!Number.isFinite(parsedDelta)) {
    const err = new Error("delta must be numeric.");
    err.code = "INVALID_REMOTE_PAYLOAD";
    throw err;
  }

  if (!dispatchState.quantityPromptOpen) {
    confirmHold({ lineItemKey });
  }

  const currentQty = Number.isFinite(dispatchState.quantityPromptQty) ? dispatchState.quantityPromptQty : 0;
  dispatchState.quantityPromptQty = Math.max(0, Math.trunc(currentQty + parsedDelta));

  const nextState = getState();
  emitStateChange("adjustPackedQty", previousState, nextState, {
    delta: Math.trunc(parsedDelta),
    targetLineItemKey: dispatchState.quantityPromptTargetLineItemKey
  });
  return nextState;
}

export function setPackedQty({ lineItemKey, qty } = {}) {
  const previousState = getState();
  ensureSelectedOrderForRequest("set packed qty");

  const targetLineItemKey =
    resolvePromptTargetLineItemKey(lineItemKey) || dispatchState.quantityPromptTargetLineItemKey;
  if (!targetLineItemKey) {
    const err = new Error("lineItemKey is required to set packed qty.");
    err.code = "INVALID_REMOTE_PAYLOAD";
    throw err;
  }

  let committedQty = normalizePackedQty(qty);
  if (committedQty == null) {
    committedQty = Number.isFinite(dispatchState.quantityPromptQty)
      ? dispatchState.quantityPromptQty
      : (dispatchState.packedQtyByLineItemKey[targetLineItemKey] ?? 0);
  }

  dispatchState.packedQtyByLineItemKey[targetLineItemKey] = committedQty;
  dispatchState.lastPackedQtyCommittedLineItemKey = targetLineItemKey;
  dispatchState.lastPackedQtyCommittedQty = committedQty;
  dispatchState.lastPackedQtyCommittedAt = new Date().toISOString();
  dispatchState.lastPackedQtyCommittedEventId += 1;
  dispatchState.quantityPromptOpen = false;
  dispatchState.quantityPromptTargetLineItemKey = null;
  dispatchState.quantityPromptQty = null;

  const nextState = getState();
  emitStateChange("setPackedQty", previousState, nextState, { targetLineItemKey, committedQty });
  return nextState;
}



function valueAsNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

export function upsertEnvironmentReading(
  reading,
  {
    now = Date.now(),
    staleMs = 60000,
    tempMin = 5,
    tempMax = 35,
    humidityMin = 20,
    humidityMax = 70
  } = {}
) {
  const deviceId = String(reading?.deviceId || "").trim();
  const temperatureC = valueAsNumber(
    firstDefined(reading?.temperatureC, reading?.temperature, reading?.tempC, reading?.temperature_c)
  );
  const humidityPct = valueAsNumber(
    firstDefined(reading?.humidityPct, reading?.humidity, reading?.humidity_pct)
  );
  const batteryPct = valueAsNumber(reading?.batteryPct);
  const signalRssi = valueAsNumber(reading?.signalRssi);
  const recordedAtRaw = reading?.recordedAt ? new Date(reading.recordedAt) : new Date(now);
  const recordedAtMs = recordedAtRaw.getTime();

  if (!deviceId) {
    const err = new Error("deviceId is required.");
    err.code = "INVALID_ENVIRONMENT_PAYLOAD";
    throw err;
  }
  if (temperatureC == null || temperatureC < -40 || temperatureC > 100) {
    const err = new Error("temperatureC is invalid.");
    err.code = "INVALID_ENVIRONMENT_PAYLOAD";
    throw err;
  }
  if (humidityPct == null || humidityPct < 0 || humidityPct > 100) {
    const err = new Error("humidityPct is invalid.");
    err.code = "INVALID_ENVIRONMENT_PAYLOAD";
    throw err;
  }
  if (!Number.isFinite(recordedAtMs)) {
    const err = new Error("recordedAt is invalid.");
    err.code = "INVALID_ENVIRONMENT_PAYLOAD";
    throw err;
  }

  const previousState = getState();
  const issues = [];
  if (temperatureC < tempMin || temperatureC > tempMax) issues.push("temperature_out_of_range");
  if (humidityPct < humidityMin || humidityPct > humidityMax) issues.push("humidity_out_of_range");

  dispatchState.environment.current = {
    deviceId,
    temperatureC,
    humidityPct,
    batteryPct,
    signalRssi,
    recordedAt: new Date(recordedAtMs).toISOString()
  };
  dispatchState.environment.lastUpdatedAt = new Date(now).toISOString();
  dispatchState.environment.status = now - recordedAtMs > staleMs ? "stale" : "ok";
  dispatchState.environment.issues = issues;

  const nextState = getState();
  emitStateChange("environmentUpdate", previousState, nextState, { source: "environment-sensor", deviceId });
  emitCustomEvent("environment-update", { environment: nextState.environment, deviceId });

  return nextState.environment;
}

export function getEnvironmentState({ now = Date.now(), staleMs = 60000 } = {}) {
  if (!dispatchState.environment.current || !dispatchState.environment.lastUpdatedAt) {
    return cloneEnvironment();
  }
  const lastUpdatedAtMs = new Date(dispatchState.environment.lastUpdatedAt).getTime();
  if (Number.isFinite(lastUpdatedAtMs) && now - lastUpdatedAtMs > staleMs) {
    dispatchState.environment.status = "stale";
  }
  return cloneEnvironment();
}

export function recordRemoteHeartbeat(heartbeat, { now = Date.now(), staleMs = 30000 } = {}) {
  const remoteId = String(heartbeat?.remoteId || "").trim();
  if (!remoteId) {
    const err = new Error("remoteId is required.");
    err.code = "INVALID_REMOTE_PAYLOAD";
    throw err;
  }
  const previousState = getState();
  dispatchState.remote.remoteId = remoteId;
  dispatchState.remote.firmwareVersion = String(heartbeat?.firmwareVersion || "").trim() || null;
  dispatchState.remote.profile = String(heartbeat?.profile || "").trim() || null;
  dispatchState.remote.batteryPct = valueAsNumber(heartbeat?.batteryPct);
  dispatchState.remote.signalRssi = valueAsNumber(heartbeat?.signalRssi);
  dispatchState.remote.lastSeenAt = new Date(now).toISOString();
  dispatchState.remote.status = "connected";

  const nextState = getState();
  emitStateChange("remoteHeartbeat", previousState, nextState, { source: "remote", remoteId });
  emitCustomEvent("remote-status", { remote: nextState.remote, staleMs });
  return nextState.remote;
}

export function getRemoteState({ now = Date.now(), staleMs = 30000 } = {}) {
  if (!dispatchState.remote.lastSeenAt) return cloneRemote();
  const lastSeenMs = new Date(dispatchState.remote.lastSeenAt).getTime();
  if (Number.isFinite(lastSeenMs)) {
    const age = now - lastSeenMs;
    if (age > staleMs * 2) {
      dispatchState.remote.status = "offline";
    } else if (age > staleMs) {
      dispatchState.remote.status = "stale";
    } else {
      dispatchState.remote.status = "connected";
    }
  }
  return cloneRemote();
}

export function onStateChange(listener) {
  dispatchEvents.on("state-change", listener);
  return () => dispatchEvents.off("state-change", listener);
}

export function onCustomEvent(listener) {
  dispatchEvents.on("custom", listener);
  return () => dispatchEvents.off("custom", listener);
}
