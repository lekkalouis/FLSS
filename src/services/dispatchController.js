import { EventEmitter } from "node:events";

const dispatchState = {
  queueOrderIds: [],
  selectedOrderId: null,
  mode: "dispatch",
  lastConfirmedAt: null,
  lastConfirmedOrderId: null
};

const dispatchEvents = new EventEmitter();

function hasStateChanged(previousState, nextState) {
  if (!previousState || !nextState) return true;
  if (previousState.selectedOrderId !== nextState.selectedOrderId) return true;
  if (previousState.mode !== nextState.mode) return true;
  if (previousState.lastConfirmedAt !== nextState.lastConfirmedAt) return true;
  if (previousState.lastConfirmedOrderId !== nextState.lastConfirmedOrderId) return true;
  if (previousState.queueOrderIds.length !== nextState.queueOrderIds.length) return true;
  return previousState.queueOrderIds.some((orderId, index) => orderId !== nextState.queueOrderIds[index]);
}

function emitStateChange(action, previousState, nextState) {
  if (!hasStateChanged(previousState, nextState)) return;
  dispatchEvents.emit("state-change", {
    action,
    state: nextState,
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
    lastConfirmedOrderId: dispatchState.lastConfirmedOrderId
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

export function onStateChange(listener) {
  dispatchEvents.on("state-change", listener);
  return () => dispatchEvents.off("state-change", listener);
}
