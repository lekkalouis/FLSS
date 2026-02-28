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
  lastFulfillRequestedOrderId: null
};

const dispatchEvents = new EventEmitter();

function hasStateChanged(previousState, nextState) {
  if (!previousState || !nextState) return true;
  if (previousState.selectedOrderId !== nextState.selectedOrderId) return true;
  if (previousState.mode !== nextState.mode) return true;
  if (previousState.selectedLineItemKey !== nextState.selectedLineItemKey) return true;
  if (previousState.lastConfirmedAt !== nextState.lastConfirmedAt) return true;
  if (previousState.lastConfirmedOrderId !== nextState.lastConfirmedOrderId) return true;
  if (previousState.lastConfirmedLineItemKey !== nextState.lastConfirmedLineItemKey) return true;
  if (previousState.lastPrintRequestedAt !== nextState.lastPrintRequestedAt) return true;
  if (previousState.lastPrintRequestedOrderId !== nextState.lastPrintRequestedOrderId) return true;
  if (previousState.lastFulfillRequestedAt !== nextState.lastFulfillRequestedAt) return true;
  if (previousState.lastFulfillRequestedOrderId !== nextState.lastFulfillRequestedOrderId) return true;
  if (previousState.queueOrderIds.length !== nextState.queueOrderIds.length) return true;
  if (previousState.queueOrderIds.some((orderId, index) => orderId !== nextState.queueOrderIds[index])) return true;
  return previousState.queueOrderIds.some((orderId) => {
    const prevKeys = previousState.lineItemKeysByOrderId[orderId] || [];
    const nextKeys = nextState.lineItemKeysByOrderId[orderId] || [];
    if (prevKeys.length !== nextKeys.length) return true;
    return prevKeys.some((lineKey, index) => lineKey !== nextKeys[index]);
  });
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

function normalizeLineItemKeysByOrderId(rawValue = {}) {
  if (!rawValue || typeof rawValue !== "object") return {};
  const normalized = {};
  Object.entries(rawValue).forEach(([orderId, lineKeys]) => {
    const orderKey = String(orderId || "").trim();
    if (!orderKey || !Array.isArray(lineKeys)) return;
    normalized[orderKey] = lineKeys
      .map((key) => String(key || "").trim())
      .filter(Boolean);
  });
  return normalized;
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
  ensureLineItemSelection();
  return dispatchState.selectedOrderId;
}

function getSelectedLineItemIndex() {
  const selectedOrderId = dispatchState.selectedOrderId;
  if (!selectedOrderId || !dispatchState.selectedLineItemKey) return -1;
  const lineKeys = dispatchState.lineItemKeysByOrderId[selectedOrderId] || [];
  return lineKeys.indexOf(dispatchState.selectedLineItemKey);
}

function ensureLineItemSelection() {
  const selectedOrderId = dispatchState.selectedOrderId;
  if (!selectedOrderId) {
    dispatchState.selectedLineItemKey = null;
    return;
  }
  const lineKeys = dispatchState.lineItemKeysByOrderId[selectedOrderId] || [];
  if (!lineKeys.length) {
    dispatchState.selectedLineItemKey = null;
    return;
  }
  const index = lineKeys.indexOf(dispatchState.selectedLineItemKey);
  if (index === -1) {
    dispatchState.selectedLineItemKey = lineKeys[0];
  }
}

function selectLineItemByIndex(index) {
  const selectedOrderId = dispatchState.selectedOrderId;
  if (!selectedOrderId) {
    dispatchState.selectedLineItemKey = null;
    return null;
  }
  const lineKeys = dispatchState.lineItemKeysByOrderId[selectedOrderId] || [];
  if (!lineKeys.length) {
    dispatchState.selectedLineItemKey = null;
    return null;
  }
  const normalizedIndex = ((index % lineKeys.length) + lineKeys.length) % lineKeys.length;
  dispatchState.selectedLineItemKey = lineKeys[normalizedIndex];
  return dispatchState.selectedLineItemKey;
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
  ensureLineItemSelection();
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
    lastFulfillRequestedOrderId: dispatchState.lastFulfillRequestedOrderId
  };
}

