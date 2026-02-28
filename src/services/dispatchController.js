import { EventEmitter } from "node:events";

const dispatchState = {
  queueOrderIds: [],
  selectedOrderId: null,
  mode: "dispatch",
  lastConfirmedAt: null,
  lastConfirmedOrderId: null,
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
  if (previousState.queueOrderIds.length !== nextState.queueOrderIds.length) return true;
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
}

export function getState() {
  return {
    selectedOrderId: dispatchState.selectedOrderId,
    queueOrderIds: [...dispatchState.queueOrderIds],
    mode: dispatchState.mode,
    lastConfirmedAt: dispatchState.lastConfirmedAt,
    lastConfirmedOrderId: dispatchState.lastConfirmedOrderId,
    environment: cloneEnvironment(),
    remote: cloneRemote()
  };
}

export function syncState({ queueOrderIds, mode } = {}) {
  const previousState = getState();
  if (queueOrderIds !== undefined) {
    dispatchState.queueOrderIds = normalizeOrderIds(queueOrderIds);
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
  const index = getSelectedIndex();
  selectIndex(index === -1 ? 0 : index + 1);
  const nextState = getState();
  emitStateChange("next", previousState, nextState);
  return nextState;
}

export function prev() {
  const previousState = getState();
  if (!dispatchState.queueOrderIds.length) return getState();
  const index = getSelectedIndex();
  selectIndex(index === -1 ? 0 : index - 1);
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
  dispatchState.lastConfirmedAt = new Date().toISOString();
  const nextState = getState();
  emitStateChange("confirm", previousState, nextState);
  return nextState;
}

function valueAsNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  const temperatureC = valueAsNumber(reading?.temperatureC);
  const humidityPct = valueAsNumber(reading?.humidityPct);
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