export function syncState({ queueOrderIds, lineItemKeysByOrderId, mode } = {}) {
  const previousState = getState();
  if (queueOrderIds !== undefined) {
    dispatchState.queueOrderIds = normalizeOrderIds(queueOrderIds);
    ensureSelection();
  }
  if (lineItemKeysByOrderId !== undefined) {
    dispatchState.lineItemKeysByOrderId = normalizeLineItemKeysByOrderId(lineItemKeysByOrderId);
    ensureLineItemSelection();
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
  const selectedOrderId = dispatchState.selectedOrderId;
  const lineKeys = selectedOrderId ? dispatchState.lineItemKeysByOrderId[selectedOrderId] || [] : [];
  const lineIndex = getSelectedLineItemIndex();
  if (lineKeys.length && lineIndex >= 0 && lineIndex < lineKeys.length - 1) {
    selectLineItemByIndex(lineIndex + 1);
  } else {
    const index = getSelectedIndex();
    selectIndex(index === -1 ? 0 : index + 1);
    ensureLineItemSelection();
  }
  const nextState = getState();
  emitStateChange("next", previousState, nextState);
  return nextState;
}

export function prev() {
  const previousState = getState();
  if (!dispatchState.queueOrderIds.length) return getState();
  ensureSelection();
  const selectedOrderId = dispatchState.selectedOrderId;
  const lineKeys = selectedOrderId ? dispatchState.lineItemKeysByOrderId[selectedOrderId] || [] : [];
  const lineIndex = getSelectedLineItemIndex();
  if (lineKeys.length && lineIndex > 0) {
    selectLineItemByIndex(lineIndex - 1);
  } else {
    const index = getSelectedIndex();
    selectIndex(index === -1 ? 0 : index - 1);
    const prevLineKeys = dispatchState.lineItemKeysByOrderId[dispatchState.selectedOrderId] || [];
    if (prevLineKeys.length) {
      selectLineItemByIndex(prevLineKeys.length - 1);
    } else {
      ensureLineItemSelection();
    }
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
  ensureLineItemSelection();
  const lineKeys = dispatchState.lineItemKeysByOrderId[dispatchState.selectedOrderId] || [];
  if (lineKeys.length && !dispatchState.selectedLineItemKey) {
    const err = new Error("No selected line item to confirm.");
    err.code = "NO_SELECTED_LINE_ITEM";
    throw err;
  }

  dispatchState.lastConfirmedOrderId = dispatchState.selectedOrderId;
  dispatchState.lastConfirmedLineItemKey = dispatchState.selectedLineItemKey || null;
  dispatchState.lastConfirmedAt = new Date().toISOString();
  const nextState = getState();
  emitStateChange("confirm", previousState, nextState);
  return nextState;
}

export function requestPrint() {
  const previousState = getState();
  ensureSelection();
  if (!dispatchState.selectedOrderId) {
    const err = new Error("No selected order to print.");
    err.code = "NO_SELECTED_ORDER";
    throw err;
  }
  dispatchState.lastPrintRequestedOrderId = dispatchState.selectedOrderId;
  dispatchState.lastPrintRequestedAt = new Date().toISOString();
  const nextState = getState();
  emitStateChange("print", previousState, nextState);
  return nextState;
}

export function requestFulfill() {
  const previousState = getState();
  ensureSelection();
  if (!dispatchState.selectedOrderId) {
    const err = new Error("No selected order to fulfill.");
    err.code = "NO_SELECTED_ORDER";
    throw err;
  }
  dispatchState.lastFulfillRequestedOrderId = dispatchState.selectedOrderId;
  dispatchState.lastFulfillRequestedAt = new Date().toISOString();
  const nextState = getState();
  emitStateChange("fulfill", previousState, nextState);
  return nextState;
}

export function onStateChange(listener) {
  dispatchEvents.on("state-change", listener);
  return () => dispatchEvents.off("state-change", listener);
}
